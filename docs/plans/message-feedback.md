# Message feedback

## Behavior

- A positive vote is saved immediately. Tapping the selected vote removes it.
- A negative vote requires a reason: wrong answer, didn't do what I asked, too slow, too long, or other. An optional note is limited to 1,000 characters.
- Feedback is attached to a saved assistant message. The API rejects requests while that message's run is queued or running.
- A one-to-one reply is attributed to the chat's mate. A group reply is attributed only when its saved message identifies exactly one speaker; otherwise mate attribution is empty.
- Offline or failed requests show an error toast and leave the previous selection in place. The user can retry.

## API and storage

The message_feedback table is unique by (clerk_user_id, message_id). The authenticated routes are:

- POST /v1/messages/:id/feedback with { "rating": "up" } or { "rating": "down", "reason": "...", "note": "..." }. Posting again updates the existing row.
- DELETE /v1/messages/:id/feedback removes the signed-in user's row and is safe to repeat.

The API verifies that the message is an assistant message in a chat owned by the authenticated user. It derives the run ID from the message's saved delegation metadata and records the most recently used OpenRouter model for that run when available. Client-supplied attribution is ignored.

Account deletion removes these rows. Feedback is for product quality review only and is never used to train models.

## Internal report

From apps/api, list the last week's negative feedback:

    pnpm exec tsx scripts/message-feedback-report.ts

Pass a day count from 1 to 90 to change the window. The JSON report includes reason, note, message/chat IDs, mate, run, model, and timestamp; it does not include conversation text.

## Validation

Migration 0039_cloudy_clint_barton.sql creates the table and its rating/reason checks (renumbered after the faster-replies migrations took 0036–0038). Apply it before merging, since the API deploys on merge.

Automated tests cover request validation, authentication, run readiness, group speaker attribution, and account-deletion registration. Device QA should cover selected-state toggling, reason selection, optional notes, success/error toasts, and a failed request with the API offline.
