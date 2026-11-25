# The return trip — implementation handoff

**Branch:** `feat/return-trip`  
**Status:** Slices 1–5 are implemented in code. Migration and device validation are pending.

## Slice 1: outcome inventory

`apps/api/src/return-trip-outcome.ts` maps persisted states to `done`, `blocked`, or `failed`. Active, paused by the user, stopped, and cancelled states have no return-trip outcome. Browser `blocked` means access was denied and maps to **failed**; browser approval, login, control, and verification map to **blocked** because the user can act. A code run with a draft PR is still `done` at the run level; its notification copy may say that the draft needs review.

| Source | Done | Blocked | Failed | Existing completion path |
| --- | --- | --- | --- | --- |
| Durable run | completed | waiting | failed | `saveFinding` and `deliverFindings` |
| Code run | done | — | failed | `announce` in `code-runs.ts` |
| Deck | ready | — | failed | `announce` in `decks.ts` |
| Mission | done | needs_input | — | Mission status and round findings; no dedicated outcome push |
| Call | ended | — | failed | Meeting notes push on completion; failures need review |
| Browser handoff | completed | approval, login, user_control, verification | blocked, error, expired | The parent delegation owns delivery; browser session states only classify its card |
| Computer goal | done | waiting | failed | Goal push paths; avoid duplicate parent-run pushes |

## Gaps for the next slices

- Resuming a waiting task creates a new delegation ID. `deliveries` are unique per delegation and device, so the resumed completion may send a distinct push. Slice 2 makes its finding use the new answer instead of the waiting text copied into the resumed run. A waiting push already queued for the old delegation can still become stale if the user resolves it on another device; handle that when adding blocked follow-up cancellation.
- Failed findings prefer the stored error over earlier assistant text. Code, deck, computer, and meeting-note pushes now use stable `return-trip:` source keys in the shared outbox, so repeated announcements cannot create another notice. These user-requested results wait through quiet hours but do not use the unprompted budget or proactive mode. Normal run findings keep their per-delegation delivery rows; a resumed run has a new delegation ID.
- The shared outbox requires migrations `0051_tan_masque.sql` and `0052_friendly_sister_grimm.sql` from the quiet-hours branch. Slice 4 adds `0053_known_the_hand.sql`, with nullable `blocked_since` and `blocked_reminder_at` columns. Slice 5 adds `0054_free_trauma.sql`, with nullable `chats.watched_at`. Apply all four in order before deploying the API and Trigger worker. See `quiet-hours-noise-budget-handoff.md` for device checks.
- The minute dispatcher checks waiting delegations, computer goals, and missions after three hours. It enqueues one quiet-hours-aware reminder per unresolved item. Delegation claims recover after two minutes if the process stops before outbox insertion; computer and mission reminders use stable outbox source keys. Resolution is checked again before a delayed push. Unresolved items appear in the next brief's deferred section even when Tasks is off.
- A resumed task creates a new delegation, but reuses its original agent-run ID. Reminder and brief queries only treat a **later** delegation as a resume; otherwise a resumed delegation would match itself or an older episode and never receive its own reminder.
- Before broad rollout, consider a partial index on `delegations(blocked_since) WHERE status = 'waiting'` if minute-dispatcher scans become costly. Mission reminder taps currently open the group chat without locating the decision card; target routing is part of the next slice.
- Push taps pass the chat and result target. The chat switches before locating the target, loads older pages when needed, and falls back to the newest point if the message is no longer retained. Dedicated code, computer, and call result messages carry a message ID; deck and waiting computer cards are located by their card IDs.
- Result pushes from runs, code, decks, calls, and computer goals use the same `return-trip:` outbox. A 20-second collection window groups results that are ready together. One result opens its card in chat; several open “Ready for you” filtered to that push's result IDs, where each row opens its own target. Legacy findings with an already accepted or uncertain per-device delivery stay on their original path to avoid a duplicate during rollout. Queued run results are suppressed if cancelled or superseded by a later resume; a computer decision push is suppressed after the goal leaves waiting.
- Mobile refreshes `chats.watched_at` every 15 seconds while the chat is focused and the app is active. A result is suppressed only when that chat has been watched after the result was created and within the last 30 seconds. Other chats and old presence do not suppress it. This is a short-lived server signal, not `chats.updated_at`.
- Mission reminders now carry the current `mission_<id>_<round>` message target. The mobile notification handler accepts that target and the chat scroll logic finds the message.
- A partial index on `delegations(blocked_since) WHERE status = 'waiting'` remains a scale follow-up if the dispatcher scan grows costly.
- Integrate the quiet-hours and noise-budget policy from its feature branch when it lands on `main`.

## Ken

Apply migrations 0051–0054 in order on staging before deploying the API and Trigger worker together. The mobile build is required for chat presence, the grouped-results screen, and mission targets. No new environment variables are required.

On iOS and Android, verify one result opens its card; two results finishing within a minute produce one push and open the list; each list row opens the correct chat/card; a watched chat suppresses its own result while another chat still notifies; backgrounding the app does not suppress later results; quiet-hours deferral still sends after quiet end; and a resolved blocked item does not send a reminder. Check a mission reminder opens its latest round message. Confirm old accepted deliveries are not re-enqueued after deployment. No migration, deployment, or device check has been performed by the agent.
