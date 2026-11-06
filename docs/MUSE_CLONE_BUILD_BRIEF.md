# Muse Clone — End-to-End Product and Engineering Build Brief

Date: 2026-10-09

Implementation update, 2026-10-10: Cooper now has Neon-backed background chat jobs, a recoverable submission outbox, persisted progress and assistant messages, Trigger.dev workers, confirmed one-time/daily/weekly routines, real Tasks/Feed screens, explicit external-action approvals, and independent push-delivery records. The hosted worker and concurrent occurrence claim have passed focused smoke checks. This is not a complete production launch: API hosting, installed-build push verification, conditional monitoring, and standing external delivery consent remain release gates. See [background operations and app checks](COOPER_BACKGROUND_OPERATIONS.md) for the current behavior and verification steps. Later user instructions changed navigation from the original tab proposal to a drawer and changed the visual reference to Finora; those decisions supersede the original visual proposal below.

## 1. Purpose and authority

Build a Muse clone: a polished personal AI companion named Cooper that chats, researches live information, uses connected applications, and completes scheduled or recurring work. Preserve the product identity and interaction model of the reference app while making execution, persistence, scheduling, and delivery reliable.

This is the handoff document for the agent building the new app. It describes the intended product, the inspected reference implementation, the replacement architecture, and completion criteria. Do not interpret existing placeholder screens as finished functionality.

The user selected the following target stack and execution platform:

- **Clerk handles authentication.** Do not use Supabase Auth.
- **OpenRouter handles AI inference.** Do not make direct OpenAI model calls, including hidden calls inside browser automation or schedule parsing.
- **Neon Serverless PostgreSQL with Drizzle ORM** replaces Supabase as the database.
- **Hono** provides the authenticated backend in an Expo + API monorepo.
- **Trigger.dev Cloud** provides hosted workers, queues, and scheduled task execution.
- **Expo SDK 57, Expo Router tabs, TypeScript, pnpm, NativeWind, Hugeicons, Zustand, Liquid Glass, dark mode, expo-haptics, Sentry, and EAS** are the selected application foundation.
- **Google and Apple** are the selected Clerk social sign-in providers. No separate onboarding flow or mobile analytics was selected in the scaffold.

Preserve the Muse clone concept. Treat the choices above as settled; do not substitute Supabase, another auth provider, or a different job platform. Verify the generated scaffold and package compatibility before implementation. Hono API hosting, object storage, exact model IDs, billing provider, and transcription provider remain open decisions. Retain Composio and Browserbase/Stagehand from the reference, subject to verifying their integration and OpenRouter-only inference requirement.

This brief is based on the local repository at `C:/Users/HP/Desktop/muse`, not an exhaustive audit of the original commercial Muse product. Do not invent original-product features or claim pixel accuracy without a reference.

## 2. Product concept

Muse gives users a familiar companion they can delegate work to. Chat is the entry point; tools and routines turn conversation into action.

The central promise is: **Tell Cooper what outcome you want, see what it is doing, and get a useful result—even if the work runs later while the app is closed.**

Examples:

- “Find three suitable laptops within my budget and compare current prices.”
- “Summarize my unread work emails.”
- “Every weekday at 8 AM, research the latest AI news and send a brief here.”
- “Every Monday, summarize this information and post it to this Slack channel.”
- “Check this product daily and tell me when the price drops below my threshold.”

Cooper should explain outcomes clearly, ask concise questions when essential details are missing, and use tools when the answer depends on live data. Opening a page, starting a job, or invoking a tool is not completion of the user's objective.

## 3. Reference implementation: what exists

### Current stack

The source declares Expo SDK 57, React Native 0.86.3, React 19.2.3, Expo Router, TypeScript, Hugeicons, SVG, safe-area handling, Reanimated, and a WebView browser preview.

Its backend integrations include Supabase, Composio, OpenAI Agents SDK, Browserbase, and Stagehand. These versions are reference facts, not automatically the correct versions for a new project.

### Existing behavior

- Google onboarding uses Supabase Auth.
- Chat threads and messages are persisted in Supabase.
- The chat endpoint first attempts schedule-intent parsing, otherwise starts a Cooper agent with Composio and browser tools.
- The active chat agent defaults to `gpt-5.2`; Stagehand separately uses `gpt-4o`; background summarization defaults to `gpt-4.1-mini`.
- Browser tools create a session, navigate, take one logical action, extract page information, and close the session.
- Composio supplies connected-app tools and connection links.
- Chat returns newline-delimited JSON events for a browser, schedule confirmation, final answer, or error. It does not currently render token-by-token text.
- Confirmed schedules are saved in `scheduled_agent_tasks`.
- A Supabase Edge Function runs due tasks and records run history. A supplied cron script dispatches every 15 minutes.
- Background execution differs from chat execution: it uses Browserbase agent-run HTTP calls, Composio HTTP calls, and separate model calls.
- Chat delivery inserts an assistant message into the source thread or a main-thread fallback.

### Existing gaps that must not be copied

- Some auth helpers accept a client-supplied user ID when token verification fails or is absent.
- Browser sessions are kept in a process-local map with no reliable ownership/resume contract.
- Schedule computation stores a timezone but calculates using local date arithmetic instead of applying it correctly.
- Due schedules are read and executed without a robust atomic claiming mechanism.
- Regular assistant responses are persisted by the client after receiving the result; a disconnected client can lose the saved answer.
- Browser/connect metadata is not fully preserved through normal chat reloads.
- The chat screen does not subscribe to background results or implement push delivery.
- Feed stories, idea actions, plan usage, billing, voice, attachments, and several settings actions are mocked or toast-only.
- The API URL helper depends on the Expo development host; web output is configured as static. Production backend deployment must be explicit.
- Some browser comments call cleanup “pause,” while the implementation actually closes/releases sessions.

None of the inspected code establishes that deployment, credentials, external delivery, or production workflows currently work end to end.

## 4. Product surface and visual direction

Retain the five-tab Muse structure:

| Screen | Intended responsibility |
|---|---|
| Chat | Conversation, progress, live browser, sources, approvals, schedule cards, results |
| Feed | Real findings, completed routines, important changes, and items requiring attention |
| Ideas | Templates that create a real chat or schedule draft |
| Tasks | Scheduled routines, next runs, controls, run history, results, errors |
| Settings | Account, connections, notifications, appearance, companion profile, actual usage |

Retain the header with menu, Cooper mascot/avatar, agent name, and contextual actions. Retain a drawer with main chat, searchable side chats, unread indicators, and new-chat creation. Use an attractive floating dock, rounded surfaces, restrained spacing, peach user bubbles, soft gray assistant bubbles, and a capsule composer. Implement styling with NativeWind backed by centralized tokens. Use Liquid Glass where supported with a readable blur/solid fallback, and tasteful expo-haptics feedback for meaningful actions. Dark mode needs a complete token palette rather than simply inverting colors.

Centralize design tokens. Reference palette:

| Token | Value |
|---|---|
| Primary | `#2563EB` |
| User bubble | `#E8C4B4` |
| Assistant bubble | `#EEF0F2` |
| Active tab | `#E6E8EA` |
| Main text/icons | `#1E2022` |
| Muted text/icons | `#9E9E9E` |
| Status blue | `#0066FF` |
| White | `#FFFFFF` |

Do not hardcode ad-hoc component colors. Persist companion name, avatar selection, and appearance. Keep technical session IDs, model debugging, credentials, and provider payloads out of ordinary product UI.

Provide keyboard-aware input, safe-area spacing, accessible labels, readable contrast, reduced-motion behavior, empty/loading/error states, and usable layouts on small phones and web. The mascot reflects actual state; an “online” dot must not falsely imply work is running.

## 5. Target stack and service boundaries

| Layer | Decision |
|---|---|
| Client | Expo SDK 57 / React Native / Expo Router tabs / TypeScript in an Expo + API monorepo |
| Package manager | pnpm; use the generated workspace layout and lockfile |
| Styling and icons | NativeWind, centralized theme tokens, Hugeicons |
| Interface polish | Liquid Glass with fallbacks, dark mode, expo-haptics |
| Client state | Zustand for transient interface state; Neon for durable application state |
| Authentication | Clerk, Google and Apple sign-in, secure native session persistence |
| API | Hono with Clerk verification and owner-scoped endpoints |
| AI gateway | OpenRouter, accessed only from the backend |
| Orchestration | Shared TypeScript agent runtime with validated tools and durable run state |
| App integrations | Retain Composio, behind an internal connector adapter |
| Browser | Retain Browserbase and Stagehand if OpenRouter-only inference compatibility is verified |
| Database | Neon Serverless PostgreSQL with Drizzle schema, queries, and migrations |
| Files | Private object storage with owner-scoped access; vendor still to be chosen |
| Execution | Trigger.dev Cloud hosted tasks and queues; Hono submits work and the app observes runs |
| Scheduling | Trigger.dev recurring dispatcher plus Neon-owned schedules and atomic occurrence claiming |
| Updates | Authenticated event stream and resumable event replay |
| Notifications | Mobile push where configured, with in-app delivery as the canonical result |
| Monitoring | Sentry crash/error reporting and performance traces with sensitive-data redaction |
| Builds | EAS configuration and platform-specific native builds |
| Analytics | No mobile analytics SDK; Sentry is the explicitly selected monitoring service |

Hono handles short authenticated requests and event access; Trigger.dev Cloud executes long agent/browser tasks. Deploy worker code through Trigger.dev and verify its build/runtime supports the installed Browserbase/Stagehand packages. Do not port the Supabase Edge Function execution model. Hono hosting remains to be selected and must support the intended streaming/replay transport.

### Trigger.dev execution decisions

- Keep worker code in a dedicated monorepo package or directory, sharing validated contracts, Drizzle access, and the agent engine with Hono through server-only modules.
- Define an agent execution task for interactive delegation, manual runs, and scheduled occurrences. Use separate delivery tasks so notification failures do not repeat research or external actions.
- Define agent and delivery queues with explicit global and per-user concurrency controls. Set execution budgets, retry policies, and queue expiry for time-sensitive work.
- Store canonical business state, evidence, results, approvals, and recurrence rules in Neon. Trigger.dev manages execution lifecycle; its run ID is a reference on the application run, not the application identity or the only copy of the result.
- Save semantic checkpoints between model/tool steps. A task retry can restart task code; do not assume each JavaScript statement or external side effect is automatically checkpointed. Resume from persisted state or completed subtasks deliberately.
- Use Trigger.dev wait tokens for approvals and other human handoffs where appropriate. Persist the owner-bound mapping and timeout. Only Hono, after authorization and approval validation, completes the token; never accept arbitrary completion tokens from the client.
- Browser connections may need reconnection after a wait or retry. Persist session references, check expiry, and never assume an in-memory browser object survives suspension.
- Use a recurring dispatcher task to find due Neon schedules. Database occurrence keys, transactional claiming, and an outbox bridge database commits to Trigger.dev submission safely.
- Keep Trigger.dev secrets on Hono/worker infrastructure. If provider realtime subscriptions are used, issue narrowly scoped access only after owner verification; do not expose broad project credentials.
- Verify current SDK APIs and plan limits before implementation. Trigger.dev is an execution service, not a replacement for authorization, tool consent, idempotency, or the product database.

Do not keep direct OpenAI calls merely because the old repository used OpenAI Agents SDK. A custom tool loop using OpenRouter's documented API is an acceptable default. Keep any SDK only if it supports the chosen gateway, streaming, tool schemas, and resume semantics without bypassing OpenRouter.

## 6. Clerk authentication and identity

1. Initialize Clerk in the app with its publishable key.
2. Implement Google and Apple sign-in, callback/deep-link handling, cancellation, loading, expired sessions, and sign-out. Preserve the scaffold's no-onboarding choice; the sign-in gate and essential account setup still exist.
3. Obtain the current Clerk session token for backend requests.
4. Verify it server-side using supported Clerk verification facilities. Derive identity from verified claims; never trust a body `userId`.
5. Map the Clerk subject to a local application user row. Use a unique `clerk_user_id` string and an internal UUID primary key.
6. Use the internal user ID consistently for database ownership, Composio mapping, runs, schedules, and browser ownership.
7. Scope every operation to the authenticated owner. Verify ownership of threads, messages, tasks, files, connections, approvals, and runs.
8. Authenticate workers with separate service credentials. A worker's authority comes from its trusted job, not a forged client identity.

Neon database access is server-side through Drizzle in Hono and Trigger.dev workers. Never expose the database connection string to the app. Do not retain foreign keys to `auth.users` or policies based on Supabase `auth.uid()`. Use local user UUID ownership predicates on every query/mutation; database RLS can add defense in depth if configured with a tested server identity context. Select the Neon driver and connection strategy for the actual Hono/worker runtimes and bound connection usage under concurrency.

Support verified Clerk webhooks for profile changes and deletion, with idempotent handling; provision users on authenticated requests as well so delayed webhook delivery does not block onboarding. Account deletion must revoke connections, stop future tasks, invalidate access, and follow an explicit data-retention policy.

## 7. OpenRouter inference and model policy

All generative AI calls go through OpenRouter: conversation, intent extraction, summaries, titles, browser reasoning, structured extraction, and later transcription/vision features if compatible endpoints are available.

The backend owns the API key and maintains model configuration by role. Do not hardcode the old model names as new requirements. Choose models after checking current availability, tool support, structured-output support, latency, and cost.

Requirements:

- Define validated JSON tool schemas and normalized tool results.
- Preserve assistant tool calls and matching tool-result IDs across loop iterations.
- Buffer streamed tool arguments until complete and validated; never execute partial argument JSON.
- Require supported capabilities on primary and fallback models; avoid silently switching to a model that cannot use tools.
- Persist model/provider identifiers, usage, timing, and errors for each invocation.
- Set per-run time, turn, token, and spending limits server-side.
- Handle cancellation, timeouts, rate limits, and recoverable provider errors.
- Use validated structured intent output for schedules; ask for missing details instead of inventing a recipient, deadline, or frequency.
- Keep provider-specific data inside adapters so the app consumes a stable event/result contract.

Stagehand compatibility is a build gate: prove that browser actions and extraction use OpenRouter. If the installed version cannot do so, update or replace its inference adapter. Do not ship the old `OPENAI_API_KEY` requirement. Avoid hosted browser-agent modes whose inference routing cannot meet this requirement.

## 8. Shared agent execution model

Chat, manual task runs, and scheduled occurrences must call the same execution engine with different triggers. They share tools, policy, evidence, budgets, approvals, and result persistence.

```text
Clerk-authenticated Expo client -> Hono -> persist message + run in Neon
                                         |
                              outbox -> Trigger.dev queue
                                         |
                              Trigger.dev Cloud worker
                                         |
                                  OpenRouter loop
                                         |
                     read/search/browser/connected-app tools
                                         |
                   Neon checkpoints + events + evidence + result
                                         |
                         chat + feed + notifications/delivery
```

Run states: `queued`, `running`, `waiting_for_approval`, `waiting_for_connection`, `waiting_for_login`, `completed`, `failed`, `cancelled`.

Store checkpoints containing conversation/tool history, current step, evidence references, approval state, budgets, and browser-session references. Browser objects themselves remain worker-local; durable session references and ownership allow reconnection when supported. A database row alone does not make a closed browser resumable.

Before each tool call, validate arguments, ownership, capability, current connection state, approval requirements, and budget. Afterward, persist the result and a progress event before continuing.

Completion requires a useful result or a clear account of what could not be completed. Distinguish verified success, partial findings, missing access, and provider failure. Never report a successful email delivery because an email was merely drafted.

## 9. End-to-end chat flow

1. Open or create an owner-scoped thread.
2. Load paginated messages, persisted cards, unread state, and active runs.
3. Submit text with a client-generated idempotency key and optional attachment references.
4. Hono verifies Clerk identity, validates thread/file ownership, and transactionally saves the user message, application run, and submission outbox record in Neon. An outbox publisher submits the task to Trigger.dev with a stable idempotency key and records the provider run ID. Recover unsent records after failures; do not rely on an unprotected database-write-then-network-call sequence.
5. Return a run ID promptly and subscribe to its events.
6. Cooper chooses direct response, live research, connected-app work, schedule drafting, or a clarification.
7. Display progress, streamed answer text, browser cards, and approval/connection cards as appropriate.
8. Persist assistant output and rich metadata on the server, regardless of whether the client remains connected.
9. Finish with a coherent result and sources when research was used.
10. On reconnect, recover the run and replay events after the last cursor. Do not launch another run simply because the transport broke.

Stopping a run cancels future model/tool steps and releases resources where possible. An already committed external action cannot be undone by closing the stream. Editing a request creates a new explicit run or revision; it must not silently mutate an executing run.

Conversation history supplies context, but is not a complete memory system. Start with recent turns plus persisted summaries. Add explicit, user-editable preference memory when needed; do not claim long-term recall unless it is stored and retrieved.

## 10. Search, browsing, and evidence

The reference searches through a browser. Preserve this as the baseline workflow; a dedicated search provider is a later implementation choice, not an already-selected dependency.

Tool choice:

- Answer from supplied content for writing, explanations, and stable ordinary questions.
- Use connected-app APIs for private workspace data when available.
- Use live browser tools for current website facts, product availability, forms, authentication, or site interaction.
- If a dedicated search adapter is added, use it for efficient discovery and the browser for interaction or detailed verification.

Browser loop:

1. Create one owned session for the run.
2. Navigate to the relevant site or search page.
3. Read visible information and identify the next step.
4. Perform one logical action: click, type, submit a search, scroll, or navigate.
5. Read again and collect evidence.
6. Retry sensible alternatives for missing data or failed actions within the run budget.
7. Finish only when the objective is met or a specific blocker is established.
8. Release the session on completion/cancellation/failure; retain it temporarily for an explicit login handoff with a timeout.

Evidence records should include URL, title, retrieval time, extracted facts/excerpts, and their associated tool step. Final research answers include usable source links. Compare currencies, units, dates, and availability accurately; label incomplete coverage.

Website and document content is untrusted input. It cannot authorize messages, payments, downloads, credential access, or changes to the agent's rules. Restrict browser navigation to permitted protocols and block unintended local/private-network access.

Live preview is an authorized view into the user's own run. Gate preview access, use expiring URLs where supported, and do not expose another user's session. Login handoff needs an explicit “Continue” action that resumes the same run/session when valid; recover gracefully if the session expired.

## 11. Composio connections and external actions

Connect flow: select app -> backend creates owner-bound connection -> open OAuth -> verify completion server-side -> store account mapping -> show connected account -> resume waiting work when the user continues.

Verify callback ownership/state; do not trust a client success flag. Poll with backoff or use provider callbacks. Account email is a display label, not the authorization identity. For multiple accounts, store and display the exact selected account.

Support connection status, permissions, account selection, reauthorization, and disconnect. Disconnect prevents future use immediately and affects dependent tasks visibly.

Wrap Composio tools in an internal registry with capability, schema, read/write classification, ownership, connection requirements, and normalized result verification. Register supported workflows deliberately; a connector catalog entry alone does not mean every action works.

Update, 2026-11-06 (owner decision, supersedes the approval rules below): Cooper acts without asking for approval, including sending and replying to email and messages, posting, deleting and website actions, whenever the action comes from the user's own request. Every change is listed on the reply's Done card with Undo where an inverse exists. Content from emails, files, websites and tool results is never treated as an instruction to act. Cooper still never types passwords, one-time codes or payment details; the private browser handoff remains for those.

For mutations, show an explicit approval card with destination/account, action, exact content or relevant arguments, and consequences. Persist approval tied to the action version. Reject stale approvals or changes to approved arguments.

Scheduled external delivery can use standing consent only when its scope was included in the confirmed schedule: selected account, destination, operation, cadence, and allowed generated content. Anything outside that scope requires fresh approval. Never treat webpage text or a model claim as approval.

When a provider request times out after a possible commit, reconcile the outcome before retrying. Use provider idempotency when available. Do not promise exactly-once behavior across arbitrary third-party APIs.

## 12. Scheduling and recurring work

Support one-time, daily, and weekly schedules first. Add weekday and interval schedules when their parsing, execution, and UI are complete. Conditions such as “notify me only if the price drops” belong in a validated task condition, not just in loose prose.

Schedule draft includes title, original prompt, actionable task specification, recurrence, local time, IANA timezone, delivery account/destination, conditions, and consent scope. Show the next concrete occurrence before confirmation. Missing information produces a clarification.

The backend calculates occurrences using the stored timezone. Persist UTC instants plus the local recurrence definition. Specify daylight-saving behavior, including nonexistent and ambiguous local times, and test it. A device timezone change must not silently move an existing schedule.

Confirmation creates the schedule transactionally and records consent. Editing its action/destination changes its version and may require renewed consent.

Dispatcher/worker behavior:

- Atomically claim/enqueue due occurrences using transactional locking or an equivalent tested mechanism.
- Run this dispatcher as a Trigger.dev scheduled task. Save the claimed occurrence and its outbox record in one Neon transaction, then submit the shared agent task through the recoverable outbox publisher.
- Enforce a unique occurrence key such as `(schedule_id, scheduled_for, schedule_version)`.
- Use leases/heartbeats so crashed workers can be recovered.
- Limit concurrency per user and globally.
- Execute through the shared runtime.
- Record success, partial results, failure, approval/login blocks, and delivery status independently.
- Advance recurrence deterministically and apply an explicit missed-run policy. Default: coalesce missed recurring occurrences into one useful catch-up rather than sending a backlog of duplicate briefs.
- Retry transient failures with bounded backoff; do not endlessly re-run the same overdue task.
- Pausing/cancelling prevents future occurrences; offer a separate control to stop an already running occurrence.

Show next run, timezone, recent outcome, last success, and run history in Tasks. “Run now” creates a manual occurrence and does not unexpectedly alter the regular cadence. Dispatcher cadence is configurable; do not claim exact-minute delivery with the old 15-minute polling setup.

## 13. Results, feed, delivery, and notifications

Persist the canonical result before attempting optional notification delivery. Link it to its run, task, evidence, and source thread. If the source thread was deleted, route to an owned main thread or a clearly defined results inbox.

Chat results appear without requiring a restart through authenticated event updates or refresh-on-focus recovery. Feed cards represent real saved findings and activity, with deep links to results/tasks. A curated news feature must use genuine retrieved sources and deduplication; do not ship dummy stories as current news.

Keep execution status separate from delivery status. A task can complete while push or Slack delivery fails. Show “Result ready; delivery failed” and permit a delivery-only retry that does not repeat research or external actions.

Push notifications use registered device tokens, user preferences, quiet hours, and deep links. Keep sensitive content out of lock-screen previews by default. Scheduled monitoring stays quiet on unchanged/non-actionable findings when that is what the user requested. Store the last observed value/change baseline.

## 14. Ideas, settings, attachments, and voice

Ideas must open chat with an editable task prompt or a schedule draft, expose required connectors, and lead into real execution. Templates cannot secretly authorize external writes.

Settings must provide real sign-out, account settings, saved appearance/profile, connection management, notifications, and usage. Usage comes from measured server-side activity; do not preserve the sample 11% card. Billing remains an open provider/product decision. Omit payment controls until a real flow exists.

Attachments: select/upload with progress, validate type/size, use private owner-scoped storage, scan/process as appropriate, and attach references to a run. Extract content server-side and enforce model/context limits. Do not ship a functioning-looking button that only shows a toast.

Voice: request microphone permission, record with cancel/send controls, transcribe through a supported chosen service, allow editing the transcript, then use normal chat submission. Verify OpenRouter endpoint/model support before assuming it handles transcription. Until a compatible provider decision is made, hide or clearly disable voice. Speaking responses is a separate later feature.

## 15. Data model

Use migrations, foreign keys, ownership checks, indexes, and retention rules. Suggested entities:

| Entity | Key fields/responsibility |
|---|---|
| `users` | Internal UUID, unique Clerk subject, profile, preferences |
| `agent_profiles` | Owner, companion name/avatar/accent |
| `chat_threads` | Owner, title, main/side type, timestamps, archived state |
| `chat_messages` | Thread, role, content, rich metadata, run reference |
| `connections` | Owner, toolkit, provider account ID, account label, permissions, status |
| `runs` | Owner, thread/task, trigger, status, checkpoint, budget, outcome |
| `run_steps` | Tool/model invocation, validated inputs, normalized outputs, status |
| `run_events` | Monotonic sequence/cursor, event type, payload, timestamp |
| `approvals` | Run/action version, exact approved scope, owner response, expiry |
| `browser_sessions` | Owner/run, provider session ID, lifecycle, expiry, reconnect metadata |
| `schedules` | Owner, task spec, rule/timezone, destination, consent, version, next occurrence |
| `schedule_occurrences` | Unique scheduled occurrence, claim/lease, run reference |
| `evidence` | Run/step, URL/title, retrieved facts and timestamp |
| `results` | Run, final text/artifacts, evidence, partial/completed outcome |
| `deliveries` | Result, destination, attempts, provider receipt, status |
| `feed_items` | Owner, result/run, type, summary, read state |
| `attachments` | Owner, storage key, MIME/size, extraction status |
| `device_tokens` | Owner/device, push token, platform, validity |
| `usage_events` | Owner/run, model/provider, tokens/cost, browser/tool usage |

Use stable IDs for ownership rather than email. Persist rich cards structurally so reloads reconstruct browser status, approvals, connector prompts, schedule drafts, and results. Redact secrets and credential-bearing URLs from logs and retained tool payloads.

## 16. API and event contracts

Suggested backend routes (names may adapt to the destination framework):

```text
POST   /threads
GET    /threads
GET    /threads/:id/messages
POST   /threads/:id/messages           -> message + run IDs
GET    /runs/:id
GET    /runs/:id/events?after=:cursor  -> authenticated stream/replay
POST   /runs/:id/cancel
POST   /runs/:id/continue
POST   /approvals/:id/respond
GET    /connections
POST   /connections/:toolkit/connect
GET    /connections/:id/status
DELETE /connections/:id
POST   /schedules                     -> validated confirmed draft
GET    /schedules
PATCH  /schedules/:id
POST   /schedules/:id/run
GET    /schedules/:id/runs
GET    /feed
POST   /feed/:id/read
POST   /attachments/upload-request
POST   /devices
GET    /usage
```

Event envelope: `{ runId, sequence, type, timestamp, payload }`.

Events include `run.started`, `progress`, `text.delta`, `tool.started`, `tool.completed`, `browser.ready`, `approval.required`, `connection.required`, `login.required`, `schedule.draft`, `result.saved`, `delivery.updated`, `run.completed`, `run.failed`, and `run.cancelled`.

Client reducers must deduplicate events and handle replay. Terminal messages reference persisted results. Authentication expiry should reconnect using a refreshed token; access to another owner's stream must fail. Use client idempotency keys on mutation endpoints.

## 17. Configuration and deployment

Client-visible configuration: Clerk publishable key and HTTPS Hono API origin. Server-only configuration: Clerk secret/verification settings, OpenRouter key and model roles, Neon `DATABASE_URL`, Composio key/auth configs, Browserbase key/project, Trigger.dev secret/project configuration, object-storage credentials, and push credentials where required. Configure Sentry with platform-appropriate public DSNs and server-only upload/auth tokens; redact prompts, tool content, and session credentials by default.

Do not use `EXPO_PUBLIC_` for secrets. Provide `.env.example` with placeholders and a startup configuration check. Never print access tokens, refresh tokens, or credential-bearing responses.

Deploy the Expo app using the selected EAS setup, the Hono backend to its chosen host, and workers/dispatcher to Trigger.dev Cloud. Supply Drizzle migrations for Neon, documented Trigger.dev deployment and schedule setup, OAuth callbacks, native deep links, CORS/allowed origins, and health checks. Static web hosting alone cannot run Hono or worker tasks. Use pnpm workspace commands and `npx expo install` for Expo-compatible native dependencies. Verify the generated SDK 57 configuration rather than guessing versions. Do not run production migrations or deploy externally without the user's applicable authorization.

## 18. Implementation sequence

1. Inspect the generated `muse-clone` monorepo and applicable instructions. Confirm pnpm workspaces, Expo SDK 57, Hono, Clerk, NativeWind, Neon/Drizzle, Sentry, and EAS configuration. Confirm API hosting and unresolved vendor choices.
2. Establish Clerk Google/Apple authentication, local identities, Drizzle migrations, owner-scoped Hono API access, and persisted chat in Neon.
3. Integrate Trigger.dev Cloud, task queues, recoverable outbox submission, and the shared OpenRouter runtime with streamed responses, durable runs/events, cancellation, and server-side persistence.
4. Add Composio connections and a tested read workflow, then explicit approvals and a tested write workflow.
5. Add Browserbase live sessions, Stagehand/OpenRouter integration, evidence, cleanup, and login handoff.
6. Add schedule drafts/confirmation, timezone-safe recurrence, atomic dispatch, worker recovery, and run history.
7. Add result delivery, feed, unread state, push notifications, and delivery-only retries.
8. Complete Ideas and real Settings behavior; add attachments and voice only when their full workflows work.
9. Validate device/web behavior and deployment, then document remaining limits honestly.

Deliver coherent increments. Do not wait until every screen looks complete before verifying the first real request-to-result path.

## 19. Acceptance criteria

The new agent must demonstrate these with meaningful automated checks and actual integration/device verification where credentials are available:

- Clerk Google/Apple sign-in, restart persistence, sign-out, expired sessions, and rejected forged identities.
- Drizzle migrations apply cleanly to Neon; Hono and workers share contracts and enforce ownership without exposing database credentials.
- Trigger.dev tasks execute after the API returns; outbox recovery handles failed submissions without duplicate application runs.
- One user cannot access another's messages, files, schedules, connections, approvals, runs, or browser previews.
- All AI inference uses OpenRouter, including browser extraction and intent parsing.
- A simple chat response streams, persists server-side, and survives an app disconnect/reopen.
- A current-information request retrieves live facts, returns source links, and closes its browser session.
- A blocked login resumes the same authorized run or clearly reports expiry.
- A Composio read uses the selected account; a write waits for approval and executes only the approved content/destination.
- Disconnecting an account blocks future dependent actions.
- Confirming a schedule produces the correct next occurrence in its IANA timezone.
- Concurrent dispatchers do not create duplicate occurrences; worker recovery does not blindly duplicate external effects.
- Manual run, pause, edit, cancellation, and recurrence behave as specified.
- A background run produces a saved result while the app is closed; the result appears on return and notifications deep-link correctly.
- Failed notification delivery can be retried without rerunning the task.
- Rate limits, budget exhaustion, partial research, tool failures, expired OAuth, and ambiguous external outcomes have truthful states.
- Feed, Ideas, settings, and usage are backed by real functionality; unsupported controls are not masquerading as working features.
- Keyboard, safe areas, accessibility, stream parsing, and browser previews are checked on intended platforms.

Typechecking alone does not prove browser automation, OAuth, scheduled execution, external delivery, push notifications, or deployment. Report tested behavior separately from code implemented but unverified.

## 20. Reference files and official integration sources

Reference repository paths:

- `src/app/(tabs)/chat.tsx`: client chat and confirmation rendering.
- `src/app/api/chat+api.ts`: old streaming API and routing.
- `src/lib/composioAgent.ts`: old Cooper instructions and tool assembly.
- `src/lib/browserbase.ts`: Browserbase/Stagehand setup and direct OpenAI configuration to replace.
- `src/services/tools/BrowserbaseSession.ts`: browser action/read/navigation tools.
- `src/services/tools/browserSessionStore.ts`: process-local session map to redesign.
- `src/lib/scheduleIntentAgent.ts`: old intent parser to replace.
- `src/lib/scheduledTasks.ts`: task operations and schedule arithmetic to redesign.
- `supabase/functions/agent-run/index.ts`: separate background execution to unify.
- `supabase/functions/agent-run/scheduled_agent_tasks.sql`: old auth-dependent schema.
- `supabase/functions/agent-run/schedule.sql`: old 15-minute dispatcher setup.
- `src/services/chatHistory.ts`: conversation persistence behavior.
- `src/constants/colors.ts`: palette reference.

Official documentation checked for this handoff; recheck exact APIs during implementation:

- [Clerk Expo provider](https://clerk.com/docs/expo/reference/components/clerk-provider): Expo integration entry point.
- [Clerk session tokens](https://clerk.com/docs/guides/sessions/session-tokens): authenticating backend requests.
- [Clerk request authentication](https://clerk.com/docs/reference/backend/authenticate-request): backend verification.
- [OpenRouter tool calling](https://openrouter.ai/docs/guides/features/tool-calling): model tool-call contract and capability checks.
- [OpenRouter developer platform](https://openrouter.ai/developers): gateway/API integration.
- [Trigger.dev tasks](https://trigger.dev/docs/tasks/overview): hosted execution, retries, queues, and task limits.
- [Trigger.dev scheduled tasks](https://trigger.dev/docs/tasks/scheduled): recurring dispatcher execution.
- [Trigger.dev wait tokens](https://trigger.dev/docs/wait-for-token): human approval and continuation handoffs.

The resulting app should feel like Muse: a calm, personal companion with visible autonomous work and useful recurring routines. Its reliability comes from verified identity, durable execution, deliberate tool use, explicit action consent, grounded results, and dependable delivery.
