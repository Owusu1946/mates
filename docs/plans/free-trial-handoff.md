# Handoff: Apple free trial on Starter, plus the paywall

**For:** Samuel. **From:** Ken. **Date:** 2026-11-15.

This **replaces** the "No free trial" decision in [in-app-purchases.md](in-app-purchases.md). The products, entitlements, identity, and purchase/restore helpers remain as documented. The app reads RevenueCat's current offering dynamically; in this project that is `mates_tiers`, not the old `default` offering.

## What we're doing
Users Apple marks eligible can redeem **one free trial of Starter**. New and existing Mates accounts may qualify; Mates account age does not determine eligibility. The offer converts to the selected paid Starter subscription unless the user cancels. When there is no active plan, the app shows the paywall and chat is locked once paid-plan enforcement is enabled.

## Decisions
| Topic | Decision |
|---|---|
| Which plan has the trial | **Starter only** (`mates_starter_monthly` and `mates_starter_yearly`). Plus, Pro and Max have **no** introductory offer. |
| Who gets it | Apple decides eligibility: **one introductory offer per Apple ID per subscription group**. Existing Mates users may qualify, but the app must not promise a trial unless Apple's eligibility check returns eligible. |
| Trial length | **Ken to confirm: 1 week or 1 month.** Apple has no exact "30 days"; 1 month is closest. Use the same length on both Starter products. |
| Existing users | **Ken to confirm:** straight to the paywall when they open the updated app, or a short grace period first. Build for "straight to the paywall"; a grace period is a backend grant on Ken's side and needs no app change. |
| Paywall | **Blocking:** no plan means no chat until they start the trial or subscribe. |
| Android | Not now (iOS first, as before). |

## 1. App Store Connect (you)
Bundle ID `app.askorin.mates`, subscription group **Mates**.
1. *Monetization → Subscriptions → Mates → **Starter Monthly** (`mates_starter_monthly`) → Subscription Prices → View all Subscription Pricing → **Introductory Offers** → Create.*
   - **Countries:** all.
   - **Start date:** today. **No end date.**
   - **Type:** **Free**.
   - **Duration:** the trial length Ken confirms (1 week or 1 month).
2. Do the same for **Starter Yearly** (`mates_starter_yearly`), with the same length.
3. **Don't** add offers to Plus, Pro or Max.
4. **Group ranking stays Max > Pro > Plus > Starter.** Upgrading during a trial ends the trial and starts the new paid plan straight away. That's Apple's standard behaviour, and our sync follows it.
5. **App Review:** update the Starter review screenshot to the new paywall. In the review notes, say: "Starter has a free introductory offer; terms are shown on the paywall before purchase."

**RevenueCat** is run by Ken. Nothing new is needed there: products refresh from App Store Connect, and the trial comes through as an ordinary active `starter` entitlement with an expiry. Tell Ken once the offers are live, so he can check that the products show the intro price.

## 2. The paywall screen (`apps/mobile/app/(app)/paywall.tsx`)
Build on what's there, and keep reading RevenueCat's current offering and its packages. The current project offering is `mates_tiers`; use its products dynamically rather than hard-coding the offering identifier.

**Layout:**
- **Hero, for users eligible for a free trial:** derive its duration from the selected product's free `introPrice` (for example, "Try Starter free for 1 week"), then show its localized renewal price. Never hard-code the price or promise a trial when eligibility is unknown or ineligible.
- **Main button:**
  - **Start free trial** when eligible, which buys the Starter package;
  - **Subscribe** when they've already used it.
- **Billing toggle:** Monthly or Yearly ("2 months free" on yearly). The trial applies to whichever Starter period they pick.
- **Other plans:** Plus, Pro and Max as paid options below, with price, period and a one-line difference. Use the budgets and features shown on the landing page (`apps/web/src/components/Pricing.astro`).
- **Required by Apple:** **Restore purchases**, plus links to **Terms of Use** and **Privacy Policy**, and the auto-renewal text near the button: "Payment is charged to your Apple ID at the end of the free trial unless cancelled at least 24 hours before. Subscriptions renew automatically."

**Eligibility:** call `Purchases.checkTrialOrIntroductoryPriceEligibility` for the Starter monthly and yearly product IDs on iOS. Show trial copy only when the selected product returns `INTRO_ELIGIBILITY_STATUS_ELIGIBLE` and its `introPrice` is free. Ineligible, unknown, unsupported-platform, missing-offer, or failed checks use ordinary paid copy. Read the localized renewal price and offer duration from the selected package's product; never hard-code them.

**After buying:**
- **Sync:** use the existing `purchasePackage`, which already syncs with the API (`POST /v1/billing/sync`).
- **Refresh:** refresh the usage query (`["usage", userId]`) and the mates and chats lists.
- **Leave:** close the paywall and land in the lead mate's chat.
- **Confirm:** a success toast using the selected product's trial duration when available (for example, "Your free trial has started."). Do not hard-code a week.

**Errors:**
- **Cancelling** the Apple sheet does nothing: no error is shown.
- **Network or store errors:** a toast and a retry.
- **Purchased, but the sync failed:** say so ("Your purchase went through; finishing setup…"), and retry the sync on the next app open.

## 3. Where the paywall appears
The rule is simple: **the plan from `GET /v1/usage` is `"none"`** (`usage.plan.id === "none"`).
- **Why it's safe to ship early:** `"none"` only happens once Ken sets `DEFAULT_PLAN=none` at launch. Before that, everyone resolves to Starter, so the paywall never shows. You can merge it before launch.

**Show it:**
1. **New users,** right after onboarding: after the About step in `src/onboarding/leader-setup.tsx` / `about-step.tsx`, when `onDone` runs, check usage and open the paywall if the plan is `"none"`.
2. **Existing users,** on app open: in `LeaderGate` (`src/onboarding/leader-gate.tsx`) or the app layout, after usage has loaded, if the plan is `"none"`, show the paywall over the app. Avoid duplicate presentation while it is already open.
3. **Any refused request:** when an API call fails with `402 plan_required` (see `isOutOfUsage` in `src/chat/background-chat.ts` and `src/usage/usage-notice.tsx`), open the paywall rather than only showing the message.
4. **Plan & usage** (`app/(app)/usage.tsx`): "See plans" already opens it. Keep that.

The paywall is **blocking** when the plan is `"none"`: disable dismissal and back navigation, but keep **Restore purchases** and **Sign out** reachable. When opened from Plan & usage by someone who already has a plan, it closes normally.

## 4. Showing the trial
- **Where:** in Plan & usage and Settings, show "**Free trial** · ends Nov 27" while it's running.
- **How:** from the SDK, `customerInfo.entitlements.active.starter` with `periodType === "TRIAL"` and its `expirationDate`.
- **Manage:** a **Manage subscription** row, using `Purchases.showManageSubscriptions()` or `itms-apps://apps.apple.com/account/subscriptions`, so people can cancel easily (Apple requires it to be findable).
- **No change needed for limits:** a trial user is on Starter, so they get Starter's 5-hour and weekly limits once enforcement is on. The existing usage UI already handles that.

## 5. Testing (dev build or TestFlight, not Expo Go)
In-app purchases don't run in Expo Go. Use a development build or TestFlight with a **sandbox Apple account** (*Users and Access → Sandbox*). In sandbox, a 1-week trial lasts **3 minutes** and a 1-month trial **5 minutes**, so renewals and expiry happen quickly.

Ask Ken to point a staging API at sandbox (`REVENUECAT_ALLOW_SANDBOX=true` on staging only, **never** on production).

**Check each of these:**
1. **New account:** onboarding, then the paywall, then **Start free trial**. Chat unlocks, and Plan & usage shows "Free trial · ends …".
2. **Trial converts:** a few minutes later it renews as paid Starter, and the plan stays Starter.
3. **Cancel during the trial** (sandbox subscription settings): access lasts until the trial ends, then the plan is `none` and the paywall is back.
4. **Same Apple ID, new app account:** the button now says **Subscribe** (no second trial).
5. **Upgrade to Pro during the trial:** the trial ends, Pro starts, and Plan & usage shows Pro.
6. **Restore** on a fresh install brings the trial or subscription back.
7. **Existing account opening the update:** the paywall appears (with `DEFAULT_PLAN=none` on staging).
8. **A refused message** (`402`) opens the paywall.

To test eligibility again, use a new sandbox tester, or *Settings → App Store → Sandbox Account → Clear Purchase History* on the device.

## 6. Ken's side (not yours)
- **At launch:**
  - Do not run the grandfather script unless Ken confirms a separate grace period for existing users. Apple's trial eligibility is based on Apple ID subscription-group history, not Mates account age.
  - Set `DEFAULT_PLAN=none` and `USAGE_ENFORCE=on` on **both** the API and the worker.
- **Backend tidy-ups:**
  - skip $0 trial events in revenue accounting;
  - fix the usage bar rounding (it shows 100% at 99.6%);
  - add a per-user enforcement switch for pre-launch testing;
  - close issue #82.
- **Check:** confirm the RevenueCat products show the intro price after your App Store Connect change.

## Done when
- Starter monthly and yearly have the free introductory offer in App Store Connect, and the other plans don't.
- The paywall shows trial copy only to eligible users, with prices from the store, Restore, Terms, Privacy and the auto-renewal text.
- The paywall appears for plan `"none"` after onboarding, on app open and on a `402`, and never before launch.
- Trial status and Manage subscription appear in Plan & usage.
- All 8 sandbox checks above pass on a dev build or TestFlight.
- [in-app-purchase-progress.md](in-app-purchase-progress.md) is updated with the batch status, as usual.
