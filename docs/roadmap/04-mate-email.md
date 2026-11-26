# 04 · The mate's own email address

## What competitors do
- **Grok Bot** (Oct 2026): you ask the bot to claim an address on `mail.grokbot.com`. It's permanent, one per account, and can't be renamed.
  - You can forward newsletters, receipts and invoices to it, or CC it on a thread with an instruction. It replies from its own address.
  - Mail it writes when asked in chat sends after Auto-review; anything a **routine** writes waits as a draft until you press Send. Team admins turn it on.
  - Google has been disabling Gmail accounts *created by* agents, which is why a dedicated domain beats making Gmail accounts.
  - Sources: [Cursor help](https://cursor.com/help/grok-bot/agent-email), [pasqualepillitteri.it](https://pasqualepillitteri.it/en/news/22755/grok-bot-email-address-mail-grokbot)

## How it works for users
- Each mate gets **`nova.k7x2@mates.askorin.app`**: a readable name plus a short random suffix, so strangers can't guess it. It can be renamed once.
- **Use cases:**
  - forward with "handle this";
  - CC the mate to schedule a meeting;
  - receipts and bills tracking;
  - travel confirmations turned into an itinerary and reminders;
  - newsletters turned into a digest;
  - a contact address for vendors and landlords;
  - errands sent as the mate ("ask three caterers for quotes").
- **Default safety:** only email **from the user's own verified addresses** is acted on. Other senders are held in chat ("Email from ama@x.com. Let Nova handle emails from Ama?"). Allowed senders can be managed in Settings.

## Architecture
1. **Domain:** `mates.askorin.app` as a subdomain, so our main domain's reputation stays isolated. Set up MX, SPF, DKIM and DMARC (`p=quarantine`).
2. **Incoming email.** We recommend **Amazon SES inbound** (receipt rule → S3 and SNS → our webhook). It's the cheapest at scale: about **$0.10 per 1,000 emails plus $0.09 per 1,000 incoming 256 KB chunks**. Check AWS's new plan tiers from July 2026. ([AWS SES pricing plans](https://aws.amazon.com/about-aws/whats-new/2026/07/amazon-ses-pricing-plans/), [usecarly](https://www.usecarly.com/blog/amazon-ses-pricing/))
   - **Simplest alternative:** Cloudflare Email Routing plus an **Email Worker**, where inbound routing is free and the Worker POSTs the parsed MIME to us. It's billed on Workers usage, and the limit is 25 MiB per message. ([Cloudflare pricing](https://developers.cloudflare.com/email-service/platform/pricing/))
   - **Postmark inbound:** the nicest developer experience, but only on Pro and above (from about $16.50 per month for 10k emails).
   - **Our pick:** Cloudflare to start (free, minutes to set up), then SES when volume or deliverability needs it.
3. **`POST /v1/email/inbound`** (signed with an HMAC secret shared with the Worker):
   1. Parse with `mailparser`.
   2. Check SPF, DKIM and DMARC results from the headers. Unauthenticated senders claiming to be the user are **dropped**.
   3. Look up the mate and user by local part.
   4. Check the sender against the allowed list.
   5. Store attachments with our existing `attachments` storage (4 MB limit today; larger files are linked or skipped with a note).
   6. Start a **run** in the mate's chat: "Email from X, subject Y: … (attachments)". Origin is `channel`, so approval rules (01) apply, and outgoing mail from a channel defaults to Ask.
4. **Sending as the mate.** We recommend **Amazon SES outbound** (about $0.10 per 1,000) or Cloudflare Email Service when it's GA (3,000 per month included, then about $0.35 per 1,000). Add a tool `mate_email_send { to, subject, body, reply_to_message_id? }` with proper `In-Reply-To` and `References` headers so threads work. Replies come back to the same inbound path.
5. **Threads:** `email_threads` (`mateId, messageId, subject, participants, lastAt`), so a reply from a vendor three days later lands with context.
6. **Abuse limits:**
   - inbound cap per plan (e.g. 50, 200 or 1,000 per day);
   - a spam score threshold (SES gives a verdict);
   - outbound cap of 50 per day per mate, with warm-up;
   - bounce and complaint handling through SES notifications, auto-pausing sending above a 0.3% complaint rate.

## Cost
Effectively **free to $0.20 per 1,000 emails** for the transport. The real cost is the run each email triggers, which is already metered. Usage source: `email`.

## Delivery
1. Domain, inbound (Cloudflare Worker), the webhook, the allow-list, runs in chat. This covers forward-to-handle, receipts, travel and newsletters.
2. Outbound as the mate, threads, CC scheduling, errands.
3. Digest mode for newsletters, using routines or watches.
4. Settings: address, rename, allowed senders, pause.

## Open decisions
- One address per mate, or one per user (Grok Bot does one per account)? We recommend per mate. It's free, and it routes to the right persona.
- Should mail the mate writes from routines and watches wait as drafts, like Grok Bot? Yes, through the approval rules default.
