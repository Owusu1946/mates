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

Bio edits are diffed against the existing memories (add, update or delete), so they never duplicate.
A save that repeats an existing memory updates it. If a shared save repeats a mate's note, the note is promoted to shared.

## Mates talking to each other
`cooper_check_with_mate { mate, question }` searches that mate's notes, plus close shared memories, by embedding. There's no model call. The reply shows a **Checked with {mate}** card (`WorkflowCard.kind = "consult"`).
The tool is offered only when the user has more than one mate and the reply has a speaker.

## Gentle questions
While there's no bio, in the first 7 days after the lead mate was created, the prompt may invite **one** natural question about the user, at most once a day.
`profiles.about_asked_at` is stamped whenever the invitation is included.

## Lifecycle
- **A mate is deleted:** its notes move to the lead mate, so nothing learned is lost. `ON DELETE SET NULL` is the safety net.
- **Memory is off:** no bio, memories, briefings or extraction are used. The bio is still saved.
- **Account deletion:** already removes `memories` and `profiles`.
- **Voice calls:** `memoryFacts(userId, mateId)` gives the same layers as plain lines. The voice agent's contract is unchanged.

## Deploy
1. Run migration `0031` (additive: one nullable column and an index on `memories`, three nullable columns on `profiles`).
2. Deploy the API and the worker.

The mobile changes are JavaScript only.
