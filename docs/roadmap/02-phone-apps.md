# 02 · Phone apps: Reminders, Calendar, Contacts, Home

## What competitors do
- **Grok Bot (iPhone):** reads and adds, changes, checks off and deletes **Reminders**; reads **Calendar** and **Contacts**; reads and controls Apple **Home** accessories (lights, fans, blinds, thermostats, locks, garage doors, security). On Android: Calendar and Contacts. Users grant access per app under *Settings → Connect apps*. ([docs.x.ai/grok-bot/mobile](https://docs.x.ai/grok-bot/mobile))
- **Grok Bot (Mac):** adds Messages, Mail, Notes and Location (12 Nov 2026). ([9to5Mac](https://9to5mac.com/2026/11/12/grok-bot-for-mac-adds-integration-with-apple-mail-messages-notes-and-more/))
- **What's off-limits to everyone:** no third-party iOS app can read iMessages or Apple Notes on iPhone. Those are Mac-only (see 14).

## How it works for users
- **Settings → Connect apps → This iPhone,** with a toggle per app. Each toggle triggers the system permission prompt.
- **Examples:**
  - "Add 'call mum' to my reminders for Friday 6pm."
  - "What's on my calendar tomorrow?"
  - "Text Ama's number to the group", where the contact is resolved on the phone.
  - "Turn off the living room lights."
- **Writes follow the approval rules (01).** Reminders and Calendar default to Act; locks, garage doors and security default to **Ask**.

## Architecture
The mate runs on the server, but these apps live on the phone. So we build a **device bridge**, which Siri (05) reuses:

1. **Tools,** added only when the user has connected the app:
   - `phone_reminders_list | add | update | complete | delete`
   - `phone_calendar_events | add`
   - `phone_contacts_find`
   - `phone_home_list | set`
2. **Server side.** When the model calls a phone tool, the run saves a `device_actions` row (`id, userId, runId, tool, args, status pending|done|failed|expired, result`) and pauses with status `waiting_device`. It then sends a **silent push** with the action id (`content-available`, Expo `_contentAvailable`).
3. **Phone side.** The app wakes up, or picks the action up on its next foreground through a poll in `app/(app)/_layout.tsx`. It runs the action with native APIs, POSTs the result to `/v1/device-actions/:id`, and the run resumes. The resume flow already exists for app connections.
4. **Timeouts.** If the phone doesn't answer within about 2 minutes, the run carries on and says "I'll add it when your phone is reachable". The action stays queued and runs next time the app opens. Reads expire instead of queuing.
5. **Native modules:**
   - **Reminders and Calendar:** `expo-calendar`, which covers EventKit reminders and calendars. On iOS 17+ it uses `requestFullAccessToReminders` and `requestFullAccessToEvents`, and needs `NSRemindersFullAccessUsageDescription` and `NSCalendarsFullAccessUsageDescription`. The old `requestAccess` is a no-op on iOS 17. ([Expo changelog](https://expo.dev/changelog/2023-09-28-new-xcode-ios), [Apple TN3152](https://developer.apple.com/documentation/technotes/tn3152-migrating-to-the-latest-calendar-access-levels))
   - **Contacts:** `expo-contacts`. It respects iOS 18 **limited** contact access, so only the contacts the user picked are visible.
   - **Home:** no maintained Expo module exists. We write a small Expo Module in Swift wrapping `HMHomeManager`, `HMAccessory` and `HMCharacteristic`. It needs the **HomeKit entitlement** (`com.apple.developer.homekit`) and `NSHomeKitUsageDescription`. The permission prompt appears when `HMHomeManager` is created. ([Apple: enabling HomeKit](https://developer.apple.com/documentation/homekit/enabling-homekit-in-your-app))
6. **Android:** Calendar and Contacts through the same Expo modules. Reminders have no system app equivalent; we'd use Google Tasks through Composio instead.

## Cost
Everything runs on the device, so there's no API cost. The only cost is the model turns, which are already metered.

## App Store review
- Request only what's used, with clear purpose strings.
- Ask for access at the moment it's first needed (on the toggle), not at launch.
- Reviewers will test it, so include a demo note in the review submission.

## Delivery
1. The device bridge: table, silent push, resume, timeout and queue.
2. Reminders and Calendar (iOS and Android), Contacts.
3. Home (iOS, custom module), with Ask as the default for security-related accessories.
4. Needs a new dev build and an App Store release.

## Open decisions
- Should phone tools run while the app is in the background? iOS limits silent pushes, so "next open" is the honest fallback.
- Should Home ship at launch or after? It needs the entitlement and more review risk. We recommend shipping it in a second wave.
