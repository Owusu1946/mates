# In-app purchase progress and handoff

Last updated: 2026-11-13

## Status

**Backend sync is in progress and is not ready for deployment.** The existing foundation is the usage and plan system described in [usage.md](usage.md). Follow the implementation handover in [in-app-purchases.md](in-app-purchases.md), together with the decisions and corrections below.

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
| Backend subscription sync | Handed off to Ken | Routes and initial reconciliation exist but are unsafe to deploy; resolve the backend handoff below before enabling billing. |
| Revenue accounting and rollout | Not started | Idempotent transaction/refund handling and a safe grandfather cohort and cutoff procedure. |
| Mobile purchase foundation | Ready for review | SDK, optional keys, Clerk identity, purchase and restore helpers added; real purchase testing awaits a development build and safe staging backend. |
| Paywall and integration | Not started | iOS purchase screen, localized store prices, restore/manage actions, and usage navigation. |
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

## Work log

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
