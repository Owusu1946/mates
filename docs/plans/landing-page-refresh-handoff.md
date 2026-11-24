# Landing page refresh — Ken handoff

Branch: `feat/landing-page-refresh`  
Baseline: `ec7e328`  
Owner: Sammy  
Reviewer/deployment: Ken  
Status: ready for preview review on this branch.

## Current homepage

- The hero uses the three-phone composition with an inline animated mascot. The team handoff scene appears within the computer section. Platform icons open the waitlist; desktop is labelled as upcoming.
- Ghana examples, calls, Google Meet and the code demo follow the hero. Example fares illustrate the interaction.
- Navigation includes How it works, Apps and Pricing. How it works targets the team handoff scene.
- Pricing switches between monthly USD 8/15/40/80 and yearly USD 80/150/400/800, with 2 months free. Annual amounts match the mobile purchase documentation. Mobile obtains localized offers from RevenueCat. Ken should verify production offers.
- Earlier browser passes covered horizontal fit at 320px, 390px and 1280px plus FAQ, platform-to-waitlist actions and pricing disclosure. The final yearly toggle and latest logo adjustments still require a browser smoke test before merge.
- API, worker and database deployments are unnecessary for this web change.

## Local preview

From repository root:

```sh
pnpm --filter @muse-clone/web dev --host 127.0.0.1
```

Open the URL Astro prints (normally http://127.0.0.1:4321). Root `pnpm dev` starts API/mobile, not this marketing site. Waitlist requests default to the production API when PUBLIC_API_URL is absent. Avoid real form submission during casual preview; use a staging API configured through PUBLIC_API_URL for submission checks.

## Validation

- Workspace typecheck, tests, production build and whitespace checks passed after the final yearly pricing copy change.
- Workspace `pnpm typecheck && pnpm test` passed, with cached task results. Web has no dedicated typecheck/test script; these workspace checks do not validate all Astro interactions.
- Diff whitespace checks passed.
- Build warning: roughly 520 KB minified LiveKit chunk; output references found in meeting utility assets, not landing HTML. This is not a measured landing-page transfer or speed regression.
- Build warning: local Node 26 differs from Vercel function runtime Node 24. Validate with the deployment runtime.
- Physical-device, screen-reader, Lighthouse and staging signup checks remain with Ken.

## Ken review and deployment checks

- [ ] Confirm prelaunch status is still accurate. When listings are live, update store links, waitlist and pricing CTAs together.
- [ ] Verify prices, yearly billing, feature entitlements and deployment availability against actual billing config. Metadata starts at USD 8; confirm this remains the correct advertised monthly offer.
- [ ] Check the visible Calls, Google Meet, Computer and Ghana examples against capabilities enabled for launch.
- [ ] Confirm the approval language reflects standing routine instructions as well as one-off requests. No blanket promise that every external action requires a fresh approval.
- [ ] Preview desktop widths 1024/1440 and mobile 320/375/390, plus short landscape and 200% zoom. Check header fit, the hero draft, meeting tiles, pricing toggle, pricing disclosure and footer.
- [ ] Keyboard: skip to main, all section links, monthly/yearly toggle, pricing disclosure, open/close mobile menu, Escape, rapid repeat taps and breakpoint changes.
- [ ] Mobile menu to waitlist: only one visible active dialog; Tab stays in waitlist; disabled submit/input do not break cycling; closing returns to visible menu button; page scrolling unlocks.
- [ ] Check form success/failure/retry against staging; no duplicate submissions or unwanted real signups. Verify main CTA still works after dialog close/reopen.
- [ ] Reduced motion: reload and change system setting while open; mascot becomes static and existing demos settle appropriately.
- [ ] Screen readers and touch: labels, heading order, form errors, readable phone examples, adequate targets and contrast.
- [ ] Run production build with supported Node runtime and inspect actual homepage network/performance on mobile.
- [ ] Deploy web through normal hosting workflow after review. Smoke-test canonical/OG metadata, privacy/terms, section anchors and waitlist API/CORS configuration.

## Rollback and follow-ups

Rollback the website deployment to the previous reviewed version if CTA/menu/form behavior fails. No database rollback is required.

Deferred: actual device captures, approved customer proof, shipped Ghana/commute demonstrations, dark-theme design, generated OG image refresh, dedicated pricing pages and broader performance work. Add them only with verified product availability and evidence. Do not fabricate testimonials or promote pending features as released.
