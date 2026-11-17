# Handoff: chat mentions and mate collaboration

**For:** Samuel and Ken. **Status:** Batches 1–4 are implemented locally, including the two routing fixes from the 16 Nov audit. Migrations `0034_quiet_logan` and `0035_collaborator_removed_at` are generated and not applied. A device pass is still open.

## Goal

Let someone bring another mate into an existing one-to-one conversation by mentioning them, without creating a group chat or moving the conversation to a different chat. Add Chief of Staff to the existing `@` picker alongside connected apps and Web Search.

## Current implementation

- A direct chat stays `kind: "mate"` with its primary `mateId`. Extra mates live in `chat_collaborators`, not `group_members`. Removing one sets `removed_at` instead of deleting the row.
- The `@` menu in a direct chat offers Chief of Staff, the user's other mates, connected apps, and Web Search. A group chat offers its members and does not offer Chief of Staff.
- Picking a mate adds a removable chip inside the composer. Sending appends `@Name{id}` for routing; the transcript shows `@Name`. Abandoning the draft does not change the chat.
- The worker resolves a picked mention by that id, then falls back to the name for a mention someone typed. `@Web` and unknown names do not become mates.
- A direct chat runs as its primary mate unless the message tags another owned mate, tags `@Chief of Staff`, or resumes a collaboration that was waiting.
- Removing a mate drops them from later messages. A turn that is already waiting still finishes as that mate. If that mate no longer exists, the step is skipped and the primary mate does not take their place.
- Removing collaborators first writes removal markers for the user's other mates, including ones with no previous row. An in-flight first attach then conflicts with that marker instead of restoring a removed chip. Existing-row attaches also re-check `removed_at`. Chip removals on the phone run one at a time.

## Product direction

- Keep the current chat and its current mate as the primary speaker.
- Add Chief of Staff as a coordinator option in the `@` menu. It can route work to selected mates and connected apps, then summarize in the current conversation.
- Selecting another mate attaches them to the current conversation and invokes them for that turn. The attachment persists when the user leaves and reopens the chat, so the mate remains available with the same conversation context.
- Attached mates do not reply to every message automatically. They contribute when explicitly mentioned; the current mate can coordinate their results. 
- Keep one canonical conversation history. Do not create another chat or copy the transcript into each mate's separate chat.
- Keep connected-app mentions and Web Search in the same picker. Filter the available choices as the user types.

## Proposed implementation batches

Target **four reviewable commits**. Samuel reviews each batch and handles commits and pushes unless the backend work is explicitly handed to Ken.

1. **Chat collaboration API and persistence** — implemented locally; ready for review.
   - Define how collaborator mate IDs attach to and detach from a direct chat.
   - Enforce chat ownership and verify each mate belongs to the signed-in user.
   - Reuse `group_members` only if its invariants support direct chats safely; otherwise add a focused collaborator relation. Do not change a direct chat's kind or create a new chat.
   - Preserve existing chat history and API response contracts; update the shared API contract where needed.
2. **Backend orchestration**
   - Extend direct-chat runs to accept explicit mate mentions and route them through the existing handoff/relay machinery.
   - Give mentioned mates the canonical conversation context, then return their work in the current chat under their own speaker identity.
   - Keep the current mate as coordinator and preserve cancellation, waiting/resume, authorization, and usage accounting behavior.
   - Treat Chief of Staff as the coordinator entry point, not a separately persisted chat.
3. **Mobile mention picker and participants**
   - Add Chief of Staff and the user's mates to the existing picker; retain apps and Web Search.
   - Use stable mate IDs for routing. Selecting a mate attaches them to the current chat, adds the mention to the pending message, and invokes them when sent.
   - Show attached collaborators unobtrusively in the chat and provide a clear way to remove one.
   - Keep the current chat ID and one-to-one chat navigation unchanged.
4. **Integration, tests, and handoff update**
   - Cover mention selection, persistent attachment, removal, one or multiple collaborators, resume after navigation, and a failed/unavailable mate.
   - Verify a direct chat remains a direct chat, app mentions still work, Web Search still works, and existing group-chat behavior is unchanged.
   - Run `pnpm typecheck && pnpm test`; record manual checks and unresolved issues here.

## Acceptance criteria

- Typing `@` in a direct mate chat offers Chief of Staff, the user's mates, connected apps, and Web Search, filtered by the query.
- Mentioning a mate attaches them to the existing chat and includes the chat context needed for that turn.
- Their reply appears in the same thread with a clear speaker identity; no separate group chat is created.
- The attachment survives leaving and reopening the chat. The mate only contributes when explicitly requested or coordinated by Chief of Staff.
- Removing a collaborator prevents future routing to them without deleting chat history.
- Users cannot attach or invoke another user's mate by crafting an API request.
- Existing group chats and connector mention behavior continue to work.

## Open implementation checks

- Inspect the `group_members` schema and all group-chat queries before deciding whether it can safely represent collaborators on direct chats.
- Confirm the existing relay/resume and cancellation paths can be reused without changing group behavior.
- Decide whether the picker attaches a mate immediately on selection or only when the message is sent. Preferred behavior: attach atomically with message submission so abandoning a draft does not alter the chat.
- Confirm the intended display for collaborators (for example, small avatars with an edit/remove affordance) before polishing the UI.
- Agree with Ken who owns the two backend batches and the database migration, if one is needed.

## Batch 1 implementation notes

- Added `chat_collaborators` rather than overloading `group_members`; direct chats keep `kind: "mate"` and their existing primary `mateId`.
- Added authenticated `PUT /v1/chats/:id/collaborators` with a replacement list (`{ mateIds: string[] }`). An empty list removes all collaborators. The store accepts only an owned mate chat and mate IDs owned by the same Clerk user, and excludes the primary mate.
- The chat list now includes collaborator summaries for mate chats. The mobile `ChatSummary` type accepts this field while remaining compatible with older cached payloads.
- Added Drizzle migration `apps/api/drizzle/0034_quiet_logan.sql` and API route coverage for authentication, malformed IDs, and invalid collaborator results. The picker and orchestration landed in later batches.
- Before running the migration in a deployed environment, coordinate with Ken on who owns applying it. This batch only generates the migration; it does not apply it.

## Batch 2 implementation notes

- A direct mate chat still runs as that mate alone. It uses the group handoff path only when the latest message tags another owned mate, tags `@Chief of Staff`, or resumes a collaboration that was waiting.
- Tagged mates answer in order, with the chat's transcript, then the primary mate brings their answers together. `@Chief of Staff` with no other name plans among mates already attached to that chat.
- Newly tagged mates are attached with `attachCollaborators` (additive, still capped at 19, still excluding the primary and other users' mates). The chat stays `kind: "mate"`.
- `resolvePersona` includes attached collaborators so later turns can see them. They are not asked to reply unless tagged again.

## Batch 3 implementation notes

- The `@` menu in a direct chat offers Chief of Staff and the user's other mates, and still offers connected apps and Web Search. A group chat still offers its members and does not offer Chief of Staff.
- Choosing a mate shows a compact chip with an avatar, name, and remove button. Mate, Chief of Staff, app, and Web Search chips share a strip above the text input, leaving the typing row its full width. Sending adds `@Name{id}` for routing and attaches the mate. Abandoning the draft does not change the chat.
- Attached collaborators render as chips above the composer. Removing one replaces the list with `PUT /v1/chats/:id/collaborators` and rolls the chip back if that request fails.
- After a direct-chat send that contained an `@` mention, the chat list refreshes once that run finishes, so a mate attached by the worker shows up without a second send.
- The send path adds `@Ama{id}` for a picked mate. Routing uses that id. A typed `@Ama` with no id still matches by name, so two mates with the same name stay ambiguous unless the person picked one from the menu. Removing someone uses the id.

## Batch 4 implementation notes

- Direct-chat routing is covered without calling the model: up to three other owned mates, `@Chief of Staff` plus a name, `@Web` and unknown names such as `@Slack` staying out of the roster, and a resume continuing the collaboration only when that run was already waiting on a handoff.
- The mention helper tests cover forming `@Name{id}` for routing, Web Search taking the `@` token out, and refreshing collaborators only after a tagged run finishes.
- Removing a mate marks the row with `removed_at`. A later message that mentions them clears it. Active lists ignore removed rows, and the chat stays `kind: "mate"`.
- A waiting collaborator who is removed still speaks that turn, looked up by the queued id. The primary mate is not substituted. A mate who no longer exists is skipped.
- The attach update only clears `removed_at` when that timestamp is still older than the message. Chip removals are serialized against the cache.
- Checked on 17 Nov 2026 with `pnpm typecheck && pnpm test` from the repo root. Both passed: API 348 tests, mobile 22 tests, decks 12 tests.

## Still open

- Neither migration has been applied. Coordinate with Ken before running them.
- Not exercised on a simulator: open a direct chat, type `@`, send a mention, leave and come back, remove the chip, and confirm a group chat's `@` menu is unchanged.
- A mate who fails mid-relay still stops the mates queued behind them, which is the existing group behavior. Text already produced stays in the thread.
- The product copy does not yet say that a mention shares this conversation with that mate.

## Privacy and safety

- A mention explicitly shares the relevant conversation context with that mate. Make this clear in UI copy before the first collaboration if the existing product copy does not already communicate it.
- Validate collaborator IDs on the server against the current user's mates; never trust client-supplied names or participant lists.
- Keep the complete transcript in the existing chat and avoid duplicating personal conversation content in new history stores.
- Do not let a failed secondary mate call erase a successful response from the current mate or another collaborator.

## Not in scope for this first pass

- Creating a group chat or changing direct-chat identity.
- Automatically asking every attached mate to answer every message.
- Reworking connector authentication or app execution.
- Adding persistent copied transcripts per mate.
