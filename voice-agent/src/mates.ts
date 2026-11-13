import { beta, inference, llm, voice } from '@livekit/agents';
import { z } from 'zod';
import type { CallApi, CallContext, CallMate, TranscriptLine } from './api.ts';
import { goToSlide, isSlideCue, presentDeck, type Presenting, stopPresentingTool } from './presenting.ts';
import { greeting, mateInstructions, meetingInstructions } from './prompts.ts';

/**
 * One agent per mate on the call, each speaking in its own Inworld voice. The session holds one
 * call state; the mates pass the conversation between themselves with handoffs.
 */

/** Who's on the call and how to reach the outside world; the session's single source of state. */
export type CallState = {
  api: CallApi;
  context: Pick<CallContext, 'memories' | 'recent' | 'chatTitle'>;
  userName?: string;
  /** Everyone who has joined, by id. */
  roster: Map<string, CallMate>;
  /** Who's on the call now, lead first. */
  present: string[];
  leadId: string;
  agents: Map<string, MateAgent>;
  previous?: MateAgent;
  /** Tells the app who's speaking and who's present (room attributes); a no-op in tests. */
  publish: (attributes: Record<string, string>) => void;
  publishEnding?: () => Promise<void>;
  /** In someone's meeting: speak only when addressed, never greet, take notes. */
  meeting?: boolean;
  /** When the mate last spoke, so a follow-up to its own answer doesn't need its name again. */
  lastSpokeAt?: number;
  /** What's been said so far, so tasks from a meeting carry it (a deck "on what we've covered"). */
  transcript?: { readonly lines: readonly TranscriptLine[] };
  /** The deck being presented in a meeting, and which slide is up. */
  presenting?: Presenting;
  /** A deck still being built that the mate will present once it's ready. */
  waitingFor?: { deckId: string; timer: ReturnType<typeof setInterval> };
};

/** Transcript lines sent with a task from a meeting; the API keeps the newest that fit. */
const TASK_CONTEXT_LINES = 150;

/** After the mate answers, people can follow up for this long without saying its name. */
export const FOLLOW_UP_MS = 25_000;

/** Whether a line in a meeting is for this mate: its name (or "Mates") said as a word. */
export function addressed(text: string, name: string) {
  const words = [name, ...name.split(/\s+/), 'mates'].filter((w) => w.length > 1).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`\\b(${words.join('|')})\\b`, 'i').test(text);
}

export const presentAttributes = (state: CallState) => ({ 'mates.present': JSON.stringify(state.present) });

export class MateAgent extends voice.Agent<CallState> {
  readonly mate: CallMate;

  constructor(mate: CallMate, state: CallState) {
    super({
      instructions: instructionsFor(mate, state),
      tts: new inference.TTS({ model: 'inworld/inworld-tts-2', voice: mate.voice, language: 'en' }),
      tools: [
        ...(state.meeting ? [] : [passTo]),
        startTask,
        // In a meeting the mate can put a deck on screen and talk through it.
        ...(state.meeting ? [presentDeck, goToSlide, stopPresentingTool] : []),
        beta.createEndCallTool({
          deleteRoom: false,
          ignoreOnEnter: true,
          onToolCompleted: async () => { await state.publishEnding?.(); },
        }),
      ],
    });
    this.mate = mate;
  }

  /** In a meeting, people talk to each other; the mate stays quiet unless it's spoken to. */
  override async onUserTurnCompleted(_chatCtx: llm.ChatContext, newMessage: llm.ChatMessage): Promise<void> {
    const state = this.session.userData;
    if (!state.meeting) return;
    const followUp = state.lastSpokeAt !== undefined && Date.now() - state.lastSpokeAt < FOLLOW_UP_MS;
    const text = newMessage.textContent ?? '';
    // While presenting, "next", "go back" or "stop" are for the mate without its name.
    const cue = !!state.presenting && isSlideCue(text);
    if (!followUp && !cue && !addressed(text, this.mate.name)) throw new voice.StopResponse();
  }

  override async onEnter(): Promise<void> {
    const state = this.session.userData;
    state.publish({ 'mates.speaker': this.mate.id, ...presentAttributes(state) });
    // Walking into a meeting, the mate doesn't interrupt; the chat hello already said who it is.
    if (state.meeting) return;
    const handedOver = state.previous && state.previous !== this;
    if (handedOver) {
      // Bring the conversation so far, without the previous mate's instructions.
      const chatCtx = this.chatCtx.copy();
      const known = new Set(chatCtx.items.map((item) => item.id));
      const carried = state.previous!.chatCtx.copy({ excludeInstructions: true }).truncate(12);
      chatCtx.items.push(...carried.items.filter((item) => !known.has(item.id)));
      await this.updateChatCtx(chatCtx);
    }
    this.session.generateReply({ instructions: greeting(this.mate, !handedOver, state.userName), toolChoice: 'none' });
  }
}

export function instructionsFor(mate: CallMate, state: CallState) {
  if (state.meeting) return meetingInstructions(mate, state.context, state.userName);
  const others = state.present.filter((id) => id !== mate.id).map((id) => state.roster.get(id)!).filter(Boolean);
  return mateInstructions(mate, others, state.context, state.userName);
}

/** The mate's agent, made on first use; existing ones are reused so their history stays. */
export function agentFor(state: CallState, mateId: string) {
  let agent = state.agents.get(mateId);
  if (!agent) {
    agent = new MateAgent(state.roster.get(mateId)!, state);
    state.agents.set(mateId, agent);
  }
  return agent;
}

/** After someone joins or leaves, every mate's instructions name the right people. */
export async function refreshInstructions(state: CallState) {
  await Promise.all([...state.agents.values()].map((agent) => agent.updateInstructions(instructionsFor(agent.mate, state))));
}

/** The lead and up to three others on the call at once. */
export const MAX_PRESENT = 4;

export type RosterChange = { ok: true; present: string[] } | { ok: false; error: string };

/** The user added a mate from the app: they join, and whoever is talking welcomes them. */
export async function inviteMate(session: voice.AgentSession<CallState>, mateId: string): Promise<RosterChange> {
  const state = session.userData;
  if (state.present.includes(mateId)) return { ok: true, present: state.present };
  if (state.present.length >= MAX_PRESENT) return { ok: false, error: `A call holds ${MAX_PRESENT} mates at most.` };
  const roster = await state.api.invite(mateId);
  for (const mate of roster) state.roster.set(mate.id, mate);
  const joined = state.roster.get(mateId);
  if (!joined) return { ok: false, error: "That mate couldn't join." };
  state.present = [...state.present, mateId];
  await refreshInstructions(state);
  state.publish(presentAttributes(state));
  session.generateReply({ instructions: `${joined.name} (${joined.brief}) just joined the call. Welcome them in one short sentence; don't speak for them.`, toolChoice: 'none' });
  return { ok: true, present: state.present };
}

/** The user removed a mate. The lead stays; if the removed mate was talking, the lead takes over. */
export async function removeMate(session: voice.AgentSession<CallState>, mateId: string): Promise<RosterChange> {
  const state = session.userData;
  if (mateId === state.leadId) return { ok: false, error: 'The mate you called stays on the call.' };
  if (!state.present.includes(mateId)) return { ok: true, present: state.present };
  state.present = state.present.filter((id) => id !== mateId);
  await refreshInstructions(state);
  state.publish(presentAttributes(state));
  const current = session.currentAgent as MateAgent;
  if (current.mate.id === mateId) {
    state.previous = current;
    session.updateAgent(agentFor(state, state.leadId));
  }
  return { ok: true, present: state.present };
}

const nameKey = (name: string) => name.trim().toLowerCase();

export const passTo = llm.tool({
  name: 'pass_to',
  description:
    "Hand the conversation to another mate on this call, when the user asks for them by name or the question is clearly theirs. They speak next, in their own voice. Only mates on the call can take it.",
  parameters: z.object({ mate: z.string().describe("The other mate's name, exactly as listed on the call") }),
  execute: async ({ mate }, { ctx }: llm.ToolOptions<CallState>) => {
    const state = ctx.userData;
    const current = ctx.session.currentAgent as MateAgent;
    const id = state.present.find((presentId) => nameKey(state.roster.get(presentId)?.name ?? '') === nameKey(mate));
    if (!id) return `${mate} isn't on this call. On the call: ${state.present.map((p) => state.roster.get(p)?.name).join(', ')}.`;
    if (id === current.mate.id) return `You are ${mate}; answer yourself.`;
    state.previous = current;
    return llm.handoff({ agent: agentFor(state, id), returns: `Passed to ${mate}.` });
  },
});

export const startTask = llm.tool({
  name: 'start_task',
  description:
    'Start work that needs apps, the web, research, writing, email or code. It runs in the background in your chat with the user, and the result appears there; it is not done when this returns.',
  parameters: z.object({ task: z.string().describe('The whole task in plain words, with every detail the user gave') }),
  execute: async ({ task }, { ctx }: llm.ToolOptions<CallState>) => {
    const current = ctx.session.currentAgent as MateAgent;
    try {
      const state = ctx.userData;
      await state.api.startTask(current.mate.id, task, state.meeting ? state.transcript?.lines.slice(-TASK_CONTEXT_LINES) : undefined);
      return 'Started. It is running in the chat now; the result will appear there.';
    } catch {
      // A fact, not a guess at the cause, so the mate tells the user plainly and never claims success.
      return 'Not started: Mates could not be reached just now. Nothing was done.';
    }
  },
});
