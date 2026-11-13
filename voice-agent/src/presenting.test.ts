import { describe, expect, it, vi } from 'vitest';
import { createCallApi } from './api.ts';
import { isSlideCue, narration } from './presenting.ts';

const presenting = (index: number, total: number, mode: 'screenshare' | 'tile' = 'screenshare', notes = 'Revenue doubled since March.') => ({
  status: 'presenting' as const,
  mode,
  deck: { id: 'd1', title: 'Q3 review', total },
  slide: { index, title: 'Revenue', notes, layout: 'chart' },
});

describe('presenting in a meeting', () => {
  it('hears slide cues without the mate being named, and ignores ordinary talk', () => {
    for (const cue of ['next slide', 'Next', 'go back', 'previous slide', 'slide 4', 'go to slide three', 'stop presenting', "that's enough"]) expect(isSlideCue(cue)).toBe(true);
    expect(isSlideCue('Revenue is up this month')).toBe(false);
    // A loose match only lets the line reach the mate, which then decides; it doesn't move a slide.
    expect(isSlideCue('the next quarter looks good')).toBe(true);
  });

  it('narrates from the speaker notes, moves on by itself, and asks for questions at the end', () => {
    const middle = narration(presenting(2, 5));
    expect(middle).toContain('slide 2 of 5');
    expect(middle).toContain('Revenue doubled since March.');
    expect(middle).toContain('go_to_slide with "next"');
    const last = narration(presenting(5, 5));
    expect(last).toContain('last slide');
    expect(last).toContain('stop_presenting');
    expect(narration(presenting(1, 5, 'tile'), true)).toContain("doesn't allow screen sharing");
    expect(narration(presenting(1, 5, 'screenshare'), true)).not.toContain('screen sharing');
    expect(narration(presenting(3, 5, 'screenshare', ''))).toContain('no speaker notes');
  });

  it('sends the meeting so far with a task, and talks to the presenting routes', async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.endsWith('/tasks')) return Response.json({ runId: 'run_1' });
      if (url.includes('/decks')) return Response.json({ decks: [{ id: 'd1', title: 'Q3 review', status: 'ready', built: 5, total: 5, building: false, fromThisChat: true }] });
      if (url.endsWith('/present')) return Response.json(presenting(1, 5));
      return Response.json({ stopped: true });
    });
    const api = createCallApi({ baseUrl: 'https://api.test', dispatch: { callId: '00000000-0000-4000-8000-0000000000aa', callToken: 'signed-token' }, fetch: fetch as unknown as typeof globalThis.fetch });
    await api.startTask('m1', 'make a deck on what we covered', [{ speaker: 'Meeting', text: 'We agreed to launch on the 24th.', at: '2026-11-13T10:00:00Z' }]);
    expect(calls[0]!.body).toMatchObject({ task: 'make a deck on what we covered', context: [{ text: 'We agreed to launch on the 24th.' }] });
    await api.startTask('m1', 'email Kwesi');
    expect(calls[1]!.body).not.toHaveProperty('context');
    expect((await api.findDecks('q3'))[0]!.title).toBe('Q3 review');
    expect(calls[2]!.url).toContain('/decks?q=q3');
    expect(await api.present('d1', 1)).toMatchObject({ status: 'presenting', slide: { index: 1 } });
    await api.stopPresenting();
    expect(calls.at(-1)!.url).toContain('/present/stop');
  });
});
