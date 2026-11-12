import { describe, expect, it } from 'vitest';
import { dispatchSchema } from './api.ts';
import { addressed } from './mates.ts';
import { meetingInstructions } from './prompts.ts';

const ama = { id: '00000000-0000-4000-8000-000000000001', name: 'Ama', brief: 'research', voice: 'asteria', color: 'blue', shape: 'cloud' };

describe('a mate in a meeting', () => {
  it('knows when it is being spoken to', () => {
    expect(addressed('Ama, what did we promise the beta testers?', 'Ama')).toBe(true);
    expect(addressed('can you check that, ama?', 'Ama')).toBe(true);
    expect(addressed('Mates, take a note of that', 'Ama')).toBe(true);
    expect(addressed('Ama Serwaa, are you there?', 'Ama Serwaa')).toBe(true);
    expect(addressed('Okay so the launch is on the 24th', 'Ama')).toBe(false);
    expect(addressed('That was amazing work', 'Ama')).toBe(false);
  });

  it('reads the meeting mode from the dispatch, and calls stay calls', () => {
    const base = { callId: '00000000-0000-4000-8000-0000000000aa', callToken: 'signed-token' };
    expect(dispatchSchema.parse({ ...base, mode: 'meeting' }).mode).toBe('meeting');
    expect(dispatchSchema.parse(base).mode).toBeUndefined();
  });

  it('is told it is a guest in someone else\'s meeting, and how to act on requests', () => {
    const text = meetingInstructions(ama, { memories: [], recent: [], chatTitle: '' }, 'Kenneth');
    expect(text).toContain("Kenneth's AI mate");
    expect(text).toContain('start_task');
    expect(text).toContain('end_call');
    expect(text).not.toContain('pass_to');
  });
});
