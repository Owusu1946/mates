# The return trip — implementation handoff

**Branch:** `feat/return-trip`  
**Status:** Slices 1–2 outcome mapping and finding copy are implemented. Deep links, reminders, batching, and presence are pending.

## Slice 1: outcome inventory

`apps/api/src/return-trip-outcome.ts` maps persisted states to `done`, `blocked`, or `failed`. Active, paused by the user, stopped, and cancelled states have no return-trip outcome. Browser `blocked` means access was denied and maps to **failed**; browser approval, login, control, and verification map to **blocked** because the user can act. A code run with a draft PR is still `done` at the run level; its notification copy may say that the draft needs review.

| Source | Done | Blocked | Failed | Existing completion path |
| --- | --- | --- | --- | --- |
| Durable run | completed | waiting | failed | `saveFinding` and `deliverFindings` |
| Code run | done | — | failed | `announce` in `code-runs.ts` |
| Deck | ready | — | failed | `announce` in `decks.ts` |
| Mission | done | needs_input | — | Mission status and round findings; no dedicated outcome push |
| Call | ended | — | failed | Meeting notes push on completion; failures need review |
| Browser handoff | completed | approval, login, user_control, verification | blocked, error, expired | Cards in its parent run; avoid a second push for the same parent transition |
| Computer goal | done | waiting | failed | Goal push paths; avoid duplicate parent-run pushes |

## Gaps for the next slices

- Resuming a waiting task creates a new delegation ID. `deliveries` are unique per delegation and device, so the resumed completion may send a distinct push. Slice 2 makes its finding use the new answer instead of the waiting text copied into the resumed run. A waiting push already queued for the old delegation can still become stale if the user resolves it on another device; handle that when adding blocked follow-up cancellation.
- Failed findings now prefer the stored error over earlier assistant text. Direct code, deck, call, and computer notifications already have their own outcome copy; they remain on their existing delivery paths until transition identity is unified.
- Mate and group notification taps pass `notificationChatId`, but no result message target. `run-message-target.ts` already finds the current array position for a delegation.
- Code, deck, call, and computer notifications use separate `pushToUser` paths. Route them through a common transition identity before batching or reminders so one event is not sent twice.
- `chats.last_viewed_at` is not an active-chat presence signal. Foreground suppression needs a short-lived signal tied to the specific chat.
- Integrate the quiet-hours and noise-budget policy from its feature branch when it lands on `main`.

## Ken

No migration or deployment is needed for slice 1 alone. Later slices will update this handoff with migration order, worker changes, and device checks. No commit, push, or deployment was performed by the agent.
