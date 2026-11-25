# Quiet hours and noise budget — implementation and Ken handoff

**Branch:** `feat/mate-notification-noise-budget`  
**Status:** Backend policy and mate-profile controls are implemented. Deployment and device checks are pending.

## Scope

Each mate has a notification mode and local quiet hours. Normal mode permits up to one non-urgent push per mate per local day, with a global cap of three non-urgent pushes per user per local day. Urgent watches bypass quiet hours and both budgets, but are still blocked by Off. Over-budget and non-urgent Only urgent items are retained for a later morning brief. User-created reminders remain on their existing on-time path.

## Implementation map

- `apps/api/src/notification-settings.ts`: settings defaults, validation, timezone resolution, quiet-hour helpers, and budget policy.
- `apps/api/src/app.ts`: authenticated per-mate settings GET/PUT and registered-device timezone refresh endpoints.
- `apps/api/src/db/schema.ts`: per-mate settings, durable proactive notification outbox, and explicit watch urgency.
- `apps/api/src/delivery.ts`: central gate, atomic daily-budget reservation, quiet-hour retries, deferred brief items, and proactive finding routing.
- `apps/api/src/habits/nudges.ts`, `apps/api/src/habits/prep.ts`, `apps/api/src/watches.ts`, `apps/api/src/morning-brief-run.ts`: proactive sources routed through the gate.
- `apps/mobile/src/mates/mate-notification-settings.tsx`: Normal / Only urgent / Off controls, local quiet-hour pickers, timezone display, save/retry behavior.
- `apps/mobile/app/(app)/mate/[id].tsx`: notification controls on each mate profile.
- `apps/mobile/src/data/notifications.ts`: refreshes the registered device timezone when the app resumes; existing quiet-hour settings on the device token are preserved.

## Migrations and rollout

Apply migrations in order through the normal API deployment process:

1. `0051_tan_masque.sql` creates `mate_notification_settings`.
2. `0052_friendly_sister_grimm.sql` creates the proactive notification outbox and adds the `urgent` watch flag.

Both migrations are generated and have not been applied by this implementation. Verify them on a non-production database first. Deploy the API and Trigger worker together so old delivery rows cannot bypass the new outbox policy. No new environment variables are required. The mobile build is needed for the profile controls and timezone refresh.

New mates use Normal mode with quiet hours 22:00–07:00. Settings are lazily defaulted; no notification-setting backfill is required. Timezone follows the most recently refreshed enabled device and defaults to Africa/Accra for older registrations.

## Verification for Ken

Use a test account and verify:

1. Open each mate profile. Confirm defaults, all three modes, timezone label, and both time pickers on iOS and Android. Save changes, force a failed save, then retry; the draft should remain visible until saved.
2. In Normal mode, send a routine/habit/watch or meeting-prep notification during quiet hours. Confirm no push during quiet hours and one delivery after the configured end time. Chat content should still be posted while the push waits.
3. Change the device timezone, foreground the app, and confirm the settings label and next quiet-hour calculation use the new zone without resetting device quiet-hour values. Test across midnight and a DST transition.
4. Confirm Only urgent defers non-urgent proactive items and sends a watch marked urgent. Confirm Off suppresses both urgent and non-urgent proactive pushes.
5. Exercise per-mate and per-user caps: one non-urgent push for a mate per local day, no more than three across mates. Confirm excess items remain available to the next morning brief, including when the brief is currently disabled and enabled later.
6. Set an explicit reminder during quiet hours and confirm it still fires on time.
7. Restart or overlap the dispatcher while a notice is queued, quiet-deferred, over budget, and sending. Confirm only one push is accepted and queued work resumes safely.
8. Verify account deletion removes mate settings and outbox rows.

## Known behavior and limits

- Urgency is only set on a watch when the user explicitly asks to be notified during quiet hours. Other proactive sources are non-urgent.
- Reminder pushes intentionally bypass this proactive policy. User-requested and feature-specific direct pushes outside the scoped proactive sources also retain their existing behavior; review them separately before expanding the budget's scope.
- Quiet hours use one effective user timezone, selected from the most recently updated enabled device. A user with devices in different timezones does not yet get per-device quiet-hour delivery.
- The outbox uses at-most-once handling for uncertain provider outcomes. A provider timeout is not blindly retried because it may already have accepted the push.
- Deferred items are included in a later morning brief when one runs. They do not cause the brief to be enabled automatically.

## Verification completed during implementation

- `pnpm typecheck` — passed.
- `pnpm test` — passed (69 API test files, 646 API tests; 57 mobile tests).
- `git diff --check` — passed.

No database migration or deployment was run, and no physical-device notification check has been completed.
