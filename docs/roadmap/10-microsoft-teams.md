# 10 · Microsoft Teams

## What competitors do
- **Dots:** chat with your dot in Microsoft Teams (and Slack). Business dots can be published to Microsoft Agent 365. ([openai.com/index/introducing-dots](https://openai.com/index/introducing-dots/))
- **Grok Bot:** Team Bots can be invited into Slack and Microsoft Teams. ([paktechstan](https://paktechstan.com/grok-bot-on-mac-can-now-read-and-send-your-messages-search-mail-and-edit-notes))

## How it works for users
It mirrors our Slack feature:
- **Install:** "Add Mates to Teams" from Settings → Apps; an admin may need to approve it.
- **Link:** the user links their Teams account to Mates once.
- **Use it:** @mention a mate in a channel or chat ("@Nova summarise this thread"), or message it directly.
- **What it does:** the mate replies in the thread with an "On it…" message that updates, the same as Slack. Approval cards appear as **Adaptive Cards** with Approve and Decline buttons.

## Architecture
1. **Bot registration:** an **Azure Bot** resource (single-tenant or multi-tenant) plus a Teams app manifest. Teams is a **standard channel**, so there's **no per-message charge**. You pay only for hosting, and we host on our existing API (Railway), so the Azure App Service isn't required. ([Azure pricing](https://azure.microsoft.com/pricing/details/bot-service/), [MS TechCommunity](https://techcommunity.microsoft.com/blog/fasttrackforazureblog/how-much-would-a-bot-cost/3619464))
2. **SDK:** the **Microsoft 365 Agents SDK** (the successor to Bot Framework) for Node, mounted on Hono at `POST /v1/teams/messages`. It verifies Microsoft's JWT on every request.
3. **Reuse the Slack design:** `slack-events.ts` and `slack-delivery.ts` become generic through the channel abstraction (09).
   - `teams_installs` (tenant, serviceUrl) and `teams_links` (aadObjectId → userId);
   - a run per ask; the answer is posted back by editing the activity;
   - a queue when the mate is busy, same as `slackQueue`.
4. **Adaptive Cards** for approvals (01), results and decks (a link to the viewer).
5. **Store listing:** publish to the Teams Store later. To start, distribute the app package as a sideloadable zip for pilot organisations.
6. **Metering:** none beyond runs. Teams messages are free on standard channels.

## Cost
About $0 marginal, plus Azure Bot registration (free tier available). Hosting is on our API.

## Delivery
1. Bot registration, the messages endpoint, linking, direct-message chats.
2. Channel @mentions with threading and Adaptive Card approvals.
3. Teams Store submission.

## Open decisions
- Start single-tenant (per pilot company) or multi-tenant? We recommend multi-tenant with admin consent.
