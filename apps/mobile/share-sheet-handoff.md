# Share to a mate: backend handoff for Ken

## Context

The mobile feature is planned but not implemented. The desired flow is: share a URL or file from another app, choose a mate (last used preselected), add an optional note, send, and have the resulting user message and run appear in that mate's chat with the existing push path.

The mobile plan is in [`share-sheet-plan.md`](./share-sheet-plan.md). The outstanding product choice that most affects backend scope is how a voice note should be represented: transcript text, stored audio attachment, or both. Multi-item scope also needs confirmation.

## Existing backend behavior to build on

- `POST /v1/attachments` accepts an authenticated multipart file, stores it for the user, returns its attachment metadata, and enforces a **4 MiB per-file** limit.
- `POST /v1/runs` accepts `chatId`, `requestKey`, `assistantMessageId`, `parentId`, and `messages`. A user message can include attachment IDs. The API validates ownership, links the attachments to the chat, and submits the durable run.
- Run completion already uses follow-up processing and the existing push delivery mechanism. Preserve this path; no new push provider or share-specific endpoint is currently justified.
- The typed API contract lives in the shared contract package and must stay aligned if backend behavior/schema changes.
- No API or backend deployment change is currently indicated for links, photos, or PDFs. The app can send those through the existing upload/run routes.

## Ken's backend scope

1. **First confirm voice-note behavior and MIME formats with mobile.** Do not add general audio/video upload support by default.
2. **If transcript text is sufficient:** check whether `/v1/transcribe` accepts the exact source formats and size range from iOS/Android. That route returns transcript text; it does not store/link the original recording. If it fits, no new attachment endpoint should be needed.
3. **If audio must remain attached:** add only the required audio MIME/extension support to attachment validation and define how the agent consumes audio (transcribe during analysis, pass audio through, or preserve audio plus transcript). Review provider/model limits before accepting audio into the general attachment pipeline.
4. **Preserve retry and push behavior.** Run submissions are idempotent by `requestKey`, but attachment uploads are not. The mobile flow uploads before creating a run, so determine whether unlinked attachments need cleanup or whether retry can safely retain/reuse an upload. Verify share-originated runs trigger the existing push follow-up and keep `chatId` in notification data.
5. **Keep API changes narrow and backward compatible.** Add contract changes only when request/response behavior changes. Add focused API tests for new audio types, limits, ownership, run linking, and push eligibility as applicable.
6. **Own API deployment when needed.** Document required environment/configuration changes (if any), deploy the API before the dependent native app release, and report the deployed version/commit plus a smoke-check result to mobile. Do not put server credentials in `apps/mobile` or the iOS App Group.

The iOS extension credential design is a mobile/native concern. Do not add a `/v1/token` or similar exchange endpoint as a shortcut; Clerk's session token is a short-lived JWT, and any long-lived credential exchange needs an explicit reviewed authorization model.

## Not currently requested

- No new share-specific API route unless a concrete contract issue is found.
- No new push delivery service; reuse existing run follow-ups.
- No database migration unless audio processing requires persisted transcript/status metadata beyond the existing attachment fields.

## Coordination gate

Please wait for the voice-note decision before implementing audio-specific API behavior. The photo/PDF/link path can use the existing endpoints and should remain independent of any optional audio work.
