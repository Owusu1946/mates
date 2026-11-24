# Mates

Mates is a mobile app for building a team of AI "mates". Each mate has a role, a personality and a mascot. They chat with you, call you, work in your connected apps (Gmail, Notion, Calendar and more), search the web, and write code that ships as GitHub pull requests while you're away.

This repository is a **pnpm + Turborepo monorepo** with everything in one place: the mobile app, the desktop app, the API, the background worker and the landing page.

| Path | What it is | Stack |
| --- | --- | --- |
| `apps/mobile` | The iOS/Android app | Expo SDK 57, Expo Router, assistant-ui, Clerk |
| `apps/desktop` | The Windows/macOS/Linux app (early: a native shell for now). See [Desktop app](#desktop-app) | Electron 44, electron-vite, React 19 |
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
| `pnpm dev:desktop` | Desktop app in a window, with hot reload. See [Desktop app](#desktop-app) |
| `pnpm --filter @expojet/api worker:dev` | Trigger.dev worker locally (background runs, routines, code runs) |

Run all commands from the **repository root**. `pnpm --filter <package>` targets one workspace.

---

## Desktop app

`apps/desktop` is the Mates app for Windows, macOS and Linux, built with Electron. Today it's a native shell: one window with the mascot and "Hello there." It doesn't sign in or talk to the API yet, so it needs no `.env`. The plan is in [docs/desktop/desktop-app.md](docs/desktop/desktop-app.md) and the stack in [docs/desktop/stack.md](docs/desktop/stack.md).

It's built to feel native on each system:

| | Windows | macOS | Linux |
| --- | --- | --- | --- |
| Window | Our title bar with Windows' own caption buttons; Mica on Windows 11 22H2 and later | Inset traffic lights over vibrancy | The desktop's own frame (GNOME, KDE…) |
| Menu | Hidden; shortcuts still work | Full menu bar | Shows on Alt |
| Font | Segoe UI | SF Pro | Your desktop's font |

On all three it follows the system's light or dark mode, remembers its size and position, and runs as a single instance (opening it again brings the window forward).

### Run it

Same on every system, from the repository root after `pnpm install`:

```sh
pnpm dev:desktop
```

The first run downloads Electron's binary for your system (about 100 MB), so it takes longer. Later runs start in a few seconds. The window reloads as you edit the renderer (`src/renderer`), and the app restarts when you edit the main process or preload.

**System requirements for running:**

- **Windows:** Windows 10 or 11, x64 or arm64.
- **macOS:** macOS 12 or newer, Apple silicon or Intel.
- **Linux:** a desktop session (X11 or Wayland) on a 64-bit distribution. Ubuntu, Fedora and Debian desktop installs already have the libraries Electron needs. It won't open a window inside WSL or over plain SSH.

### Check it

```sh
pnpm --filter @muse-clone/desktop typecheck
pnpm --filter @muse-clone/desktop test     # node --test, no Electron needed
pnpm --filter @muse-clone/desktop build    # bundles main, preload and renderer into apps/desktop/dist
```

The root `pnpm typecheck && pnpm test` covers the desktop app too.

### Build an installer

Each system builds its own installer: you can't build a macOS app on Windows, for example. Installers land in `apps/desktop/release/`.

| System | Command (from the repository root) | What you get |
| --- | --- | --- |
| Windows | `pnpm --filter @muse-clone/desktop dist:win` | `Mates-Setup-<version>-x64.exe` and `-arm64.exe`: one-click, per-user install, no admin prompt |
| macOS | `pnpm --filter @muse-clone/desktop dist:mac` | `Mates-<version>-mac.dmg` and a `.zip`, universal (Apple silicon and Intel) |
| Linux | `pnpm --filter @muse-clone/desktop dist:linux` | `Mates-<version>-x86_64.AppImage` and a `.deb` |

The builds aren't code-signed yet, so each system warns the first time you open one:

- **Windows:** SmartScreen says "Windows protected your PC". Choose **More info → Run anyway**.
- **macOS:** right-click the app in Applications and choose **Open**, then **Open** again. Or go to **System Settings → Privacy & Security** and choose **Open Anyway**.
- **Linux:** make the AppImage executable with `chmod +x Mates-*.AppImage`, then run it. On Ubuntu 22.04 and later, AppImages need `sudo apt install libfuse2`. Install the `.deb` with `sudo apt install ./Mates-*.deb`.

### Where things are

| Path | What it does |
| --- | --- |
| `src/main/index.ts` | Puts the app together; each module below owns one concern |
| `src/main/app/` | App identity (Windows taskbar id), lifecycle (single instance, Dock, quit), web-link guards |
| `src/main/window/` | The window (per-system options, light/dark, remembered bounds) and the menus |
| `*.logic.ts` | The pure part of a module, tested in `*.logic.test.ts` without Electron |
| `src/preload/index.ts` | The only bridge to the page: the platform and window material, nothing else |
| `src/renderer/` | The React app |
| `electron-builder.yml` | Installer settings for all three systems |

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
| Desktop app | Built by hand on each system for now | `dist:win`, `dist:mac`, `dist:linux` (see [Build an installer](#build-an-installer)). Signing, auto-update and CI builds come later |

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
- **The desktop app says "Electron failed to install correctly", or `pnpm dev:desktop` seems stuck on its first run.** Electron downloads its binary the first time it's used. Download it yourself with `pnpm --filter @muse-clone/desktop exec install-electron`. Behind a proxy or slow connection, set `ELECTRON_MIRROR` to a mirror first.
- **The desktop window doesn't follow a light/dark change on Linux.** A known Electron issue (electron/electron#48736): it reads the Linux colour scheme once at start. Restart the app; a fix is planned.
- **The desktop app opens off screen after unplugging a monitor.** It shouldn't (saved positions are checked against the connected screens), but you can reset it by deleting `window-state.json` from the app's data folder: `%APPDATA%\Mates` on Windows, `~/Library/Application Support/Mates` on macOS, `~/.config/Mates` on Linux.
