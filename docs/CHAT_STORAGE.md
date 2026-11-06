# Cooper chat storage

Chats are stored in Neon through Clerk-authenticated Hono endpoints. Every query uses the verified Clerk subject; clients cannot select another user. Database credentials stay in apps/api. The mobile client uses the shared Hono API contract.

The `chats` table holds titles, archive status, and timestamps. `chat_messages` holds assistant-ui messages and parent IDs so edit/retry branches can be restored. Repeated saves update the same message rather than duplicating it. Deleting a chat cascades to its messages.

## Local development

Run `pnpm --filter @expojet/api db:migrate` using the API's direct Neon connection. Run `pnpm --filter @expojet/api exec tsx check-chat-storage.ts` to verify storage and ownership against the configured database; it creates and removes a temporary test chat.

The mobile app imports its previous local history once per user. Original local records are retained. Unsynced messages are queued in AsyncStorage and retried when chat history loads or the user taps Retry. Messages must complete their local save before they can be recovered after an app restart. This is not a resumable server generation system: an interrupted model stream does not continue after the app closes.

## API address on a phone

For Expo LAN development, leave `EXPO_PUBLIC_API_URL` blank/unset to use Expo's host address with API port 3000. Phone and laptop must be on the same network, and Windows Firewall must allow the API. Restart Expo after changing the environment file. An explicit URL overrides host detection. Expo tunnel addresses do not expose the separate API.

For production, set `EXPO_PUBLIC_API_URL` to the deployed HTTPS API address. The laptop's IP and hotspot no longer matter.

## Validation

Run `pnpm typecheck` and `pnpm test`. The API tests cover authentication, subject scoping, invalid payloads, missing chats, and backend errors. The live database check additionally covers idempotent saves, restoring messages, ownership isolation, archive, and deletion. Device UI behavior must be checked on a phone separately.
