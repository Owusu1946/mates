# Roadmap: what Dots and Grok Bot have that Mates doesn't

This is researched in November 2026 against OpenAI's **Dots** (launched 29 Sep 2026) and SpaceXAI/Cursor's **Grok Bot** (1.0 in Nov 2026). There is one file per feature, in the order we recommend building them.

Each file covers:
- what competitors do;
- how it should work for Mates;
- the architecture in *our* codebase;
- cost per user and plan gating;
- safety;
- phased delivery;
- the open decisions.

Every feature is designed to be **cost-efficient yet production-ready**:
- reuse what exists (Composio, the usage meter, watches, routines, the voice agent, Trigger.dev);
- pay per use, not per seat;
- ship behind a flag with a shadow or measure period.

| # | Feature | Effort | New native build? | Marginal cost | File |
|---|---|---|---|---|---|
| 01 | Approval rules (act / ask / hand off / block) | S | No | ~$0 | [01-approval-rules.md](01-approval-rules.md) |
| 02 | Phone apps: Reminders, Calendar, Contacts, Home | M | **Yes** | ~$0 (on-device) | [02-phone-apps.md](02-phone-apps.md) |
| 03 | Proactive mode (it notices and offers) | M | No | ~$0.01–0.03 per user per day | [03-proactive-mode.md](03-proactive-mode.md) |
| 04 | The mate's own email address | M | No | ~$0.10 per 1,000 inbound emails | [04-mate-email.md](04-mate-email.md) |
| 05 | Siri, Shortcuts and the share sheet | M | **Yes** | $0 | [05-siri-and-share.md](05-siri-and-share.md) |
| 06 | Skills (teach it once) | S | No | ~$0 | [06-skills.md](06-skills.md) |
| 07 | Import memory from another assistant | S | No | ~$0.002 per import | [07-memory-import.md](07-memory-import.md) |
| 08 | Mates place phone calls | M–L | No | ~$0.04–0.05 per minute | [08-phone-calls.md](08-phone-calls.md) |
| 09 | Text your mate (SMS, WhatsApp, iMessage) | M | No | ~$0.01 per SMS; WhatsApp per template | [09-messaging-channels.md](09-messaging-channels.md) |
| 10 | Microsoft Teams | M | No | ~$15/month hosting (shared) | [10-microsoft-teams.md](10-microsoft-teams.md) |
| 11 | Small touches: threads, reactions, @everyone, voice replies, referral reset | S each | No | ~$0 | [11-small-touches.md](11-small-touches.md) |
| 12 | Image and video generation | M | No | ~$0.02–0.07 per image; ~$0.03–0.08 per video second | [12-image-and-video.md](12-image-and-video.md) |
| 13 | A general, always-on computer | L | No | ~$0.07 per active hour; paused is ~free | [13-cloud-computer.md](13-cloud-computer.md) |
| 14 | Connect your own computer | L | Desktop app | $0 to us | [14-connect-your-computer.md](14-connect-your-computer.md) |

## Why this order
1. **Approval rules come first.** Every later feature acts on its own: watches, proactive mode, email, calls, texting. Users need one place that says what a mate may do unasked. It's also the cheapest to build.
2. **Phone apps, proactive mode and email** are the features people feel daily, and they build on what we have: Composio, watches and the usage meter.
3. **Siri and the share sheet, skills and memory import** are cheap, sticky and low-risk.
4. **Phone calls, texting and Teams** open new channels. Each carries telecom or compliance overhead, so they come after the trust features.
5. **Image and video generation, the cloud computer and the desktop link** are the heaviest builds and costs. They're worth doing once the core is sticky.

## Foundations shared by several features
- **Action policy** (`apps/api/src/action-policy.ts`): every tool call is sorted into read or write today. Item 01 turns that into per-category rules that items 03, 04, 08, 09 and 13 all respect.
- **Usage meter** (`apps/api/src/usage/`): every new cost (search, model, telephony, SMS, sandbox minutes, image generation) goes through `recordUsage` with its own `source`, so it shows up in limits and in the finance views. Add a new `UsageSource` value and a `prices.ts` entry for each one.
- **Watches** (`apps/api/src/watches.ts`): the timer, judgement and "fire once" engine. Proactive mode (03) reuses its judgement and evidence pattern. App events (Composio triggers) feed both.
- **Channels:** Slack already maps a user to a mate chat (`slack.ts`, `slack-events.ts`). Email (04), SMS and WhatsApp (09) and Teams (10) follow the same shape: inbound becomes a run in the mate's chat, and the reply goes back to the channel. Build a small `channels/` abstraction the first time, with item 04.
- **Device bridge:** phone apps (02) and Siri (05) both need the server to ask the phone to do something. One mechanism serves both: a pending "device action" on the run, carried out by the app.
- **Plan gating:** keep per-plan limits in `usage/plans.ts`, next to `WATCH_LIMITS`. Don't spread them across files.

## Out of scope here
Payments (see `docs/plans/in-app-purchases.md`). Meeting production fixes were reported separately and are waiting for go-ahead.
