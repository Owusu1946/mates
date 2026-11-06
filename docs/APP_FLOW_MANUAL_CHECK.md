# Cooper app flow: phone checks

Restart `pnpm dev`, reload Expo Go, and start a new chat. Keep the phone and laptop on the same network. These are manual checks; automated typechecks do not verify phone OAuth or provider permissions.

| Check | Say or do | Expected behavior |
| --- | --- | --- |
| Normal conversation | “Help me plan a productive morning.” | A normal chat answer. No app connection or result cards. |
| Named app | “Check Gmail for my five most recent unread emails.” | A small status line, then Gmail results. If Gmail is disconnected, first show a Gmail connection card explaining why access is needed. |
| Connection and continuation | Connect from that card and return to Cooper. | Continue the original request without typing it again. Show email subject, sender/time when supplied by Gmail, preview and an Open email action. |
| Cancel authorization | Ask for an app you have not connected; tap Connect and cancel on the authorization page. | Keep the request in the conversation, explain cancellation and let you connect again. No endless spinner. |
| Choose an app | “I want to check unread email. Let me choose between Gmail and Outlook first.” | One question with app options and logos. Select one; use that app, connect if necessary, and continue the saved request. |
| Multiple accounts | If you have two active accounts for the same app, ask Cooper to check that app. | Ask which account to use before reading data. Labels use Composio account aliases when available, otherwise account labels and connection dates. Use the selected account for this task. |
| X results | “Using X, compare my five most-liked posts from my last 20 posts. Tell me if you could only check a smaller sample.” | Connect X if needed. Return post previews, available engagement counts and View post actions. State sampling or provider permission limitations honestly. Do not claim an all-time ranking from a sample. |
| Empty results | “Search Gmail for subject cooper-test-no-match-927461.” | A verified Nothing found state and a useful follow-up. An error must not be shown as an empty inbox. |
| Follow-up action | Tap a suggestion below the results. | Put the suggested prompt into the composer. Review or edit it, then send. Tapping a suggestion alone does not run a tool or send an email. |
| Result links | Tap Open email or View post. | Open the corresponding provider page on the phone. Provider login may be required. |
| Reconnection | Disconnect an app in Apps, then ask for it again. | Ask to reconnect instead of pretending it can still read the app. Continue after reconnecting. |
| Stop a request | Stop while a lookup is running. | Stop generating; show an interrupted/error state rather than an endless progress indicator. |

Use Gmail plus one other app for the first pass. If a provider refuses access, note the exact error and the app/account used. Do not treat a Composio catalog listing as proof that your account has permissions for every operation.

The flow uses the existing Clerk identity, server-only Composio key and Neon saved run history. Choice submissions are checked against the saved options and active accounts belonging to that user. Results use IDs from successful tool responses; invented result IDs and unsupported links are rejected or removed. Generic app result layouts depend on the fields returned by the provider; email and post previews have dedicated link behavior.
