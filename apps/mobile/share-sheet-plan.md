# Share to a mate: implementation plan

## Goal

From another app, share a link or supported file to a mate, optionally add an instruction, and send it without first navigating through Mates. The accepted share becomes a user message in that mate's chat and the existing run delivery path attempts a push notification.

Out of scope: sharing content from Mates to other apps; that already exists.

## Current baseline

- Mobile already uploads attachments through `POST /v1/attachments` and starts work through `POST /v1/runs`.
- API accepts images, PDFs, and text formats. It rejects audio. The current limit is 4 MiB per file; run messages allow up to four attachment references.
- `/v1/transcribe` exists, but returns transcript text and does not store an audio attachment. Decide whether that meets the product meaning of “share a voice note.”
- Run completion already enters the follow-up/push path. Reuse it; do not add a separate push mechanism unless verification shows a gap.
- `useMates()` caches the full mates response in AsyncStorage under the per-user `mates` cache key. An iOS extension cannot read that app sandbox.
- The widget target already names App Group `group.app.askorin.mates`. The host app's checked-in `Mates.entitlements` is empty, so the app currently lacks the matching entitlement in that file. Verify and fix the host app entitlement before relying on the group; add the same group to the share target.
- `expo-sharing` is installed for outbound sharing but is not configured as an inbound share plugin. SDK 57 also supports inbound Android intents through its config plugin and incoming-share APIs; configure and use that for Android if its payload behavior fits. Its inbound iOS extension opens the main app, so it does not satisfy the requested in-extension iOS UI. `expo-apple-targets` is not installed. Existing widget code uses `expo-widgets`, so the targets must coexist in prebuild and signing.
- `uploadAttachment()` depends on `expo/fetch` and `expo-file-system`; `resolveApiUrl()` can inspect Expo Constants in development. Do not assume those app helpers or Expo modules are available in a separate extension process.

## Decisions before implementation

1. **Voice notes:** transcribe to text with the existing endpoint, upload/store audio as an attachment, or do both. If audio is an attachment, settle supported iOS/Android MIME types and whether the mate receives playable audio, transcription, or both.
2. **Multiple items:** support one item per share or several. If several, use the existing maximum of four attachments and define whether 4 MiB is per item or total. Current API enforcement is per file.
3. **iOS authentication:** prove how the extension can refresh Clerk credentials while the main app is not running. Clerk session tokens are short-lived JWTs; copying one at sign-in does not provide a durable credential. The existing `@clerk/expo/token-cache` uses `expo-secure-store`, but do not assume it can use a Keychain access group shared with an extension. Verify the exact cache API and Clerk refresh requirements. If a supported shared Keychain cache cannot be established, the fallback is explicit: keep the share pending and offer “Open in Mates to refresh your session.” Do not add a backend token-exchange endpoint around a long-lived credential without a reviewed auth design.
4. **Failure recovery:** define how pending content moves to Mates after upload/run failure and how retry avoids duplicate run submissions or repeated uploads.

The App Group identifier is already established for the widget as `group.app.askorin.mates`; use it consistently after fixing host-app entitlement generation.

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
- Inject the public API base URL into the extension target's Info.plist at build time from `EXPO_PUBLIC_API_URL`; `resolveApiUrl()`'s Expo Constants development-host discovery is app-only. The target's config/plugin should own this value so prebuild preserves it.
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
- Verify links, supported photos/PDFs, chosen voice-note behavior, one/multiple item policy, last-used mate, note submission, signed-out/expired auth, upload failure, run failure after upload, and the size boundary.
- Confirm accepted shares appear in the selected chat and that the current push path is attempted. Push is best-effort, so the share UI confirms server acceptance rather than promising device receipt.

## Commit estimate

Plan for **three mobile implementation commits**, plus **one API commit if audio attachment support is required**:

1. `feat(mobile): add iOS share target and shared context` — target/config/App Group/auth spike and minimal app-to-extension data bridge.
2. `feat(mobile): share content with a mate on iOS` — payload handling, mate/note UI, upload/run, and recovery.
3. `feat(mobile): receive shares on Android` — intent registration, route, payload handling, and shared send flow.
4. `feat(api): support shared voice-note attachments` — conditional on the chosen voice-note behavior; include contract and tests.

If voice notes are transcribed through the existing endpoint and no API change is needed, expect **three implementation commits**. Keep tests with the commit that introduces each behavior. The two planning documents are separate planning artifacts, not part of that implementation estimate.

## Expo native-code approach

Start with the extension target and existing packages before writing a module. Expo's local-module pattern is appropriate for app-specific Swift/Kotlin functionality, and config plugins are the durable way to change generated native project configuration. Use a narrowly scoped local module only if the main app's JS needs native App Group/Keychain access. Keep extension-specific UI and file/network handling inside the extension target unless a validated Expo Modules integration makes sharing that code simpler.

References: [Expo native module tutorial](https://docs.expo.dev/modules/native-module-tutorial/), [Expo custom native code and CNG](https://docs.expo.dev/workflow/customizing/), [Expo SDK 57 Sharing](https://docs.expo.dev/versions/v57.0.0/sdk/sharing/), [Clerk Expo session token cache](https://clerk.com/docs/expo/reference/components/clerk-provider), [Clerk session tokens](https://clerk.com/docs/guides/sessions/session-tokens).
