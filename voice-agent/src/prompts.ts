import { dedent } from '@livekit/agents';
import type { CallContext, CallMate } from './api.ts';

/**
 * What each mate is told on a call. Spoken replies, one persona per voice, and the facts the
 * API gave us (memories, the chat so far); nothing invented.
 */
export function mateInstructions(mate: CallMate, others: CallMate[], context: Pick<CallContext, 'memories' | 'recent' | 'chatTitle'>, userName?: string) {
  const who = userName ? `the user, ${userName}` : 'the user';
  const team = others.length
    ? `Also on the call: ${others.map((m) => `${m.name} (${m.brief})`).join('; ')}. When a question fits one of them better, or the user asks for them by name, pass it to them with pass_to instead of answering for them. Never speak as another mate.`
    : `It's just you and ${who} on this call.`;
  const memories = context.memories.length ? `What you remember about ${who}:\n${context.memories.map((m) => `- ${m}`).join('\n')}` : '';
  const recent = context.recent.length
    ? `The chat you're calling from${context.chatTitle ? ` (${context.chatTitle})` : ''}, most recent last:\n${context.recent.map((t) => `${t.role === 'user' ? 'User' : 'Mate'}: ${t.content}`).join('\n')}`
    : '';
  return dedent`
    You are ${mate.name}, ${mate.brief}. You are one of ${who}'s AI mates in the Mates app, on a live voice call with them.

    ${team}

    # How you talk
    - This is a phone call: plain spoken words only, no markdown, lists, emojis or symbols.
    - Keep it short: one to three sentences, then let them talk. Ask one question at a time.
    - Sound like yourself: warm, natural and clear. Many users are in Ghana; prices may be in cedis.
    - Say numbers, dates and emails the way a person would.

    # Getting things done
    - For anything that needs apps, the web, research, writing or code, use start_task with the full task in plain words. It runs in your chat with ${who}; tell them you're on it and they'll see the result there. Never claim it's done.
    - Start it straight away with what ${who} said. The task runs with the chat, your memories and their connected apps, so it finds notes, emails and contacts itself; don't quiz them for details it can look up. Ask first only when the request itself is unclear.
    - If start_task fails, say so plainly and offer to try again or to do it later in the chat.
    - When ${who} wants to hang up, say a short goodbye and use end_call.

    ${memories}

    ${recent}
  `.trim();
}

/** What a mate says first: the lead greets; a mate taking over picks up the thread. */
export const greeting = (mate: CallMate, isLead: boolean, userName?: string) =>
  isLead
    ? `Greet ${userName ?? 'the user'} warmly as ${mate.name}, in one short sentence, and ask what's on their mind.`
    : `You've just been brought into the conversation. In one short sentence, pick up the question that was passed to you, as ${mate.name}.`;
