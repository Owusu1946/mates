# 11 · Small touches

Grok Bot's mobile app lets you reply in a **thread**, **react** to a message, **mention @everyone** in a group, **play voice memos** the bot sends, and **refer a friend for a free usage reset** when you have none left. ([docs.x.ai/grok-bot/mobile](https://docs.x.ai/grok-bot/mobile)) Each is small. Ship them one at a time.

## a) Reactions
- **What it does:** long-press a message → 👍 ❤️ 😂 🎉 ✅ ❓. On a mate's reply, a reaction is light feedback: 👍 / ❤️ count as "good", ❓ asks the mate to clarify.
- **How:** `message_reactions` (`chatId, messageId, userId, emoji`), shown under the bubble. 👍/👎 feed the existing feedback signal; ❓ sends a follow-up run "The user is unsure about your last message; clarify briefly."
- **Cost:** $0.

## b) Threads
- **What it does:** "Reply in thread" on any message opens a side conversation with the same mate, scoped to that message. This keeps long chats tidy.
- **How:** the chat model already has `parentId` (branching). A thread is a message subtree shown in a sheet. Runs in a thread get the parent message plus the thread as context, not the whole chat.
- **Watch out:** the one-active-run-per-chat index (`delegations_active_chat`) would block a thread while the main chat runs. Key the index by `(chatId, threadRootId)`.
- **Cost:** $0, and slightly less context per run.

## c) @everyone in groups
- **What it does:** in a group, "@everyone what do you think?" makes every mate answer briefly, in turn.
- **How:** group routing (`groups.ts` `planGroupTurn`) already picks mates. @everyone forces all members with a short-answer instruction, capped at 8.
- **Cost:** N short turns, metered as usual.

## d) Voice replies (voice memos from the mate)
- **What it does:** a toggle "Reply with voice" per chat, or "say it" on any message. The mate's reply comes as an audio bubble in its own voice.
- **How:** TTS on the API with the same Inworld voices as calls (each mate's `voice`), producing **Opus/m4a** stored as an attachment. Play with `expo-audio`. Generated lazily, only when the bubble is first played.
- **Cost:** Inworld TTS about $25 per 1M characters, so about **$0.005 for a 200-character reply**. Usage source `voice`; capped per plan.

## e) Referral for a usage reset
- **What it does:** when someone hits a limit, "Invite a friend: when they join, your session resets." Once a week at most.
- **How:** `referrals` (`code, referrerId, refereeId, rewardedAt`). On the referee's first real use, reset the referrer's **5-hour window** (`usage_windows` row: `resetsAt = now`) and send a push. Abuse guards: one per referee device or account, the referee must verify email and send a few messages, and at most 1 reward per week.
- **Cost:** one extra session of usage per referral, a cheap acquisition channel.

## Order
Reactions → voice replies → threads → @everyone → referrals. That's about half a day to two days each. Reactions and @everyone need no native changes.
