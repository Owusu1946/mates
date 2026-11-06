# Real voice calls with mates (LiveKit)

## Context
The call screen (`apps/mobile/app/(app)/call.tsx`, `src/call/*`) is UI-only: `useCallSession` in `src/call/call-model.ts` fakes connecting, speakers and captions. The user wants real, production-ready calls, one-to-one and group (several mates in one call), smart (the mates' real personas, memory and powers), and resilient on weak networks. Decisions made with the user:
- **Transport:** LiveKit (Opus audio, adaptive jitter buffer, auto-reconnect, TCP/TLS 443 fallback).
- **Speech:** LiveKit Inference for speech-to-text, voices and turn detection (no extra provider keys).
- **Brain:** pipeline STT → OpenRouter LLM (mate persona + memory + tools) → the mate's own TTS voice.
- **Hosting:** LiveKit Cloud agent hosting.
- **Lite (text-only) fallback:** not now.
- Calls need a **development build** (LiveKit's native WebRTC isn't in Expo Go). Expo Go must degrade gracefully, never crash.

## Architecture
```
Phone ──POST /v1/calls──► API (Hono) ── creates call row, mints token with agent dispatch {callId}
  │                                      
  └──WebRTC audio──► LiveKit Cloud room ◄── voice agent (apps/api/src/voice, deployed to LiveKit Cloud)
                                              loads call → persona, memory, recall, recent chat
                                              speaks as the active mate; hands long work to durable runs
```
The agent lives **in `apps/api`** (new `src/voice/`), like the Trigger worker in `src/trigger/`: secrets stay in apps/api (AGENTS.md), and it reuses existing code directly instead of re-implementing it. The token's dispatch metadata carries **only `callId`**; the agent loads everything from the DB, so the client can't spoof user, mates or chat.

## Data (migration `0014`)
`apps/api/src/db/schema.ts`
- **`calls`**: `id uuid`, `clerkUserId`, `chatId` (FK chats, cascade), `roomName` unique (`call_<id>`), `status` `'starting'|'live'|'ended'|'failed'`, `mateIds jsonb` (current cast, leader first), `startedAt`, `connectedAt`, `endedAt`, `endReason`, `createdAt`. **Partial unique index: one non-ended call per user** → no double calls / orphaned rooms.
- **`mates.voice`** text nullable. Default voice is derived deterministically from the mate id over a curated list of ~8 distinct LiveKit Inference voices (`src/voice/voices.ts`), so every mate sounds different with no setup. Voice ids confirmed against the Inference TTS docs at build time.

## API (`apps/api`, typed contract preserved)
New `src/calls.ts` (+ `calls.test.ts`), routes in `src/app.ts`:
- `POST /v1/calls` `{ chatId, mateIds? }` → `resolvePersona` (`src/mates.ts`) validates every mate belongs to the user; ends any stale non-ended call of this user (deletes its room); inserts the call; mints an `AccessToken` (identity = userId, room = `call_<id>`, 10-min TTL, publish audio only, `roomConfig` with `RoomAgentDispatch{ agentName: "cooper-voice", metadata: {callId} }`, `departureTimeout` ~20s so a network blip doesn't close the room). Returns `{ callId, url, token }`.
- `POST /v1/calls/:id/end` → idempotent: marks ended (`WHERE status <> 'ended'`), deletes the room via `RoomServiceClient`.
- `POST /v1/livekit/webhook` → verified with `WebhookReceiver`; on `room_finished` finalizes a call the agent didn't (agent crash/deploy safety net).
- Env (`src/env.ts`, optional block like Trigger's): `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `OPENROUTER_VOICE_MODEL` (fast model; falls back to `CHAT_MODEL`), `CALL_MAX_MINUTES` (default 60). Mobile only ever receives the URL + token.
- `GET /v1/mates` exposes `voice`; `PATCH /v1/mates/:id` accepts it (enum of curated voices).

## Voice agent (`apps/api/src/voice/`)
Packages (api): `@livekit/agents`, `@livekit/agents-plugin-openai` (OpenRouter via `baseURL`), `@livekit/agents-plugin-silero`, `@livekit/rtc-node`, `livekit-server-sdk`, noise-cancellation plugin. Scripts: `voice:dev` (`tsx src/voice/main.ts dev`), deploy with `lk agent create/deploy` from a Dockerfile building `apps/api`.

- **`main.ts`** — `defineAgent` + `ServerOptions({ agentName: "cooper-voice" })`; `prewarm` loads Silero VAD once per process. Entry: parse `{callId}`, load call (reject unknown/ended → disconnect), mark `live`.
- **Context load (parallel, before greeting):** persona (`resolvePersona`), `memoryContext` (`src/memory.ts`), `recallContext` (`src/recall.ts`), last ~16 turns of the chat (`recentTurns`, `src/missions.ts`), live mission context if the call is from a group (`liveMission`/`missionContext`). One snapshot per call; a mate edited mid-call can't break it.
- **Session:** one `voice.AgentSession` — `inference.STT` (streaming, English + auto-language), `inference.TurnDetector`, Silero VAD, noise cancellation, preemptive generation on; LLM = OpenAI-plugin LLM pointed at OpenRouter with an LLM fallback adapter (voice model → `OPENROUTER_FALLBACK_MODEL`).
- **`MateAgent` (one `voice.Agent` per mate in the call):** instructions = `personaPreamble(mate, …)` + voice rules (short spoken sentences, no markdown/lists/URLs, confirm names and numbers aloud, never read raw ids) + memory/recall/mission context. Its own `tts` = `inference.TTS` with the mate's voice. Tools:
  - `do_task` — anything needing apps/browser/long work: `submitRun` (`src/durable-runs.ts`) into the call's chat with full powers (no approvals, as chat). Mate says "On it". A watcher polls the delegation; when it finishes while the call is live, the mate announces the result in one or two sentences; the full result is in the chat with a push as today.
  - `remember` / `forget` → `runMemoryTool`; `recall` → `runRecall`; `set_reminder` → existing reminder handler.
  - `pass_to(mate_name, reason)` (group calls) → `session.updateAgent(next)` carrying the chat context; next mate speaks in its own voice.
  - `end_call` → short goodbye, then shut down.
- **Group conductor (no extra latency):** default active agent = leader. In `onUserTurnCompleted`, `parseMentions` (`src/groups.ts`) on the transcript switches agent *before* the reply ("Felix, …"). With no mention, the leader answers or uses `pass_to`, guided by the same role descriptions the chat leader uses. One mate speaks at a time.
- **Live cast changes:** RPC methods `call.invite` / `call.remove` (from the phone) — the agent re-validates the mate belongs to the user, updates `calls.mateIds`, a joining mate says one short hello.
- **State to the phone:** participant attributes on the agent — `cooper.speaker` (active mate id), `cooper.members` (JSON cast) — plus LiveKit's built-in `lk.agent.state` (listening/thinking/speaking) and transcription text streams for captions.
- **Guards:** max duration (`CALL_MAX_MINUTES`) → polite wrap-up; 3 min of silence → "Still there?" then end at 5; LLM/TTS error → spoken "Sorry, say that again?" and continue; unrecoverable → `failed` with reason.
- **On shutdown (idempotent, `WHERE status <> 'ended'`):** write the call into the chat as one assistant message with a new **`call` WorkflowCard** (duration, cast, 2–3 line summary, expandable transcript), `recordExchange` for history recall, `extractMemories` on the transcript (respecting `profiles.autoMemory`), mark `ended`.

## Mobile (`apps/mobile`)
Packages (user installs from `apps/mobile`): `@livekit/react-native`, `@livekit/react-native-webrtc`, `@livekit/react-native-expo-plugin`, `@config-plugins/react-native-webrtc`, `livekit-client`, `expo-dev-client`; plugins in `app.json`; iOS `UIBackgroundModes: ["audio"]`, mic usage string; Android foreground service for a call in the background.
- **`src/call/livekit.ts`** — guarded `registerGlobals()`; `callsAvailable()` checks the native module so **Expo Go shows "Calls need the Cooper app build"** in the lobby instead of crashing.
- **`useCallSession` internals replaced, screens kept** (`call-model.ts` was built for this):
  - `start` → mic permission (denied → lobby explains + "Open Settings") → `POST /v1/calls` → `AudioSession` (playAndRecord / voiceChat, speaker default) → `Room.connect` (`adaptiveStream`, `dynacast`, echo cancellation, noise suppression, AGC) → publish mic.
  - Members/speaking from agent attributes + `lk.agent.state`; captions from transcription streams (speaker name from `cooper.speaker`, "You" for the user).
  - `RoomEvent.Reconnecting/Reconnected` → "Reconnecting…" state on the call screen and pill; `ConnectionQualityChanged` poor → small "Weak connection" chip; `Disconnected` → ended screen with reason.
  - Mute → `setMicrophoneEnabled`; speaker → audio output switch; invite/remove → RPC to the agent; end → disconnect + `POST /v1/calls/:id/end`.
  - Phone-call/Siri interruptions handled by AudioSession; app background keeps the call (pill already lives above the stack).
- `toCallMate` drops the placeholder `ROLE_LINES`.
- **Chat:** `CallCard` renderer for `kind: "call"` in `chat-thread.tsx`; ended screen shows the same summary with "Open chat".
- **Mate profile:** native voice picker (curated list) in `mate/[id].tsx`.

## Edge cases covered
Double tap / two devices → one live call per user (unique index; new call ends the stale one). Agent never arrives (no capacity) → client times out after 15s, call marked failed, clear message. User loses network → LiveKit reconnects; room survives 20s departure timeout; after that the agent finalizes. Agent crash/redeploy → webhook finalizes; LiveKit Cloud drains running calls on deploy. Mate deleted mid-call → snapshot keeps the call working. Token leak → 10-min TTL, single room, audio-only grant. Expo Go → graceful message. Mic denied → explained. Background task finishing after the call → normal chat result + push.

## Build order (each step shippable)
1. Migration `0014`, `calls.ts`, routes, webhook, env, token tests.
2. Voice agent 1:1: persona, context, tools, transcript card, guards; `voice:dev` + LiveKit Agent Console to talk to it without the app.
3. Mobile: dev build, LiveKit session in `useCallSession`, captions, reconnecting/weak states, CallCard.
4. Group calls: mentions, `pass_to`, invite/remove RPC, per-mate voices + voice picker.
5. Deploy to LiveKit Cloud; webhook URL configured.

## Verification
- `pnpm typecheck && pnpm test`. New tests: token grants/TTL/dispatch metadata, one-live-call rule and idempotent end, webhook finalization, voice instruction builder, transcript → call card/summary, default voice derivation; agent turn tests (LiveKit Vitest harness) for `pass_to` on mention, `do_task` for app work, `end_call`.
- Agent: `pnpm --filter @expojet/api voice:dev`, talk via LiveKit Agent Console (`lk agent debugger`).
- Device (dev build): 1:1 call with Cooper → remembers your name, "set a reminder" works, "email X" runs in background and is announced; group call → "Felix, …" switches voice; invite/remove mid-call; toggle airplane mode for 5s → "Reconnecting…" then resumes; end → call card in chat with transcript; Expo Go → friendly message.
- User provides: LiveKit Cloud project keys in `apps/api/.env`, `lk cloud auth`, and runs the install + `npx expo run:ios/android` (or EAS dev build).
