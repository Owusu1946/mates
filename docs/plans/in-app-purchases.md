# In-app purchases with RevenueCat: the full handover

This is everything needed to add paid plans to the Mates app with RevenueCat (App Store and Google Play). Read it top to bottom once before writing any code.

Usage limits (PR #65) are already built and live, so **you are only connecting payments to a plan field that already exists.** You do not build limits, metering or the usage screen. They are done.

---

## 0. The one-paragraph version

Each person has a `plan` stored in the database (`profiles.plan`): `starter`, `plus`, `pro`, `max` or `none`. Everything else (limits, the usage screen, margins) reads that one field. Your job:
1. Let people buy a subscription in the app (RevenueCat SDK plus a paywall screen).
2. When RevenueCat says someone bought, renewed, changed or lost a subscription, the server calls the existing function **`setPlan()`** with the right plan and the money amounts.
3. When it's live, flip `DEFAULT_PLAN` to `none`, so people without a subscription can't use mates.

---

## 1. Ground rules (don't skip)

- **Secrets stay in `apps/api` only.**
  - The RevenueCat **secret** API key and the webhook auth value must never go in the mobile app, `EXPO_PUBLIC_*` variables or git.
  - The mobile app only gets RevenueCat's **public SDK keys**, which are designed to be public.
- **Never trust the phone about payments.** The server decides the plan, from RevenueCat's servers. The app only shows what the server says (`GET /v1/usage`).
- **Run `pnpm typecheck && pnpm test` from the repo root before every commit** (from `AGENTS.md`).
- **Small, signed commits.** No secrets in commits.
- **Apple rule (App Store guideline 3.1.1):** on iOS, buttons that unlock paid features must use in-app purchase. Today "See plans" opens our website's pricing page (`upgradeUrl`). That will get the iOS app **rejected** once real plans exist. On the phone it must open **your paywall**. (Details in §6.4.)
- **This needs a new dev build.** `react-native-purchases` is a native module, so Expo Go and the current builds won't have it.

---

## 2. What already exists (read these files first)

| What | Where | What it does |
|---|---|---|
| Plan list and prices | `apps/api/src/usage/plans.ts` | `PLAN_IDS`, `isPlanId()`, `planSpec(plan)` (gives `.priceMicros`, `.label`, `.budgets`), `resolvePlan()`, `defaultPlan()` |
| **The function you call** | `apps/api/src/usage/billing.ts` → **`setPlan(userId, plan, options)`** | Writes `profiles.plan`. With `options.period`, also records a payment row in `plan_periods`. The row is idempotent on `externalId`. |
| Where someone stands | `apps/api/src/usage/gate.ts` → `usageState(userId)` | Plan, windows and whether they're blocked |
| Admin plan route | `apps/api/src/app.ts` → `PUT /internal/users/:id/plan` | Sets plans by hand (header `x-admin-key`). Keep it for support and comps. |
| Manual plan script | `apps/api/scripts/set-plan.ts` | Same, from the command line |
| Constant-time key check | `apps/api/src/usage/billing.ts` → `adminAuthorized()` | Copy this pattern for the webhook's auth check |
| Usage endpoint the app reads | `GET /v1/usage` in `apps/api/src/app.ts` | Returns `{ plan, windows, blocked, enforced, upgradeUrl, remainingMicros }` |
| Usage hook in the app | `apps/mobile/src/usage/use-usage.ts` → `useUsage()` | React Query, key `["usage", userId]` |
| Usage screen | `apps/mobile/app/(app)/usage.tsx` | Has the **"See plans" / "Compare plans" button** you'll repoint |
| Limit notices | `apps/mobile/src/usage/usage-notice.tsx` | The line above the composer and the limit reply. They open `/usage`. |
| Settings row | `apps/mobile/app/(app)/settings.tsx` | The "Plan & usage" row |
| DB tables | `apps/api/src/db/schema.ts` | `profiles` (`plan`, `planSource`), `planPeriods`, `usageEvents`, `usageWindows`, `usageDaily`, `fixedCosts` |
| Finance views | migration `apps/api/drizzle/0027_*.sql` | `v_revenue_month`, `v_user_margin`, `v_plan_margin`, `v_profit_month`. They already read `plan_periods`. |
| How usage works | `docs/plans/usage.md` | Read it |

**`setPlan` signature** (current code, don't change its meaning):

```ts
setPlan(
  userId: string,                 // Clerk user id, e.g. "user_2abc..."
  plan: "starter" | "plus" | "pro" | "max" | "none",
  options?: {
    source?: "manual" | "revenuecat",
    period?: {                    // omit = just change the plan, record no money
      startsAt?: Date, endsAt?: Date,
      grossMicros?: number,       // what the customer paid, in micro-dollars (1_000_000 = $1)
      storeFeeMicros?: number,    // Apple/Google's cut, in micro-dollars
      externalId?: string,        // the store transaction id: the same id never records twice
    },
  },
)
```

The **user id is the Clerk user id** everywhere. Use it as RevenueCat's `appUserID`, so a webhook maps straight to our user with no lookup table.

---

## 3. Plans and products to create

Prices come from the landing page (`apps/web/src/components/Pricing.astro`). A yearly plan costs 10 months (2 months free).

| Our plan id | RevenueCat entitlement id | Monthly product id | Yearly product id | Monthly | Yearly |
|---|---|---|---|---|---|
| `starter` | `starter` | `mates_starter_monthly` | `mates_starter_yearly` | $8 | $80 |
| `plus` | `plus` | `mates_plus_monthly` | `mates_plus_yearly` | $15 | $150 |
| `pro` | `pro` | `mates_pro_monthly` | `mates_pro_yearly` | $40 | $400 |
| `max` | `max` | `mates_max_monthly` | `mates_max_yearly` | $80 | $800 |

**Rules:**
- **Entitlement ids must equal our plan ids exactly** (`starter`, `plus`, `pro`, `max`). The server turns entitlements into a plan by name.
- **One subscription group on iOS** ("Mates") with all eight products, ranked Max > Pro > Plus > Starter. Apple then handles upgrades and downgrades as plan changes, not as second subscriptions.
- **On Google Play**, one subscription per plan with a monthly and a yearly base plan is fine. Product ids can use the `:base-plan` form RevenueCat shows; keep the table above as the naming.
- **One RevenueCat Offering**, `default`, with packages `$rc_monthly` / `$rc_annual` for each plan. A simpler alternative is one offering per plan. Either works; the paywall reads offerings.
- **No free trial.** It was decided against, so don't add introductory offers.

**Store setup checklist (done by whoever owns the store accounts):**
1. App Store Connect: paid apps agreement signed; subscription group and 8 products created with prices, localisations and review screenshots.
2. Google Play Console: merchant account; subscriptions and base plans created.
3. RevenueCat: a project, with the iOS app (App Store Connect API key or in-app purchase key uploaded) and the Android app (Play service account JSON uploaded).
4. RevenueCat: products imported, the 4 entitlements created and products attached, the offering created.
5. RevenueCat → Integrations → **Webhooks**: URL `https://<API host>/webhooks/revenuecat`, with an authorization header value you generate (§4.1).

---

## 4. Server work (`apps/api`)

### 4.1 Environment variables

Add these to **Railway (the API service) only**. The worker doesn't need them.

```
REVENUECAT_SECRET_KEY=sk_xxxxxxxxxxxxxxxxx        # RevenueCat → Project settings → API keys → secret key
REVENUECAT_WEBHOOK_AUTH=<long random string>     # paste the same value into RevenueCat's webhook "Authorization header"
REVENUECAT_ALLOW_SANDBOX=false                   # true only on a dev/staging API, so test purchases set plans there
```

Generate the webhook value with `openssl rand -hex 32`. Also add both names to `apps/api/.env.example` if one exists, with empty values. **Never commit real values.**

### 4.2 New file: `apps/api/src/usage/revenuecat.ts`

Responsibilities:
1. `revenueCatAuthorized(header)`: a constant-time compare of the `Authorization` header against `REVENUECAT_WEBHOOK_AUTH`. Copy `adminAuthorized()` from `billing.ts`.
2. `planFromEntitlements(active: string[])`: picks the **highest** active entitlement (`max` > `pro` > `plus` > `starter`) and returns `"none"` if nothing is active. Ignore names that aren't plan ids (use `isPlanId`).
3. `fetchSubscriber(userId)`: `GET https://api.revenuecat.com/v1/subscribers/{encodeURIComponent(userId)}` with `Authorization: Bearer ${REVENUECAT_SECRET_KEY}`.
   - Returns the entitlements whose `expires_date` is null or in the future.
   - This is the **source of truth**. Webhook events can arrive late or out of order, so always ask RevenueCat for the current state instead of trusting one event's type.
4. `handleRevenueCatEvent(body)`: the logic in §4.4.
5. `syncFromRevenueCat(userId)`: fetches the subscriber, computes the plan and calls `setPlan(userId, plan, { source: "revenuecat" })` with **no period**, so no money is recorded. Used by the app right after a purchase (§4.5).

### 4.3 New routes in `apps/api/src/app.ts`

Follow the style of the existing routes and the `failure()` helper.

```ts
// RevenueCat webhook: no Clerk auth (RevenueCat calls it), its own shared secret instead.
.post("/webhooks/revenuecat", bodyLimit({ maxSize: 200_000 }), async (c) => {
  if (!revenueCatAuthorized(c.req.header("authorization"))) return c.json(failure("UNAUTHORIZED", "Bad webhook auth", c.get("requestId")), 401);
  const body = await c.req.json().catch(() => null);
  if (!body?.event) return c.json(failure("INVALID_EVENT", "No event", c.get("requestId")), 400);
  await handleRevenueCatEvent(body.event);
  return c.json({ ok: true }); // must be 200 quickly, or RevenueCat retries
})

// The app calls this right after a purchase or restore, so the plan updates before the webhook lands.
.post("/v1/billing/sync", auth, async (c) => {
  await syncFromRevenueCat(c.get("userId"));
  return c.json(await usageState(c.get("userId")));
})
```

- Put the webhook route **outside** `/v1/*`, so it isn't behind CORS or bearer auth. That's next to the other non-`/v1` routes, before `.notFound`.
- If `handleRevenueCatEvent` throws, return 500. RevenueCat will retry, which is safe because everything is idempotent.

### 4.4 What to do per event

RevenueCat sends `{ api_version, event: { ... } }`. **Verify field names against RevenueCat's current webhook docs before coding.** These are the usual ones:

- `id`: unique event id
- `type`
- `app_user_id`: our Clerk id, because the app logs in with it
- `original_app_user_id`
- `aliases`
- `product_id`
- `new_product_id`: on `PRODUCT_CHANGE`
- `entitlement_ids`
- `period_type`
- `purchased_at_ms`
- `expiration_at_ms`
- `environment`: `SANDBOX` or `PRODUCTION`
- `store`: `APP_STORE` or `PLAY_STORE`
- `price`: in USD
- `takehome_percentage`: e.g. 0.85
- `transaction_id`
- `original_transaction_id`
- `cancel_reason`

**Always first:**
1. `userId = event.app_user_id`. If it doesn't start with `user_` (an anonymous RevenueCat id such as `$RCAnonymousID:…`), log it and return. It will be resolved when the app logs in (§6.2).
2. Skip `type === "TEST"` (return OK).
3. If `environment === "SANDBOX"` and `REVENUECAT_ALLOW_SANDBOX !== "true"`, return OK without changes. This keeps test purchases out of production revenue.
4. `plan = planFromEntitlements(await fetchSubscriber(userId))`. This is the current truth, whatever the event says.

**Then, by type:**

| `event.type` | Set plan? | Record money? (`period`) |
|---|---|---|
| `INITIAL_PURCHASE` | yes → `plan` | **yes** |
| `RENEWAL` | yes → `plan` | **yes** |
| `PRODUCT_CHANGE` (upgrade or downgrade) | yes → `plan` | no. The charge for the new product arrives as its own `RENEWAL` or `INITIAL_PURCHASE`. |
| `NON_RENEWING_PURCHASE` | yes → `plan` | yes, if you ever sell one-off passes. We don't plan to. |
| `UNCANCELLATION` | yes → `plan` | no |
| `CANCELLATION` | yes → `plan`. They usually stay active until `expiration_at_ms`, so `plan` is still their plan. That's correct: don't remove access early. | Only for a **refund** (`cancel_reason === "CUSTOMER_SUPPORT"`): record a **negative** row (below). |
| `EXPIRATION` | yes → `plan` (usually `"none"` now) | no |
| `BILLING_ISSUE` | yes → `plan`. They keep access during the store's grace period while the entitlement is active. | no |
| `SUBSCRIPTION_PAUSED` (Android) | yes → `plan` | no |
| `SUBSCRIPTION_EXTENDED` | yes → `plan` | no |
| `TRANSFER` | Run the sync for **both** the old and the new user ids (`transferred_from`, `transferred_to`). | no |
| anything else | yes → `plan` (a harmless re-sync) | no |

**Recording money** (only where the table says yes):

```ts
const grossMicros = Math.round((event.price ?? 0) * 1_000_000);              // price is USD
const storeFeeMicros = Math.round(grossMicros * (1 - (event.takehome_percentage ?? 0.85)));
await setPlan(userId, plan, {
  source: "revenuecat",
  period: {
    startsAt: new Date(event.purchased_at_ms),
    endsAt: new Date(event.expiration_at_ms),
    grossMicros,
    storeFeeMicros,
    externalId: `rc:${event.transaction_id ?? event.id}`,
  },
});
```

**Refund:** call `setPlan(userId, plan, { source: "revenuecat", period: { …same dates…, grossMicros: -grossMicros, storeFeeMicros: -storeFeeMicros, externalId: \`rc:refund:${event.transaction_id ?? event.id}\` } })`.
- Negative amounts are allowed: the columns are `bigint`, and the views simply add them up.
- If `price` is missing on the cancellation event, look up the original period by `externalId = rc:<transaction_id>` and negate its amounts.

**Important edge rules:**
- **Never record money without a store transaction id.** `externalId` is what stops a replayed webhook from counting a payment twice (`plan_periods.external_id` is unique, and `setPlan` uses `onConflictDoNothing`).
- **Plan changes happen even when money isn't recorded.** `setPlan` always updates `profiles.plan`.
- **Don't reset usage windows on upgrade.** Budgets are read from the plan at check time, so an upgrade takes effect on the next request with no extra code: the same spend becomes a smaller percentage. That's intended.
- **Respond fast.** Don't call anything slow other than the one RevenueCat REST fetch.

### 4.5 Why `/v1/billing/sync` exists

Webhooks can take seconds or minutes. Right after a purchase, the app calls `POST /v1/billing/sync`, the server asks RevenueCat directly and updates the plan, and the user isn't still told they're out of usage. Money is still recorded only by the webhook, which carries the transaction details.

### 4.6 Account deletion

`apps/api/src/account.ts` → `deleteAccount()`: it's optional but recommended to also delete the RevenueCat customer (`DELETE https://api.revenuecat.com/v1/subscribers/{id}` with the secret key) after our data is gone.
- Wrap it in try/catch, so a RevenueCat failure never blocks the account deletion.
- Store subscriptions themselves can only be cancelled by the user in the store. Say so in the delete confirmation text in `apps/mobile/app/(app)/settings.tsx` (`DELETE_NOTE`), e.g. "Cancel any subscription in the App Store or Google Play first."

### 4.7 Server tests (`apps/api/src/usage/revenuecat.test.ts`)

Copy the mocking style of `apps/api/src/usage/usage.test.ts`: it mocks `../db/client.js` and uses `createApp(deps)`. Also mock `fetch` for the RevenueCat REST call. Cover:
- the webhook rejects a wrong or missing `Authorization` (401);
- `TEST` and sandbox events change nothing when `REVENUECAT_ALLOW_SANDBOX` isn't set;
- `planFromEntitlements(["plus","max"])` gives `"max"`, `[]` gives `"none"`, and unknown names are ignored;
- `INITIAL_PURCHASE` calls `setPlan` with the plan and a `period` whose `externalId` is `rc:<transaction_id>`, with the right gross and fee;
- `PRODUCT_CHANGE` sets the plan with **no** period;
- a refund `CANCELLATION` records negative amounts;
- an anonymous `app_user_id` is ignored;
- the same event twice records money once (same `externalId`);
- `POST /v1/billing/sync` needs a bearer token and returns the usage state.

---

## 5. Turning it on for real

Do these in order, **only after purchases work end to end in sandbox:**
1. Deploy the API with the RevenueCat env vars.
2. Release the app build that contains the paywall.
3. **Decide what happens to existing users.** Today everyone without a stored plan is treated as Starter (`DEFAULT_PLAN=starter`). Options:
   - (a) Give existing users a grace period with `set-plan.ts` or the admin route (`PUT /internal/users/:id/plan` with `{ plan: "starter", recordPayment: false }`), then flip.
   - (b) Flip straight away.

   **Ask the owner** which one.
4. Flip `DEFAULT_PLAN=none` on Railway, **and** in the local `.env` used for `worker:deploy`, then run `pnpm --filter @expojet/api worker:deploy`. The worker reads it too (`trigger.config.ts` syncs it).
5. From then on, people without a subscription get `402 plan_required`. The app already handles that: "Choose a plan to keep using mates." with a See plans button, which you're pointing at the paywall.

---

## 6. Mobile work (`apps/mobile`)

### 6.1 Install

```bash
cd apps/mobile
npx expo install react-native-purchases react-native-purchases-ui
```

- `react-native-purchases-ui` is optional. It gives RevenueCat's ready-made paywall, but a custom paywall (§6.4) matches our design better. Pick one.
- Then a **new dev build** (EAS) is required. Check the RevenueCat Expo docs for any config plugin needed by the installed version.

Public keys go in `apps/mobile/.env` (public by design):

```
EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_xxxxxxxx
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_xxxxxxxx
```

### 6.2 New file: `apps/mobile/src/billing/purchases.ts`

- `configurePurchases()`: call once at startup.
  - Use `Purchases.configure({ apiKey })` with the key for the platform (`Platform.OS`).
  - Use `Purchases.setLogLevel(LOG_LEVEL.DEBUG)` only in `__DEV__`.
- **Log in with the Clerk user id.** When the session becomes authenticated, call `await Purchases.logIn(userId)`. On sign-out, call `await Purchases.logOut()`.
  - **This is what links store purchases to our user.** If it's skipped, webhooks arrive with anonymous ids and nobody gets their plan.
  - Where it goes: the session provider (`apps/mobile/src/session/provider.tsx`) or the `(app)/_layout.tsx` effect that runs once the user is signed in. Use `useAuth()` from `@clerk/expo` for `userId`.
- `getPlanOfferings()`: `Purchases.getOfferings()`, returning the packages grouped by plan for the paywall.
- `buy(pkg)`:
  1. `await Purchases.purchasePackage(pkg)`
  2. then `await runRequest(getToken, "billing/sync", {})` (`runRequest` is in `src/chat/background-chat.ts`)
  3. then invalidate React Query `["usage"]`. `onUsageChange` doesn't fire here, so call `queryClient.invalidateQueries({ queryKey: ["usage"] })`.
  4. Treat `userCancelled` errors as "do nothing", not as an error.
- `restore()`: `Purchases.restorePurchases()`, then the same sync and invalidate. **Apple requires a visible "Restore purchases" button.**
- `manageSubscription()`:
  - iOS: `Linking.openURL("https://apps.apple.com/account/subscriptions")`
  - Android: `Linking.openURL("https://play.google.com/store/account/subscriptions")`
  - Or use `customerInfo.managementURL` when present.

### 6.3 New screen: `apps/mobile/app/(app)/paywall.tsx`

- Register it in `apps/mobile/app/(app)/_layout.tsx` next to `usage`, as `<Stack.Screen name="paywall" options={{ title: "Plans", presentation: "modal" }} />`.
  - A plain `modal` is the presentation that worked for routines; avoid `formSheet`, which rendered blank there.
- **Content:**
  - the four plans, with each plan's store price string from the package (`pkg.product.priceString`; never hard-code prices);
  - a monthly/yearly switch;
  - what each plan gets, matching `Pricing.astro`;
  - the current plan marked, from `useUsage().data.plan.id`;
  - a Subscribe button, plus **Restore purchases** and **Manage subscription** links;
  - legal: auto-renew wording and links to Terms and Privacy (Apple requires these on the paywall).
- **Design:** copy the look of `app/(app)/usage.tsx` and `memory.tsx`:
  - `useTheme()` colours, DM Sans fonts, grouped rows with hairlines, no boxed cards;
  - the primary button style from `usage.tsx`;
  - **no invented colours** (the theme tokens and mate colours only).
- **States:** loading (skeleton), offerings failed to load (message plus retry), purchasing (button spinner, everything disabled), success (haptic plus close the modal plus the usage screen refreshes), and an error with a plain message.

### 6.4 Repoint every "See plans" to the paywall

| File | Today | Change to |
|---|---|---|
| `apps/mobile/app/(app)/usage.tsx` | the `see-plans` button calls `Linking.openURL(usage.upgradeUrl)` | `router.push("/paywall")` |
| `apps/mobile/src/usage/usage-notice.tsx` | `openUsage` → `/usage` | Keep it: the usage screen is the right first stop. Optionally go straight to `/paywall` when `kind === "no_plan"`. |

Keep `upgradeUrl` in the API: the web landing page uses it. The phone just stops using it.

### 6.5 Settings

In `apps/mobile/app/(app)/settings.tsx`, the "Plan & usage" row already opens `/usage`. Optionally add **Manage subscription** and **Restore purchases** rows in the same section, on both the iOS (`LinkRow`) and Android (`row(...)`) layouts.

---

## 7. Testing (before release)

1. **iOS sandbox:** use a Sandbox Apple ID (Settings → App Store → Sandbox Account) on a dev build. **Android:** add license testers in the Play Console and use an internal testing track.
2. On a **dev or staging API** with `REVENUECAT_ALLOW_SANDBOX=true`:
   1. Buy Starter monthly. The paywall closes, Settings → Plan & usage shows "Starter", and there's a `plan_periods` row with `source = revenuecat` and `external_id = rc:...`.
   2. Upgrade to Max. The plan becomes Max and the session bar disappears.
   3. Cancel in the store sandbox and wait for expiry (sandbox renewals are minutes long). The plan becomes `none`, and the app shows "Choose a plan…" (once `DEFAULT_PLAN=none` on that server).
   4. Delete and reinstall the app, sign in, tap Restore. The plan comes back.
   5. Send a test webhook from the RevenueCat dashboard. It returns 200 and changes nothing.
   6. Replay a real webhook from RevenueCat's event history. No second `plan_periods` row appears.
3. **Money check:** `SELECT * FROM v_user_margin WHERE clerk_user_id = '<you>'` shows your purchase as net revenue.
4. `pnpm typecheck && pnpm test` from the repo root.

---

## 8. Done means

- [ ] Products, entitlements (`starter`/`plus`/`pro`/`max`) and the offering are set up in both stores and RevenueCat
- [ ] `POST /webhooks/revenuecat` (auth-checked, idempotent, sandbox-gated) and `POST /v1/billing/sync`, with tests
- [ ] The app calls `Purchases.logIn(clerkUserId)` on sign-in and `logOut` on sign-out
- [ ] The paywall screen with store prices, restore, manage, and the legal links
- [ ] Every "See plans" on the phone opens the paywall, not the website
- [ ] Sandbox purchase → plan → usage screen → `plan_periods` row works on iOS and Android
- [ ] Existing-user decision made, then `DEFAULT_PLAN=none` on Railway and the worker (`worker:deploy`)
- [ ] `docs/plans/usage.md`'s "Next: payments" section updated to point here

## 9. Don'ts

- Don't trust `entitlement_ids` from a single event over `fetchSubscriber()`.
- Don't record money from `PRODUCT_CHANGE`, `CANCELLATION` (except refunds) or `EXPIRATION`.
- Don't put `REVENUECAT_SECRET_KEY` or `REVENUECAT_WEBHOOK_AUTH` anywhere but `apps/api` on Railway.
- Don't hard-code prices in the app; use the store's `priceString`.
- Don't change `setPlan`'s behaviour, the plan ids or the usage tables. Limits and the finance views depend on them.
- Don't link to the website for buying on iOS.
- Don't run `db:migrate` changes for this. **No new tables are needed:** `profiles.plan`, `profiles.plan_source` and `plan_periods` already cover it.
