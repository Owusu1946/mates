# Share to a mate: backend handoff for Ken

## Context

Commit 1 adds the iOS share-extension scaffold: an iOS target, App Group entitlements, a minimal mate cache published by the host app and cleared on sign-out, and placeholder extension UI. The extension does not yet send shares, and its Clerk credential path is unproven. The desired flow is: share a URL, image, or PDF from another app, choose a mate (last used preselected), add an optional note, send, and have the resulting user message and run appear in that mate's chat with the existing push path.

The mobile plan and progress are in [`share-sheet-plan.md`](./share-sheet-plan.md). First-release scope is one item per share; voice notes are deferred. No audio API work is requested for this release.

## Mobile auth gate

Clerk's native iOS SDK documents sharing sessions across trusted apps/extensions through a common Keychain service and access group ([shared-session requirements](https://clerk.com/docs/ios/reference/native-mobile/shared-session-sync)). The Team ID `6KBN2JVL76`, shared Keychain service/group, and extension-side ClerkKit token check are configured. A local patch to `@clerk/expo` adds the access-group option to the host app's native Clerk configuration. The share extension now links ClerkKit as a direct SPM product and no longer has a ClerkExpo CocoaPods dependency or its React Native pod tree. Prebuild shows the package product on the extension target, and ClerkKit 1.6.1 source confirms the `getToken()` API. The isolated Xcode build currently fails while copying ClerkKit's localized resource bundle into the extension, before compiling the extension Swift source. This is the immediate mobile blocker. Signed-device auth proof has not happened. Expo SecureStore documents iOS access groups ([SecureStore API](https://docs.expo.dev/versions/latest/sdk/securestore/#types)); sign-in, token refresh, and sign-out behavior still need device verification.

Mobile should finish the auth spike before implementing the iOS send flow. Resolve the resource-bundle copy failure and compile the extension Swift source; then verify extension-side token refresh, API authorization, sign-out propagation, and the no-session case on a signed build. If no valid session is available, retain the pending share and offer “Open in Mates to refresh your session.” Do not add a backend token-exchange endpoint for this flow. Team ID is configured; signed Keychain Sharing still requires valid provisioning credentials and device validation.

## Existing backend behavior to build on

- `POST /v1/attachments` accepts an authenticated multipart file, stores it for the user, returns its attachment metadata, and enforces a **4 MiB per-file** limit.
- `POST /v1/runs` accepts `chatId`, `requestKey`, `assistantMessageId`, `parentId`, and `messages`. A user message can include attachment IDs. The API validates ownership, links the attachments to the chat, and submits the durable run.
- Run completion already uses follow-up processing and the existing push delivery mechanism. Preserve this path; no new push provider or share-specific endpoint is currently justified.
- The typed API contract lives in the shared contract package and must stay aligned if backend behavior/schema changes.
- No API or backend deployment change is currently indicated for links, photos, or PDFs. The app can send those through the existing upload/run routes.

## Ken's backend scope

1. **No audio behavior is in the first-release scope.** Do not add audio/video upload or transcription support unless mobile reopens that scope.
2. **Preserve retry and push behavior.** Run submissions are idempotent by `requestKey`, but attachment uploads are not. The mobile flow uploads before creating a run, so determine whether unlinked attachments need cleanup or whether retry can safely retain/reuse an upload. Verify share-originated runs trigger the existing push follow-up and keep `chatId` in notification data.
3. **Keep API changes narrow and backward compatible.** Add contract changes only when request/response behavior changes. No API change is currently indicated for one URL, image, or PDF per share.
4. **Own API deployment only if a concrete backend change is needed.** Document required environment/configuration changes, deploy before a dependent native app release, and report the deployed version/commit plus a smoke-check result to mobile. Do not put server credentials in `apps/mobile` or the iOS App Group.

The iOS extension credential design is a mobile/native concern. Do not add a `/v1/token` or similar exchange endpoint as a shortcut; Clerk's session token is a short-lived JWT, and any long-lived credential exchange needs an explicit reviewed authorization model.

## Not currently requested

- No new share-specific API route unless a concrete contract issue is found.
- No new push delivery service; reuse existing run follow-ups.
- No database migration unless audio processing requires persisted transcript/status metadata beyond the existing attachment fields.

## Coordination gate

There is no backend implementation or deployment task for the chosen first-release scope at this time. Keep the API unchanged unless investigation finds a concrete contract gap; coordinate with mobile before reopening audio scope.
