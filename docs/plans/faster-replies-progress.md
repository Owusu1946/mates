# Faster replies: progress and handoff

**For:** Samuel and Ken  
**Branch:** `feat/faster-replies`  
**Last updated:** 2026-11-18  
**Status:** Slice 1 code is committed locally as `02b1e1c` and `c6d07da`; the migration is generated but not applied. Samuel handles all commits and pushes.

## Goal and scope

Make one-to-one chat show typing immediately and stream the first answer text quickly while preserving saved progress, usage gates, stop, and safe recovery. Measure production send-to-first-visible-text p50 below 1 s and p95 below 2.5 s; measure a plain “Hello” through completion. Keep groups, missions, routines, watches, code runs, and voice on their existing paths initially.

The 18 Nov production timings and cache experiment in the task brief are the starting hypothesis. This handoff's code findings were checked against the current branch; production timings and device behavior have not been reproduced here.

## Verified current behavior

- `apps/api/src/durable-runs.ts`: `submitRun` creates the delegation, outbox row, and placeholder message, then calls `publishOutbox`. Every durable chat run is immediately eligible for `cooper-agent`.
- `apps/api/src/agent-chat.ts`: the model response is streamed internally, but answer text is held until the model step finishes. The first system message includes `scheduleContext`, which embeds a millisecond UTC timestamp. Conversation turns are inserted before later context. Composio session, tools, and connected apps are loaded before the model request.
- `apps/mobile/src/chat/background-chat.ts`: the app submits a run, then polls snapshots every 600 ms. `apps/mobile/src/chat/chat-model.ts` also fetches capabilities and initializes the thread before submission.
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
| 1 | Per-run timing events and first-text finance report, including client text layout timing | Code committed locally; review and runtime validation remain | Apply migration to a test environment, then verify real samples and p50/p95 |
| 2 | Stable prompt prefix, deterministic tool order, cache/session keys, prompt snapshot tests | Implemented locally; API checks pass | Byte-identical stable prefix; verify cache-hit rate in production |
| 3 | Prompt block/token audit, selective tools, Composio cache/invalidation, parallel setup | Implemented locally; API checks pass; production token/latency gates unverified | Plain-message prompt below 7k tokens and warm setup under 150 ms measured; answer quality checked |
| 4 | Typed run event protocol and durable SSE replay/reattach, retaining JSON and polling paths | Implemented locally; API checks pass | Event ordering, cursors, reconnect, and terminal event tested |
| 5 | Mobile immediate typing and SSE consumption with polling fallback | Not started | iOS/Android device pass; no duplicate or flickering text |
| 6 | API execution ownership and live one-to-one path | Not started | One executor per run; usage gate and idempotency preserved |
| 7 | Safe handoff, recovery checkpoints, and fast cancellation | Not started | Disconnect/redeploy/long-tool/stop tests, including uncertain external writes |
| 8 | Background chores, worker tuning experiment, rollout controls and final QA | Not started | Follow-up starts promptly; production p50/p95 and error rates pass |

The slices are an estimate, not a requirement to force unrelated work into one commit. Update this table after each reviewed slice with commit hash, changed files, tests, metrics, and remaining risks.

## Design decisions and risks to settle

1. **Execution ownership:** The current outbox immediately queues a worker. The live path needs an atomic claim or lease and an explicit handoff transition so API and worker never execute the same delegation. Keep the JSON `POST /v1/runs` contract for old clients; use an opt-in SSE response for new clients, with an authenticated stream by run ID for reattachment and another device.
2. **Recovery:** Existing recovery fails stale runs. Save model/tool history at safe boundaries and have the worker claim from that checkpoint. Do not replay an external write whose outcome is unknown. A 60 s deadline requests handoff at the next safe boundary rather than interrupting a tool midway.
3. **Stop:** A 2.5 s database check cannot satisfy 300 ms. The API needs an immediate signal for locally owned runs plus durable cancellation for worker-owned runs; measure server stop acknowledgement and visible UI stop separately.
4. **Early text:** The current model loop can detect tool calls written as text and rewrite citations after a step ends. Incremental output must avoid exposing tool-call text or broken `[s1]` links. If a tool follows visible text, retain that text once as narration and stream the eventual answer in a separate segment.
5. **Cache measurement:** Prompt prefix stability is necessary but does not guarantee cache hits. Use an opaque, stable conversation `session_id` for OpenRouter provider stickiness and trial `prompt_cache_key` for provider caching. Track cold/eligible turns separately when evaluating the 80% target.
6. **Latency accounting:** Measure tap-to-first-render on the device as well as server submitted/setup/model first token/persisted first text/done. Include capabilities lookup, thread initialization, auth, database, network, and SSE proxy buffering. A generic immediate step label and a model-chosen tool label are different metrics.
7. **Cache freshness:** A 10-minute in-memory Composio cache is process-local. Invalidate local changes and handle OAuth callback/webhook changes and other API instances; stale connection state must not permit a disconnected action.
8. **Resource limits:** Long SSE requests consume API connections. Validate deployment timeouts and behavior under disconnect and deploy before switching production traffic.

## QA matrix

- Run idempotency: retry before or after the accepted event, old client JSON, and duplicate send.
- Stream transport: split UTF-8/SSE chunks, lost connection, cursor replay, event ordering, terminal event, and polling fallback.
- Two devices: one live stream, one reattachment; both converge on the same saved content.
- Model output: plain text, citations split across chunks, text then tool call, multiple steps, fallback model, and usage limit before first token.
- Lifecycle: app background/close, API restart, worker claim, 60 s boundary, long tool, stop before run ID and after handoff, and ambiguous external write.
- Production: p50/p95 first visible text, Hello completion, setup time, first-step cache rate, prompt tokens, follow-up queue delay, failure/duplicate-action rate, and a device check.

## Work log

- 2026-11-18: Implemented slice 1. Added `run_timings` with submit, execution start, model request, first token, first saved text, and completion timestamps; tool-step count; and the phone's send-to-first-text-layout duration. Added a protected `/internal/finance/latency` endpoint and p50/p95 rows to `apps/api/scripts/usage-report.ts`. Samuel committed the code in `02b1e1c` and `c6d07da`. Generated migration `0036_whole_starbolt`; it has not been applied anywhere. API typecheck and 401 tests pass. Mobile 31 tests pass. Mobile typecheck still fails on the pre-existing generated `/memory-import` route type. No production sample or device validation yet. The existing finance surface is an authenticated API and terminal report; there is no private web dashboard in this repo.
- 2026-11-18: Compared the proposal with API, worker, and mobile code; identified current outbox, recovery, cancellation, streaming, and prompt ordering behavior. Ran baseline API and mobile checks above.
- 2026-11-18: Implemented slice 2 locally without committing or pushing. The stable system instructions and user preamble now precede conversation turns; request-specific context and minute-precision schedule time follow them. Tool schemas are sorted by function name. OpenRouter requests receive SHA-256 opaque `prompt_cache_key` per user and `session_id` per user/chat (run ID fallback). Added tests for byte-identical stable prefix across changing time and deterministic tool order. API `pnpm typecheck` and `pnpm test` pass (48 files, 403 tests). Cache performance has not been measured in production; confirm OpenRouter accepts and honors the keys and verify `usage_events.cached_tokens` before claiming the 80% target. No mobile or device validation for this slice.
- 2026-11-18: Implemented slice 3 locally without committing or pushing. Composio session, tool schema, and connected-app results are cached in process for 10 minutes; app connect requests, disconnects, and verified Composio webhooks invalidate relevant cache state. Independent setup calls now run concurrently. Trivial acknowledgements skip app tools, recall, and playbook lookup; ride tools/instructions are included only for likely travel requests. Added prompt block and per-tool schema character diagnostics without logging prompt contents, plus tests for trivial/travel selection. API `pnpm typecheck` and `pnpm test` pass (48 files, 405 tests). Character diagnostics are not token counts; verify actual prompt tokens from provider usage and warm setup timings in a deployed environment. Tool selection and answer quality need runtime review, and the under-7k / under-150-ms targets are not yet established.
- 2026-11-18: Implemented slice 4 locally without committing or pushing. Added a versioned run-event schema and `/v1/runs/:id/events` SSE endpoint backed by persisted `run_events`, with `Last-Event-ID` / `after` replay cursors, ordered sequence IDs, keep-alive comments, and terminal close. Existing JSON snapshot and polling routes are unchanged. Added protocol and route tests for cursor validation, replay, event typing, and terminal close. API `pnpm typecheck` and `pnpm test` pass (49 files, 411 tests). No mobile SSE client, reconnect-on-device, proxy buffering, or production load validation yet.

## Next step

Next: Samuel reviews and commits slices 2–4 when ready. Slice 5 is the mobile SSE reader, cursor reattachment, polling fallback, and immediate typing state. Test on iOS and Android, including reconnect and duplicate-free progress. Ken can validate OpenRouter cache behavior and first-step `cached_tokens`, actual prompt tokens, setup latency, and answer quality in a safe environment; those production targets are not established by local tests. The slice 1 timing migration `0036_whole_starbolt` is still unapplied and must be tested before using latency reporting. Resolve or regenerate the stale mobile route type before treating mobile typecheck as a release gate. Keep this handoff current so Ken can continue without chat history.
