# Morning brief v2 — implementation handoff

Owner: Sammy. Ken takes deployment and follow-up verification after Sammy reviews and commits each slice.

## Delivery sequence

Keep this as three reviewable commits. Sammy reviews, commits, and pushes manually after each slice.

1. **Foundation (committed as `7bed6eb`):** dedicated per-user settings table, validated GET/PUT API, local-time next occurrence, weekend-off scheduling, migration, and scheduling tests. The brief defaults off.
2. **Backend brief (committed as `45af229`):** minute dispatcher claim and one occurrence per local day; parallel bounded read-only collectors; one structured model selection call; code-owned lines and caps; lead-mate chat message; one push attempt; source-failure and late-run handling. This is a system task, separate from user-created routines.
3. **Mobile and measurement (current working tree, awaiting Sammy's review):** settings UI, brief line actions, per-line “Not useful” preference, brief-view event and open-rate query. Actions only navigate or open source items; tapping a line sends no payment, booking, or reply.

## Source dependencies

Calendar reads and Sail ride estimates exist. Gmail is available through Composio, but a brief-specific read/classification path is still needed. Weather, power-cut windows (C2), bills due (C1), stateful tasks (B6), and deferred noise items (A4) do not yet have reliable brief collectors. Omit unavailable sections and never invent a line. Commute needs a known origin and an unambiguous meeting destination; Sail returns estimates, not bookings.

## Slice 1 details

- `apps/api/src/morning-brief.ts` owns input validation, settings read/write, and next occurrence. `apps/api/src/db/schema.ts` adds `morning_brief_settings`.
- `apps/api/src/app.ts` exposes `GET` and `PUT /v1/morning-brief/settings`. Hono route typing flows through `@expojet/api-contract`.
- `apps/api/drizzle/0047_long_shiva.sql` is generated but **not applied**. Apply through the normal `pnpm db:migrate` deployment step before running an API build containing these routes.
- Account deletion includes the new table.
- The existing push quiet hours default to 22:00–08:00, so a 07:00 brief needs a product rule before delivery is wired. Recommended: explain the conflict in settings and do not silently bypass quiet hours.
- A brief that becomes due hours late should be skipped, not posted as a stale “morning” item. Use a stable local-day idempotency key.

## Slice 2 details

- `morning-brief-run.ts` claims due settings and inserts a unique `(user, local_day)` occurrence in one SQL statement. A Trigger task runs each occurrence. Leases and a stable `brief_<id>` chat message ID let a retry resume without another chat post. After three failed attempts it stops. Occurrences more than 90 minutes late are skipped.
- `morning-brief-sources.ts` reads Google Calendar, Gmail headers/snippets, due reminders, and delegations waiting for user input. Each source is bounded and may fail independently. The model selects candidate IDs once across all sections; code supplies the text and action targets, limits output to eight lines and three emails, and falls back to calendar/tasks when selection fails. Weekend-light mode allows four lines and one email. Empty results produce no chat post or push. The calendar query covers the local day, including all-day events, but omits timed events already finished by brief time; pending reminders due earlier that day remain eligible.
- The chat message includes plain text and typed line metadata for the slice 3 action chips. The push uses the chat deep link fields and is claimed before sending to avoid duplicates. `push_accepted_at` means Expo accepted at least one request; it is **not** a device delivery receipt. Push respects existing device quiet hours. With the default 22:00–08:00 quiet period and a 07:00 brief, the chat post arrives at 07:00 and the push waits until 08:00. A push still in quiet hours after two hours is dropped and recorded in `morning_briefs.error`. Provider failures are recorded too; an uncertain push is never retried automatically because Expo may already have accepted it.
- `apps/api/drizzle/0048_dizzy_alex_power.sql` is generated and **not applied**. Apply after 0047 and before deploying the API/Trigger worker with this slice. Account deletion includes occurrences.
- The brief is sent even if the app was opened in the preceding 30 minutes. There is no reliable presence signal yet; avoiding a missed brief takes precedence. Revisit only after presence tracking exists.
- No-app fallback currently has due reminders and waiting delegations. Weather and C2 light-off data are still missing, so the specified weather/light/tasks fallback and a useful brief every day are **not complete**. Keep the setting disabled for general users until those collectors and the mobile controls are reviewed.

## Verification and deployment for Ken

After each slice, run `pnpm typecheck && pnpm test` at the repository root and record the result here. Verify migration in a non-production database before production. For the complete feature, verify device push receipt and chat deep link on iOS and Android; check timezone changes, DST, weekends, disconnected apps, duplicate dispatcher runs, and a missed morning window. Record generated, delivered, and viewed brief counts separately; define 24-hour open rate over delivered briefs.

Current verification: workspace `pnpm typecheck && pnpm test` passes after slice 3. Migrations 0047–0049 have not been applied, and no deployment has been made. Ken should verify the worker schedule is active and inspect a test user's one-day occurrence, chat message, push attempt, quiet-hours delay, feedback, and view timestamp before enabling the feature broadly.

Audit follow-up (committed as `fd22624`): store full worker errors, use the model's selection for calendar/tasks as well as email, include all-day events and pending reminders from local midnight, and record push rejection/expiry. The push claim remains at-most-once; clearing it after an uncertain provider response could duplicate notifications. Per-device quiet-hour delivery remains to be addressed before broad rollout.

## Slice 3 details and metric

- `apps/mobile/app/(app)/morning-brief.tsx` adds on/off, time, timezone, weekend, and available-section controls under Settings. New users default to Calendar, Email, and Tasks; the other five sections are named as upcoming. A muted section can be restored with its switch using an atomic section restore after the settings save. Saves preserve the draft on failure, and returning to Settings refetches feedback.
- Brief messages render `morning-brief-card.tsx` with an Open action and “Not useful” on each line. The latter saves a section mute through an authenticated endpoint, so subsequent briefs omit that section; restoring a section uses an atomic DELETE endpoint and cannot overwrite unrelated feedback. Calendar opens its verified HTTPS event link; email opens its Gmail thread in the default account; reminders open Tasks with the named reminder highlighted at the top; waiting runs open their feed item. These are navigation actions only.
- `apps/api/drizzle/0049_empty_sentry.sql` adds `muted_sections` and `viewed_at`. Apply after 0047 and 0048. `POST /v1/morning-brief/:id/view` records the first interaction idempotently, and `POST /v1/morning-brief/:id/not-useful` verifies ownership and the saved line before muting its section. A push tap or brief-line interaction is the current view signal; simply mounting a chat message does not count.
- Until device receipts are stored, `push_accepted_at` is the closest denominator to delivered. Use the following 30-day, matured-cohort query for a **push-accepted 24-hour interaction-rate proxy**; views come from a push tap or brief-line interaction, so passive reading is not counted. It is not verified device delivery. Compare the percentage with the 45% target only with that label.

```sql
SELECT
  count(*) FILTER (WHERE push_accepted_at IS NOT NULL) AS push_accepted,
  count(*) FILTER (WHERE push_accepted_at IS NOT NULL AND viewed_at >= scheduled_for AND viewed_at < scheduled_for + interval '24 hours') AS viewed_within_24h,
  round(100.0 * count(*) FILTER (WHERE push_accepted_at IS NOT NULL AND viewed_at >= scheduled_for AND viewed_at < scheduled_for + interval '24 hours')
    / nullif(count(*) FILTER (WHERE push_accepted_at IS NOT NULL), 0), 1) AS open_rate_pct
FROM morning_briefs
WHERE scheduled_for >= now() - interval '30 days'
  AND scheduled_for < now() - interval '24 hours'
  AND status = 'posted';
```

Ken: verify 0049 and then the commute-origin migration 0050 in a non-production database, then test settings save/failure recovery, a quiet-hours push, its deep link, every available line action, section muting and restoration, and a single `viewed_at` value after repeat taps and chat reopening. Opening a chat without interacting with a brief should leave `viewed_at` null. The ride commute source is added on `feat/ride-end-to-end`; see `ride-end-to-end-handoff.md` for its limits and checks. Weather/light/bills/deferred sources, per-device quiet-hour handling, and receipt-level delivery measurement remain rollout gaps.
