# Share to a mate: implementation plan

## Goal

From another app, share a link or supported file to a mate, optionally add an instruction, and send it without first navigating through Mates. The accepted share becomes a user message in that mate's chat and the existing run delivery path attempts a push notification.

Out of scope: sharing content from Mates to other apps; that already exists.

## First-release decisions and progress

- **Content:** URLs, images, and PDFs only. Voice notes are deferred; do not add audio upload or transcription behavior to this release.
- **Share count:** one item per share. The extension activation rules and send flow should stay single-item for this release.
- **Commit 1 scaffold:** adds the iOS target, App Group wiring, minimal mate cache, and placeholder extension UI. This is not yet a usable send flow.
- **Authentication gate:** initial shared-session access is proved on a signed device. Simulator URL, PDF, and image sends are now authorized and completed through the existing API flow. API authorization and attachment display are verified; push receipt on a physical device remains a release check.
- **Signed-device result:** the EAS auth probe returned a token after Mates sign-in (768 characters in the first observation, 792 characters when Argent reopened it later). After sign-out, tapping the probe showed “Open Mates once to finish setting up sharing.” The sign-out probe exits when the shared publishable key is missing, so this verifies App Group cleanup, not Keychain token invalidation. The token length change is not proof of refresh timing.
- **Local simulator result:** `expo prebuild --platform ios --no-install` and `expo run:ios` built the app and share extension for the iPhone 16 Pro simulator. Mates launched signed in. Safari shared `https://example.com/` to Mates; the SwiftUI screen rendered with the URL, cached mate selected, note field, and Send button. A first observation of a blank surface was a transient/premature capture, not a reproducible render defect.
- **History continuity test:** after saving the share user message under the current history leaf, a second `https://example.com/` share was sent to Kwame from Safari on the iPhone 16 Pro simulator. The existing visible share/reply remained in the chat and the new share/reply appeared after it. This verifies the new-share branch link for the current visible history. It does not recover older messages already hidden by a share from a previous build.
- **File-share result:** a 595-byte PDF shared from Safari uploaded, appeared in Kwame's chat with its filename, and received a response. A 138 KB PNG shared from Safari was downscaled to `photo.jpg`, uploaded, appeared in chat, and received a response. The existing PDF and earlier chat turns remained visible after the photo share.
- **File-size result:** a 4.2 MB PDF was rejected in the extension with “Files must be 4 MB or smaller.” It could not be sent.
- **Share activation/provider fixes:** Safari's PDF share supplied extra preview providers, so the extension now prefers one PDF/image provider and ignores accompanying URL/text metadata. The activation predicate allows multiple matching representations within one extension item; the loader still rejects multiple actual file payloads. Both PDF and PNG targets appeared in Safari's share sheet after a local simulator rebuild.
- **Recovery status:** pending-share storage, the app-side retry screen, and reuse of an uploaded attachment/run key are implemented. A forced upload/run failure followed by a retry has not been verified. During the photo smoke test, launching Mates immediately while the extension was finishing showed a stale retry screen; after the share completed, retry correctly reported it was no longer pending. Avoid treating that race as a failed upload or as proof of the failure-recovery path.
- **Android inbound implementation (commit 3e34829):** configured the SDK 57 `expo-sharing` Android plugin for `text/plain`, images, and PDFs; added Router intent redirection and an authenticated in-app picker/note/send screen. It copies resolved file content into Mates' private documents before clearing expo-sharing's cache, normalizes images to a 1600 px JPEG, stores the draft and uploaded attachment ID in user-scoped AsyncStorage, and reuses the shared chat-history/run submission helper. Android prebuild verifies the intended `ACTION_SEND` MIME filter and `mates://expo-sharing` marker. The plugin also emits an empty `ACTION_SEND_MULTIPLE` filter when no multi-item MIME types are configured; because it declares no MIME type, typed multi-item shares do not match it. Typecheck and the 34 existing tests pass. A local Gradle compile did not finish: the Android SDK manager stayed at “Preparing NDK” without progress, so it was stopped. A manual share-sheet/send/retry check on an Android emulator/device remains outstanding.

### Clerk extension-auth investigation

The installed `@clerk/expo` version is 4.10.0. Source inspection shows its built-in token cache uses `expo-secure-store` and caches Clerk's native device token under `__clerk_client_jwt`; that is separate from the short-lived session JWT returned by `getToken()`. Expo SecureStore supports a shared iOS Keychain `accessGroup`, and Clerk's native iOS SDK supports sharing sessions when each target uses the same Keychain service, access group, Clerk publishable key, and Apple Developer Team ([Clerk shared-session requirements](https://clerk.com/docs/ios/reference/native-mobile/shared-session-sync), [Expo SecureStore access-group option](https://docs.expo.dev/versions/latest/sdk/securestore/#types)).

The installed Expo Clerk native bridge configures the Keychain service but does not expose an access-group option. A local pnpm patch now configures the same Keychain access group in the host app. The Apple Team ID (`6KBN2JVL76`), shared Keychain group, and service are configured in Expo and extension target config. The extension uses a small local Expo config plugin to link ClerkKit directly as a Swift package product, without adding ClerkExpo or its React Native dependency tree to the extension. Prebuild confirms the product dependency appears on the extension. ClerkKit 1.6.1 source confirms `Clerk.shared.auth.getToken()` exists. A normal `Mates.xcworkspace` build of the `MatesShareExtension` scheme succeeds with code signing disabled; the earlier project-only resource-bundle failure was a build-path artifact. Signed-device testing confirms initial token access and App Group cleanup. Simulator URL/PDF/photo sends confirm API authorization and successful uploads/runs. Do not place session JWTs in App Group defaults or add a token-exchange endpoint as a shortcut.

The `@clerk/expo` config plugin sets the shared Keychain service. `ios.infoPlist.ClerkKeychainAccessGroup` is a separate manual entry because the plugin does not expose that option; keep the two values paired. The custom Xcode modification uses the `xcodeProjectBeta2` mod from `@bacons/apple-targets` 5.0.0, so that package is pinned to the version the plugin expects.

Commit 2 audit follow-up: the ClerkKit config plugin now creates a `PBXBuildFile` scoped to the share extension's frameworks phase instead of reusing a build-file object from another target. A clean iOS prebuild, CocoaPods install, and simulator build all succeeded with ClerkKit linked to `MatesShareExtension`.

If the extension has no valid session, retain the pending share and tell the user to open Mates to refresh the session. Shared session access was proved in the signed auth probe; a full signed-device send remains a release check.

Local Xcode signing lacked development profiles for the app, widget, and share extension; the EAS `development-device` build supplied the signed auth probe used on the physical iPhone.

The first EAS `development-device` build contains the auth probe only. Subsequent source work stages one URL, photo, or PDF from the share context. Photos are downscaled to 1600 px JPEG; files over 4 MiB and unsupported items get clear errors. The local iPhone 16 Pro simulator prebuild compiles the extension and its SwiftUI share UI renders from Safari.

Post-probe source work adds the SwiftUI mate picker, note field, URL/file upload and run submission, last-used mate, and an App Group pending-share record. Mates reads that record on launch and offers a retry with the same run key and any completed upload. URL, PDF, and photo sends have been verified in Safari on the simulator. The 4 MiB rejection has been verified; forced upload/run failure and retry behavior remain unverified.

Apple documents `NSExtensionContext.open` support for Today and iMessage extensions, not Share extensions ([Apple API](https://developer.apple.com/documentation/foundation/nsextensioncontext/open%28_%3Acompletionhandler%3A%29)). The iOS failure path should save the pending share in the App Group and tell the user to open Mates; the app must surface that saved content on its next launch. Confirm the product wording before shipping.

## Current baseline

- Mobile already uploads attachments through `POST /v1/attachments` and starts work through `POST /v1/runs`.
- API accepts images, PDFs, and text formats. It rejects audio. The current limit is 4 MiB per file; run messages allow up to four attachment references.
- `/v1/transcribe` exists, but returns transcript text and does not store an audio attachment. Decide whether that meets the product meaning of “share a voice note.”
- Run completion already enters the follow-up/push path. Reuse it; do not add a separate push mechanism unless verification shows a gap.
- **Chat continuity fix:** new share sends save the synthetic user message through the existing `PUT /v1/chats/:id/messages` contract with the current history leaf as its parent before calling `POST /v1/runs`. This preserves the branch and stores attachment display metadata without a schema or endpoint change. URL, PDF, and image sends preserved the visible earlier turns. Shares sent before this fix may already be separate roots; Ken should review a safe history repair so those earlier messages become visible again.
- `useMates()` caches the full mates response in AsyncStorage under the per-user `mates` cache key. An iOS extension cannot read that app sandbox.
- The widget target already names App Group `group.app.askorin.mates`. Commit 1 adds the group to `ios.entitlements` in `app.json`; prebuild confirms the host app, widget, and share target all resolve to that same group. The generated `ios/` files are ignored and should remain generated.
- `expo-sharing` is installed for outbound sharing but is not configured as an inbound share plugin. SDK 57 also supports inbound Android intents through its config plugin and incoming-share APIs; configure and use that for Android if its payload behavior fits. Its inbound iOS extension opens the main app, so it does not satisfy the requested in-extension iOS UI. Commit 1 added `@bacons/apple-targets`; existing widget code uses `expo-widgets`, so both targets must continue to coexist through prebuild and signing.
- `uploadAttachment()` depends on `expo/fetch` and `expo-file-system`; `resolveApiUrl()` can inspect Expo Constants in development. Do not assume those app helpers or Expo modules are available in a separate extension process.

## Remaining implementation gates

Post-audit fixes: Android reopens the live share intent after sign-in and reports a second share blocked by an earlier pending draft. iOS records sending/failed state so its app retry cannot race the active extension; a ten-minute stale-send timeout permits recovery after an extension crash. Mates checks for an iOS failure while already in the foreground, and an open retry screen refreshes its state. Android intent retention across process termination during sign-in remains unverified and would require durable staging before authentication. The signed-device and Android runtime checks below remain open.

1. **iOS API flow:** URL, small PDF, and photo upload/send plus visible chat continuity passed on the iPhone 16 Pro simulator. The 4.2 MB PDF limit message passed. Still force an upload or run failure and verify the pending-share retry end to end; confirm push receipt on a signed device.
2. **Android inbound share:** implementation is in place. Verify share-sheet visibility and end-to-end behavior on an Android emulator/device for a URL, photo, PDF, unsupported audio, multi-item share, and a file over 4 MiB. Verify a failed upload/run retains the draft and retry reuses the upload ID and stable run key.
3. **Failure recovery:** verify pending content opens in Mates after upload/run failure and retries without duplicate run submissions or repeated uploads. The UI and persistence code are present, but that failure/retry scenario is not yet proven.

The App Group identifier is established for the widget as `group.app.askorin.mates` and is now declared consistently on the host app and share extension.

## Proposed structure

Keep the share feature under one small mobile module, for example `src/share/`, with:

- a platform-neutral share payload and send-flow contract;
- a small API adapter that uploads file payloads and submits the resulting user turn;
- app-side helpers to publish the minimal mates list and clear the shared cache on sign-out;
- platform-specific entry points only where the OS requires them.

The shared mate cache should contain only the signed-in user's mate IDs, names, chat IDs, and last-used mate ID. Do not copy the full offline cache or unrelated mate/profile data into the App Group. Scope it by user ID and clear it at sign-out/account switch. Write it next to the existing successful cache write in `src/mates/data.ts`; clear it next to `clearCache(userId)` in the sign-out path in `src/session/provider.tsx`.

## Build sequence

### 1. Prove the native target and credential boundary

- Add the iOS share target with `expo-apple-targets` and configure the existing App Group on the host app, widget, and share target.
- Check that target signing, `expo-widgets`, `with-mates-widget-mascot`, and prebuild work together.
- Use a minimal **native SwiftUI share extension** for the requested small mate picker/note/send UI. It can read the App Group and call the API with `URLSession`, avoiding a second React Native bundle and assumptions about Expo modules in the extension process. First prove it receives a URL and file, reads the shared mate list, and can obtain a valid API credential under the agreed Clerk design.
- In the host app, use a narrowly scoped local Expo module only for App Group and (if supported) shared Keychain operations needed by JavaScript. The Swift extension accesses those stores directly. Do not build a generic bridge or put the host app's `expo/fetch` / `expo-file-system` upload helper into the extension.
- Publish the public API base URL to the App Group with the mates cache; `resolveApiUrl()`'s Expo Constants development-host discovery is app-only. The extension should report a clear setup error when no URL is available.
- Put native project configuration in app config/config plugins so a prebuild does not erase it. Use a local Expo module only for app-specific native functions the JavaScript app actually needs (for example, App Group or shared Keychain access). A module linked into the main app is not automatically linked into the extension target.

### 2. Implement the API flow for existing content

- Normalize a shared URL as message text; do not upload it as a file.
- For files, copy/read the OS-provided URI while access is valid, check file size, upload each supported file, then submit one run to the selected mate's `chatId` with the note and attachment IDs.
- Generate stable IDs/request keys for a send. The run endpoint is idempotent by `requestKey`; attachment upload is not. Retain the local pending share through failure and avoid blind repeat uploads.
- Show a clear 4 MiB error. The API remains the final size/type authority.

### 3. Add voice-note API behavior if selected

- If voice notes become transcript text, use the existing transcription endpoint where its accepted formats/limits fit; then submit the transcript plus the user's optional note as the run message.
- If audio must remain an attachment, Ken adds the supported MIME/type handling and model/audio processing needed in the API. Keep `POST /v1/attachments` and `POST /v1/runs` unless the selected behavior exposes a concrete contract gap.
- Add API tests and deploy the compatible API behavior before distributing a mobile build that depends on it.

### 4. Build platform entry points

- **iOS:** complete mate selection, last-used default, optional note, send state, and “Open in Mates” recovery in the extension. Use the share extension's own file and network strategy; do not directly import app-only upload code until it is proven to work in that target.
- **Android:** use SDK 57 `expo-sharing` inbound intent support if its payload types cover the agreed scope. Its plugin adds `ACTION_SEND` and `ACTION_SEND_MULTIPLE` filters for configured MIME types, and its incoming-share APIs route payloads into Expo Router. Configure only the actions/types in scope. Route into a share screen in Mates, where the app can reuse its existing auth and attachment code. Handle temporary content URI permissions/copying. Expo marks inbound sharing experimental overall; the iOS behavior is specifically unsuitable here because it opens the main app.

### 5. Verify native builds and user outcomes

- Build iOS and Android binaries; these target/manifest changes cannot ship by OTA alone.
- Verify URLs, supported images/PDFs, the one-item rule, last-used mate, note submission, signed-out/expired auth, upload failure, run failure after upload, and the size boundary. Voice notes are out of scope for this release.
- Confirm accepted shares appear in the selected chat and that the current push path is attempted. Push is best-effort, so the share UI confirms server acceptance rather than promising device receipt.

## Commit estimate

The chosen first release is **three mobile implementation commits**. Voice-note support is deferred, so there is no audio API commit in the current scope. Reopen the API estimate only if a later product decision adds audio or an existing contract gap is found.

1. `feat(mobile): add iOS share target and shared context` — target/config/App Group and minimal app-to-extension data bridge. The Clerk auth spike remains a gate before the send-flow commit.
2. `feat(mobile): share content with a mate on iOS` — payload handling, mate/note UI, upload/run, and recovery.
3. `feat(mobile): receive shares on Android` — intent registration, route, payload handling, and shared send flow.
Keep tests with the commit that introduces each behavior. The two planning documents are separate planning artifacts, not part of that implementation estimate.

## Expo native-code approach

Start with the extension target and existing packages before writing a module. Expo's local-module pattern is appropriate for app-specific Swift/Kotlin functionality, and config plugins are the durable way to change generated native project configuration. Use a narrowly scoped local module only if the main app's JS needs native App Group/Keychain access. Keep extension-specific UI and file/network handling inside the extension target unless a validated Expo Modules integration makes sharing that code simpler.

References: [Expo native module tutorial](https://docs.expo.dev/modules/native-module-tutorial/), [Expo custom native code and CNG](https://docs.expo.dev/workflow/customizing/), [Expo SDK 57 Sharing](https://docs.expo.dev/versions/v57.0.0/sdk/sharing/), [Clerk Expo session token cache](https://clerk.com/docs/expo/reference/components/clerk-provider), [Clerk session tokens](https://clerk.com/docs/guides/sessions/session-tokens).
