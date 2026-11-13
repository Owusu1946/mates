# 05 · Siri, Shortcuts, Spotlight and the share sheet

## What competitors do
- **Grok Bot** adds shortcuts you can run from Siri, Spotlight or the Shortcuts app: **List Bots, Send Message, Start Dictation, Start Voice Chat** ("Send a message in Grok Bot").
- It also accepts shares from other apps, with an optional note and an "Open in Grok Bot" fallback. ([docs.x.ai/grok-bot/mobile](https://docs.x.ai/grok-bot/mobile))

## How it works for users
- **"Hey Siri, ask Nova to…"**, or the Shortcuts actions **Ask a mate**, **Start a call with a mate**, **New chat**. Results come back as a push, or Siri reads a short reply.
- **Share sheet:** share a link, photo, PDF or text from any app → **Mates** → pick a mate → add a note ("summarise this", "add to my reading list") → Send. Without opening the app.
- **Notes reach a mate this way:** share a note, or build a shortcut with "Find Notes" then "Ask a mate". It's the only route to Apple Notes on iPhone.
- **Spotlight:** mates and recent chats appear in search.

## Architecture
1. **App Intents** with the official **`expo-app-intents`** package (iOS 16.4+). Apple discovers intents at build time, and the package connects a Swift intent to a JavaScript handler. ([Expo blog](https://expo.dev/blog/introducing-expo-app-intents), [docs](https://docs.expo.dev/versions/latest/sdk/app-intents/))
   - `AskMateIntent(mate: MateEntity, request: String)` posts to the existing `POST /v1/runs` with a **background-safe token**. The intent runs in the app's process; Clerk tokens are read from secure storage.
     - **Short answers** (≤ 10 seconds): poll the run and return text for Siri to speak.
     - **Otherwise:** return "On it. I'll let you know" and send a push when it's done.
   - `StartCallIntent(mate)` opens the app with a deep link to `/call?mate=…`.
   - `MateEntity` gives a dynamic list of the user's mates, so Siri can resolve "Nova".
   - The **App Shortcuts provider** makes the phrases available with no setup.
2. **Share extension** with **`expo-apple-targets`** (a `share` target; needs Expo SDK 53+ and Xcode 16+). ([GitHub](https://github.com/evanbacon/expo-apple-targets))
   - A small native extension UI shows the mate picker, a note field and Send.
   - It uploads the content (links as text; images and PDFs through `POST /v1/attachments`), then creates the run through `POST /v1/runs`.
   - It shares the auth token and the mates list through an **App Group** container that the main app writes on sign-in.
   - Fallback: if the upload fails, "Open in Mates" passes the content to the main app.
3. **Android:** an intent filter for `ACTION_SEND` (text, image, PDF) routing to a share screen in the app. Add Google Assistant App Actions later.
4. **Spotlight:** `CSSearchableItem` for mates and recent chats, through the same Swift target or `expo-app-intents` entities.

## Cost
$0. It uses existing runs and attachments.

## Delivery
1. Share extension (iOS) and the Android share target. This is the most useful part.
2. App Intents: Ask a mate, Start a call, plus the App Shortcuts phrases.
3. Spotlight indexing.
4. Needs a new dev build and an App Store release.

## Open decisions
- Should a share pick the last-used mate by default? We recommend yes, with a picker one tap away.
