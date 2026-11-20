# Share to a mate: backend handoff for Ken

## Context

The mobile branch has the iOS share target, App Group cache, Clerk credential bridge, SwiftUI picker, direct upload/run flow, and pending-share retry screen. A local Expo prebuild and iOS simulator build compiled the extension for iPhone 16 Pro, and Mates launched signed in. Safari shared `https://example.com/` to Mates and the SwiftUI picker rendered with the URL, cached mate selected, note field, and Send button. A first observation of a blank surface was a transient/premature capture, not a reproducible render defect. The desired flow is: share a URL, image, or PDF from another app, choose a mate (last used preselected), add an optional note, send, and have the resulting user message and run appear in that mate's chat with the existing push path.

The mobile plan and progress are in [`share-sheet-plan.md`](./share-sheet-plan.md). First-release scope is one item per share; voice notes are deferred. No audio API work is requested for this release.

## Mobile auth gate

Clerk's native iOS SDK documents sharing sessions across trusted apps/extensions through a common Keychain service and access group ([shared-session requirements](https://clerk.com/docs/ios/reference/native-mobile/shared-session-sync)). The Team ID `6KBN2JVL76`, shared Keychain service/group, and extension-side ClerkKit token check are configured. A local patch to `@clerk/expo` adds the access-group option to the host app's native Clerk configuration. The share extension links ClerkKit as a direct SPM product without a ClerkExpo CocoaPods dependency. Prebuild shows the package product on the extension target, ClerkKit 1.6.1 source confirms the `getToken()` API, and a normal `Mates.xcworkspace` build of the extension scheme succeeds with code signing disabled. The signed auth probe retrieved a token after host-app sign-in. Expo SecureStore documents iOS access groups ([SecureStore API](https://docs.expo.dev/versions/latest/sdk/securestore/#types)); API authorization and the full send flow still need device verification.

The first signed probe confirms token access. Argent reopened the extension later and saw a token, then signed out in Mates and saw “Open Mates once to finish setting up sharing” after tapping Check shared session. That latter result proves App Group publishable-key cleanup; the probe exits before checking the Keychain token, so Keychain invalidation is not independently proved. A new signed build must verify API authorization and the send flow. If no valid session is available, retain the pending share and guide the user to open Mates. Do not add a backend token-exchange endpoint for this flow.

The connected iPhone signed build currently fails because local Xcode has no Apple account for Team `6KBN2JVL76` and no development profiles for the host app, widget, or share extension. The public API base URL is now published with the App Group cache. Apple documents opening the containing app from Today and iMessage extensions, not Share extensions ([Apple API](https://developer.apple.com/documentation/foundation/nsextensioncontext/open%28_%3Acompletionhandler%3A%29)); iOS recovery should persist the pending item and guide the user to launch Mates, where the app resumes it. Product wording needs confirmation.

The first EAS `development-device` build contains the auth probe only. Subsequent source work adds payload staging for one URL, photo, or PDF, photo downscaling, and the 4 MiB limit. Safari displays the implemented share UI on the iPhone 16 Pro simulator. No API send has been tested yet.

The signed-device auth probe returned a token from the extension after Mates sign-in (768 characters initially; 792 when Argent reopened it later). After sign-out, it showed “Open Mates once to finish setting up sharing”; that confirms App Group cleanup, not Keychain invalidation. The SwiftUI send UI renders in the simulator. API authorization, successful send, file access from the shared container, and the full user flow remain unverified. Tapping Send will create a run for the selected mate and may trigger a push notification.

## Mobile next steps

1. iOS URL send and current-branch continuity were verified on iPhone 16 Pro simulator by sharing `https://example.com/` to Kwame. Next verify photo/PDF upload, size errors, and recovery.
2. Implement Android inbound sharing with the SDK 57 `expo-sharing` config plugin (Android only), `app/+native-intent.ts`, and an in-app receive route using `useIncomingShare()`. Keep the accepted share single-item and in URLs, images, and PDFs; copy temporary content URIs before clearing native payloads. Reuse the existing chat/API upload and run behavior where it fits.
3. Verify image/PDF size handling, failed upload/run recovery, and chat rendering after API verification.

## Existing backend behavior to build on

- `POST /v1/attachments` accepts an authenticated multipart file, stores it for the user, returns its attachment metadata, and enforces a **4 MiB per-file** limit.
- `POST /v1/runs` accepts `chatId`, `requestKey`, `assistantMessageId`, `parentId`, and `messages`. A user message can include attachment IDs. The API validates ownership, links the attachments to the chat, and submits the durable run.
- **History branch root cause and mobile fix:** iOS previously submitted a new `parentId` (`user_share_<uuid>`) without first saving that user message into the chat history. `submitRun()` inserts a missing row without a `parentId`, making it a new root; the assistant reply hangs from it. Mobile `recentBranch()` follows the newest leaf, hiding earlier messages from view although their rows remain stored. The mobile fix now reads `GET /v1/chats/:id/messages`, selects the newest leaf using the same graph rule as `recentBranch()`, and saves the share user message through the existing `PUT /v1/chats/:id/messages` contract before `POST /v1/runs`. It saves attachment display metadata in that same message. No new API route or deployment is expected.
- **Previously sent shares need recovery:** the new mobile pre-save prevents future sends from introducing another disconnected root. It does not reconnect root share messages already stored by earlier builds. Please review a safe one-time history repair (or an API history normalization) that links each orphaned `user_share_` root after the preceding chat leaf, preserving chronological order and any intentional branches. Test that reopening the affected chat restores its earlier messages.
- **Verification status:** a second `https://example.com/` share was sent to Kwame from Safari on the iPhone 16 Pro simulator. Before sending, the chat showed the prior visible share and reply; afterward, that turn remained visible and the new share/reply appeared after it. This verifies the current-branch pre-save and API authorization for URL shares. No new API route or schema was needed. A simulator history branch already lacked messages from before an earlier share, so this fix does not restore older orphaned roots.
- **Remaining review:** Ken should review recovery for orphaned `user_share_` roots from earlier builds and concurrent-send safety. An API change/deployment may be needed for historical repair. Confirm a run retry reuses the same message ID, upload ID, and run idempotency key.
- In `apps/api/src/durable-runs.ts`, `submitRun()` currently inserts a user `chatMessages` row with text content only, even when the latest turn has attachment IDs. Please check whether chat history obtains those references elsewhere. If it does not, save the attachment references on the user message; otherwise a successful share of a photo/PDF may show no attachment in chat. Keep the typed contract aligned and deploy before a file-sharing mobile release.
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

The mobile history-pre-save fix is in place and the simulator URL continuity check passed. Ken should review historical repair of orphaned share roots and concurrent-send safety; a backend change/deployment may be needed to restore messages already hidden by older builds. Photo/PDF upload, size errors, and failure recovery still need verification before the native release.
