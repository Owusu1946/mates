# 09 · Text your mate: SMS, WhatsApp, iMessage

## What competitors do
- **Dots:** message your dot in ChatGPT, Slack and Teams, with **iMessage and RCS** on a waitlist for Pro users. A messaging channel doesn't automatically grant app access. ([learn.chatgpt.com](https://learn.chatgpt.com/docs/dots), [mobilelaby](https://mobilelaby.com/blog-entry-openai-dots-24-hours-working-ai-impressions.html))
- **Grok Bot:** X Chat, @bot on X, and Slack.
- **We have:** Slack (`slack.ts`, `slack-events.ts`).

## Options compared

| Channel | Reach | Cost | Catch |
|---|---|---|---|
| **WhatsApp (Cloud API)** | Huge in Africa, Europe, LatAm | Per-message pricing since Jul 2025, by category and country. User-initiated **service** replies have been free within a 24-hour window, but some sources say they become charged from **1 Oct 2026**. Templates (outside the window) cost per message. ([Sleekflow](https://sleekflow.io/blog/whatsapp-business-price), [eesel](https://www.eesel.ai/blog/whatsapp-business-api-pricing)) | Meta business verification; templates must be approved; rate cards change quarterly |
| **SMS (Twilio or Telnyx)** | Everyone | US about **$0.0083 per segment** plus carrier fees ($0.0035–0.005), a number at $1.15 per month, and **10DLC**: brand $4.50–46 one-time, campaign $15 vetting plus $1.50–10 per month. ([Twilio](https://www.twilio.com/en-us/sms/pricing/us), [Twilio support](https://support.twilio.com/hc/en-us/articles/1260803965530)) | US 10DLC registration takes weeks; international rates vary |
| **iMessage (Sendblue and others)** | iPhone users | Around **$100 per dedicated line per month**; outbound on Enterprise plans. ([getkanal](https://getkanal.com/blog/sendblue-pricing)) | No official Apple API. **Apple Messages for Business forbids bot-only service** (a live agent is required). ([getkanal](https://getkanal.com/blog/apple-messages-for-business)) |
| **RCS** | Android, and iOS 18+ | Through Twilio or Google RBM, priced per message | Agent verification per country |

## Recommendation
1. **WhatsApp first:** the biggest win for our markets.
2. **SMS second,** US and UK, through Telnyx or Twilio. It's useful for alerts and for people without data.
3. **No iMessage** until Apple offers an official route. Sendblue-type services rely on Mac farms, which brings ToS and reliability risk at about $100 per line.

## How it works for users
- **Settings → Channels → WhatsApp → Connect:** a QR code or a wa.me link with a one-time code links the user's number to their account.
- From then on: message the Mates number on WhatsApp. "@Nova …" or a reply picks the mate; by default it goes to the lead mate. Replies come from the same number, prefixed with the mate's name.
- Watches, reminders and urgent proactive items (03) can be **delivered** by WhatsApp or SMS, chosen per notification type.

## Architecture
1. **Channel abstraction (shared with email 04 and Teams 10):** `channels/` with `inbound(provider, payload) → { userId, mateId, text, attachments }` and `send(userId, channel, mateId, text, attachments?)`. Slack moves onto it.
2. **Linking:** `channel_links` (`userId, channel, address (E.164), verifiedAt`), verified with a one-time code sent from the app.
3. **WhatsApp Cloud API** (Meta-hosted; no BSP needed):
   - a webhook `POST /v1/whatsapp` with signature verification (`X-Hub-Signature-256`);
   - text, images and voice notes go through the existing transcription and attachment code;
   - replies inside the 24-hour window are free-form; outside it, use pre-approved **utility templates** ("Your watch fired: {{1}}").
4. **SMS** (Telnyx or Twilio Messaging): webhook in, `send` out, with segment counting. MMS images where supported.
5. **Runs:** inbound starts a run with origin `channel`, so approval rules (01) apply. Long answers are summarised for SMS with a link to the app.
6. **Metering:** `channel` usage = provider cost per message (recorded from the provider's price in the webhook or our price table).
   - **Plan caps:** WhatsApp included on Plus and up within fair use; SMS a monthly allowance (e.g. Plus 100, Pro 300, Max 1,000 segments).

## Delivery
1. Channel abstraction (move Slack onto it) and WhatsApp linking with inbound and outbound.
2. Delivery of notifications over WhatsApp, with templates.
3. SMS (US and UK) with 10DLC registration started early (it takes weeks).

## Open decisions
- One shared Mates number, or a number per user? We recommend shared: far cheaper, with linking by sender number.
- Which countries for SMS at launch?
