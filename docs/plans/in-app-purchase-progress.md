# In-app purchase progress and handoff

Last updated: 2026-11-14

## Status

**Backend sync is done** (`fix/billing-safe`): grants, ordered and sandbox-safe syncs, a stored webhook with retries, revenue accounting and the grace-period script. It's safe to deploy with the RevenueCat keys unset; turn them on only on staging first. The existing foundation is the usage and plan system described in [usage.md](usage.md). Follow the implementation handover in [in-app-purchases.md](in-app-purchases.md), together with the decisions and corrections below.

Update this document after each reviewed batch with its status, changed files, checks, unresolved issues, and any setup needed from Ken. Samuel reviews each batch and handles all commits and pushes.

## Scope and decisions

- Release iOS purchases first. Structure the integration so Android can be connected later; Google Play setup and Android sandbox testing are deferred.
- Use RevenueCat's `react-native-purchases` SDK and a custom paywall. Offer the four documented plans, with monthly and yearly products and no free trial.
- RevenueCat subscription state informs the API's existing plan and usage system. Store secrets only in the API environment; the app receives only the public platform SDK key.
- Existing users receive Starter access for 30 days after paid enforcement begins. Capture the existing-user cohort before changing `DEFAULT_PLAN`, and explicitly transition that cohort at the cutoff: the current manual plan assignment has no automatic expiry. Confirm the actual cutoff and process with Ken before rollout.
- The RevenueCat public keys in the mobile environment schema should be optional during development. A missing iOS key should produce a clear billing-unavailable state.
- Configure purchase identity from Clerk's authenticated user. Run asynchronous login from an effect, handle errors and account changes, and wait for the correct identity before purchases or restores.
- The usage screen's external “See plans” link must open the paywall. Usage notices already open `/usage`.

## Review batches

| Batch | Status | Handoff |
| --- | --- | --- |
| Backend subscription sync | Done (Ken) | Plan grants, ordered and sandbox-safe sync, a stored webhook with dispatcher retries. See usage.md, "Plans and where they come from" and "Payments". |
| Revenue accounting and rollout | Done in code (Ken) | Purchases, renewals, plan changes and refunds go to `plan_periods`, keyed by transaction id. `scripts/grandfather.ts` gives the existing users their grace period. Still to do: check the figures against staging. |
| Mobile purchase foundation | Ready for review | SDK, optional keys, Clerk identity, purchase and restore helpers added; real purchase testing awaits a development build and safe staging backend. |
| Paywall and integration | In progress | Initial paywall and usage navigation added; product mapping and purchase flow require Test Store / iOS sandbox verification after Ken's backend fixes. |
| iOS sandbox and release | Not started | New development build, sandbox purchase and lifecycle checks, then coordinated rollout. |

## Ken / backend owner

### Backend handoff: required before deployment

- **Manual and purchased access:** `profiles.plan` and `plan_source` currently hold only one grant. A RevenueCat sync can overwrite a manual or grandfathered grant, and a paid upgrade can erase the grant that should remain after cancellation. Design durable storage for both grants, their precedence, and the agreed 30-day expiry; migrate existing manual assignments and keep the usage API contract intact.
- **Concurrent reconciliation:** overlapping webhook and client sync requests can write older RevenueCat state after newer state. Coordinate updates per user across API instances and cover delayed and out-of-order requests with tests.
- **Sandbox isolation:** RevenueCat customers can have sandbox and production receipts. The current v1 subscriber lookup joins entitlement and subscription data by product identifier; this has not been validated for mixed environments. Ensure production sync cannot grant test access or revoke a valid production subscription. RevenueCat's v2 customer subscription listing supports an environment filter; evaluate its pagination, entitlement mapping and credentials before choosing an approach.
- **Webhook handling:** retain authentication and idempotency, reconcile both sides of transfers (whose environment may be absent), and ensure timely responses with durable retryable processing. An unrecognized entitlement must not silently revoke access. Add route tests for successful sync, sandbox handling, failures, transfers and retries.
- **Revenue accounting and rollout:** implement transaction and refund/reversal accounting, then capture the existing-user cohort before enforcement and define how its 30-day grant expires. Validate reporting against the existing finance views.
- The current endpoints and tests are a starting point only. No backend deployment, RevenueCat configuration, or live purchase testing has been performed.

- Own backend environment configuration, deployment and worker changes. No production deployment, `DEFAULT_PLAN` change, RevenueCat dashboard change, or store submission has been performed.
- Configure the RevenueCat secret API key and webhook authorization in the appropriate API environment. Permit sandbox events only against a development or staging API. Never put secrets in mobile `EXPO_PUBLIC_*` variables or this document.
- Confirm the RevenueCat account's webhook access and set up the RevenueCat project, products, entitlements, offering and webhook as described in the handover. Agree the offering layout and product mapping before end-to-end testing; the app should read offerings dynamically.
- Coordinate App Store Connect products, keys and notification setup with Samuel. The iOS public SDK key is needed for the app; exchange Apple `.p8` keys and server secrets privately, never in this document or chat.
- Before enabling enforcement, confirm staging results, the captured existing-user cohort, its 30-day cutoff, and matching `DEFAULT_PLAN` / `USAGE_ENFORCE` configuration for the API and worker.

## Audit corrections to carry into implementation

- RevenueCat's `takehome_percentage` is deprecated; use current commission and tax fields defensively. Event `price` may already be negative for refunds, so do not blindly negate it. Account for refund reversals, missing fields and webhook retries. Verify event formats against [RevenueCat's current event documentation](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields) when implementing.
- Keep webhook processing idempotent, authenticate the webhook, distinguish sandbox from production, and reconcile current entitlement state with RevenueCat. Handle transfers and delayed or out-of-order events.
- Preserve `setPlan()` semantics and the typed API contract. Validate transaction and refund records against the existing finance views before relying on their reported amounts.
- A new native development build is required for real purchases; Expo Go does not support the required native IAP module.

## RevenueCat Test Store setup

Ken manages the RevenueCat dashboard. Before any test purchase or restore, connect the app to a **staging API and staging database** with sandbox processing enabled; the current backend sync must first be fixed. The app calls the API after both operations, and must not use production data for Test Store tests.

1. Create the Test Store in the Mates RevenueCat project and copy its public SDK key. Configure the key locally as `EXPO_PUBLIC_REVENUECAT_TEST_KEY`; do not commit `.env` values. The app selects this key in development when it is present.
2. Create the entitlements `starter`, `plus`, `pro`, and `max`. Attach each plan's monthly and yearly Test Store products to the corresponding entitlement, then add the products to an offering.
3. Use the following product identifiers and durations. The current paywall matches these exact product identifiers; package identifiers can be chosen in RevenueCat.

| Plan | Monthly product / price | Yearly product / price |
| --- | --- | --- |
| Starter | `mates_starter_monthly` / $8 | `mates_starter_annual` / $80 (Test Store); `mates_starter_yearly` / $80 (planned App Store ID) |
| Plus | `mates_plus_monthly` / $15 | `mates_plus_yearly` / $150 |
| Pro | `mates_pro_monthly` / $40 | `mates_pro_yearly` / $400 |
| Max | `mates_max_monthly` / $80 | `mates_max_yearly` / $800 |

4. The current Test Store offering is `mates_tiers`. The `starter` entitlement includes `mates_starter_monthly` and `mates_starter_annual`; the latter is no longer attached to `mates_pro`. The app reads the current offering and recognizes both Starter yearly identifiers. Its own paywall is custom, so a RevenueCat-hosted paywall is not required.
5. Build a new iOS development client including `react-native-purchases`. Test Store uses a simulated purchase screen; test success, cancellation and failure, then check the staging API and usage screen.
6. Before TestFlight or App Store submission, configure the App Store products and use `EXPO_PUBLIC_REVENUECAT_IOS_KEY`. RevenueCat Test Store keys must not be used in release builds; TestFlight is a release build. Complete Apple Sandbox testing separately.

The Test Store key is public by design. RevenueCat secret keys and webhook authorization values belong only in Ken's server configuration, never in mobile `.env` files or this document.

## Deploy and cutoff (Ken)

**Deploy the backend:** this is safe now, and it changes nobody's access.
1. Run `pnpm --filter @expojet/api db:migrate`. Migration 0030 copies every existing plan into a manual grant.
2. Deploy the API and the worker.
3. Keep `REVENUECAT_SECRET_KEY` and `REVENUECAT_WEBHOOK_AUTH` **unset on production** until staging has passed. Until then, sync answers `503 BILLING_UNAVAILABLE` and the webhook answers 401.

**Staging:**
1. Set up a separate Railway API and worker on a Neon branch.
2. Set `REVENUECAT_SECRET_KEY`, `REVENUECAT_WEBHOOK_AUTH` and `REVENUECAT_ALLOW_SANDBOX=true`.
3. Add a RevenueCat webhook pointing at `https://<staging-host>/webhooks/revenuecat`, with the same authorization value.

**Go live:**
1. Set the two RevenueCat variables on the production API.
2. Add the production webhook: `https://mates-production.up.railway.app/webhooks/revenuecat`.
3. Ship the app build.

**Enforcement cutoff:** the 30-day grace period.
1. Run `pnpm exec tsx scripts/grandfather.ts --until <start + 30 days> --dry-run` in `apps/api` to see the count, then run it again without `--dry-run`.
2. Set `DEFAULT_PLAN=none` and `USAGE_ENFORCE=on` on **both** the API and the worker.
3. The existing users keep Starter until the date, then fall back to the default. Anyone who subscribed keeps their plan.

## Work log

- 2026-11-14: Ken finished the backend batch on `fix/billing-safe`: plan grants (manual, grandfather, revenuecat; the best active one wins, never "none"), sync from RevenueCat's subscriptions with sandbox kept separate, promotional grants and unknown products handled, ordering by RevenueCat's `request_date`, a stored webhook with dispatcher retries, revenue and refund accounting, and `scripts/grandfather.ts`. 26 new tests; `pnpm typecheck && pnpm test` pass.
- 2026-11-13: Added Test Store setup details and optional public key placeholders to the mobile environment example. Dashboard setup and sandbox transactions remain outstanding.
- 2026-11-13: Added an initial paywall, plan selection, store prices, restore and management links, and navigation from usage. The paywall expects the documented iOS product IDs; configure matching Test Store IDs for early testing. No end-to-end purchase or visual device verification has been performed.
- 2026-11-13: Added the mobile SDK, optional iOS, Android and Test Store public keys, Clerk identity handling, and purchase / restore helpers. The paywall and real purchase testing remain. Backend sync is unsafe until Ken resolves the issues below.
- 2026-11-13: Samuel requested that Ken take over the unfinished backend and rollout work. The API implementation remains unsafe to deploy; the backend handoff above lists the unresolved issues.
- 2026-11-13: Added initial RevenueCat webhook and authenticated sync routes, environment placeholders and unit tests. `pnpm typecheck && pnpm test` passed. Do not deploy: manual/grandfathered plan precedence, concurrent sync ordering, and mixed sandbox/production receipts require resolution; route-level tests are still needed. Revenue accounting is not implemented.
- 2026-11-13: Audited the existing plans, usage implementation and Expo / RevenueCat guidance. Agreed on iOS first, Android later, four review batches, and a 30-day existing-user grace period. No IAP code, external configuration, deployment or store testing has been completed.

## Checks and open items

- [ ] Implement and review each batch; record the actual checks and results here.
- [ ] Run `pnpm typecheck` and `pnpm test` from the repository root after changes, as required by `AGENTS.md`.
- [ ] Confirm RevenueCat webhook access and product / offering setup with Ken.
- [ ] Configure iOS sandbox products and a tester; build a fresh development client.
- [ ] Verify purchase, plan change, restore, cancellation / expiry, refund handling and usage refresh against staging.
- [ ] Agree and execute the grandfather cohort and cutoff procedure before production enforcement.
