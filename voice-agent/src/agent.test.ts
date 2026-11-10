import { inference, initializeLogger, voice } from '@livekit/agents';
import dotenv from 'dotenv';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CallApi, CallMate } from './api.ts';
import { type CallState, MateAgent, agentFor } from './mates.ts';

/**
 * Turn tests with the real model, through LiveKit Inference. They need LIVEKIT_API_KEY and
 * LIVEKIT_API_SECRET (in .env.local); without them they're skipped. The Mates API is stubbed.
 */
dotenv.config({ path: '.env.local' });
initializeLogger({ pretty: false, level: 'warn' });

const live = !!(process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);
const AMA: CallMate = { id: '00000000-0000-4000-8000-000000000001', name: 'Ama', brief: 'a personal assistant who handles email and planning', voice: 'thalia', color: 'violet', shape: 'blob' };
const KOJO: CallMate = { id: '00000000-0000-4000-8000-000000000002', name: 'Kojo', brief: 'a fitness coach', voice: 'apollo', color: 'green', shape: 'star' };

describe.skipIf(!live)('mates on a call', () => {
  let session: voice.AgentSession<CallState>;
  let model: inference.LLM;
  let api: { startTask: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    model = new inference.LLM({ model: 'openai/gpt-5.6-luna', modelOptions: { reasoning_effort: 'low' } });
    api = { startTask: vi.fn(async () => 'run_1') };
    const state: CallState = {
      api: api as unknown as CallApi,
      context: { memories: [], recent: [], chatTitle: '' },
      userName: 'Kenneth',
      roster: new Map([AMA, KOJO].map((m) => [m.id, m])),
      present: [AMA.id, KOJO.id],
      leadId: AMA.id,
      agents: new Map(),
      publish: () => {},
    };
    session = new voice.AgentSession<CallState>({ llm: model, userData: state });
    await session.start({ agent: agentFor(state, AMA.id) });
  });

  afterEach(async () => {
    await session?.close();
    await model?.aclose();
  });

  it('greets as the lead mate', { timeout: 30_000 }, async () => {
    const result = await session.run({ userInput: 'Hi Ama!' }).wait();
    await result.expect.nextEvent().isMessage({ role: 'assistant' }).judge(model, { intent: 'A short, friendly spoken reply that does not claim to be anyone other than Ama.' });
    result.expect.noMoreEvents();
  });

  it('passes to the mate the user asks for', { timeout: 30_000 }, async () => {
    const result = await session.run({ userInput: "Kojo, what's a good warm-up before a run?" }).wait();
    result.expect.nextEvent().isFunctionCall({ name: 'pass_to', args: { mate: 'Kojo' } });
    result.expect.nextEvent().isFunctionCallOutput();
    result.expect.containsAgentHandoff({ newAgentType: MateAgent });
  });

  it('hands real work to the chat with the details the user gave', { timeout: 30_000 }, async () => {
    const result = await session.run({ userInput: 'Can you email Kwesi the notes from this morning and say I will be late on Friday?' }).wait();
    // A short spoken lead-in ("Sure, on it") before the tool call is fine on a call.
    result.expect.skipNextEventIf({ type: 'message', role: 'assistant' });
    result.expect.nextEvent().isFunctionCall({ name: 'start_task' });
    result.expect.nextEvent().isFunctionCallOutput();
    await result.expect.nextEvent().isMessage({ role: 'assistant' }).judge(model, { intent: 'Says the task is under way; does not claim the email has already been sent.' });
    result.expect.noMoreEvents();
    const task = String(api.startTask.mock.calls[0]?.[1] ?? '');
    expect(task).toMatch(/Kwesi/);
    expect(task).toMatch(/Friday/);
  });

  it('says so when the task cannot be started, never claiming success', { timeout: 30_000 }, async () => {
    api.startTask.mockRejectedValue(new Error('The Mates API returned 503'));
    const result = await session.run({ userInput: 'Please email Kwesi that I will be late on Friday.' }).wait();
    result.expect.skipNextEventIf({ type: 'message', role: 'assistant' });
    result.expect.nextEvent().isFunctionCall({ name: 'start_task' });
    result.expect.nextEvent().isFunctionCallOutput();
    await result.expect.nextEvent().isMessage({ role: 'assistant' }).judge(model, { intent: "Tells the user it couldn't start the task right now and offers to try again or do it later; does not say the email was sent or is being sent." });
  });
});
