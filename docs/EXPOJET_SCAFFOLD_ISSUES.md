# Expojet scaffold issues found in muse-clone

Report date: 2026-10-09. Target: Expojet source templates that generate Expo + Hono + Neon/Drizzle workspaces. This report records the failures and local fixes from the setup session; it does not imply that Expojet source has already been changed.

## 1. Optional API URL breaks the typed Hono client

**Trigger:** Run workspace typecheck with the generated mobile API client. `EXPO_PUBLIC_API_URL` is optional in `apps/mobile/src/env.ts`, but `hc<AppType>` requires a string. Passing the value directly produced TS2345 (`string | undefined` is not assignable to `string`).

**Local fix:** `apps/mobile/src/data/api.ts` assigns the URL to a local variable and throws an actionable configuration error if absent before calling `hc<AppType>(apiUrl, ...)`. This narrows the type and preserves the shared typed contract.

**Source recommendation:** Generate the same guard when the schema intentionally allows the URL to be absent. If the product instead requires the URL at startup, make the schema required consistently. Do not use a non-null assertion to conceal missing configuration.

## 2. API and Drizzle do not automatically load their .env file

**Trigger:** Put valid `DATABASE_URL`, `DIRECT_DATABASE_URL`, and `CLERK_SECRET_KEY` in `apps/api/.env`, then run `pnpm dev`. The API's `tsx watch src/index.ts` process did not load that file; validation reported all three as undefined. A populated file alone does not populate `process.env`. Drizzle commands also need the file loaded before reading database URLs.

**Local fix:** `apps/api/src/load-env.ts` resolves `apps/api/.env` relative to its own module, checks existence, and calls Node's `loadEnvFile`. Both `apps/api/src/index.ts` and `apps/api/drizzle.config.ts` import the loader before consuming environment values. This also covers the API start script and the generate/migrate/studio commands through their entrypoints.

**Source recommendation:** Generate a server-only loader and import it at executable entrypoints. Keep secrets and loading inside `apps/api`. Check the generated Node support policy against `loadEnvFile` availability.

**Typed-contract constraint:** Do not import this loader from `src/env.ts`. The contract re-exports `AppType` from the API app, so mobile typechecking follows API dependencies. Putting Node filesystem/process loading in that shared dependency path leaks server-only module requirements into the mobile typecheck. Keep the environment schema separate from executable loading.

## 3. Occupied Metro port fails under the original Turbo dev command

**Trigger:** Run the original root `turbo dev` while port 8081 is occupied. Expo asks whether to use 8082, but the piped/non-interactive invocation cannot accept input. It skips the server and exits with code 1, causing the workspace command to fail.

**Local fix:** Mobile `dev` uses `expo start --port 0`, allowing Expo to select an available port without a confirmation prompt. Selection of 8082 while 8081 was occupied was verified in the session.

**Source recommendation:** Generate automatic free-port selection for development, or a clearly configurable explicit port. Check that browser API origin configuration remains compatible with whichever ports are permitted; the current API default is `http://localhost:8081`, so dynamic browser origins require separate consideration.

## 4. Turbo output obscures Expo's interactive terminal

**Trigger:** Run both API and Expo through the original root `turbo dev`. Prefixed interleaved logs clutter startup and Expo does not show the expected foreground QR code and keyboard controls.

**Local fix:** Root `dev` now runs `node scripts/dev.mjs`. The launcher resolves package-local CLI entrypoints, starts the API with stdout redirected to `.turbo/api-dev.log` and stderr inherited, and starts Expo with inherited terminal stdio. It prints the API log location. `dev:clear` passes `--clear` to Expo. Separate `dev:api` and `dev:mobile` commands remain available.

**Source recommendation:** Generate an interactive foreground Expo command with backend logs routed to a documented file or separate terminal. Preserve visible backend errors and terminate child processes on exit. Keep Turbo for build/typecheck/test orchestration where interactive stdin is unnecessary.

**Lifecycle limit:** The launcher contains signal and child-exit cleanup, including Windows process-tree termination, but normal user Ctrl+C cleanup was not verified in this session. QA processes were force-cleaned. Test terminal interruption, child startup failures, and orphan prevention on supported platforms before upstream release. A watcher staying alive after a crashed API should also be considered separately from a successful server startup.

## Related observations, not confirmed scaffold defects

- **Metro cache deserialization:** A cache deserialization error was resolved by starting with `--clear`; `pnpm dev:clear` provides this recovery. Treat this as an environment/runtime cache issue. No evidence establishes a template defect or the cache's original cause.
- **Sentry plugin warning:** Startup warns that organization/project plugin configuration is missing and build environment values will be used as fallback. `apps/mobile/app.json` currently registers `@sentry/react-native/expo` without options. This is nonfatal, separate from the failed Metro/API startup, and remains outstanding. Consider generating organization/project configuration guidance or explicit plugin options when supplied. Keep upload tokens private and outside public client variables.

## Validation recorded in the setup session

- Workspace `pnpm typecheck` and `pnpm test` passed after the fixes. The API suite contains three tests; mobile and contract packages have no substantive tests.
- Expo's QR display and keyboard controls were verified with the foreground launcher.
- API health was verified using temporary port 3012 during launcher QA. This does not prove the user's default port is available or verify database/authentication flows.
- Required API environment values were detected without printing their contents. No secret values are included in this report.
- Drizzle loading is implemented through the config import; this report does not claim a live database migration was executed.
- Normal Ctrl+C process cleanup, device/browser end-to-end behavior, Sentry upload behavior, and upstream Expojet changes remain unverified.

## Upstream acceptance checks

1. Generate a fresh matching workspace and run typecheck with the API URL unset; the template must remain type-correct and provide its chosen configuration behavior.
2. Populate only `apps/api/.env` and verify API startup and Drizzle config loading without exporting secrets in the parent shell.
3. Occupy 8081, run root `pnpm dev` in a real Windows terminal, and verify a usable Metro port, QR display, and keyboard controls.
4. Verify API errors are visible, logs are discoverable, and Ctrl+C leaves no watcher/server child processes.
5. Run `pnpm typecheck && pnpm test` on the regenerated workspace and verify allowed browser origins if dynamic ports are used.
