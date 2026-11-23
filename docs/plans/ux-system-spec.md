# Mates UX system: proposed implementation brief

Date: 23 November 2026  
Status: proposal for Sammy and Ken review; no implementation approved by this document  
Baseline: `main` at `ec7e328`; reconcile feature branches before building  
Companion audit: [App audit and build readiness](app-audit-build-readiness.md)

## Outcome

Make it easy to understand who is working, what is happening, what needs the user, and where the result lives. Improve visual consistency and response usefulness while keeping ordinary conversation calm and readable.

This brief reconciles Cursor's supplied UX proposal with the code-supported audit. Competitor performance rankings, exact response-time claims and visual superiority claims are not established. Device friction remains a hypothesis unless explicitly observed. Proposed timings are prototype values, not commitments or measured baselines.

## Comparison and decisions

| Cursor proposal | Assessment | Direction for Mates |
| --- | --- | --- |
| Named live status and expandable activity | Adopt with safeguards | One authoritative status line; derive specific verbs from actual run/tool events, not guessed user intent |
| Status in 300 ms | Prototype target | Immediate generic acknowledgement is safe; only say “Checking calendar” once execution supports that statement |
| Mate accent on every reply, send button and header | Visual experiment | Compare subtle identity accents against current UI; do not mandate a full-height rail or multiple gradients before rendered review |
| Five layers on every assistant message | Too heavy as a universal rule | Use status, answer, artifact and receipt only when relevant; short replies remain simple |
| CardShell around every card | Adopt incrementally | First align two existing cards; extract common chrome only after the repeated structure is clear |
| Today strip | Useful hypothesis | Leader/home surface only initially; max three actionable items, dismiss/collapse and See all; avoid shrinking every chat viewport |
| Sticky waiting chip | Adopt if navigation works | Scope to current unresolved work and link to the exact item; never let old approvals permanently obstruct the composer |
| Always route results to chat | Incomplete | Chat plus exact message when available; Feed fallback for absent/deleted/unavailable chat and results without one |
| Mark winning mate with “Leading” | Reject without explicit evidence | Different perspectives are not a competition; rank only when the user asked and criteria support a defensible comparison |
| Parse prices/lists from Markdown into actionable cards | Avoid for actions | Use validated typed data for domain cards and action targets; keep Markdown readable as fallback |
| Shimmer for all turns and stale-price pulse | Excessive | One bounded progress indicator; static timestamp/stale badge for aging quotes |
| Word fade, drawer stagger, send ripple | Optional experiments | Lower priority than scroll stability, readability and recovery; do not combine all effects |
| “Autopilot” proactive marker | Wording review required | Prefer “Scheduled” or “Routine” unless execution/approval scope justifies autonomy claims |
| “Undo 2” receipt | Conditional | Show only confirmed actions with supported undo, expiry and actual outcomes; never invent reversibility |
| Virtualize chat as a future prerequisite | Already present | Profile existing MessagesFlatList and tune the measured issue |
| Empty chat needs suggestions | Already present | Existing suggestionSpots should be improved/reused; Ideas remains the confirmed placeholder |
| Noise budget remaining counter | Defer | Controls should describe useful behavior; avoid implementation quotas in product UI unless users benefit |
| Dark/light colors identical | Reject | Choose contrast-safe semantic values separately for each theme; amber for partial status must not also ambiguously mean Ghana identity |
| Fixed days/weeks and numerical engagement targets | Unvalidated | Estimate after component/data-path inspection; establish baseline before targets |

## Existing anchors

Paths below are under apps/mobile unless noted:

- `src/chat/chat-thread.tsx`: ThinkingIndicator, RoutineMarker, existing empty-chat suggestions, header, composer and MessagesFlatList.
- `src/chat/activity-line.tsx`: existing working dots, duration and expandable activity; reduced motion already handled for dots.
- `src/chat/workflow-card.tsx`: typed workflow rendering and connection/resume behavior.
- `src/chat/rides-card.tsx`, `sources-card.tsx`, `action-approval.tsx`: existing domain result patterns to preserve.
- `src/theme/tokens.ts` and useChatColors in chat-thread: parallel palette choices to reconcile gradually.
- `app/(app)/feed.tsx`, `tasks.tsx`, `ideas.tsx`: attention inbox, task controls and placeholder destination.

New component names below are suggestions, not instructions to create every file. Reuse a suitable existing boundary first.

## Response hierarchy and state contract

1. **Acknowledgement:** immediate neutral indication that the message was accepted. If submission fails, say so and preserve the draft. Do not imply an external action started before acceptance.
2. **Live status:** one line tied to actual activity, optionally named for the mate. Avoid duplicate header, shimmer, dot and card progress announcements.
3. **Answer:** concise useful content first, supporting detail progressively disclosed. Preserve selectable text, citations and readable streaming.
4. **Structured result:** an existing typed card when comparison or interaction is meaningfully easier than prose. Unknown/malformed metadata falls back safely.
5. **Outcome:** distinguish completed, partial, waiting, failed, cancelled and uncertain. A result card is not proof an external action succeeded.

Do not map every phase to a new backend enum automatically. First map existing run and card states and identify where additional information is actually required. A typed contract change must be version-compatible with older mobile clients.

## Proposed small build slices

### UX1 — Honest live status and waiting navigation

Start with ThinkingIndicator and ActivityLine. Show a neutral named acknowledgement before tool evidence exists, then replace it with the current supported activity. On completion retain useful expandable history for meaningful work; do not show “Worked for…” under every greeting.

Add a waiting shortcut only if it can locate the relevant unresolved card. On resolution, cancellation, navigation away or stale approval, update/remove it. Multiple blockers need a count and accessible chooser rather than overlapping pills.

Acceptance: no duplicated progress lines; tool text reflects real execution; resume/reconnect keeps state consistent; no stale waiting shortcut; screen readers announce meaningful changes without token-by-token chatter.

Dependencies: existing event semantics; inspect run resumption before creating new status plumbing. Backend work only if the required state is unavailable.

### UX2 — Two-card consistency pilot

Prototype shared hierarchy for rides and one other frequently used card selected after device observation. Standardize title, state label, primary action, evidence/freshness, details and failure recovery. Keep bespoke content and existing server authority.

Semantic states use text/icon plus restrained color. A live result and a saved snapshot must be distinguishable. A quote uses “Checked at 09:02” and “May have changed”, not permanent “estimate now” wording. Missing data stays visibly missing.

Acceptance: long content, partial results, expired data, malformed payload, repeated tap and failed action open remain understandable in both themes and large text. No heavy shell around lightweight source or memory chips.

### UX3 — Discoverability without a navigation rewrite

Test a compact leader/home attention summary and drawer unread badge before considering bottom tabs. Reuse Feed data only after verifying its response supports pagination, timestamps, ownership and actionable state. Do not blindly filter one page and label it a global count.

Prioritize unresolved input, then recent unread outcomes. Avoid treating every unread item or historical failure as urgent. Mark read on meaningful viewing; preserve separate meanings for “read”, “resolved” and “dismissed”.

Acceptance: zero items consumes little/no space; refreshing does not reorder a tapped item unexpectedly; multi-device updates converge; no global results leak into a specialist chat by accident. Feed remains the complete inbox.

### UX4 — Source chat and artifact continuity

Resolve run-to-chat-message navigation using delegationId where supported. Support loading an older target beyond the current history page. Preserve the user's place and show why a result opens in Feed if chat is unavailable.

Assess a Library entry only after inventorying existing page/deck/file surfaces. Show source, creation date and actual availability; distinguish a generated draft from a shared/published output.

Acceptance: cold-start notification, deleted chat, older result, offline return and expired artifact each have a recoverable destination.

### UX5 — Identity, tokens and motion review

Produce rendered alternatives for subtle mate identity: avatar/name only, a small status accent, and an optional response rail. Compare a mixed multi-mate thread and long answer before choosing. Group identity must not arbitrarily adopt the first member's color or imply that member authored the response.

Add only needed semantic success/warning/info tokens; preserve a clear main action. Avoid making every card bright or using the same amber for partial failure and local-feature decoration. Ghana identity can be expressed with accurate currency, place names, route icons and useful copy.

Prototype a short status crossfade and a detail expansion using existing Reanimated tools. Typical starting range 150–220 ms; interruptible, no input delay. Preserve reduced motion and reading position. Avoid per-token motion, replayed entry animations on history refresh and continuous stale-item pulses.

Acceptance: contrast, large text, light/dark, reduced motion and modest-device frame pacing checked; no information communicated through color/motion alone.

### UX6 — Preferences and low-friction starters

Correct notification scope labels and review a generic-preview setting with server enforcement. Client-only hiding cannot protect notification text already delivered by the server. Old clients and direct-push callers need an explicit policy.

Reuse existing empty-chat suggestions. Replace or remove the Ideas placeholder; prioritize executable prompts with understandable permissions. Do not suggest calendar-dependent actions as connected when no calendar is available.

Acceptance: settings persist across devices as intended, real notification payloads respect privacy choice, suggestions begin usable journeys and failure preserves user input.

## Screen-level review checklist

| Screen | Focus |
| --- | --- |
| Chat | Composer predictability, stable scrolling, readable answers, exact waiting target, mate identity |
| Drawer | Clear destinations, meaningful badges, no feature dump, retain navigation context |
| Feed | Owner identity, read vs resolved, recoverable failure, source-chat links, accurate counts |
| Tasks | Clear reminders/routines/watches distinction, next scheduled time, last outcome; avoid a ticking countdown per row |
| Connections | Account identity, expiry, reconnect and resume without promising unsupported recovery |
| Settings | Accurate labels, privacy controls, consistent forms, repeated-tap safety and save feedback |
| Share | Clear destination, preserved content, offline/retry explanation and duplicate protection |
| Calls/computer | Obvious live/listening/paused states, permissions and stop controls, interruption recovery |
| Onboarding | Explain first useful action, avoid empty gated surfaces, permissions requested with context |

## Competitor references and comparison limits

Grok Bot's documented attention states and reusable routines support UX1/UX3; Muse's documented artifact continuity supports UX4. See sources in the companion audit. These are behavior references, not proof of competitor visual quality, speed, noise levels or regional availability. Dots/Duet claims and Cursor's scorecard require separate evidence before inclusion as factual comparisons.

A future visual comparison should capture the same journeys in dated app versions: first task, long result, approval, failed connection, background return and artifact reopen. Record the observed pattern and user benefit instead of subjective winner scores.

## Measurement and review gates

Measure acknowledgement latency separately from model first text and external-tool start. Track task completion, correct next-action discovery, retry success, scroll displacement and accidental taps. A Today click-through increase alone does not establish user value. Use baseline-relative targets approved after measurement.

Ken review:

- [ ] Confirm deployed/branch baseline and reconcile existing notification, navigation, brief and ride work.
- [ ] Select UX1 or UX2 as the first small implementation; agree state mapping and backend needs.
- [ ] Validate Feed query/count/read semantics before Today/badges.
- [ ] Review privacy and external-action wording; confirm receipts and undo promises.
- [ ] Schedule rendered design review with Sammy before identity/token rollout.
- [ ] Include iOS/Android, large text, screen readers, reduced motion, slow network and long-thread checks.
- [ ] Keep manual commits and deployment handoffs per slice; no broad automatic migration of all cards.

## Validation of this document

Documentation only; inspected existing anchors and compared supplied Cursor proposals against the companion audit. No runtime behavior, device validation, production measurements or dependencies changed.
