import { initializeLogger } from '@livekit/agents';
import { describe, expect, it, vi } from 'vitest';
import { type CallApi, type CallMate, CallApiError, createCallApi } from './api.ts';
import { type CallState, type MateAgent, MAX_PRESENT, inviteMate, removeMate } from './mates.ts';
import { mateInstructions } from './prompts.ts';
import { MAX_LINES, Transcript } from './transcript.ts';

initializeLogger({ pretty: false, level: 'warn' });
// Building a mate's voice needs keys to exist; nothing here connects anywhere.
process.env.LIVEKIT_API_KEY ??= 'test-key';
process.env.LIVEKIT_API_SECRET ??= 'test-secret';

const callId ='00000000-0000-4000-8000-0000000000aa';
const mate = (id: string, name: string, voice = 'thalia'): CallMate => ({ id, name, brief: `${name}'s role`, voice, color: 'violet', shape: 'blob' });
const AMA = mate('00000000-0000-4000-8000-000000000001', 'Ama');
const KOJO = mate('00000000-0000-4000-8000-000000000002', 'Kojo', 'apollo');
const YAW = mate('00000000-0000-4000-8000-000000000003', 'Yaw', 'arcas');

describe('call api client', () => {
  it('sends the call token and reads the context', async () => {
    const fetch = vi.fn(async () => Response.json({ callId, leadMateId: AMA.id, chatKind: 'mate', chatTitle: '', mates: [AMA], memories: [], recent: [], keyterms: ['Ama'] }));
    const api = createCallApi({ baseUrl: 'https://api.test/', dispatch: { callId, callToken: 'signed.token' }, fetch });
    const context = await api.context();
    expect(context.mates[0]?.name).toBe('Ama');
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.test/v1/calls/${callId}/agent/context`);
    expect((init.headers as Record<string, string>)['x-call-token']).toBe('signed.token');
  });

  it("surfaces the API's error message", async () => {
    const fetch = vi.fn(async () => Response.json({ error: { message: 'Call not found' } }, { status: 404 }));
    const api = createCallApi({ baseUrl: 'https://api.test', dispatch: { callId, callToken: 'signed.token' }, fetch });
    await expect(api.startTask(AMA.id, 'email Kwesi')).rejects.toEqual(new CallApiError('Call not found'));
  });
});

describe('transcript', () => {
  it('keeps clean, attributed lines and the latest part of a long call', () => {
    const transcript = new Transcript();
    transcript.add('You', '  hello   there ');
    transcript.add('Ama', '   ');
    expect(transcript.lines).toEqual([expect.objectContaining({ speaker: 'You', text: 'hello there' })]);
    for (let i = 0; i < MAX_LINES + 5; i++) transcript.add('Ama', `line ${i}`);
    expect(transcript.lines).toHaveLength(MAX_LINES);
    expect(transcript.lines.at(-1)?.text).toBe(`line ${MAX_LINES + 4}`);
    expect(transcript.report(transcript.startedAt + 61_400).durationSec).toBe(61);
  });
});

describe('instructions', () => {
  it('name the other mates and only the facts given', () => {
    const text = mateInstructions(AMA, [KOJO], { memories: ['Prefers mornings'], recent: [], chatTitle: '' }, 'Kenneth');
    expect(text).toContain('You are Ama');
    expect(text).toContain("Kojo (Kojo's role)");
    expect(text).toContain('Prefers mornings');
    expect(mateInstructions(AMA, [], { memories: [], recent: [], chatTitle: '' })).toContain("It's just you");
  });
});

/** A session stand-in for the roster functions: they only touch these members. */
function fakeSession(present: CallMate[], api: Partial<CallApi> = {}) {
  const roster = new Map(present.map((m) => [m.id, m]));
  const published: Record<string, string>[] = [];
  const state: CallState = {
    api: api as CallApi,
    context: { memories: [], recent: [], chatTitle: '' },
    roster,
    present: present.map((m) => m.id),
    leadId: present[0]!.id,
    agents: new Map(),
    publish: (attributes) => published.push(attributes),
  };
  const session = {
    userData: state,
    currentAgent: { mate: present[0] } as MateAgent,
    generateReply: vi.fn(),
    updateAgent: vi.fn(),
  };
  return { session: session as never, state, published, raw: session };
}

describe('roster changes', () => {
  it('invites a mate, tells the app and has them welcomed', async () => {
    const { session, state, published, raw } = fakeSession([AMA], { invite: async () => [AMA, KOJO] });
    expect(await inviteMate(session, KOJO.id)).toEqual({ ok: true, present: [AMA.id, KOJO.id] });
    expect(state.roster.get(KOJO.id)?.voice).toBe('apollo');
    expect(published.at(-1)).toEqual({ 'mates.present': JSON.stringify([AMA.id, KOJO.id]) });
    expect(raw.generateReply).toHaveBeenCalledOnce();
  });

  it('refuses a fifth mate without calling the API', async () => {
    const invite = vi.fn();
    const four = [AMA, KOJO, YAW, mate('00000000-0000-4000-8000-000000000004', 'Esi')];
    const { session } = fakeSession(four, { invite });
    expect(await inviteMate(session, mate('00000000-0000-4000-8000-000000000005', 'Kofi').id)).toEqual({ ok: false, error: `A call holds ${MAX_PRESENT} mates at most.` });
    expect(invite).not.toHaveBeenCalled();
  });

  it('keeps the lead, and removing anyone else leaves the rest unchanged', async () => {
    const { session, state, raw } = fakeSession([AMA, KOJO, YAW]);
    expect((await removeMate(session, AMA.id)).ok).toBe(false);
    expect(await removeMate(session, KOJO.id)).toEqual({ ok: true, present: [AMA.id, YAW.id] });
    expect(state.present).toEqual([AMA.id, YAW.id]);
    expect(raw.updateAgent).not.toHaveBeenCalled();
  });

  it('hands back to the lead when the mate speaking is removed', async () => {
    const { session, raw } = fakeSession([AMA, KOJO]);
    raw.currentAgent = { mate: KOJO } as MateAgent;
    await removeMate(session, KOJO.id);
    expect(raw.updateAgent).toHaveBeenCalledOnce();
    expect((raw.updateAgent.mock.calls[0]?.[0] as MateAgent).mate.id).toBe(AMA.id);
  });
});
