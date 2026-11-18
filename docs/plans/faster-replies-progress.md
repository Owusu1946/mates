# Faster replies: progress and handoff

**For:** Samuel and Ken  
**Branch:** `feat/faster-replies`  
**Last updated:** 2026-11-18  
**Status:** Slices 1–4 are committed on `feat/faster-replies` (`02b1e1c`, `c6d07da`, `0d5a4ee`, `32aa2a4`, `ee24db4`). Slices 5–6 are implemented locally and uncommitted. Migration `0036_whole_starbolt` is generated but not applied. Samuel handles all commits and pushes.

## Goal and scope

Make one-to-one chat show typing immediately and stream the first answer text quickly while preserving saved progress, usage gates, stop, and safe recovery. Measure production send-to-first-visible-text p50 below 1 s and p95 below 2.5 s; measure a plain “Hello” through completion. Keep groups, missions, routines, watches, code runs, and voice on their existing paths initially.

The 18 Nov production timings and cache experiment in the task brief are the starting hypothesis. This handoff's code findings were checked against the current branch; production timings and device behavior have not been reproduced here.

## Verified current behavior

- `apps/api/src/durable-runs.ts`: `submitRun` creates the delegation, outbox row, and placeholder message, then calls `publishOutbox`. Every durable chat run is immediately eligible for `cooper-agent`.
- `apps/api/src/agent-chat.ts`: the model response is streamed internally, but answer text is held until the model step finishes. Slices 2–3 put stable instructions and per-user preamble before turns, put minute-precision time/request context after turns, sort tool schemas, send hashed OpenRouter cache/session keys, cache Composio setup per process for ten minutes, and parallelize independent setup. Production cache, prompt-token and latency targets remain unverified.
- `apps/api/src/app.ts`: slice 4 adds authenticated `GET /v1/runs/:id/events`, replayable by `Last-Event-ID` or `after`. Slice 6 opts one-to-one chats into same-request SSE using `Accept: text/event-stream`; the response includes `X-Run-Id`. `POST /v1/runs` without that header still returns JSON and uses the worker. Groups retain the worker-backed JSON path. The API and worker compete on the same atomic queued-to-running database update before execution, preventing concurrent execution.
- `apps/mobile/src/chat/background-chat.ts`: slices 5–6 submit/reuse a durable run, consume same-request SSE for one-to-one chats (or attach by run ID for an existing run), then fall back to JSON polling if SSE fails or ends unexpectedly. The client cursor is the last event sequence; events contain full saved snapshots, so the client replaces content rather than concatenating duplicate deltas. The existing `ThinkingIndicator` shows while setup is pending. Explicit Stop calls the cancel endpoint; transport abort alone detaches without canceling the durable run.
- `apps/mobile/src/chat/chat-model.ts` still fetches capabilities and initializes the thread before durable run submission; this remains on the send critical path for the later optimization slice.
- `apps/api/src/durable-runs.ts`: a running worker checks `cancelRequested` every 2.5 s. `recoverStalledRuns` marks stale running runs failed; it does not resume them. `agentRuns.messages` is checkpointed at tool boundaries and completion, not continuously during answer generation.
- `apps/api/src/trigger/agent.ts`: `cooper-agent` runs with per-user concurrency 1. Memory extraction happens in `executeDelegation` after terminal persistence; deliveries run afterward in the same worker task. Habit activity is launched without awaiting it.
- `apps/api/node_modules/@trigger.dev/sdk/docs/config/config-file.mdx`: `processKeepAlive` exists in installed Trigger.dev 4.7.3, but process lifetime is not guaranteed. Benchmark before changing worker settings.

## Baseline checks (2026-11-18)

- API `pnpm typecheck && pnpm test`: pass, 399 tests.
- Mobile `pnpm test`: pass, 31 tests.
- Mobile `pnpm typecheck`: fails in `app/(app)/memory.tsx` because the locally generated route type does not include `/memory-import`. This predates faster-replies implementation; regenerate typed routes and confirm before treating it as a product code failure.
- No live latency benchmark, device streaming test, production cache query, or deployment was run for this planning pass.

## Proposed reviewable commits

Estimate **eight commits**, adjusted if a slice proves too large or too small. Keep each buildable and reviewable. Samuel creates every commit and push.

| # | Slice | Status | Gate |
| --- | --- | --- | --- |
| 1 | Per-run timing events and first-text finance report, including client text layout timing | Committed: `02b1e1c`, `c6d07da`; migration unapplied | Apply migration to a test environment, then verify real samples and p50/p95 |
| 2 | Stable prompt prefix, deterministic tool order, cache/session keys, prompt snapshot tests | Committed: `0d5a4ee` | Byte-identical stable prefix; verify cache-hit rate in production |
| 3 | Prompt block/token audit, selective tools, Composio cache/invalidation, parallel setup | Committed: `32aa2a4`; production token/latency gates unverified | Plain-message prompt below 7k tokens and warm setup under 150 ms measured; answer quality checked |
| 4 | Typed run event protocol and durable SSE replay/reattach, retaining JSON and polling paths | Committed: `ee24db4` | Event ordering, cursors, reconnect, and terminal event tested |
| 5 | Mobile immediate typing and SSE consumption with polling fallback | Implemented locally; uncommitted | iOS/Android device pass; reconnect and duplicate-free progress |
| 6 | API execution ownership and live one-to-one path | Implemented locally; uncommitted | One executor per run; usage gate and idempotency preserved; production latency measured |
| 7 | Safe handoff, recovery checkpoints, and fast cancellation | Not started | Disconnect/redeploy/long-tool/stop tests, including uncertain external writes |
| 8 | Background chores, worker tuning experiment, rollout controls and final QA | Not started | Follow-up starts promptly; production p50/p95 and error rates pass |

The slices are an estimate, not a requirement to force unrelated work into one commit. Update this table after each reviewed slice with commit hash, changed files, tests, metrics, and remaining risks.

## Design decisions and risks to settle

1. **Execution ownership:** New live one-to-one submissions skip immediate outbox publication and run `executeDelegation` in the API. API and Trigger share the atomic `queued -> running` claim, so a publisher race can start at most one executor. The live executor has no durable owner lease or handoff yet: an API restart can leave a running row for stale-run recovery to fail. Slice 7 must add safe handoff/recovery before rollout.
2. **Recovery:** Existing recovery fails stale runs. Save model/tool history at safe boundaries and have the worker claim from that checkpoint. Do not replay an external write whose outcome is unknown. A 60 s deadline requests handoff at the next safe boundary rather than interrupting a tool midway.
3. **Stop:** A 2.5 s database check cannot satisfy 300 ms. The API needs an immediate signal for locally owned runs plus durable cancellation for worker-owned runs; measure server stop acknowledgement and visible UI stop separately.
4. **Early text:** The current model loop can detect tool calls written as text and rewrite citations after a step ends. Incremental output must avoid exposing tool-call text or broken `[s1]` links. If a tool follows visible text, retain that text once as narration and stream the eventual answer in a separate segment.
5. **Cache measurement:** Prompt prefix stability is necessary but does not guarantee cache hits. Use an opaque, stable conversation `session_id` for OpenRouter provider stickiness and trial `prompt_cache_key` for provider caching. Track cold/eligible turns separately when evaluating the 80% target.
6. **Latency accounting:** Measure tap-to-first-render on the device as well as server submitted/setup/model first token/persisted first text/done. Include capabilities lookup, thread initialization, auth, database, network, and SSE proxy buffering. A generic immediate step label and a model-chosen tool label are different metrics.
7. **Cache freshness:** A 10-minute in-memory Composio cache is process-local. Invalidate local changes and handle OAuth callback/webhook changes and other API instances; stale connection state must not permit a disconnected action.
8. **Resource limits:** Long SSE requests consume API connections. Validate deployment timeouts and behavior under disconnect and deploy before switching production traffic.

## QA matrix

- Run idempotency: retry before or after the accepted event, old client JSON, and duplicate send.
- Stream transport: API tests cover cursor validation, replay, event order and terminal close; mobile tests cover arbitrary UTF-8/SSE chunk boundaries and malformed events. Device lost-connection and polling-fallback checks remain outstanding.
- Two devices: one live stream, one reattachment; both converge on the same saved content.
- Model output: plain text, citations split across chunks, text then tool call, multiple steps, fallback model, and usage limit before first token.
- Lifecycle: app background/close now detaches without canceling; explicit Stop uses the cancel endpoint. API restart, worker handoff, 60 s boundary, long tool, stop during ownership transfer, and ambiguous external write remain for slice 7.
- Production: p50/p95 first visible text, Hello completion, setup time, first-step cache rate, prompt tokens, follow-up queue delay, failure/duplicate-action rate, and a device check.

## Work log

- 2026-11-18: Implemented slice 1. Added `run_timings` with submit, execution start, model request, first token, first saved text, and completion timestamps; tool-step count; and the phone's send-to-first-text-layout duration. Added a protected `/internal/finance/latency` endpoint and p50/p95 rows to `apps/api/scripts/usage-report.ts`. Samuel committed the code in `02b1e1c` and `c6d07da`. Generated migration `0036_whole_starbolt`; it has not been applied anywhere. API typecheck and 401 tests pass. Mobile 31 tests pass. Mobile typecheck still fails on the pre-existing generated `/memory-import` route type. No production sample or device validation yet. The existing finance surface is an authenticated API and terminal report; there is no private web dashboard in this repo.
- 2026-11-18: Compared the proposal with API, worker, and mobile code; identified current outbox, recovery, cancellation, streaming, and prompt ordering behavior. Ran baseline API and mobile checks above.
- 2026-11-18: Implemented slice 2 locally without committing or pushing. The stable system instructions and user preamble now precede conversation turns; request-specific context and minute-precision schedule time follow them. Tool schemas are sorted by function name. OpenRouter requests receive SHA-256 opaque `prompt_cache_key` per user and `session_id` per user/chat (run ID fallback). Added tests for byte-identical stable prefix across changing time and deterministic tool order. API `pnpm typecheck` and `pnpm test` pass (48 files, 403 tests). Cache performance has not been measured in production; confirm OpenRouter accepts and honors the keys and verify `usage_events.cached_tokens` before claiming the 80% target. No mobile or device validation for this slice.
- 2026-11-18: Implemented slice 3 locally without committing or pushing. Composio session, tool schema, and connected-app results are cached in process for 10 minutes; app connect requests, disconnects, and verified Composio webhooks invalidate relevant cache state. Independent setup calls now run concurrently. Trivial acknowledgements skip app tools, recall, and playbook lookup; ride tools/instructions are included only for likely travel requests. Added prompt block and per-tool schema character diagnostics without logging prompt contents, plus tests for trivial/travel selection. API `pnpm typecheck` and `pnpm test` pass (48 files, 405 tests). Character diagnostics are not token counts; verify actual prompt tokens from provider usage and warm setup timings in a deployed environment. Tool selection and answer quality need runtime review, and the under-7k / under-150-ms targets are not yet established.
- 2026-11-18: Implemented slice 4 locally without committing or pushing. Added a versioned run-event schema and `/v1/runs/:id/events` SSE endpoint backed by persisted `run_events`, with `Last-Event-ID` / `after` replay cursors, ordered sequence IDs, keep-alive comments, and terminal close. Existing JSON snapshot and polling routes are unchanged. Added protocol and route tests for cursor validation, replay, event typing, and terminal close. API `pnpm typecheck` and `pnpm test` pass (49 files, 411 tests). No mobile SSE client, reconnect-on-device, proxy buffering, or production load validation yet.
- 2026-11-18: Samuel committed slices 2–4 as `0d5a4ee`, `32aa2a4`, and `ee24db4`.
- 2026-11-18: Implemented slice 5 locally without committing or pushing. `background-chat.ts` consumes versioned SSE with `Last-Event-ID`, applies each event's saved content snapshot, and falls back to the legacy poller on a dropped/invalid stream. Added a streaming parser that handles split UTF-8/SSE boundaries and rejects malformed or cursor-mismatched events. Immediate thinking is provided by the existing live-message `ThinkingIndicator`, including during capability lookup and thread initialization. Mobile `pnpm test` passes (33 tests). Mobile `pnpm typecheck` still reports only the known generated route error at `app/(app)/memory.tsx:180` for `/memory-import`; no new errors were reported. No device test yet.
- 2026-11-18: Implemented slice 6 locally without committing or pushing. One-to-one mobile submissions request SSE on `POST /v1/runs`; the API skips Trigger publication for those runs, starts the shared durable `executeDelegation` path in the API process, and returns the run ID in `X-Run-Id`. API and worker execution race on the existing atomic queued-to-running transition. Groups and callers without the SSE `Accept` header retain the JSON worker path. Explicit Stop sends durable cancellation; transport abort/detach no longer cancels the run. API typecheck and tests pass (49 files, 413 tests); mobile tests pass (34 tests). Mobile typecheck still fails only on the stale generated `/memory-import` route. No device, API restart, load, or production latency check yet. Safe handoff is slice 7 and remains required before rollout.

## Next step

Next: Samuel reviews and commits slices 5–6 when ready. Slice 7 is safe handoff, stale-run recovery from saved checkpoints, and fast cancellation across API/worker ownership. Do not roll out the API-owned path before handoff/recovery is implemented and tested: an API restart can currently strand a live run for stale-run recovery to fail. Keep groups and background tasks on the worker. Before rollout, test SSE fallback/reconnect on iOS and Android, API restart and worker claim races, prompt/cache/setup production metrics, and apply/test migration `0036_whole_starbolt` before using latency reporting. Mobile typecheck still needs the generated `/memory-import` route type refreshed. Ken should start with this handoff and branch history; production and device gates remain unverified.
