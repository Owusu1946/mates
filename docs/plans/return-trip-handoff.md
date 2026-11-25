# The return trip — implementation handoff

**Branch:** `feat/return-trip`  
**Status:** Slices 1–2 are implemented. The quiet-hours branch is integrated into this working tree without a merge commit. Deep links, blocked reminders, batching, and active-chat presence are pending.

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
- Failed findings prefer the stored error over earlier assistant text. Code, deck, computer, and meeting-note pushes now use stable `return-trip:` source keys in the shared outbox, so repeated announcements cannot create another notice. These user-requested results wait through quiet hours but do not use the unprompted budget or proactive mode. Normal run findings keep their per-delegation delivery rows; a resumed run has a new delegation ID.
- The shared outbox requires migrations `0051_tan_masque.sql` and `0052_friendly_sister_grimm.sql` from the quiet-hours branch. Apply them before deploying the return-trip API or worker. See `quiet-hours-noise-budget-handoff.md` for deployment order and device checks.
- Mate and group notification taps pass `notificationChatId`, but no result message target. `run-message-target.ts` already finds the current array position for a delegation.
- Code, deck, call, and computer notifications use separate `pushToUser` paths. Route them through a common transition identity before batching or reminders so one event is not sent twice.
- `chats.last_viewed_at` is not an active-chat presence signal. Foreground suppression needs a short-lived signal tied to the specific chat.
- Integrate the quiet-hours and noise-budget policy from its feature branch when it lands on `main`.

## Ken

No migration or deployment is needed for slice 1 alone. Later slices will update this handoff with migration order, worker changes, and device checks. No commit, push, or deployment was performed by the agent.
