# Deploying the API to Railway

The API (`apps/api`) runs on Railway. The database stays on Neon, background work on Trigger.dev, and coding runs on Modal.

## One-time setup
1. In Railway, create a **New Project**, choose **Deploy from GitHub repo**, and pick `Owusu1946/mates`, branch `main`.
2. Railway reads `railway.json`, which:
   - builds `apps/api/Dockerfile` from the repo root;
   - health-checks `/health` before switching traffic;
   - redeploys only when API files change.
3. **Variables tab:** add the variables listed below. Leave `PORT` unset: Railway provides it.
4. **Settings → Networking → Generate Domain** gives you `https://<name>.up.railway.app`.
5. Point clients at that domain:
   - `apps/mobile/.env`: `EXPO_PUBLIC_API_URL=https://<name>.up.railway.app`
   - GitHub App → Callback URL: `https://<name>.up.railway.app/v1/github/callback`

## Variables
| Name | Notes |
| --- | --- |
| `DATABASE_URL`, `DIRECT_DATABASE_URL` | Neon |
| `CLERK_SECRET_KEY` | |
| `ALLOWED_ORIGINS` | Web origins for CORS; native apps don't need it |
| `OPENROUTER_API_KEY`, `OPENROUTER_PROVISIONING_KEY` | |
| `COMPOSIO_API_KEY` | |
| `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID` | |
| `COOPER_BACKGROUND_ENABLED` | `true` |
| `TRIGGER_SECRET_KEY`, `TRIGGER_PROJECT_REF` | Use the `tr_prod_` key in production |
| `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET` | |
| `GITHUB_APP_PRIVATE_KEY` | Paste the PEM as is; Railway keeps the newlines |
| `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET` | |

Optional: `OPENROUTER_CHAT_MODEL`, `OPENROUTER_FALLBACK_MODEL`, `OPENROUTER_CODE_MODEL`, `CODE_RUN_LIMIT_USD`, `GITHUB_STATE_SECRET`.

## After deploying
- `curl https://<name>.up.railway.app/health` should return `{"ok":true,…}`.
- Migrations run from a laptop with the Neon URL: `pnpm --filter @expojet/api db:migrate`.
- The Trigger.dev worker is deployed separately: `pnpm --filter @expojet/api worker:deploy`.
