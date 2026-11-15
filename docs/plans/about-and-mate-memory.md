# About you, and each mate's own memory

## The layers
A mate's memory section in its system prompt (`memoryContext(userId, query, speaker)` in `apps/api/src/memory.ts`) is built from:

1. **About you** (`profiles.bio`): what the user told their lead mate, in their own words. Up to 1,200 characters go into the prompt, framed as facts, never instructions.
2. **Shared memories** (`memories.mate_id IS NULL`): who the user is, their people and preferences. Every mate sees these. Every memory saved before this feature is shared.
3. **The mate's own notes** (`memories.mate_id = <mate>`): details that matter mostly to that mate's role, such as a money mate's budgets.
4. **What the crew knows** (lead mate only): the other mates' notes, labelled by mate.

Each slice uses the same selection as before: everything while it's small, then the most important memories plus those closest to the message.
Callers that pass no speaker (older paths) get the single list they got before.

## Where memories come from
| Source | When | Scope |
|---|---|---|
| `bio` | `PUT /v1/about` (onboarding or the Memory screen), in the background | shared, or a specialist's note when the fact fits its role |
| `auto` | after each reply (`extractMemories`) | in a mate's own chat: `shared` or `mine`, chosen per fact; group chats: shared |
| `explicit` | the `cooper_memory` tool | `scope: "shared"` (default) or `"mine"` |
| `briefing` | a new mate is created (`briefMate`), in the background | that mate's notes (0–5) |

Bio edits are diffed against the existing memories (add, update or delete), so they never duplicate. A bio edit can only delete memories that came from the bio, never ones learned in chat.
A save that repeats an existing memory updates it. If a shared save repeats a mate's note, the note is promoted to shared.

### Turning the bio into memories, reliably
`profiles.bio_processed_at` records the bio version (its `bio_updated_at`) last turned into memories. Work is due whenever it's behind.
- **One at a time:** `processBio` claims `bio_lease_until` (3 minutes) before working. A save made meanwhile stays due and is picked up next, so overlapping saves never run twice in parallel.
- **Retries:** a failure adds to `bio_attempts`. The every-minute dispatcher (`processPendingBios`) retries up to 5 times, and also picks up work lost to a restart. A new save resets the count.
- **Memory off:** nothing is processed. Switching memory on processes the bio straight away, and the dispatcher catches anything missed.
- **Onboarding** passes `wait: true`, so the reply waits up to 20 seconds and the lead's welcome is already in its chat when it opens.
- **The welcome** has a fixed id, so it appears once ever, from whichever save first produces memories.
- **Clearing the bio** keeps its memories unless the user chooses "Forget that too" (`forgetLearned`).

### Messages the server posts in a mate's chat
The phone loads a chat once and doesn't live-refresh, so a message posted while that chat is open would branch the thread on the user's next send.
- **A new mate's hello** is written in the same batch as the mate and its chat. It's a fixed template that says the lead filled it in when there was something to pass on.
- **A background welcome** is skipped while a reply is in progress in that chat.

## Mates talking to each other
`cooper_check_with_mate { mate, question }` searches that mate's notes, plus close shared memories, by embedding. There's no model call. The reply shows a **Checked with {mate}** card (`WorkflowCard.kind = "consult"`).
The tool is offered only when the user has more than one mate and the reply has a speaker.

## Gentle questions
While there's no bio, in the first 7 days after the lead mate was created, the prompt may invite **one** natural question about the user, at most once a day.
This happens only in live conversations, never in a routine, watch, habit, call summary, mission round or board task. `profiles.about_asked_at` is stamped only when the invitation is included.

## The lead mate
What the lead mate learns, or saves itself, is always shared: it talks about everything, so the specialists must not miss the basics. Only specialists keep notes of their own.

## Lifecycle
- **A mate is deleted:** its notes move to the lead mate, so nothing learned is lost. `ON DELETE SET NULL` is the safety net.
- **A mate's role changes:** its notes move to the lead mate, and it is briefed again for the new role.
- **Briefing** reads the bio, the shared memories and the lead's notes, so a re-created specialist gets back what an earlier one knew.
- **Memory is off:** no bio, memories, briefings or extraction are used. The bio is still saved.
- **Account deletion:** already removes `memories` and `profiles`.
- **Voice calls:** `memoryFacts(userId, mateId)` gives the same layers as plain lines. The voice agent's contract is unchanged.

## Deploy
1. Run migrations `0031` and `0032` (both additive: one nullable column and an index on `memories`; nullable columns, plus `bio_attempts` defaulting to 0, on `profiles`).
2. Deploy the API and the worker.

The mobile changes are JavaScript only.
