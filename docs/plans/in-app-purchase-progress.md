# In-app purchase progress and handoff

Last updated: 2026-11-16

## Status

**Backend sync is done** (`fix/billing-safe`): grants, ordered and sandbox-safe syncs, a stored webhook with retries, revenue accounting and the grace-period script. It's safe to deploy with the RevenueCat keys unset; turn them on only on staging first. The existing foundation is the usage and plan system described in [usage.md](usage.md). Follow the implementation handover in [in-app-purchases.md](in-app-purchases.md), together with the decisions and corrections below.

Update this document after each reviewed batch with its status, changed files, checks, unresolved issues, and any setup needed from Ken. Samuel reviews each batch and handles all commits and pushes.

## Scope and decisions

- Release iOS purchases first. Structure the integration so Android can be connected later; Google Play setup and Android sandbox testing are deferred.
- Use RevenueCat's `react-native-purchases` SDK and a custom paywall. Offer the four documented plans, with monthly and yearly products. Starter has Apple's free trial (changed 2026-11-15; see [free-trial-handoff.md](free-trial-handoff.md)).
- RevenueCat subscription state informs the API's existing plan and usage system. Store secrets only in the API environment; the app receives only the public platform SDK key.
- Existing Mates users may redeem Apple's Starter introductory offer only when Apple reports their Apple ID eligible. Any separate grace period for existing users remains for Ken to decide; do not assume or grant 30 days unless that decision is confirmed. See [free-trial-handoff.md](free-trial-handoff.md).
- The RevenueCat public keys in the mobile environment schema should be optional during development. A missing iOS key should produce a clear billing-unavailable state.
- Configure purchase identity from Clerk's authenticated user. Run asynchronous login from an effect, handle errors and account changes, and wait for the correct identity before purchases or restores.
- “See plans” from Plan & usage and a `402 plan_required` action open the in-app paywall. Usage-limit notices still open `/usage`.

## Review batches

| Batch | Status | Handoff |
| --- | --- | --- |
| Backend subscription sync | Done (Ken) | Plan grants, ordered and sandbox-safe sync, a stored webhook with dispatcher retries. See usage.md, "Plans and where they come from" and "Payments". |
| Revenue accounting and rollout | Done in code (Ken) | Purchases, renewals, plan changes and refunds go to `plan_periods`, keyed by transaction id. Whether to run `scripts/grandfather.ts` for a new grace period remains a rollout decision; see [free-trial-handoff.md](free-trial-handoff.md). Still to do: check the figures against staging. |
| Mobile purchase foundation | Implemented | SDK, optional keys, Clerk identity, purchase and restore helpers are in place. A failed post-purchase sync is retried on the next authenticated app open. |
| Trial-aware paywall and access gate | Implemented; review next | Apple eligibility controls Starter trial copy; the no-plan gate, 402 navigation, trial status, and subscription management are wired. Requires iOS sandbox verification. |
| iOS sandbox and release | Not started | New development build, sandbox purchase and lifecycle checks, then coordinated rollout. |

## Ken / backend owner

### Remaining backend and rollout decisions

- Confirm whether existing users receive a separate backend grace period before paid enforcement. Apple's introductory-offer eligibility does not grant every Mates account a trial. Do not assume the previous 30-day grant without Ken's decision.
- Validate staging revenue figures and the production/staging environment configuration before launch.

- Ken owns backend environment configuration, deployment and worker changes. Samuel has configured the App Store products and RevenueCat App Store app; production deployment and the `DEFAULT_PLAN` enforcement change are not confirmed here.
- Configure the RevenueCat secret API key and webhook authorization in the appropriate API environment. Permit sandbox events only against a development or staging API. Never put secrets in mobile `EXPO_PUBLIC_*` variables or this document.
- Confirm the RevenueCat account's webhook access and set up the RevenueCat project, products, entitlements, offering and webhook as described in the handover. Agree the offering layout and product mapping before end-to-end testing; the app should read offerings dynamically.
- Coordinate App Store Connect products, keys and notification setup with Samuel. The iOS public SDK key is needed for the app; exchange Apple `.p8` keys and server secrets privately, never in this document or chat.
- Before enabling enforcement, confirm staging results and whether an existing-user grace period was approved. If so, capture and grant that cohort with the agreed expiry before changing `DEFAULT_PLAN`; otherwise do not run the grandfather script. Confirm matching `DEFAULT_PLAN` / `USAGE_ENFORCE` configuration for API and worker.

## Audit corrections to carry into implementation

- RevenueCat's `takehome_percentage` is deprecated; use current commission and tax fields defensively. Event `price` may already be negative for refunds, so do not blindly negate it. Account for refund reversals, missing fields and webhook retries. Verify event formats against [RevenueCat's current event documentation](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields) when implementing.
- Keep webhook processing idempotent, authenticate the webhook, distinguish sandbox from production, and reconcile current entitlement state with RevenueCat. Handle transfers and delayed or out-of-order events.
- Preserve `setPlan()` semantics and the typed API contract. Validate transaction and refund records against the existing finance views before relying on their reported amounts.
- A new native development build is required for real purchases; Expo Go does not support the required native IAP module.

## RevenueCat Test Store setup

Ken manages the RevenueCat dashboard. Before any test purchase or restore, connect the app to a **staging API and staging database** with sandbox processing enabled. The backend sync implementation is complete, but Ken must confirm staging and worker configuration. Never use production data for Test Store tests.

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

**Enforcement cutoff:** follow the decision in [free-trial-handoff.md](free-trial-handoff.md). If Ken confirms a grace period, capture and grant the cohort before changing `DEFAULT_PLAN`; otherwise, do not run the grandfather script. Set `DEFAULT_PLAN=none` and `USAGE_ENFORCE=on` on both API and worker only at the agreed launch cutoff.

## Work log

- 2026-11-14: Ken finished the backend batch on `fix/billing-safe`: plan grants (manual, grandfather, revenuecat; the best active one wins, never "none"), sync from RevenueCat's subscriptions with sandbox kept separate, promotional grants and unknown products handled, ordering by RevenueCat's `request_date`, a stored webhook with dispatcher retries, revenue and refund accounting, and `scripts/grandfather.ts`. 26 new tests; `pnpm typecheck && pnpm test` pass.
- 2026-11-16: Implemented the Starter trial and access-flow batch on `feat/starter-trial-paywall`. The paywall checks Apple eligibility per Starter product, derives trial duration and renewal price from RevenueCat product metadata, uses paid copy for unknown/ineligible results, and includes renewal terms, Restore, Terms, Privacy and Manage subscription. A no-plan account is routed to a blocking paywall after lead setup; Restore and sign-out remain reachable. Purchase/restore refresh usage, mates and chats; failed store-to-server sync is retried on the next authenticated app open. Plan & usage and Settings show active trial expiry and subscription management. `pnpm typecheck` and `pnpm test` pass. App Store Connect offer setup, sandbox lifecycle checks and Ken's existing-user grace-period decision remain outstanding.
- 2026-11-13: Added Test Store setup details and optional public key placeholders to the mobile environment example. Dashboard setup and sandbox transactions remain outstanding.
- 2026-11-13: Added the initial paywall, plan selection, store prices, restore and management links, and navigation from usage. Product IDs match the current Test Store and App Store products; sandbox lifecycle and visual device verification remain outstanding.
- 2026-11-13: Added the mobile SDK, optional iOS, Android and Test Store public keys, Clerk identity handling, and purchase / restore helpers. The paywall and real purchase testing remain. Backend sync is unsafe until Ken resolves the issues below.
- 2026-11-13: Samuel requested that Ken take over the unfinished backend and rollout work. The API implementation remains unsafe to deploy; the backend handoff above lists the unresolved issues.
- 2026-11-13: Added initial RevenueCat webhook and authenticated sync routes, environment placeholders and unit tests. `pnpm typecheck && pnpm test` passed. Do not deploy: manual/grandfathered plan precedence, concurrent sync ordering, and mixed sandbox/production receipts require resolution; route-level tests are still needed. Revenue accounting is not implemented.
- 2026-11-13 (superseded 2026-11-15): Audited the plans and agreed on iOS first, Android later, and staged review batches. Existing-user trial eligibility and any separate grace period are now governed by [free-trial-handoff.md](free-trial-handoff.md); no 30-day grant is assumed.

## Checks and open items

- [ ] Review the trial-aware paywall and access-flow batch; record the review outcome here.
- [x] Run `pnpm typecheck` and `pnpm test` from the repository root after changes, as required by `AGENTS.md` (2026-11-16).
- [ ] Confirm RevenueCat webhook access and product / offering setup with Ken.
- [ ] Configure iOS sandbox products and a tester; build a fresh development client.
- [ ] Verify purchase, plan change, restore, cancellation / expiry, refund handling and usage refresh against staging.
- [ ] Confirm whether existing users receive a separate grace period; execute the agreed procedure before production enforcement.
