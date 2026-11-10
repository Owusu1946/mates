import { type JobContext, ServerOptions, cli, defineAgent, inference, llm, log, voice } from '@livekit/agents';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { createCallApi, dispatchSchema } from './api.ts';
import { type CallState, type MateAgent, agentFor, inviteMate, removeMate } from './mates.ts';
import { Transcript } from './transcript.ts';

// Local runs (`lk agent dev`) read LIVEKIT_* and MATES_API_URL from here; LiveKit Cloud injects them.
dotenv.config({ path: '.env.local' });

export const AGENT_NAME = process.env.LIVEKIT_AGENT_NAME ?? 'mates-voice';
/** A call wraps up politely at thirty minutes. */
const MAX_CALL_MS = 30 * 60_000;
const WRAP_UP_MS = 20_000;

const rosterPayload = z.object({ mateId: z.string().uuid() });
const parseJson = (text: string | undefined): unknown => {
  try {
    return JSON.parse(text || 'null');
  } catch {
    return null;
  }
};

export default defineAgent({
  entry: async (ctx: JobContext) => {
    const logger = log();
    const dispatch = dispatchSchema.safeParse(parseJson(ctx.job.metadata));
    const baseUrl = process.env.MATES_API_URL;
    if (!dispatch.success || !baseUrl) {
      logger.error({ dispatch: dispatch.success, baseUrl: !!baseUrl }, 'call_dispatch_invalid');
      ctx.shutdown('invalid dispatch');
      return;
    }
    const api = createCallApi({ baseUrl, dispatch: dispatch.data });

    const [context] = await Promise.all([api.context(), ctx.connect()]).catch(async (error: unknown) => {
      // Without the call's mates there is no one to speak as; closing the room tells the app.
      logger.error({ error: String(error), callId: dispatch.data.callId }, 'call_context_failed');
      await ctx.deleteRoom().catch(() => {});
      ctx.shutdown('no call context');
      return [null];
    });
    if (!context) return;

    const roster = new Map(context.mates.map((mate) => [mate.id, mate]));
    const leadId = context.leadMateId && roster.has(context.leadMateId) ? context.leadMateId : context.mates[0]!.id;
    const state: CallState = {
      api,
      context,
      userName: dispatch.data.userName,
      roster,
      present: [leadId, ...context.mates.map((m) => m.id).filter((id) => id !== leadId)],
      leadId,
      agents: new Map(),
      publish: (attributes) => void ctx.room.localParticipant?.setAttributes(attributes).catch(() => {}),
    };

    const session = new voice.AgentSession<CallState>({
      stt: new inference.STT({ model: 'deepgram/nova-3', language: 'en' }),
      // Mates' names and the user's apps, so the speech-to-text spells them right.
      keytermsOptions: { keyterms: context.keyterms },
      llm: new inference.LLM({ model: 'openai/gpt-5.6-luna', modelOptions: { reasoning_effort: 'low' } }),
      turnHandling: { turnDetection: new inference.TurnDetector(), preemptiveGeneration: { enabled: true } },
      userAwayTimeout: 20,
      userData: state,
    });

    // The transcript, with who said each line, for the summary card in the chat.
    const transcript = new Transcript();
    session.on(voice.AgentSessionEventTypes.ConversationItemAdded, (event) => {
      if (!(event.item instanceof llm.ChatMessage) || !event.item.textContent) return;
      if (event.item.role === 'user') transcript.add('You', event.item.textContent);
      else if (event.item.role === 'assistant') transcript.add((session.currentAgent as MateAgent).mate.name, event.item.textContent);
    });

    // Reported once, however the call ends: the user hangs up, end_call, the time cap or an error.
    ctx.addShutdownCallback(async () => {
      await api.end(transcript.report()).catch((error: unknown) => logger.error({ error: String(error) }, 'call_end_report_failed'));
    });

    // Quiet for a while: check in once, then hang up if there's still no answer.
    let checkedIn = false;
    session.on(voice.AgentSessionEventTypes.UserStateChanged, (event) => {
      if (event.newState === 'speaking') checkedIn = false;
      if (event.newState !== 'away') return;
      if (!checkedIn) {
        checkedIn = true;
        session.generateReply({ instructions: 'The user has gone quiet. Briefly ask if they are still there.', toolChoice: 'none' });
      } else {
        void session.say("I'll let you go for now. Talk soon!").waitForPlayout().finally(() => session.shutdown());
      }
    });

    const cap = setTimeout(() => {
      session.generateReply({ instructions: "The call has reached its thirty minute limit. Say you need to wrap up, and that they can call back or carry on in the chat. Say goodbye.", toolChoice: 'none' });
      setTimeout(() => session.shutdown(), WRAP_UP_MS).unref();
    }, MAX_CALL_MS);
    cap.unref();

    // However the session closes, close the room so the app shows the call as ended.
    session.on(voice.AgentSessionEventTypes.Close, (event) => {
      clearTimeout(cap);
      ctx.addShutdownCallback(() => ctx.deleteRoom().catch(() => {}));
      ctx.shutdown(String(event.reason));
    });

    // Adding and removing mates from the app.
    const rosterHandler = (change: typeof inviteMate) => async (data: { payload: string }) => {
      const input = rosterPayload.safeParse(parseJson(data.payload));
      if (!input.success) return JSON.stringify({ ok: false, error: 'Choose a mate.' });
      const result = await change(session, input.data.mateId).catch((error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : "That didn't work." }));
      return JSON.stringify(result);
    };
    ctx.room.localParticipant?.registerRpcMethod('mates.invite', rosterHandler(inviteMate));
    ctx.room.localParticipant?.registerRpcMethod('mates.remove', rosterHandler(removeMate));

    await session.start({ agent: agentFor(state, leadId), room: ctx.room });
  },
});

cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url), agentName: AGENT_NAME }));
