# Live Activity Plan: Dynamic Island and Lock Screen

## Overview

Plan iOS Live Activities for two surfaces:

- **Calls:** Dynamic Island and Lock Screen while a group or one-to-one call is active.
- **Background tasks:** Dynamic Island and Lock Screen while a task runs in the background.

This document describes proposed work. Live Activities are not part of the current call and chat fixes.

## Architecture

Live Activities need a WidgetKit extension and app-side ActivityKit calls. Expo SDK 57's `expo-widgets` package provides both, including the extension target, ActivityKit bridge, and SwiftUI rendering through Expo UI. The app does not need to offer a home-screen widget for this.

## Proposed stack

- **`expo-widgets`** at the SDK 57 compatible version, with `createLiveActivity` for the call UI and ActivityKit lifecycle.
- **`@expo/ui/swift-ui`** for the Lock Screen and Dynamic Island layout.

This avoids a custom Swift module and a manually managed Xcode target. Keep the ActivityKit extension code declarative and pass it only serializable call state; it runs in an isolated widget runtime without access to the app's React state.

## Activity types

### Call activity

| Field | Type | When set |
|---|---|---|
| `callId` | `String` | Static; set once at start |
| `leadName` | `String` | Static |
| `leadGradient` | `[String]` | Static |
| `duration` | `Int` (seconds) | Dynamic; update while the call is active |
| `isMuted` | `Bool` | Dynamic |
| `speakerName` | `String?` | Dynamic; current speaker, if any |
| `participantNames` | `[String]` | Dynamic |

**Dynamic Island, compact:** Mate avatar and call timer.

**Dynamic Island, expanded:** Participant row, mute state, and current speaker when available. Tapping the activity opens the call screen; do not expose an End button unless its action can reliably end the LiveKit call while the app is suspended.

**Lock Screen:** Similar information to the expanded view, using the wider layout.

### Background task activity

| Field | Type | When set |
|---|---|---|
| `taskId` | `String` | Static |
| `chatId` | `String` | Static; supports linking back to the chat |
| `title` | `String` | Static |
| `status` | `String` (`running` / `needs_attention` / `done` / `failed`) | Dynamic |
| `description` | `String` | Dynamic |
| `progress` | `Double?` (0–1) | Dynamic; optional progress value |

**Dynamic Island, compact:** Progress indicator or checkmark and truncated task name.

**Dynamic Island, expanded:** Full status and a “Tap to respond” action when `needs_attention`.

**Lock Screen:** Similar information to the expanded view.

## Background task updates

Call activities can be updated by the app while it is active in the foreground. Background task activities need a server path for updates while the app is suspended.

Proposed push update flow:

1. The mobile app starts a task activity and receives an ActivityKit push token.
2. The mobile app sends that token to the API.
3. When task state changes, the API sends an ActivityKit push through APNs.
4. iOS applies the new activity state.

This requires API and APNs work in addition to the mobile and widget work.

## Proposed files

```text
src/call/
  call-live-activity.tsx           # Declarative Live Activity layout
  call-activity.ts                 # Guarded ActivityKit helpers and lifecycle
  call-live.ts                     # Start, update, and end from the real call session

app.json                           # expo-widgets and iOS scene-lifecycle config plugins
ios/                               # Generated extension target and entitlements
```

Do not add a home-screen widget entry for a Live Activity. The package generates its Live Activity target at runtime. Its config plugin also sets `NSSupportsLiveActivities` and an App Group for the app and extension.

## Proposed JavaScript API

```ts
startCallActivity(params: CallActivityParams): Promise<void>
updateCallActivity(params: CallActivityUpdate): Promise<void>
endCallActivity(): Promise<void>

startTaskActivity(params: TaskActivityParams): Promise<string> // returns push token
updateTaskActivity(params: TaskActivityUpdate): Promise<void>
endTaskActivity(result: 'done' | 'failed'): Promise<void>
```

## Constraints to account for

| Constraint | Planning note |
|---|---|
| iOS version | Live Activities require iOS 16.1 or later; Dynamic Island requires iPhone hardware and iOS 16.2 or later. |
| Activity duration | Activities have system-enforced time limits; confirm current limits and behavior during implementation. |
| Update frequency | iOS may throttle push updates; send only meaningful state changes and avoid frequent updates. |
| Dynamic Island motion | Use system-provided transitions; do not rely on custom animations. |
| Widget UI | Implement the widget extension UI in SwiftUI. |
| Data sharing | Confirm whether an App Group is needed for the selected implementation and shared data. |

## Recommended build order

1. Implement call activities first, using local ActivityKit updates and no backend push setup.
2. Validate the Dynamic Island and Lock Screen layouts on supported devices.
3. Add background task activities, including push token registration and API-to-APNs updates.

## Backend work for background task activities

- Add an endpoint such as `POST /v1/tasks/:id/live-activity-token` to associate an ActivityKit push token with a task and device.
- Send ActivityKit pushes through APNs when task status changes.
- Use the ActivityKit APNs topic format: `<bundle-id>.push-type.liveactivity`.
- Define token replacement, expiration, authorization, and failure handling before implementation.

## Open decisions before implementation

- Confirm the minimum supported iOS version and supported device families.
- Confirm ActivityKit push notification credentials and the API’s APNs integration.
- Decide whether call duration updates should be sent every second or rendered from a start timestamp by the widget.
- Define how call controls in the Live Activity communicate with the app and call session.
- Confirm the exact `expo-widgets` SDK-compatible package version and rebuild the iOS app after adding its extension target.
- Decide whether the Live Activity needs an End action. A button must not suggest it can end a call unless its action reaches the LiveKit call session reliably when the app is backgrounded.
