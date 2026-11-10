# Live Activity Plan — Dynamic Island & Lock Screen

## Overview

Wire up iOS Live Activities for two surfaces:
- **Call** — Dynamic Island + Lock Screen while a group/1:1 call is active
- **Background tasks** — Dynamic Island + Lock Screen while a task runs in the background

---

## Architecture

Live Activities require two things working together:

1. **Widget Extension target** — a separate Xcode target with SwiftUI that renders the Dynamic Island / Lock Screen UI
2. **JS bridge** — to start, update, and end activities from React Native code

---

## Recommended Stack

- **`@bacons/apple-targets`** — creates the Widget Extension via config plugin (Expo-idiomatic, no manual Xcode target management)
- **Custom Expo Module** (`modules/live-activity/`) — ActivityKit bridge from Swift to JS

The project already has native code (LiveKit module), so the native setup pattern is established.

---

## Two Activity Types

### Call Activity

| Field | Type | When set |
|---|---|---|
| `callId` | `String` | Static — set once at start |
| `leadName` | `String` | Static |
| `leadGradient` | `[String]` | Static |
| `duration` | `Int` (seconds) | Dynamic — ticks every second |
| `isMuted` | `Bool` | Dynamic |
| `speakerName` | `String?` | Dynamic — who's currently talking |
| `participantNames` | `[String]` | Dynamic |

**Dynamic Island compact** → mate avatar + timer  
**Dynamic Island expanded** → mates row + mute state + End button  
**Lock Screen** → same as expanded, slightly wider

---

### Task Activity

| Field | Type | When set |
|---|---|---|
| `taskId` | `String` | Static |
| `chatId` | `String` | Static — for deep link back to chat |
| `title` | `String` | Static |
| `status` | `String` (`running` / `needs_attention` / `done` / `failed`) | Dynamic |
| `description` | `String` | Dynamic |
| `progress` | `Double?` (0–1) | Dynamic — optional progress bar |

**Dynamic Island compact** → spinner or checkmark + truncated task name  
**Dynamic Island expanded** → full status + "Tap to respond" CTA if `needs_attention`  
**Lock Screen** → same as expanded

---

## The Tricky Part: Background Task Updates

**Calls** — app is foregrounded during a call, so the Live Activity can be updated directly from JS every second. No server involvement needed.

**Background tasks** — app is backgrounded, so JS can't update the Live Activity. Requires **ActivityKit push tokens**:

1. Mobile starts the Live Activity → receives a push token from iOS
2. Mobile sends that push token to the API
3. When a background task updates on the server, the API sends an ActivityKit push via APNs to update the Live Activity directly
4. API needs a new endpoint to store the push token + logic to fire ActivityKit pushes

This is a meaningful backend change — not just a mobile-side wire-up.

---

## Files to Build

```
modules/
  live-activity/
    ios/
      LiveActivityModule.swift     ← Expo module bridging ActivityKit to JS
      CallAttributes.swift         ← ActivityAttributes struct for calls
      TaskAttributes.swift         ← ActivityAttributes struct for tasks
    index.ts                       ← JS API surface

ios/
  MatesWidget/                     ← Widget Extension target (via @bacons/apple-targets)
    MatesWidgetLiveActivity.swift  ← SwiftUI views for both activity types
    MatesWidgetBundle.swift
```

### JS API surface (`index.ts`)

```ts
startCallActivity(params: CallActivityParams): Promise<void>
updateCallActivity(params: CallActivityUpdate): Promise<void>
endCallActivity(): Promise<void>

startTaskActivity(params: TaskActivityParams): Promise<string> // returns push token
updateTaskActivity(params: TaskActivityUpdate): Promise<void>
endTaskActivity(result: 'done' | 'failed'): Promise<void>
```

---

## Constraints

| Constraint | Detail |
|---|---|
| Min iOS | 16.1 for Live Activities, 16.2 for Dynamic Island |
| Max duration | 8 hours foreground-updated, 12 hours push-updated |
| Update frequency | iOS rate-limits push updates — don't hammer more than once every few seconds |
| Dynamic Island animation | System-provided transitions only — no custom animations |
| Widget Extension UI | Must be SwiftUI — not React Native |
| App Group | Required to share data between main app and Widget Extension |

---

## Recommended Build Order

1. **Start with calls** — foreground-only updates, simpler, no backend changes needed
2. **Get Dynamic Island working** on the call screen first, then Lock Screen
3. **Then tackle background tasks** — requires push token infrastructure on the API side

---

## Backend Changes Needed (for background tasks)

- New endpoint: `POST /v1/tasks/:id/live-activity-token` — stores the ActivityKit push token
- When task status changes, API fires an ActivityKit push to APNs with updated `ContentState`
- APNs topic for ActivityKit pushes: `<bundle-id>.push-type.liveactivity`
