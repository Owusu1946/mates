# Mates

Mates is a mobile app for building a team of AI "mates". Each mate has a role, a personality and a mascot. They chat with you, call you, work in your connected apps (Gmail, Notion, Calendar and more), search the web, and write code that ships as GitHub pull requests while you're away.

This repository is a **pnpm + Turborepo monorepo** with everything in one place: the mobile app, the API, the background worker and the landing page.

| Path | What it is | Stack |
| --- | --- | --- |
| `apps/mobile` | The iOS/Android app | Expo SDK 57, Expo Router, assistant-ui, Clerk |
| `apps/api` | HTTP API and background worker | Hono, Drizzle ORM + Neon Postgres, Trigger.dev, OpenRouter |
| `apps/web` | Landing page at agents.askorin.app | Astro with React islands |
| `packages/api-contract` | Typed API contract shared by app and server | TypeScript |
| `packages/mascot` | The shared mascot engine (shapes, animation) | React |
| `brand/` | Logo source; `node brand/generate.mjs` rebuilds the SVG/PNG files | |
| `docs/` | Deployment and operations notes | |

---

## Prerequisites

Works the same on macOS, Windows and Linux.

- **Node.js 22 or newer** (production runs Node 22).
- **pnpm 10.** The easiest way is `corepack enable`, which picks up the version pinned in `package.json`.
- **Git.**
- **Expo Go** on a phone (App Store / Play Store), or an iOS Simulator / Android Emulator. The app runs in Expo Go, so you don't need native builds for day-to-day work.
- Accounts for the services in [Environment variables](#environment-variables). At minimum you need **Neon**, **Clerk** and **OpenRouter** to run the app with chat.

---

## Quick start

```sh
git clone https://github.com/Owusu1946/mates.git
cd mates
corepack enable
pnpm install
```

### 1. Create your env files

Copy each example and fill it in. Use `copy` instead of `cp` in Windows Command Prompt; PowerShell and Git Bash accept `cp`.

```sh
cp apps/api/.env.example    apps/api/.env
cp apps/mobile/.env.example apps/mobile/.env
cp apps/web/.env.example    apps/web/.env      # only if you work on the landing page
```

`.env` files are git-ignored. **Never commit them.** Ask the project owner for development keys rather than reusing production ones.

### 2. Set up the database

Create a Neon project, then put its pooled URL in `DATABASE_URL` and its direct URL in `DIRECT_DATABASE_URL`. Then run:

```sh
pnpm db:migrate
```

### 3. Point the app at your API

Your phone has to reach the API on your computer, so `localhost` won't work from a device. In `apps/mobile/.env`, set your computer's LAN IP:

```sh
EXPO_PUBLIC_API_URL=http://192.168.1.20:3000
```

### 4. Run it

```sh
pnpm dev
```

This starts the API and Metro together. Scan the QR code with Expo Go (iOS: the Camera app). API output goes to `.turbo/api-dev.log`, and errors still show in the terminal.

| Command | Use it for |
| --- | --- |
| `pnpm dev` | API + mobile together (the default) |
| `pnpm dev:clear` | Same, with Metro's cache cleared. **Run this after changing `apps/mobile/.env`** |
| `pnpm dev:api` / `pnpm dev:mobile` | Each one in its own terminal |
| `pnpm dev:web` | Landing page at http://localhost:4321 |
| `pnpm --filter @expojet/api worker:dev` | Trigger.dev worker locally (background runs, routines, code runs) |

Run all commands from the **repository root**. `pnpm --filter <package>` targets one workspace.

---

## Environment variables

Each app has a commented `.env.example`. The rule that matters most:

> **Server secrets live only in `apps/api`.** Anything prefixed `EXPO_PUBLIC_` (mobile) or `PUBLIC_` (web) is embedded in a bundle that anyone can download. Only publishable keys and URLs go there.

### `apps/api/.env`

| Variable | Required | Where to get it |
| --- | --- | --- |
| `DATABASE_URL`, `DIRECT_DATABASE_URL` | Yes | Neon → Connection details (pooled and direct) |
| `CLERK_SECRET_KEY` | Yes | Clerk dashboard → API keys |
| `PORT`, `ALLOWED_ORIGINS` | No | Defaults: `3000` and `http://localhost:8081` |
| `OPENROUTER_API_KEY` | For chat | openrouter.ai → Keys |
| `OPENROUTER_PROVISIONING_KEY` | For code runs | openrouter.ai → Provisioning keys |
| `OPENROUTER_*_MODEL`, `CODE_RUN_LIMIT_USD` | No | Overrides; defaults are in `src/models.ts` |
| `TRIGGER_PROJECT_REF`, `TRIGGER_SECRET_KEY` | For background work | cloud.trigger.dev → Project settings / API keys |
| `COOPER_BACKGROUND_ENABLED` | No | Set `true` once the worker is deployed |
| `COMPOSIO_API_KEY` | For app connections | composio.dev |
| `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID` | For the cloud browser | browserbase.com |
| `PARALLEL_API_KEY` | For web search | parallel.ai |
| `DEEPGRAM_API_KEY` | For voice typing | console.deepgram.com |
| `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET` | For code runs | modal.com → Settings → API tokens |
| `GITHUB_APP_*` | For code runs → PRs | Your GitHub App's settings page (see below) |
| `GITHUB_STATE_SECRET` | No | Any long random string |
| `EXPO_ACCESS_TOKEN` | No | expo.dev, only if push security is enabled |
| `SITE_ORIGINS`, `VISIT_SALT` | No | Landing-page visit counts and waitlist |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | For voice calls | cloud.livekit.io → Settings → API keys. See [docs/voice-calls.md](docs/voice-calls.md) |
| `CALL_TOKEN_SECRET`, `LIVEKIT_AGENT_NAME` | No | Signs the voice agent's per-call token (falls back to `CLERK_SECRET_KEY`); agent name defaults to `mates-voice` |

Features whose keys are missing switch themselves off. For example, without `DEEPGRAM_API_KEY` voice typing returns a friendly "not set up" error. You can start with just the core keys and add the rest as you need them.

### `apps/mobile/.env`

| Variable | Notes |
| --- | --- |
| `EXPO_PUBLIC_API_URL` | Your API base URL (LAN IP locally, HTTPS in production) |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk → API keys (`pk_…`) |
| `EXPO_PUBLIC_SENTRY_DSN` | Optional error reporting |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | For EAS source-map uploads only (CI secrets, not bundled) |

### `apps/web/.env`

| Variable | Notes |
| --- | --- |
| `PUBLIC_API_URL` | API for visit counts, the waitlist and `/dashboard`. Defaults to production |

### Setting up the GitHub App (code runs)

Create a GitHub App with:
- **Callback URL:** `<API URL>/v1/github/callback`
- **Permissions:** Contents and Pull requests set to read & write.

Copy its ID, slug, client ID and client secret, and generate a private key. In a local `.env`, put the PEM on one line with `\n` in place of newlines. Hosting dashboards like Railway accept it pasted as is.

---

## Checks

Run both before opening a PR. There is no CI yet, so these are the gate.

```sh
pnpm typecheck
pnpm test
```

API tests use Vitest (`apps/api/src/*.test.ts`) and stub every external service, so they don't need real keys. To run a single file:

```sh
pnpm --filter @expojet/api exec vitest run src/transcription.test.ts
```

---

## Database changes

The schema lives in `apps/api/src/db/schema.ts`, and migrations live in `apps/api/drizzle/`.

```sh
pnpm db:generate     # after editing the schema: writes a new migration
pnpm db:migrate      # applies pending migrations to DIRECT_DATABASE_URL
pnpm --filter @expojet/api db:studio   # browse the data
```

Commit the generated SQL together with the schema change. Never edit a migration that has already run in production; add a new one.

---

## Deployment

| Piece | Where | How |
| --- | --- | --- |
| API | Railway (Docker, `apps/api/Dockerfile`, config in `railway.json`) | Deploys on merge to `main`. Set the variables in Railway → Variables. Health check: `/health`. See [docs/deploy-railway.md](docs/deploy-railway.md) |
| Worker | Trigger.dev | `pnpm --filter @expojet/api worker:deploy`. It syncs the server variables listed in `apps/api/trigger.config.ts` |
| Migrations | From any machine with the production URL | `pnpm db:migrate`. Run them **before** the API that needs them goes live |
| Voice agent | LiveKit Cloud (`voice-agent/Dockerfile`) | `lk agent deploy voice-agent`. Setup and testing: [docs/voice-calls.md](docs/voice-calls.md) |
| Landing page | Vercel (root `apps/web`) | Deploys on merge to `main` |
| Mobile app | EAS Build | Point `EXPO_PUBLIC_API_URL` at the production API first |

---

## Working on the code

- **Branches and PRs:** branch off `main` (`feat/…`, `fix/…`, `docs/…`) and keep commits small and focused. Open a PR, and merge only when `pnpm typecheck && pnpm test` pass.
- **Typed contract:** the mobile app talks to the API through `packages/api-contract`. Change both sides together, and don't break existing response shapes.
- **Installing packages:** in the mobile app use `npx expo install <pkg>` (from `apps/mobile`) so versions match the Expo SDK. Elsewhere use `pnpm --filter <package> add <pkg>`.
- **Landing-page design:** use only the existing colour tokens and the mates' palette. Don't introduce new colours.
- **Turborepo:** see `AGENTS.md` for notes on the installed Turborepo version before changing `turbo.json`.

## Troubleshooting

- **The app can't reach the API.** `EXPO_PUBLIC_API_URL` must be your LAN IP, not `localhost`, and the phone must be on the same Wi-Fi network. Some firewalls block port 3000.
- **A changed `.env` has no effect.** Restart with `pnpm dev:clear`, because Metro caches env values.
- **Background runs never start.** Run the worker (`worker:dev` locally) and set `COOPER_BACKGROUND_ENABLED=true`.
- **A feature says "isn't set up on this server".** Its API key is missing from `apps/api/.env`.
