# Cooper background execution and routines

## What changed

Chat submits an authenticated, idempotent job to Neon. The job and its submission outbox are committed together. Trigger.dev executes the same Cooper agent used for interactive chat, saving progress, tool cards and the assistant message on the server. Losing the phone connection detaches the UI; the explicit Stop action cancels the job.

Routines are drafts until confirmed. Supported frequencies are one time, daily and weekly, with an IANA timezone and a concrete next occurrence. Editing requires renewed confirmation. The minute dispatcher atomically claims a due occurrence and creates its chat, job, message and outbox. Missed recurring times coalesce into one run. Run now has its own idempotency key and does not move the regular schedule.

Feed shows saved results and items needing attention. Notification delivery has its own state and retry path; retrying a notification never reruns the agent. Notification content is generic, with an authenticated result link. Opt-in does not send historical results. Default quiet hours are 22:00–08:00 in the phone's timezone.

External Composio changes pause for an explicit approval card. Approval uses the saved tool call and expires after 30 minutes. Browser changes retain the existing browser approval flow. A confirmed routine grants no permission to send messages, purchase goods, or mutate connected apps. Unknown tool operations also require approval. This classification is conservative, not a complete action-permissions registry.

Search failures are retried briefly and returned to the agent as recovery instructions, rather than displayed as a terminal search error. Cooper must use an available alternate search tool or search the trusted Ghana retailer sites directly; it cannot claim prices or availability without evidence.

## Deployment

Server secrets belong only in `apps/api/.env` and the hosted API/worker environment. Never put provider keys or database URLs in Expo public variables.

From `apps/api`:

```powershell
pnpm db:migrate
pnpm worker:deploy
```

SDK, build extensions and CLI are pinned to 4.7.3. Deployment syncs a whitelist of server credentials. Trigger supplies its own environment key inside hosted workers. The deployed worker has background dispatch enabled. The API should set `COOPER_BACKGROUND_ENABLED=true` only after deployment and the hosted smoke check succeed; restart the API afterwards.

The production API also needs `NODE_ENV=production`, a stable HTTPS URL, exact allowed web origins, and the corresponding `EXPO_PUBLIC_API_URL` in the mobile build. API hosting is still a separate deployment decision. Production rejects the old request-bound chat endpoint.

For local worker development, use a **DEV** Trigger key and `pnpm worker:dev`. The currently supplied production key targets the hosted production worker; do not use it with the development runner.

Workers have one concurrent job per user and eight globally. Agent tasks have one attempt: uncertain external actions are not automatically replayed. Outbox submission and notification delivery can retry independently. A dispatcher surfaces stalled jobs rather than repeating their side effects.

## App checks

| Check | Say or do | Expected behavior |
|---|---|---|
| Normal chat | “Explain what a database index is in three sentences.” | Response streams and remains after reopening the chat. |
| Background research | “Compare three laptops under GH₵8,000 from CompuGhana, Get4Less Ghana and Franko Trading. Include current prices and source links.” Then leave the app. | Worker continues. Reopen the chat or Feed to see saved findings. Unverified listings are not presented as confirmed offers. |
| One-time routine | “In five minutes, explain one useful productivity technique. Send the result here in Cooper. My timezone is Africa/Accra.” | Draft with a concrete next time. It runs only after Confirm. Allow up to one minute of dispatcher delay. Result appears in Feed and a saved chat. |
| Daily routine | “Every day at 8 AM Africa/Accra, summarize my unread Gmail messages here in Cooper.” | Connection card if needed, then a schedule draft. Confirm activates it. Pause stops future claims; Resume calculates the next future occurrence. |
| Weekly routine | “Every Monday at 9 AM Africa/Accra, research three recent AI news stories and summarize them here.” | Weekly draft with Monday and the correct local next date/time. |
| Edit / Run now | Edit the routine in Tasks, confirm its new details, then press Run now. | Editing returns to draft. Run now creates an immediate job without changing the regular next run. History opens its saved result. |
| Approval | “Send an email to [your own address] saying this is a Cooper test.” | An approval card shows the proposed action before the send. Decline prevents it; Approve authorizes the saved call once. Verify actual delivery in your inbox. |
| Stop | Start a long research request, then Stop in chat or its Feed detail. | Cancellation is requested on the server. An already dispatched external action cannot be undone. |
| Notifications | In an installed EAS-enabled build, enable result notifications in Feed and complete a task outside quiet hours. | Generic push opens the authenticated result. Turn off disables this device. Push is unavailable in Expo Go or a build without an EAS project ID. |
| Conditional request | “Check this laptop daily and notify me only when its price drops below GH₵7,000.” | Cooper explains that conditional monitoring is not implemented and asks whether an unconditional check is acceptable. It must not silently schedule a different task. |

## Focused server checks

```powershell
# From the workspace root:
pnpm typecheck
pnpm test

# From apps/api, explicitly uses isolated smoke records in the configured database:
pnpm exec tsx scripts/worker-smoke.ts claim
pnpm exec tsx scripts/worker-smoke.ts hosted
```

The claim check races two dispatchers and verifies one job plus owner isolation. The hosted check executes a harmless no-tools prompt and verifies saved output, events and Feed entry without a connected mobile client. Successful smoke records are removed. Failed records remain for diagnosis, with their routine cancelled.

## Remaining release gates

These changes do not constitute a complete production launch. Deploy the Hono API to a stable HTTPS host, configure the EAS project and native push credentials, build the installed app, and complete the app checks above. Real Gmail/browser actions and device push must be verified on the phone. Conditional monitoring and standing permission for external scheduled delivery are not implemented. Queue duration, quotas, retention and alerting still need release policy decisions.
