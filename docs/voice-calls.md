# Voice calls: setup and end-to-end testing

Voice calls let you talk to your mates. Each mate answers in its own voice, passes the conversation to the others, and hands real work to the chat. When the call ends, a summary and the transcript land in the chat.

There are three pieces, and all of them need to be running for a call to work:

| Piece | Where it runs | What it does |
| --- | --- | --- |
| API (`apps/api`) | Railway, or your machine | Creates the call and signs the phone's LiveKit token, which brings in the voice agent. Writes the summary card afterwards |
| Voice agent (`voice-agent/`) | LiveKit Cloud, or your machine with `lk agent dev` | Speaks for every mate on the call |
| App (`apps/mobile`) | A **development build** on a real phone | The call screens, microphone and speaker |

> **Expo Go can't make real calls.** LiveKit needs native code that Expo Go doesn't have, so Expo Go shows a demo call with a "Preview" note. To test for real you need a development build.

## Keys

The project owner shares the LiveKit keys with you **privately** (a password manager or a direct message, never a group chat or a commit):

- `LIVEKIT_URL` (`wss://….livekit.cloud`)
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

Where they go depends on which path you take below. They only ever go in gitignored files (`apps/api/.env`, `voice-agent/.env.local`), **never** in `apps/mobile/.env`: anything `EXPO_PUBLIC_` ships inside the app.

---

## Path A: test against production (recommended)

The API (Railway) and the agent (LiveKit Cloud) are already deployed, so all you build is the app. You don't need any LiveKit keys for this path.

### 1. Get the code

```sh
git pull
pnpm install
```

> Pulling deletes `apps/mobile/ios` and `apps/mobile/android`. That's expected: they're now generated from `app.json` at build time, with the LiveKit plugins included.

### 2. Point the app at production

In `apps/mobile/.env`:

```sh
EXPO_PUBLIC_API_URL=https://mates-production.up.railway.app
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_…   # the production publishable key
```

### 3. Make a development build

Pick one of these:

- **Locally**, if you have Android Studio or Xcode set up:
  ```sh
  cd apps/mobile
  npx expo run:android      # or: npx expo run:ios --device
  ```
- **In the cloud (EAS):**
  ```sh
  cd apps/mobile
  eas build --profile development-device --platform android
  # iOS: register the phone once with `eas device:create`, then use --platform ios
  ```
  Use `development-device`, not `development`. The `development` profile builds for the iOS simulator, and a simulator build won't install on a phone.

### 4. Run it

```sh
cd apps/mobile
npx expo start --dev-client
```

Open the Mates app on the phone (not Expo Go), sign in and tap the phone icon at the top right of any chat. The lobby shouldn't show the "Preview" note. If it does, you're in Expo Go or an old build.

---

## Path B: run everything on your machine

Use this path to change the API or the agent and try the change on a phone before it's deployed.

### 1. API

Add the LiveKit keys to `apps/api/.env`, next to your usual API keys (database, Clerk, OpenRouter):

```sh
LIVEKIT_URL=wss://….livekit.cloud
LIVEKIT_API_KEY=…
LIVEKIT_API_SECRET=…
CALL_TOKEN_SECRET=any-long-random-string
# Your own agent name, so production's agent doesn't take your test calls:
LIVEKIT_AGENT_NAME=mates-voice-yourname
```

Apply the migrations (adds the `calls` table) and start the API:

```sh
pnpm db:migrate
pnpm --filter @expojet/api dev
```

### 2. Voice agent

Install the [LiveKit CLI](https://docs.livekit.io/intro/basics/cli/) first: `winget install LiveKit.LiveKitCLI`, `brew install livekit-cli`, or `curl -sSL https://get.livekit.io/cli | bash`. The agent is a separate project, outside the pnpm workspace:

```sh
cd voice-agent
pnpm install --ignore-workspace
cp .env.example .env.local
```

Fill in `voice-agent/.env.local`:

```sh
LIVEKIT_URL=wss://….livekit.cloud
LIVEKIT_API_KEY=…
LIVEKIT_API_SECRET=…
MATES_API_URL=http://localhost:3000
LIVEKIT_AGENT_NAME=mates-voice-yourname   # must match the API's
```

Start it:

```sh
lk agent dev --deployment production
```

`--deployment production` makes your local agent take calls addressed to your agent name. Your agent name is different from the deployed `mates-voice`, so you never take real users' calls and they never take yours. When you start a call, you'll see its logs scroll in this terminal.

### 3. App

In `apps/mobile/.env`, set `EXPO_PUBLIC_API_URL=http://<your computer's LAN IP>:3000` (not `localhost`; the phone has to reach your computer over Wi-Fi). Then do steps 3 and 4 of Path A.

---

## What to test

Do these in order. Each one has a pass condition:

| # | Do this | It passes when |
| --- | --- | --- |
| 1 | From a chat with one mate, start a call | You hear that mate greet you by name within a few seconds. Its tile glows while it talks, and captions appear |
| 2 | Talk over the mate mid-sentence | It stops and listens |
| 3 | From a group chat, start a call, then say "Kojo, what do you think?" (use a real name from the group) | A **different voice** answers, and Kojo's tile glows |
| 4 | Say "Email Kwesi that I'll be late on Friday" | The mate says it's on it and doesn't claim it's done. A message saying "(from our call)" appears in the chat and runs |
| 5 | Tap **Add** and invite a mate | Their tile goes from "joining" to joined, and the mate talking welcomes them |
| 6 | Long-press a mate's tile (not the lead) to remove them | Their tile disappears |
| 7 | Tap mute, talk, then unmute | Nobody reacts while you're muted |
| 8 | Toggle the speaker | Sound moves between the earpiece and the loudspeaker |
| 9 | Minimise the call and browse the app | The call pill shows and the call keeps going. Tapping the pill returns to the call |
| 10 | Turn on airplane mode for about 5 seconds, then off | The header shows "Reconnecting…", then the call carries on |
| 11 | Say "OK, that's all, bye" | The mate says goodbye and the call ends on its own |
| 12 | Open the chat | Within about 30 seconds there's a **Voice call** card with the duration, who was on it, a summary and any action items. "View transcript" shows the conversation |
| 13 | Stay silent for about 20 seconds | The mate asks if you're still there. Stay silent again and it hangs up politely |

Also check the failure paths:

- **Microphone denied:** deny the permission when asked. Starting a call shows an alert with **Open Settings**, and nothing hangs.
- **API not set up:** an API without the LiveKit keys answers "Calls aren't set up on this server yet" in the lobby.
- **Agent not running** (Path B with `lk agent dev` stopped): after about 20 seconds the lobby says "Your mate couldn't pick up. Try again in a moment."

## When something's wrong

| Symptom | Likely cause | Check |
| --- | --- | --- |
| The lobby shows the "Preview" note | Running in Expo Go or an old build | Rebuild (step 3) and open the Mates app, not Expo Go |
| "Your mate couldn't pick up" | The agent didn't join | Path A: `lk agent logs` in `voice-agent/` (ask the owner). Path B: is `lk agent dev` running, and do both agent names match? |
| The agent logs `call_dispatch_invalid` | `MATES_API_URL` is missing | Set it in `voice-agent/.env.local` (Path B) or as the deployed agent's secret |
| The agent logs `call_context_failed` | The agent can't reach the API, or the call token secret changed mid-call | Path B: is the API running on port 3000? |
| The call works but no card appears in the chat | The summary step failed | API logs: look for `call_finish_failed` / `call_end_report_failed` |
| A build fails on LiveKit or WebRTC | Native folders left over from before | Delete `apps/mobile/ios` and `apps/mobile/android`, then build again |

## Agent tests

Turn-level tests for the agent live in `voice-agent/src/*.test.ts`:

```sh
cd voice-agent
pnpm test
```

Without LiveKit keys in `voice-agent/.env.local`, only the offline tests run. With keys, four more tests talk to the real model: greeting, handing off to another mate, starting a task, and a failed task never claimed as done. They use a few cents of LiveKit Inference credit.

## Deploying changes

- **API:** merge to `main` and Railway deploys it. Run `pnpm db:migrate` against production first if there's a new migration.
- **Agent:** from the repo root, run `lk agent deploy voice-agent`. LiveKit Cloud builds it from `voice-agent/Dockerfile`. Logs: `lk agent logs`.
