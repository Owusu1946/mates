import { llm, type voice } from '@livekit/agents';
import { z } from 'zod';
import type { DeckSummary, PresentResult } from './api.ts';
import type { CallState } from './mates.ts';

/**
 * Presenting a deck in a meeting: the bot shares its screen with the current slide (or shows it on
 * its tile when the meeting won't allow sharing), and the mate talks through it from the speaker
 * notes, moving on by itself or when someone says "next", "back" or "stop".
 */

export type Presenting = { deckId: string; title: string; slide: number; total: number };

/** How often a deck that's still building is checked, and for how long. */
const WAIT_EVERY_MS = 5_000;
const WAIT_FOR_MS = 3 * 60_000;

/** While presenting, these are for the mate even without its name. */
const CUE = /\b(next( slide)?|go back|back|previous( slide)?|skip|slide (\d+|one|two|three|four|five|six|seven|eight|nine|ten)|stop( presenting| sharing)?|pause|that'?s enough|end the presentation)\b/i;
export const isSlideCue = (text: string) => CUE.test(text);

/** What the model gets back after a slide change: what's on screen and how to talk about it. */
export function narration(result: Extract<PresentResult, { status: 'presenting' }>, opening = false) {
  const { slide, deck } = result;
  const lines = [
    opening && result.mode === 'tile'
      ? "This meeting doesn't allow screen sharing, so the slides are on your own tile instead. Say that in one short sentence first."
      : '',
    `On screen now: slide ${slide.index} of ${deck.total} of "${deck.title}"${slide.title ? `: "${slide.title}"` : ''}.`,
    slide.notes ? `Speaker notes: ${slide.notes}` : 'There are no speaker notes; describe what the slide shows in a sentence or two.',
    slide.index < deck.total
      ? 'Present this slide now in your own words, in about 20 to 40 seconds, then call go_to_slide with "next". If someone asks something, answer it, then carry on.'
      : 'This is the last slide. Present it, then ask if there are any questions. Call stop_presenting when they are done or ask you to stop.',
  ];
  return lines.filter(Boolean).join('\n');
}

const pick = (decks: DeckSummary[], name?: string) => (name ? decks[0] : (decks.find((d) => d.fromThisChat) ?? decks[0]));

function startPresenting(state: CallState, result: Extract<PresentResult, { status: 'presenting' }>) {
  state.presenting = { deckId: result.deck.id, title: result.deck.title, slide: result.slide.index, total: result.deck.total };
  state.publish({ 'mates.presenting': result.mode });
}

export function stopWaiting(state: CallState) {
  if (state.waitingFor) clearInterval(state.waitingFor.timer);
  state.waitingFor = undefined;
}

/** A deck still being built: present it the moment it's ready, for a few minutes at most. */
function waitForDeck(session: voice.AgentSession<CallState>, deck: { id: string; title: string }) {
  const state = session.userData;
  stopWaiting(state);
  const since = Date.now();
  const timer = setInterval(async () => {
    if (Date.now() - since > WAIT_FOR_MS) {
      stopWaiting(state);
      session.generateReply({ instructions: `The deck "${deck.title}" is taking longer than expected. Say in one short sentence that it'll be in the chat when it's ready.`, toolChoice: 'none' });
      return;
    }
    const result = await state.api.present(deck.id, 1).catch(() => null);
    if (result?.status !== 'presenting') return;
    stopWaiting(state);
    startPresenting(state, result);
    session.generateReply({ instructions: `The deck is ready and on screen now. Say so in a few words, then begin.\n${narration(result, true)}` });
  }, WAIT_EVERY_MS);
  timer.unref?.();
  state.waitingFor = { deckId: deck.id, timer };
}

export const presentDeck = llm.tool({
  name: 'present_deck',
  description:
    "Present a slide deck in this meeting: it appears as your shared screen and you talk through it. Use when someone asks you to present, show or walk through slides or a deck. Leave deck empty for the one just made in this chat, or give part of its name.",
  parameters: z.object({ deck: z.string().optional().describe("Part of the deck's name, if they named one") }),
  execute: async ({ deck: name }, { ctx }: llm.ToolOptions<CallState>) => {
    const state = ctx.userData;
    try {
      const deck = pick(await state.api.findDecks(name), name);
      if (!deck) return name ? `There's no deck called "${name}". Say so briefly.` : "There's no deck to present yet. Offer to make one.";
      const result = await state.api.present(deck.id, 1);
      if (result.status === 'building') {
        waitForDeck(ctx.session, result.deck);
        return `"${result.deck.title}" is still being built (${result.deck.built} of ${result.deck.total || '?'} slides). Say you'll put it up the moment it's ready; you'll be told when.`;
      }
      startPresenting(state, result);
      return narration(result, true);
    } catch {
      return "Couldn't put the deck up: Mates couldn't be reached just now. Say so plainly.";
    }
  },
});

export const goToSlide = llm.tool({
  name: 'go_to_slide',
  description: 'While presenting, move to another slide: "next", "previous", or a slide number. Use after presenting a slide, or when someone asks.',
  parameters: z.object({ to: z.union([z.literal('next'), z.literal('previous'), z.number().int().min(1)]).describe('"next", "previous", or a slide number') }),
  execute: async ({ to }, { ctx }: llm.ToolOptions<CallState>) => {
    const state = ctx.userData;
    const current = state.presenting;
    if (!current) return 'Nothing is being presented right now.';
    // Finish talking about this slide before the next one appears.
    await ctx.waitForPlayout();
    const target = to === 'next' ? current.slide + 1 : to === 'previous' ? current.slide - 1 : to;
    if (target > current.total) return 'That was the last slide. Ask if there are any questions.';
    if (target < 1) return 'This is already the first slide.';
    try {
      const result = await state.api.present(current.deckId, target);
      if (result.status !== 'presenting') return 'The deck is being changed; wait a moment and try again.';
      startPresenting(state, result);
      return narration(result);
    } catch {
      return "Couldn't change the slide: Mates couldn't be reached just now.";
    }
  },
});

export const stopPresentingTool = llm.tool({
  name: 'stop_presenting',
  description: 'Stop presenting the deck and stop sharing your screen. Use when the presentation is over or someone asks you to stop.',
  parameters: z.object({}),
  execute: async (_args, { ctx }: llm.ToolOptions<CallState>) => {
    const state = ctx.userData;
    stopWaiting(state);
    if (!state.presenting) return 'Nothing is being presented.';
    state.presenting = undefined;
    state.publish({ 'mates.presenting': '' });
    await state.api.stopPresenting().catch(() => undefined);
    return 'Stopped presenting. Say so in a few words.';
  },
});
