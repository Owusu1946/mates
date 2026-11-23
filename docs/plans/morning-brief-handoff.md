# Morning brief v2 — implementation handoff

Owner: Sammy. Ken takes deployment and follow-up verification after Sammy reviews and commits each slice.

## Delivery sequence

Keep this as three reviewable commits. Sammy reviews, commits, and pushes manually after each slice.

1. **Foundation (current working tree):** dedicated per-user settings table, validated GET/PUT API, local-time next occurrence, weekend-off scheduling, migration, and scheduling tests. The brief defaults off. There is no dispatcher or mobile control yet, so do not deploy this slice as an enabled feature.
2. **Backend brief:** minute dispatcher claim and one occurrence per local day; parallel bounded read-only collectors; one structured model call; validated ranking/line cap; lead-mate chat message; one push; source-failure and late-run handling. Reuse `scheduling.ts`, `app-tools.ts`, `delivery.ts`, and the meeting-prep message pattern. Do not use a freeform user routine for brief execution.
3. **Mobile and measurement:** settings UI, brief line actions, per-line “Not useful” preference, brief-view event and open-rate query. Keep actions as navigation or reviewed drafts; no payment, booking, or reply is sent by tapping a line.

## Source dependencies

Calendar reads and Sail ride estimates exist. Gmail is available through Composio, but a brief-specific read/classification path is still needed. Weather, power-cut windows (C2), bills due (C1), stateful tasks (B6), and deferred noise items (A4) do not yet have reliable brief collectors. Omit unavailable sections and never invent a line. Commute needs a known origin and an unambiguous meeting destination; Sail returns estimates, not bookings.

## Slice 1 details

- `apps/api/src/morning-brief.ts` owns input validation, settings read/write, and next occurrence. `apps/api/src/db/schema.ts` adds `morning_brief_settings`.
- `apps/api/src/app.ts` exposes `GET` and `PUT /v1/morning-brief/settings`. Hono route typing flows through `@expojet/api-contract`.
- `apps/api/drizzle/0047_long_shiva.sql` is generated but **not applied**. Apply through the normal `pnpm db:migrate` deployment step before running an API build containing these routes.
- Account deletion includes the new table.
- The existing push quiet hours default to 22:00–08:00, so a 07:00 brief needs a product rule before delivery is wired. Recommended: explain the conflict in settings and do not silently bypass quiet hours.
- A brief that becomes due hours late should be skipped, not posted as a stale “morning” item. Use a stable local-day idempotency key.

## Verification and deployment for Ken

After each slice, run `pnpm typecheck && pnpm test` at the repository root and record the result here. Verify migration in a non-production database before production. For the complete feature, verify device push receipt and chat deep link on iOS and Android; check timezone changes, DST, weekends, disconnected apps, duplicate dispatcher runs, and a missed morning window. Record generated, delivered, and viewed brief counts separately; define 24-hour open rate over delivered briefs.

Current verification: API typecheck passes after restoring the lockfile's missing local `e2b` package with `pnpm install --frozen-lockfile`. Workspace `pnpm test` passes. Workspace `pnpm typecheck` still fails in mobile's pre-existing Expo Router generated route types for `share-pending` and `share-receive`. An attempted `expo start --offline` refresh stopped because the local install lacks `@expo/plist` required by `@bacons/apple-targets`; investigate that separately before regenerating route types. No migration has been applied and no deployment has been made.
