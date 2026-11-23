# Landing page refresh — Ken handoff

Branch: `feat/landing-page-refresh`  
Baseline: `ec7e328`  
Owner: Sammy  
Reviewer/deployment: Ken  
Status: three slices committed manually; final focus-return fix and this handoff awaiting commit; not deployed

## Changes

1. Copy and accuracy (`a28b2ad`): consistent prelaunch/waitlist wording, clearer hero/FAQ, Starter price metadata, usage notes, illustrative hero conversations without unsupported weather or acceptance claims.
2. Structure (`6129baf`): three workflow examples, user-control section, compact closing CTA, reduced decorative mascot repetition, clearer connection and authorization copy.
3. Polish (`63c8f7b`, plus final focus-return fix in working tree): skip link and keyboard focus, sticky-header anchor offsets, tighter header spacing, scrollable short-screen menu, synchronous menu dismissal to avoid competing focus traps, disabled controls excluded from waitlist focus cycling, focus restored to menu opener after dialog, and mascot reduced-motion support including preference changes.

No API, schema, new dependencies or env variables were added. Existing interactive demos remain illustrative; this PR does not release new app capabilities.

## Local preview

From repository root:

```sh
pnpm --filter @muse-clone/web dev --host 127.0.0.1
```

Open the URL Astro prints (normally http://127.0.0.1:4321). Root `pnpm dev` starts API/mobile, not this marketing site. Waitlist requests default to the production API when PUBLIC_API_URL is absent. Avoid real form submission during casual preview; use a staging API configured through PUBLIC_API_URL for submission checks.

## Validation

- Website production build passed after slice 3; rerun after any subsequent review edits.
- Workspace `pnpm typecheck && pnpm test` passed, with cached task results. Web has no dedicated typecheck/test script; these workspace checks do not validate all Astro interactions.
- Diff whitespace checks passed.
- Build warning: roughly 520 KB minified LiveKit chunk; output references found in meeting utility assets, not landing HTML. This is not a measured landing-page transfer or speed regression.
- Build warning: local Node 26 differs from Vercel function runtime Node 24. Validate with the deployment runtime.
- Browser automation was unavailable. No rendered screenshot, keyboard-device, screen-reader, Lighthouse or real submission pass is claimed.

## Ken review and deployment checks

- [ ] Confirm prelaunch status is still accurate. When listings are live, update store links, waitlist and pricing CTAs together.
- [ ] Verify prices, yearly billing, feature entitlements and deployment availability against actual billing config. Metadata starts at USD 8; confirm this remains the correct advertised monthly offer.
- [ ] Review claims in Roles, Calls, Slack and Computer against deployed capabilities. Slack remains labelled Coming soon. Hidden meetings/decks/outbound-call sections remain hidden; do not infer availability from code presence.
- [ ] Confirm the approval language reflects standing routine instructions as well as one-off requests. No blanket promise that every external action requires a fresh approval.
- [ ] Preview desktop widths 1024/1440 and mobile 320/375/390, plus short landscape and 200% zoom. Check header fit, pricing, phone crop, workflow/control sections and footer.
- [ ] Keyboard: skip to main, all section links, pricing radios, open/close mobile menu, Escape, rapid repeat taps and breakpoint changes.
- [ ] Mobile menu to waitlist: only one visible active dialog; Tab stays in waitlist; disabled submit/input do not break cycling; closing returns to visible menu button; page scrolling unlocks.
- [ ] Check form success/failure/retry against staging; no duplicate submissions or unwanted real signups. Verify main CTA still works after dialog close/reopen.
- [ ] Reduced motion: reload and change system setting while open; mascot becomes static and existing demos settle appropriately.
- [ ] Screen readers and touch: labels, heading order, form errors, readable phone examples, adequate targets and contrast.
- [ ] Run production build with supported Node runtime and inspect actual homepage network/performance on mobile.
- [ ] Deploy web through normal hosting workflow after review. Smoke-test canonical/OG metadata, privacy/terms, section anchors and waitlist API/CORS configuration.

## Rollback and follow-ups

Rollback the website deployment to the previous reviewed version if CTA/menu/form behavior fails. No database rollback is required.

Deferred: actual device captures, approved customer proof, shipped Ghana/commute demonstrations, dark-theme design, generated OG image refresh, dedicated pricing pages and broader performance work. Add them only with verified product availability and evidence. Do not fabricate testimonials or promote pending features as released.
