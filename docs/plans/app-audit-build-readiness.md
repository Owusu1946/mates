# Mates app audit and build readiness

Date: 23 November 2026  
Owner: Sammy  
Technical reviewer and deployment reviewer: Ken  
Baseline: local `main`, `ec7e328`  
Review status: initial findings; awaiting Ken review and deeper verification

## Purpose and scope

Prepare a reviewed backlog for improving reliability, performance, feature completeness, and everyday usefulness. This document combines direct inspection of selected code paths with product recommendations and a review of Cursor's audit. It is not a complete security audit, a production incident diagnosis, or proof of device performance.

No implementation, deployment, migration, or device testing is part of this documentation change. The code references below describe the pinned baseline; recheck them against the eventual implementation branch.

## Shipping state must be reconciled first

Local main does not contain all recently reviewed work. Local branch history shows morning brief work in `feat/morning-brief-v2`, ride handoffs and commute in `feat/ride-end-to-end`, and notification improvements in `fix/routine-notifications`. Their absence from this baseline is not evidence that they need rebuilding. Local refs do not establish current remote merge status or production state.

Ken and Sammy should record the following before implementation:

| Item | Evidence needed | Status |
| --- | --- | --- |
| API and worker | Deployed commit, deployment date, worker/dispatcher health | Unverified |
| Mobile | Installed/released version, runtime/update channel, source commit | Unverified |
| Database | Applied migration journal, including pending feature migrations | Unverified |
| Feature flags | Enabled features per environment, without secret values | Unverified |
| Recent PRs | Merge status and whether deployment followed merge | Unverified |

## Findings supported by inspected code

Severity describes potential impact, not a reproduced production incident. All recovery changes must preserve protection against duplicate external actions.

### F1 — High: claimed reminders can remain stranded after interruption

Evidence: `apps/api/src/reminders.ts`, `deliverReminders`.

The dispatcher updates all due reminders to `sending`, sends them sequentially, and writes final sent/failed states after processing the batch. A process interruption can leave claimed rows in `sending`, including reminders never attempted. The normal selection only claims pending rows. No recovery path for sending reminders was found in the inspected source search.

Proposed slice: record sufficient attempt state to distinguish unattempted, accepted, failed, and uncertain sends. Recover abandoned claims without blindly repeating a request that a provider may have accepted.

Acceptance criteria:

- Interrupt before provider submission, during submission, and after provider acceptance.
- Every claimed row reaches a visible, explainable outcome.
- Recovery does not silently duplicate an uncertain send.
- Process bounded batches so one interruption does not strand every due reminder.

### F2 — High: finding delivery can remain in sending after a crash

Evidence: `apps/api/src/delivery.ts`, `deliverFindings`.

The pending-to-sending atomic claim protects against concurrent sends. The normal sweep selects only pending and receipt_pending rows. A crash after claiming but before recording the provider outcome can leave a sending row outside normal processing. The existing catch cannot handle process termination.

Proposed slice: detect stale claims and classify them as uncertain unless evidence proves they were never submitted. Preserve saved results and expose delivery state independently of task execution.

Acceptance criteria: cover claim/send/finalization interruption points; never rerun the agent to retry notification delivery; keep receipt polling functional.

### F3 — Medium: unresolved receipts can repeatedly consume limited sweep capacity

Evidence: `apps/api/src/delivery.ts`, due query and receipt_pending branch.

The query takes 50 due rows without ordering. Missing receipts continue without advancing nextAttemptAt or expiring the receipt. A sustained unresolved receipt population can compete with fresh sends; actual starvation has not been reproduced.

Proposed slice: deterministic scheduling, receipt backoff and expiry, and capacity reserved for fresh delivery. Batch provider receipt lookups where appropriate.

Acceptance criteria: more than 50 unresolved receipts do not prevent new deliveries from progressing; expired receipts reach an observable outcome; provider failures do not trigger duplicate sends.

### F4 — Medium: follow-ups are keyed to a run rather than a lifecycle transition

Evidence: `apps/api/src/run-followups.ts`, `enqueueRunFollowups`; `apps/api/src/durable-runs.ts`, `saveFinding`.

A waiting run can set followupsQueuedAt and consume the single run-level Trigger idempotency key. Findings insert once using onConflictDoNothing, and notification deliveries are unique per run/device. Re-entering a completed state on the same run may therefore skip completed-only follow-ups and leave the original finding unchanged. Verify actual resume paths, including whether they create another run, before changing the model.

Proposed slice: explicitly define waiting/resumed/completed semantics and idempotent follow-ups per required transition.

Acceptance criteria: waiting then completion presents the final result; completed-only memory/activity work runs exactly when intended; duplicate dispatches are safe; the team decides whether a second push is appropriate after an in-app resume.

### F5 — Medium: delivery policy differs between feature paths

Evidence: `apps/api/src/delivery.ts`, `deliverFindings` and `pushToUser`.

Finding delivery checks quiet hours and persists delivery rows. Direct pushToUser calls fan out to enabled devices without the same quiet-hour or delivery-record policy. Caller-specific protections require a separate inventory; do not assume all direct callers are defective.

Proposed slice: inventory callers, distinguish urgent alerts from discretionary nudges, and define consistent preference/read/quiet-hour rules. Avoid a blanket one-push-per-day limit that would suppress reminders or approval requests.

### Existing notification PR

The generic and failed-as-success copy in this baseline is already addressed on the notification branch. Preserve that work rather than implementing it again. Rich result previews introduce a lock-screen privacy decision; copy truncation is not redaction.

## Performance hypotheses requiring measurement

| Area | Inspected evidence | Investigation and acceptance |
| --- | --- | --- |
| Chat synchronization | `apps/mobile/app/(app)/_layout.tsx`: per-thread timers, active checks around 2 seconds and idle checks around 20 seconds | Count requests after visiting several chats; determine which runtimes remain mounted; restrict unnecessary polling only after confirming behavior |
| Chat rendering | `apps/mobile/src/chat/chat-thread.tsx`: existing MessagesFlatList, 30 initial rows, batches of 20 | Profile long mixed-content chats on a modest Android device and iPhone; demonstrate less jank without breaking scroll anchoring |
| Cache serialization | `apps/mobile/src/data/offline-cache.ts`: JSON parsing on reads and serialization on writes; bounded history cache | Measure JS cost during streaming/refresh; optimize only if material; retain account isolation and deletion |
| Delivery throughput | Sequential database/provider work per delivery | Measure queue age and dispatcher duration during bursts; consider batched reads and bounded concurrency |
| Reply latency | `apps/api/src/run-timings.ts` and faster-replies handoff provide instrumentation | Collect cold/warm p50/p95 first-visible-text, completion, setup and queue delay; verify device and server timing boundaries |

File size is a maintenance concern, not proof of runtime slowness. Messages are already virtualized. Do not start by replacing the list, adding an inbox materialization, or building a new event platform without measured need.

## Feature depth opportunities

These are review targets, not verified claims that every capability is absent.

| Journey | Improvement to assess | Required edge cases |
| --- | --- | --- |
| Tasks/routines | Clear next run, last outcome, pause, failure and recovery; successful task to reusable routine | DST/timezone changes, overlaps, missed occurrences, edited schedules |
| Connections | Account identity, connection health, reconnect and safely resume blocked work | Expiry mid-run, reduced permissions, wrong account, uncertain writes |
| Proactive assistance | Working/needs-you/unread states and controls by category or mate | Multiple devices, already-read results, quiet hours, stale alerts |
| Artifacts | Discoverable Library for pages/decks/files with origin and revision state | Partial generation, deleted source chat, expired files, duplicates |
| Morning brief | Finish relevance, freshness and action loops before expanding collectors | No apps, all-day events, conflicts, muted sections, late generation |
| Ghana rides | Complete existing handoff and commute work with real device verification | App absent, stale fare, ambiguity, unavailable coverage, missing duration |
| Memory | Explain use and support corrections consistently | Contradictions, per-mate access, disabled memory, deletion resurfacing |
| Share extension | Reliable handoff to the intended mate and understandable recovery | Offline upload, retry, duplicate share, app terminated |
| Voice/meetings | Observable join/listen/reconnect/end states | Audio interruptions, permissions, network loss, meeting ended, privacy state |
| Billing/usage | Explain limits and restoration without losing work | Webhook delay, account switch, expired plan, limits reached mid-run |

## Competitor lessons and evidence limits

Primary-source research identifies useful patterns, not proof that Mates is better or worse in production.

- Grok Bot documents working/unread/needs-attention states, per-bot notification controls and activity-aware alerts: https://docs.x.ai/grok-bot/settings-and-notifications
- Grok Bot documents reusable skills and routines: https://docs.x.ai/grok-bot/skills-routines-and-automations
- Its initiative guide describes reconnect assistance: https://docs.x.ai/grok-bot/initiative
- Muse advertises connected goal execution and a persistent computer: https://ai.meta.com/muse/
- Muse's getting-started guide describes conversation continuity and an artifact Library: https://www.meta.com/en-gb/help/superintelligence/1331373868832401/

The original repository brief explicitly references a local Muse source project, not an exhaustive commercial product audit (`docs/MUSE_CLONE_BUILD_BRIEF.md`). Confirm that Meta Muse is the intended comparison. Dots, Duet, competitor prices, country availability, comparative reliability, and Ghana WhatsApp restrictions remain unverified in this document. Do not use those claims as roadmap constraints without current primary evidence.

Mates' crew and Ghana utility are promising positioning hypotheses. Validate them through successful user journeys rather than feature-count comparisons.

## Audit coverage still outstanding

- Device journeys across iOS and Android, accessibility, onboarding and navigation.
- Ownership boundaries across accounts, groups, mates, public artifacts and attachments.
- Approval/cancellation/retry behavior for external writes and computer actions.
- Production crash reporting, deployment configuration, metrics and queue capacity.
- Purchase restoration, subscription webhooks and account switching.
- Offline recovery, multi-device convergence, retention and account deletion.
- Full feature-by-feature inspection and competitor journey verification.

## Proposed build sequence

| Slice | Deliverable | Review gate |
| --- | --- | --- |
| 0 | Ken reconciles shipping state and confirms baseline | Record versions, flags and migration state |
| 1 | Delivery claim recovery and receipt scheduling | Interruption and backlog scenarios reviewed; no blind resend |
| 2 | Waiting/resume/completion follow-up semantics | Actual resume paths verified; final result and follow-ups converge |
| 3 | Production visibility and chat profiling | Measured baseline and reproducible slow scenario |
| 4 | Implement the measured performance fix | Before/after evidence; scroll and streaming behavior preserved |
| 5 | Finish proactive and Ghana journeys already in branches | Device matrix, deployment checks and explicit rollout decision |
| 6 | Prioritize routine reuse, connection recovery or artifact Library | One reviewed product slice with clear success criteria |

Each implementation should stay small enough for Sammy's manual review and commit. Do not treat this document as authorization to deploy or implement every suggestion.

## Ken review checklist

- [ ] Confirm the deployed baseline and recent feature PR status.
- [ ] Validate F1–F5 against current code and existing operational recovery.
- [ ] Decide uncertain-send behavior and waiting-to-completed notification expectations.
- [ ] Confirm which alerts bypass quiet hours and how preview privacy should work.
- [ ] Confirm production observability and name the device/performance test owners.
- [ ] Choose the first implementation slice and its acceptance criteria with Sammy.
- [ ] Record deployment, migration, rollback and device checks in each subsequent feature handoff.

## Validation of this PR

Documentation only. Reviewed the referenced baseline paths and local branch history. No runtime behavior changed. Production/device behavior and benchmark claims remain unverified; earlier feature test results do not validate this audit's hypotheses.


## UI and UX audit extension

This section adds visual and interaction recommendations to the reliability audit. Evidence labels matter: **observed in code** means the implementation was inspected; **device validation needed** means a plausible friction has not been reproduced; **proposal** means a deliberate product change for review. This is not a claim to have found every UX issue. No screens or competitor apps were exercised for this extension.

### Existing foundations to retain

Mates already renders structured workflow cards, source previews, activity steps, connection prompts, ride results, and generated artifacts. It has light/dark themes, virtualized chat messages, accessibility labels, haptics and reduced-motion handling in WorkingDots. Build on these rather than introducing a second response rendering framework. See `src/chat/workflow-card.tsx`, `sources-card.tsx`, `activity-line.tsx`, `rides-card.tsx` and `src/theme/tokens.ts` under apps/mobile.

### UX findings and investigation register

| ID / priority | Evidence and friction | Suggested improvement | Completion check |
| --- | --- | --- | --- |
| U1 / P1 | Observed: `app/(app)/ideas.tsx` is a placeholder promising future starters | Replace with useful, executable starter flows, or remove the empty destination until ready. Explain required connections before starting | Every visible starter begins a real flow; no dead-end promises |
| U2 / P1 | Observed: Feed switch label says “Notify me when a mate is done” while enabled device tokens support other push categories | Label the actual scope and link to notification preferences. Later introduce category controls with accurate server enforcement | Turning a control off has documented, verified effects for each notification category |
| U3 / P1 | Observed on baseline: settings destinations use router.push; repeated-tap navigation was fixed on the morning-brief branch | Reconcile that existing fix; verify rapid taps and return paths across settings | One intended destination opens; back returns predictably; preserve intentional navigation params |
| U4 / P1 | Observed: Tasks route/header is “Routines” while the screen also manages watches and reminders | Test clearer information architecture: “Tasks” with explicit Upcoming/Routines/Watches grouping, or equivalent labels matching the content | Users can find and distinguish a reminder, recurring routine and conditional watch |
| U5 / P1 | Device validation needed: work spans chat, Feed, tasks and notifications | Use a shared status vocabulary and make each result link back to the source conversation; show the next useful action | Start elsewhere, background, return via notification and resume without reconstructing context |
| U6 / P1 | Observed: rich response types exist, but each has bespoke styling and action patterns | Review all cards against shared hierarchy, action placement, status, freshness and error rules | Same state/action means the same thing across calendar, rides, research and artifacts |
| U7 / P1 | Device validation needed: composer contains app/mate/search choices and attachment controls | Test discoverability and selection clarity; keep selected tools visible and removable; retain unsent text after failure | User can predict who receives a message and which app is used before sending |
| U8 / P1 | Device validation needed: streaming, expanding cards and history loading alter message height | Preserve reading position, show a stable jump-to-latest control and unread arrival indicator, avoid forced scrolling while reading | Long answer, keyboard, incoming update and older-page load do not move the reader unexpectedly |
| U9 / P1 | Observed: Tasks uses Alert dialogs for watch details; Feed/Tasks show inline refresh errors | Assess a reusable detail sheet for richer watch history and controls. Keep recoverable errors beside the affected item | Failure explains what was saved, what failed and the next action; no repeated modal interruptions |
| U10 / P2 | Observed: main theme defines primary/error but no success/warning/info tokens; workflow/activity cards also use inline theme-dependent colors | Extend semantic tokens where needed and migrate touched components incrementally | Consistent meaning in light/dark themes; contrast checked; no color-only states |
| U11 / P1 | Device validation needed: small icons, uppercase metadata, tables and horizontally scrolling options | Check text scaling, screen readers, focus order and touch targets across real data lengths | Main journeys work at large text sizes and with VoiceOver/TalkBack |
| U12 / P2 | Device validation needed: users must rediscover generated pages/decks through conversations | Add a lightweight Library entry with output type, title, status and originating chat | Reopen a previous artifact without remembering its chat; partial/expired items explain recovery |

### Dynamic response UI: use a small, predictable vocabulary

Render ordinary conversation as readable text. Select a structured response only when it improves scanning, comparison, confidence or action. The following are proposed refinements to existing typed cards, not a requirement for a general generative UI engine.

| Result type | Proposed presentation | Interaction and edge cases |
| --- | --- | --- |
| Research / factual answer | Concise answer first; inline citations; expandable sources and supporting detail | Sources remain accessible while streaming; missing or conflicting evidence is labelled; link failure does not discard the answer |
| Comparison | Compact rows with the criteria users asked for, recommendation and its reason; detail sheet for wider comparisons | Unknown values stay unknown; usable at large text sizes; avoid tiny wide tables on phones |
| Ride / commute | Route summary, provider rows, estimated fare, quote timestamp and one provider action per row | Freshness is explicit; no unsupported “cheapest” or leave-by claim; app handoff failure offers recovery |
| Calendar / meeting | Local date/time and timezone, location, conflicts and a clear open/review action | All-day events and timezone changes remain understandable; do not imply a draft is booked |
| Task / routine | State label, concise outcome or blocker, next run when relevant, primary next action | Waiting, failed, cancelled and partial success are distinguishable; show notification delivery separately from task completion |
| Approval | Account, recipient, proposed change and consequence immediately above Approve/Cancel | Prevent duplicate submits; handle stale approvals and changed details; external writes remain server-authorized |
| Deck / page / file | Stable artifact preview with title, generation state, open/edit/share controls and provenance | Partial creation and expired download recover cleanly; retain access through Library and source chat |
| Quantitative result | Small chart only when valid structured data supports it, plus units, date range and text alternative | Missing data is visible; accessible labels and a table alternative; no decorative fabricated series |
| Multi-mate response | Clear speaker identity and a short lead-mate synthesis, with specialist contributions expandable | Distinguish actual contributions from narration; avoid duplicating every answer in full |

Example structure for a completed ride result:

> Airport City → Osu  
> Estimates checked at 09:02  
> Bolt · GH¢38 estimate · Open Bolt  
> Uber · GH¢42 estimate · Open Uber  
> View route details

Example structure for an interrupted task:

> Needs your input  
> Calendar access expired. Your draft is saved.  
> Reconnect calendar → review and continue  
> View completed steps

The examples are proposed copy/layouts, not assertions about live quotes or shipped behavior.

### Color and visual hierarchy

- Keep a calm neutral canvas and reserve the existing primary accent for the main action, selection and important navigation. Do not color every response background.
- Introduce semantic success, warning and information colors only where they express a distinct state. Pair them with icons and explicit text: Completed, Needs you, Failed, Estimate.
- Use subtle tinted status surfaces rather than large saturated cards. Approval emphasis should come from consequence and action hierarchy, not alarming color alone.
- Standardize card title/body/metadata typography, spacing and border treatment. Keep result text selectable and avoid low-contrast metadata for essential information.
- Use mate avatars/names as identity; a small optional accent can supplement them, with no dependence on color to identify the speaker.
- Check each chosen palette in both themes and with increased contrast/text size. Palette values should be reviewed in rendered screens before acceptance.

### Motion and feedback proposals

Motion must explain a state change or preserve spatial continuity. Existing reduced-motion support is a foundation, not evidence that every animation already respects it.

| Interaction | Proposed behavior | Guardrail |
| --- | --- | --- |
| Send / long task | Immediate acknowledgement and meaningful activity text; retain Stop where supported | No fake percent complete or looping animation suggesting activity after failure |
| Streaming answer | Stable text flow with restrained appearance of new blocks | No per-token bounce, typewriter replay, repeated screen-reader announcements or forced scroll |
| Card detail expansion | Short, interruptible reveal, starting around 150–220 ms as a prototype value | Profile list remeasurement; reading position must remain stable |
| Status change | Brief icon/text crossfade; optional restrained success haptic | Avoid confetti or celebration for routine background work; no haptic on every stream update |
| Press feedback | Immediate native press state; optional small transform for suitable controls | Do not delay navigation or rely on motion to indicate activation |
| Loading | Shape-appropriate skeleton only when it prevents layout jump; preserve cached content during refresh | Avoid large simultaneous shimmer regions or restarting all loading UI on a minor refresh |
| Reduced motion | Replace movement with immediate changes or gentle opacity where appropriate | Honor system preference; core information and controls remain available |

These values are design starting points, not verified platform requirements. Use existing animation tools; adding a new dependency is not part of the proposal.

### Grok and Muse: specific lessons to evaluate

- **Grok Bot attention model:** use working/unread/needs-attention distinctions and activity-aware notifications to connect chat and Feed. Official reference: https://docs.x.ai/grok-bot/settings-and-notifications
- **Grok Bot workflow reuse:** successful work should lead naturally to reusable instructions and scheduled routines. Give the user a reviewable setup, not a hidden automation. Official reference: https://docs.x.ai/grok-bot/skills-routines-and-automations
- **Muse output continuity:** an artifact should remain easy to find after its original conversation. Evaluate Library and source-chat links. Official reference: https://www.meta.com/en-gb/help/superintelligence/1331373868832401/
- **Muse conversational continuity:** assess sending follow-ups while work continues, with an explicit choice between amending current work and starting another task. Resolve execution races before adding this interaction. Same official reference as above.

These references support behavior patterns. They do not substantiate claims about competitor typography, animations, colors or measured usability. A visual comparison needs dated screenshots or direct app sessions, using the same tasks. Do not copy competitor styling or claim pixel-level fidelity from marketing descriptions.

### UI/UX validation and build slices

1. **Capture baseline journeys:** first chat, long answer, connected-app failure, routine creation, notification return, ride handoff, artifact reopen and usage limit. Include iOS/Android, light/dark, reduced motion, large text and slow/offline networking. Record steps, screenshots, observed friction and task outcome.
2. **Fix navigation and wording:** reconcile branch fixes, accurate notification labels, useful Ideas destination and Tasks terminology. Each change should have a concrete before/after journey.
3. **Unify response states:** pick two existing result types first; align their hierarchy, action labels, evidence, freshness and recovery. Preserve typed data and server action authorization. Malformed or unsupported metadata falls back to readable text.
4. **Refine visual tokens:** review rendered variants, then apply only the chosen semantic colors and common spacing/type rules to touched components.
5. **Add justified motion:** prototype one expansion and one status transition; verify frame pacing, interruption, reduced motion and scroll stability before wider rollout.

Track task completion, time to find the next action, unnecessary backtracking, retry success and accidental taps. Establish a baseline before setting numerical targets. A card being mounted is not proof it was seen, and a provider accepting a push is not proof it was read.

### Additional Ken review decisions

- [ ] Confirm current screen/branch baseline before scheduling UI fixes.
- [ ] Review U1–U12 and distinguish reproduced friction from investigation tasks.
- [ ] Choose the first two response types for refinement and identify any API-contract work.
- [ ] Approve status terminology, preview privacy, action semantics and freshness rules.
- [ ] Select rendered visual variants with Sammy before broad token changes.
- [ ] Confirm device/accessibility coverage and performance budgets for animated responses.
- [ ] Keep backend reliability and UI state changes aligned so the interface never promises an outcome the server cannot establish.
