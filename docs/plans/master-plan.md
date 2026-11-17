# Mates master plan: launching as the best personal AI team

**Date:** 17 November 2026. **For:** Ken, Sammy and anyone building Mates.

**Built on:**
- [product-improvement-proposal.md](product-improvement-proposal.md);
- the Dots and Grok Bot gap roadmap (`docs/roadmap/` on the `docs/roadmap` branch);
- fresh research on the market, Ghana and the platforms we depend on (sources at the end).

This plan keeps what those two documents got right. It corrects them where the facts have moved, and puts everything in one order of work.

---

## 1. The short version

Every big lab now ships a personal agent:
- OpenAI's **Dots**;
- xAI's **Grok Bot**;
- Meta's **Muse**;
- Google's **Gemini Spark / Tasks**;
- Anthropic's **Claude Duet**.

They have converged on the same parts: a cloud computer, app connectors, memory, approvals and "proactive" check-ins. **None of them is built for, or even available in, most of Africa.** Muse is in five countries. Duet is US-only. Gemini's agent excludes Nigeria by name. Dots excludes the UK and EEA. ([Built with Muse](https://builtwithmuse.com/blog/muse-available-countries), [AideDex](https://aidedex.com/availability/nigeria), [Google](https://support.google.com/gemini/answer/17171264))

Mates already does things they don't:
- **a crew of named specialists** who work together, not one agent;
- **a mate that speaks in your meetings**, where Grok Bot only types in the chat;
- **voice calls with several mates at once**;
- **memory you can see and edit, per mate**, where Dots can't delete a single memory;
- **ride and trotro prices in cedis.**

**The plan:** launch as *the AI team that knows your life and gets real things done in Ghana*, with three promises no competitor keeps today:
1. **It speaks up only when it matters, and never leaves you hanging.**
2. **It asks once, then remembers what you allowed.**
3. **It handles life here:** bills, MoMo, light, transport, calls and your language.

Then expand to the rest of Africa from a base nobody else has.

**What must happen before launch** (section 7) comes down to five things:
1. Make the app solid (crashes, memory, observability).
2. Ship Android, because Ghana's money flows there.
3. Turn on what's built but dark.
4. Build three Ghana superpowers:
   - **bills and airtime with MoMo**;
   - **power-cut alerts**;
   - **mates that call local businesses.**
5. Fix how Ghanaians pay us.

---

## 2. The market in November 2026

### The field

| Agent | Price | Where | Standout | Weakness users report |
|---|---|---|---|---|
| **OpenAI Dots** | Inside ChatGPT Pro, $100–500/mo | Not in the UK, EEA or Switzerland on Pro | Own cloud computer, 4,000+ apps, Slack and Teams, read-only "proactive research" | One dot per account; asks for approval again and again ("my biggest gripe"); you can't view or delete individual memories; $100 minimum ([Zen Aegis](https://zenaegis.com/openai-dots-review/), [eesel](https://www.eesel.ai/blog/openai-dots-review)) |
| **Grok Bot 1.0** | $30 / $100 / $200 | No country list | Several bots that share one computer; Team Bots in Slack and Teams; joins Meet, Zoom and Teams calls (**chat only**) | Weekly limits hit 100% overnight on 1 Nov; check-ins can only be switched off through support; meetings are text-only ([xAI](https://x.ai/news/grok-bot-1-0), [CellCog](https://cellcog.ai/blog/grok-bot-1-0/), [Pillitteri](https://pasqualepillitteri.it/en/news/32587/grok-bot-1-0-shared-bots-slack-teams-meetings)) |
| **Meta Muse** | Free; $20; $100 | US, Canada, Japan, Singapore, Mexico | Free; in WhatsApp; fast (about 7 s replies); a separate "Sentinel" agent approves every outbound action; one-time Stripe Link cards for purchases | Trust in Meta; not in Africa, including inside WhatsApp ([Meta research](https://research.meta.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse)) |
| **Claude Duet** | Claude Pro and up | US waitlist | Excellent onboarding; proactive nudges that catch real problems | Slow follow-through; goes quiet, so tasks are forgotten ([ChatPRD](https://www.chatprd.ai/how-i-ai/claude-duet-review), [AI Maker](https://aimaker.substack.com/p/claude-duet-review-and-use-cases)) |
| **Gemini Spark / Tasks** | $19.99 (AI Pro) | 160+ countries, **not Nigeria** | Deep Gmail, Docs and Drive; up to 15 scheduled tasks | Google-only world |
| **Instinct** | Free beta, invite-only | — | Most proactive; texts like a human; places calls; your agent coordinates with friends' agents | Acts when you only asked (one user lost $200 on an unwanted booking); weak privacy ([The AI Future](https://the-ai-future.com/reviews/instinct-ai)) |
| **Poke** | Free; $19; $199 | Worldwide | Texting interface, one-minute setup | About 30% of proactive pings are noise; date and time-zone errors ([Saner](https://blog.saner.ai/poke-reviews)) |

### What this tells us
1. **The building blocks are table stakes.** A cloud computer, connectors, approvals, memory and scheduled work are expected. Nobody wins on having them, only on how well they work.
2. **Users love three things:**
   - proactivity that catches a real problem ("it flagged a show on the wrong day");
   - a personality that feels human;
   - speed.
3. **Users hate five things:**
   - an agent that **acts when you only asked**;
   - **re-asking** for permission it already has;
   - **noise**;
   - **going quiet** and leaving tasks open;
   - **surprise limits**.
4. **Trust is the market.** Accuracy (45%), trust (40%) and privacy (36%) now beat ease of use (32%) when people pick an AI tool ([Menlo](https://menlovc.com/perspective/2026-the-state-of-consumer-ai)). In a 12-country survey, only 5% of people are comfortable with AI acting even *with* approval; 42% cap agent spending at $100 or less ([Ping Identity](https://press.pingidentity.com/2026-10-06-Ping-Identity-Survey-Finds-AI-Trust-Changes-When-Assistance-Turns-to-Action)). People in high-growth markets such as India (70%) are far more willing to delegate than Europeans (about 20%).
5. **Retention is the hard part.**
   - AI apps keep about 6% of users on day 1 and **0.7% on day 30**.
   - Paid AI subscriptions churn 30% faster than non-AI ones.
   - The products that hold users have **memory that compounds** and **a recurring job**, and bring people back within 48 hours.

   ([Adjust](https://www.adjust.com/blog/ai-app-trends-2026), [RevenueCat](https://www.revenuecat.com/state-of-subscription-apps))
6. **Nobody serves Africa.** That's a moat only if we're genuinely better at life here, not just present.

---

## 3. Where Mates stands

### Where we already lead
| Mates has | Competitors |
|---|---|
| **A crew:** a lead mate plus specialists, groups, missions with a work board, mates checking with each other, and collaborators in direct chats (PR #95) | Dots: one agent. Grok Bot: several bots, mostly for teams. Muse and Duet: one agent |
| **Mates speak in meetings**, with a voice and an animated face (Recall.ai plus our voice agent) | Grok Bot joins only through the meeting chat |
| **Voice calls with up to four mates**, each with its own voice | Dots can be called but can't call you; others are mostly text |
| **Memory you control:** a bio, shared memories and per-mate notes, viewable, editable and deletable | Dots: no per-memory delete. Muse: one editable "soul" file |
| **Ghana-native rides:** Yango, Bolt and Uber prices plus trotro routes in cedis (Sail) | Nobody |
| **Decks, code PRs (Pro and Max), watches, routines, reminders, browser with handoff, Slack, 1,000+ apps (Composio), web research** | Comparable at the top end |
| **Price:** from $8/month | $20–$100+ |

### Where we trail, from the gap roadmap and confirmed by research
- Proactive mode is built (habits, nudges, meeting prep) but **switched off**. PR #97 fixes the worker flag.
- There are no fine-grained approval rules.
- There's no mate email address.
- There's no share sheet or Siri integration.
- There are no skills.
- There's no memory import.
- **There are no outbound calls to businesses.**
- There are no messaging channels beyond Slack.
- There are no image generation, persistent computer or desktop link.

### Corrections to the gap roadmap
1. **WhatsApp can't be our channel in Ghana.**
   - Since 15 January 2026, Meta's WhatsApp Business terms (section 4.7) bar general-purpose AI assistants everywhere except the EEA, Brazil and Türkiye. ChatGPT, Copilot and Perplexity left WhatsApp because of it.
   - Business bots serving their own customers are still allowed; a general assistant like Mates is not.
   - Roadmap item 09 ("WhatsApp first") is therefore **off** for Africa. See section 5D for what replaces it.
   - ([Meta terms](https://www.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform), [Meta AI-provider page](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers), [whasp.ai](https://whasp.ai/blog/whatsapp-ai-chatbot-ban-2026))
2. **iPhone users in Ghana mostly can't pay us through Apple.**
   - Apple accepts only cards in Ghana: no MTN MoMo or Telecel Cash, and no Apple Pay.
   - Ghana is billed in US dollars, which local bank cards usually block.
   - **Google Play does take MTN MoMo and Telecel Cash.**
   - The free-trial plan (Apple, Starter) will convert badly in Ghana unless we add other ways to pay. See section 6.
   - ([EverTry](https://evertry.co/blog/how-to-pay-for-apple-subscriptions-in-ghana), [Apple](https://support.apple.com/en-us/111741), [Google Play Ghana](https://support.google.com/googleplay/answer/2651410?co=GENIE.CountryCode%3DGH))
3. **Our launch films show a feature we don't have.** The "they'll make the call for you" scene shows a mate phoning a restaurant, but Mates' calls today are calls *with* your mates, not to businesses. We either build outbound calling before launch (section 5C, recommended) or recut that scene.
4. **Siri is now a real distribution channel.**
   - On 3 November 2026 Apple opened **Siri AI** to every developer through App Intents, including custom "tool" intents and multi-turn follow-ups.
   - App Store submissions open in the spring.
   - Roadmap item 05 moves from "nice to have" to a planned channel.
   - ([Apple](https://developer.apple.com/news/?id=gdk2umrf), [docs](https://developer.apple.com/documentation/appintents/siri-ai-developer-preview))

### Known problems to fix before launch, from recent work
| Problem | Status |
|---|---|
| Routines screen closes the app on an iPhone 13; probably a memory kill (no crash log) | PR #98 freezes hidden screens; needs a device check |
| Long chats jump while scrolling | PR #96 |
| Sentry probably isn't in TestFlight builds (DSN only in local `.env`), so crashes and memory kills go unseen | Add `EXPO_PUBLIC_SENTRY_DSN` to EAS production env |
| Habits and rides switched off in the worker | PR #97 and `RIDES_ENABLED`; deploy |
| Feedback 👍/👎 buttons do nothing | Not started |
| Camera preview flashes white | Not started |
| Paywall, free trial and usage enforcement (issue #82) | Sammy's handoff |
| Registration with Ghana's Data Protection Commission (Act 843, s. 27; enforcement spot checks began 5 Oct 2026) | Not done ([DPC](https://dpc.gov.gh/registration)) |

---

## 4. Positioning and product principles

**Line:** *Mates. Your crew. Always on it.*
**Promise:** a team of AI mates who know your life, do the work across your apps and your city, and only bother you when it matters.

### Seven principles
Every feature below is checked against these.
1. **Speak only when it matters.** Each mate has a daily *noise budget*:
   - at most one unprompted push a day, plus time-critical alerts;
   - everything else waits for the morning brief.

   We measure what share of proactive items get tapped and keep it high, or turn the volume down by ourselves.
2. **Never act on a question.** A question gets an answer and an offer ("Want me to book it?"), never an action. This is a written evaluation in our test suite, because it's the costliest mistake in the category.
3. **Ask once, remember the permission.**
   - Approvals are *grants*: once, for this task, for this person or app, for a period, or always (Muse's model).
   - Once given, a grant is never asked for again.
4. **Never leave a task hanging.** Every task ends in one of three ways:
   - **done**, with a receipt;
   - **blocked**, with a push saying exactly what's needed;
   - **failed**, with an honest reason.

   No silent open threads (Duet's flaw).
5. **Honest receipts.**
   - "Did 4 things", with logos, links and **Undo** where possible.
   - Never claim success that didn't happen.
   - One place shows everything mates did.
6. **Local by default.**
   - Cedis.
   - Ghanaian places, services and phone formats.
   - Twi, Ga, Ewe and Pidgin understood.
   - Low data and patchy networks handled.
7. **Fast.** The first visible response arrives within a second (a shimmer status line), with a useful answer in seconds. Long work moves to the background and reports back.

---

## 5. The feature plan

Each feature has a priority:
- **L** = needed for launch;
- **L+30** / **L+90** = days after launch;
- **Later**.

Effort is **S** (days), **M** (1–2 weeks) or **L** (3+ weeks). Costs come from the gap roadmap or vendor pages.

### A. Trust and control
"Why should I let it act for me?"

| # | Feature | What it does | Why it wins | Effort | Priority |
|---|---|---|---|---|---|
| A1 | **Permission grants** (replaces roadmap 01's four-way rules) | Keep today's default: a mate acts when *you asked in chat*. Actions started by watches, routines or proactive items, and anything in the always-ask categories (spending, sharing outside, deleting, calling or texting someone new), show a card with **Allow once · For this task · Always for this person/app · Not now**. Grants are stored and matched exactly | Fixes Dots' and Grok's re-asking complaint and matches Muse's model. Gives the 95% of people uncomfortable with autonomy a gentle start | M | **L** |
| A2 | **"What mates did"** | One screen with every action, filterable by mate and app, each row with **Undo** where we stored an inverse (`undo.ts` exists) | Visible accountability; answers "who is responsible?" (26% of people's worry) | M | **L** |
| A3 | **Memory you own** | "What do you know about me?" works everywhere, and every memory shows where it came from. **Import** from ChatGPT, Claude or Gemini (roadmap 07, about $0.002 each). **Export** everything | We already lead; import removes the switching cost on day one | S | **L** (import, export) |
| A4 | **Quiet hours and the noise budget** | Per mate: quiet hours, a daily push cap, "only urgent" mode | Principle 1. Grok Bot users have to contact support to stop check-ins; ours are a switch | S | **L** |
| A5 | **Privacy pledge** | Plain-language page: we don't sell data, don't train on your conversations, delete on request, and are registered with Ghana's Data Protection Commission | 48% would share more with a "no training" guarantee ([Proton](http://proton.me/blog/ai-chatbot-survey)); also a legal duty | S | **L** |
| A6 | **Outbound check** (a light version of Muse's Sentinel) | Before any send, share or payment, a cheap separate model checks: does this match what was asked, is the recipient new, does it carry secrets or sensitive data? A failure becomes "ask" | Defence against prompt injection and mistakes. About $0.0005 per consequential action | M | L+30 |

### B. A proactive mate that knows when to speak
"It caught that before I did."

| # | Feature | What it does | Why it wins | Effort | Priority |
|---|---|---|---|---|---|
| B1 | **Turn on habits, nudges and meeting prep** | Already built (PR #73), switched off until now. PR #97 sends the flag to the worker | "What I've noticed" is a differentiator that's ready today | S | **L** |
| B2 | **Morning brief, done properly** | One message at the user's chosen time: today's calendar, emails that need you, weather, **power-cut windows for your area (C2)**, commute time and price (Sail), bills due, and open tasks waiting on you. Plain text, under 10 lines, every line actionable | The most-loved proactive feature across Instinct, Duet and Poke reviews; the daily return trigger retention depends on | M | **L** |
| B3 | **The return trip** | When background work finishes, is blocked or needs a decision, send *one* specific push ("Esi needs your OK to send the invoice") that opens straight to the card. Blocked tasks get a gentle reminder after a few hours, then a note in the brief | Fixes Duet's biggest flaw; principle 4 | S | **L** |
| B4 | **Proactive restraint evaluation** | Automated tests of questions that must *not* trigger actions ("is that restaurant good?", "how much is a flight to Kumasi?") plus over-eager follow-ups. Runs in CI on prompt changes | Avoids Instinct's $200 mistake | S | **L** |
| B5 | **Proactive from connected apps** (roadmap 03) | Read-only sweep of Gmail, Calendar and Slack changes, at most 5 items a day, "not useful" teaches it. About $0.02 per user per day | Matches Dots' proactive research, with our noise budget | M | L+30 (Plus and up) |
| B6 | **Tasks with states**, from the proposal | "Turn this into a plan" makes tasks with owner (you or a mate), due date and state (planned, waiting for you, in progress, blocked, done). Mates follow up on stuck ones | The proposal's top priority; extends missions and routines into everyday life | M | L+30 |

### C. Gets real things done in Ghana
This is the moat.

| # | Feature | What it does | How | Effort | Priority |
|---|---|---|---|---|---|
| C1 | **Pay bills, buy airtime and data, with MoMo** | "Buy GH¢50 of ECG for the house", "Get Mum 5GB on MTN", "Pay the DStv". The mate looks up the meter or account (showing the name on it), then sends a **MoMo payment prompt to your phone**. You approve with your PIN, and it pays and gives you the token or receipt | **Hubtel**: Direct Receive Money to collect (the customer approves on their phone), Commission Services to pay ECG prepaid and postpaid, Ghana Water, airtime and data on all networks, and DStv, GOtv and StarTimes, plus refunds and a status API. We **earn commission** on each payment. The PIN prompt is a built-in, regulator-grade approval ([Hubtel docs](https://code.hubtel.com/docs/api)) | L | **L** (Ghana) |
| C2 | **Light-off alerts (dumsor)** | "Light goes off in East Legon 6pm–midnight tonight", in the morning brief and as a heads-up an hour before. "Is there light at the house?" uses crowd reports | Parse ECG's published load-management notices (as Odumsor and the 3News tool already do), plus crowd reports from Mates users who opt in. 2,500+ areas indexed publicly ([Odumsor](https://odumsor.com/about), [3News](https://3news.com/tools/dumsor)) | M | **L** |
| C3 | **Mates call businesses for you** (roadmap 08, Ghana-first) | "Call Chez Afrique, book 4 at 8". The card shows the number and what it will say, you tap Call, it states it's an AI assistant, and you get a live transcript, listen-in and take-over, then the outcome. Blocked: emergency, premium-rate and personal numbers you didn't give it | LiveKit SIP outbound trunk plus our existing voice agent in an outbound mode. **Ghana numbers are available from Telnyx (from $30/month)**, with voice from about $0.002/min plus trunk. US and UK business numbers too. Matches what the launch film promises | M–L | **L** |
| C4 | **Speak Twi, Ga, Ewe, Fante, Hausa, Pidgin** | Dictation and voice calls understand local languages and code-switching; mates can reply in Twi by voice | **Khaya** (GhanaNLP/Algorine): speech recognition and text-to-speech in 32 African languages, API from $14.95/month, Enterprise $749/month for 200k calls. Abena AI for Twi-English code-switching. Run language ID first. Whisper and the big chat models don't list Twi ([Khaya](https://www.khaya.ai/features/automatic-speech-recognition), [TechTrendi](https://techtrendi.com/blog/ai-twi-ga-ewe-ghana-language-tools-guide)) | M | **L** (Twi input); L+30 (voice replies) |
| C5 | **Rides, end to end** | Today: compare Yango, Bolt, Uber and trotro. Add: "Open in Yango with this pickup" deep links, and **commute in the brief** ("Leave by 7:10; Bolt is GH¢38 now") | Sail plus deep links | S | **L** |
| C6 | **Government errands, guided** | "Renew my passport": steps, fees (GH¢350 regular, GH¢700 expedited, GH¢2,000 premium), nearest centre, document checklist, reminders, and form-filling with the browser where allowed. The same for DVLA, Ghana Card and GRA | A Ghana knowledge pack (skills, roadmap 06) plus browser handoff for logins ([passport portal](https://passport.mfa.gov.gh/)) | M | L+30 |
| C7 | **Local knowledge, cedis everywhere** | Prices in GH¢, Ghanaian phone formats, local places (Places API), school terms and holidays, Akan day names | Shared prompt pack and checks | S | **L** |
| C8 | **Low-data mode** | Compress images, text-first cards, defer media, send voice as Opus; works on a weak network with retries and offline drafts sent when back online | Data is cheap per GB in Ghana ($0.40) but a 5GB bundle is still 3% of monthly income ([ITU via Ecofin](https://www.ecofinagency.com/news-digital/0709-58677-ghana-plans-rural-4g-expansion-but-usage-barriers-remain)) | M | L+30 |
| C9 | **Send money home, and to others** | "Send GH¢200 to Kojo's MoMo", with the registered name shown before you confirm (Hubtel verification) | Hubtel payouts. Highest-risk category: always ask, with a daily cap | M | L+90 (after C1 proves the flow) |

### D. Everywhere you are
Replacing "WhatsApp first".

| # | Feature | What it does | How | Effort | Priority |
|---|---|---|---|---|---|
| D1 | **Android app** | Same app, Play Store | Expo already builds Android; needs QA, Android-specific UI passes, and **Google Play Billing with MTN MoMo and Telecel Cash**. 70% of Ghana's mobile web is Android ([StatCounter via Marketing Parasite](https://marketingparasite.com/blog/ghana-digital-marketing-statistics/)) | M | **L** |
| D2 | **Call your mate from any phone** | A Ghana number (+233) you can dial from a basic phone, in English or Twi. Your mate answers by caller ID and can do anything a voice call can | Same telephony as C3, inbound. About half of Ghanaian adults don't use a smartphone as their main phone ([Findex via MediaWura](https://mediawura.com/blog/ghana-digital-marketing-statistics)), so this reaches them | S once C3 exists | L+30 |
| D3 | **SMS** | Alerts (light-off, bills due, task blocked) and replies by text when you have no data | Hubtel SMS (a local, cheap sender ID). Not a full chat at first: alerts and short replies | S | L+30 |
| D4 | **Siri AI and Shortcuts** (roadmap 05, upgraded) | "Hey Siri, ask Kwabena to pay the light bill", with multi-turn follow-ups; Mates actions in Shortcuts and Spotlight | App Intents `@AppIntent(.tool)`. Developer Preview now; App Store submission opens in spring 2027 | M | **Build now, ship spring** |
| D5 | **Share sheet** | Share a link, photo, PDF or voice note from any app to a mate, with a note | `expo-apple-targets` share extension; Android `ACTION_SEND` | M | L+30 |
| D6 | **The mate's own email** (roadmap 04) | `kwabena.k7x2@mates.askorin.app`: forward receipts, bills and travel; CC it to schedule | Cloudflare Email Routing to start (free), SES later | M | L+30 |
| D7 | **Telegram** | Chat with your mates in Telegram | Telegram allows AI bots. Cheap; small audience in Ghana, so a low priority | S | L+90 |
| D8 | **WhatsApp** | Only for users with EEA, Brazil or Türkiye numbers, if that ever matters (diaspora) | Meta's terms | — | Not planned |
| D9 | Teams (roadmap 10), desktop link (14) | As in the roadmap | | M / L | Later |

### E. The crew
What nobody else has: double down on it.

| # | Feature | What it does | Effort | Priority |
|---|---|---|---|---|
| E1 | **Ask my mates** | Bring any mate into any chat (PR #95). Show each mate's role, recommendation and **where they disagree**, from the proposal's top three | S (on top of #95) | **L** |
| E2 | **Family and household mates** | Share a mate with family: one "House" mate that knows the meter number, school fees dates, Mum's medication schedule and the house help's days; everyone can ask it, and it reminds the right person. Strong fit with how Ghanaian families already coordinate (and Grok Bot's Team Bots, but for homes) | L | L+90 |
| E3 | **Mates that talk to friends' mates** | "Find a time with Ama for lunch": your mate and Ama's mate agree on a slot, only with people you've approved. Instinct's most viral feature (300,000+ coordinations) | M | L+90 |
| E4 | **Skills: teach it once** (roadmap 06) | "Save how I do invoices." Shared across mates, editable, with starter skills for Ghana | S | L+30 |
| E5 | **Meetings that speak, polished** | Already unique. Add: pre-meeting brief, live answers in voice, and follow-up actions done after the call | S | **L** (polish) |

### F. Make and build

| # | Feature | Status | Priority |
|---|---|---|---|
| F1 | Decks (PPTX), code and PRs (Pro and Max) | Shipped; short branch names in PR #99 | — |
| F2 | Images: make and edit (roadmap 12); needs object storage first | Not started; about $0.04 per image | L+90 |
| F3 | Pages: shareable docs a mate keeps updated (Grok Bot's Pages) | Not started | Later |
| F4 | Persistent cloud computer (roadmap 13) | Not started; about $0.17 per running hour | Later |

---

## 6. Money: pricing and payments that work in Ghana

### The problem
- **iPhone users in Ghana mostly can't pay through Apple:** cards only, billed in USD.
- **Android users can pay** with MTN MoMo or Telecel Cash through Google Play.
- **Tax:** from 15 October 2026 Ghana collects 20% real-time VAT on foreign digital services paid with Ghanaian cards or MoMo, so a foreign-billed $8 becomes about $9.60 ([BizStack Africa](https://bizstackafrica.com/guides/pay-for-software-ghana-mtn-momo)).

### The plan
1. **Android with Google Play Billing (MoMo).** This is the main route for Ghanaian subscribers.
2. **Web checkout with MoMo for everyone,** through Hubtel or Paystack (both take MTN, Telecel and AT):
   - A plan bought on the web works in the iPhone app after sign-in. That's allowed for multi-platform services, as long as the iOS app doesn't point people to the web to pay.
   - Promote the web checkout outside the app: site, SMS, social.
   - Keep Apple's in-app purchase for people with working cards.
3. **Local prices in cedis,** set for Ghana, not converted from dollars. One option is a **Starter in the GH¢ 30–60/month range** with weekly limits, so the entry price matches a data bundle. Plus, Pro and Max stay priced for professionals.
4. **A free tier sized to bring people back daily.** Muse is free and will reach Africa eventually.
   - Morning brief, light-off alerts and a small daily chat allowance are free.
   - Actions, calls, meetings and coding are paid.
5. **Commission on payments (C1)** is a second revenue line that grows with usage, not seats.
6. **Billing entity:** billing Ghanaian users through a Ghanaian entity (Orin) avoids the foreign-service VAT surcharge and makes MoMo direct debit and recurring invoices possible (Hubtel Recurring Invoice and Direct Debit).

   Decision for Ken, with an accountant.

---

## 7. The order of work

### Phase 0: launch-ready (about 6 weeks)
In order, highest value per day first.

**Week 1–2: solid ground**
1. Merge and verify PRs #95–#99. Run migrations 0034 and 0035 before #95's API deploys.
2. Sentry in EAS builds, with memory-kill (watchdog) tracking. Confirm the Routines crash is gone on an iPhone 13.
3. Turn on habits and rides (`HABITS_ENABLED`, `RIDES_ENABLED`) on the API and worker.
4. Feedback buttons that work: 👍 saves; 👎 opens a short sheet, saved for review. Fix the camera flash.
5. Register with the Data Protection Commission. Publish the privacy pledge (A5).

**Week 2–4: trust and daily habit**

6. Permission grants (A1) and "What mates did" (A2).
7. Morning brief v2 (B2), the return trip (B3), quiet hours and noise budget (A4), and restraint tests (B4).
8. Memory import and export (A3).

**Week 3–6: Ghana superpowers and reach**

9. Light-off alerts (C2) in the brief.
10. Bills, airtime and data with MoMo through Hubtel (C1): ECG prepaid first, then airtime and data, then water and TV.
11. Outbound calls to businesses (C3): Ghana and US numbers, with approval card, live transcript and outcome.
12. Twi dictation through Khaya (C4); cedis and local pack (C7); ride deep links (C5).
13. Android release with Play Billing (D1). Web MoMo checkout (section 6).
14. Paywall and trial (Sammy's handoff), adjusted for the payment plan above.

**Launch gate.** Don't launch until all of these hold:
- **Crash-free sessions** of 99.5% or more, with no memory kills on a 4 GB iPhone.
- **Speed:** median time to the first visible response under 1 second; median simple answer under 6 seconds.
- **Restraint:** 0 failures in the restraint suite.
- **Real-life errands:** the 30 most common Ghana errands pass (on-device script: "buy ECG", "airtime to Mum", "cheapest way to Circle", "book a table by phone", "light schedule tomorrow"…).
- **Proactive taps:** over 40% of proactive items tapped in an internal two-week dogfood.

### Phase 1: launch + 30 days
- Proactive from apps (B5).
- Tasks with states (B6).
- Government errands (C6).
- Low-data mode (C8).
- Call your mate from any phone (D2).
- SMS alerts (D3).
- Share sheet (D5).
- Mate email (D6).
- Skills (E4).
- Outbound check (A6).
- Twi voice replies.

### Phase 2: launch + 90 days
- Send money (C9).
- Family mates (E2).
- Mates that talk to friends' mates (E3).
- Images (F2).
- Telegram (D7).
- First country after Ghana: **Nigeria or Kenya**, picked on payments (Paystack covers both) and rides coverage.

### Phase 3: later
- Siri AI ships when the App Store opens to it (spring).
- Persistent cloud computer (F4).
- Desktop link.
- Teams.
- Pages.
- Phone apps (roadmap 02: Reminders, Calendar, Contacts, Home).

---

## 8. What we deliberately won't do
- **Compete on raw autonomy.** We won't let mates spend or send unasked to look impressive. Every survey says trust is the market.
- **WhatsApp outside the markets Meta allows.** It's against Meta's terms and would get the number banned.
- **iMessage through Mac farms** (Sendblue and similar). No official API, ToS risk, about $100 per line.
- **Ads in conversations.** It kills trust.
- **A feature-for-feature race with Dots** on the cloud computer and desktop control before the everyday things are excellent.

---

## 9. Risks and how we handle them

| Risk | Mitigation |
|---|---|
| Muse launches in Ghana (free, inside WhatsApp) | Go deeper on local actions (bills, MoMo, light, calls, Twi), which Muse doesn't do. Ship a free tier. Make the crew the identity |
| MoMo payment failures and reversals (timeouts, pending callbacks) | Hubtel status checks and refunds; idempotent orders; "pending" shown honestly; daily caps; reconciliation job |
| Regulation: payments and data | Use only payment providers on the Bank of Ghana's licensed list (check Hubtel and Paystack against it before signing); DPC registration; watch the Data Protection Bill 2025 (automated decisions must be explainable and contestable) |
| AI phone calls misused | Always disclose; approval per call; blocked categories; per-day caps; a call log; business-number checks |
| Model and telephony costs eat margin | Usage meter already in place; cheap models for sweeps and checks; cap minutes per plan; commission revenue offsets |
| Local-language quality | Language ID first; confirm intent in English when confidence is low; never act on low-confidence transcripts |
| Noise drives people away | Noise budget, per-item feedback, auto-quieting when taps drop |
| Not enough engineers for all of this | Section 7 is sequenced so each step ships alone; cut from the bottom of each phase, never the launch gate |

---

## 10. How we'll know it's working

| Metric | Target at 90 days |
|---|---|
| Day-30 retention (all signups) | ≥ 15% (category median is far lower) |
| Daily brief open rate | ≥ 45% |
| Proactive item tap rate | ≥ 40% |
| Conversations that end in a completed action | ≥ 30% |
| Action success rate (done, not failed or abandoned) | ≥ 95% |
| Unwanted-action reports | < 1 per 1,000 actions |
| Bill payments per paying user per month (Ghana) | ≥ 2 |
| Paid conversion (trial to paid), Ghana | ≥ 8% via MoMo routes |
| Crash-free sessions | ≥ 99.5% |

Use these to improve usefulness, not to push automation people didn't ask for (the proposal's rule, and a good one).

---

## 11. Decisions needed from Ken
1. **Outbound calls before launch,** or recut the film's call scene? *Recommend: build (C3).*
2. **Hubtel or Paystack** for MoMo collections and bill payments? *Recommend: Hubtel*, for bills, airtime, Ghana Card verification and payouts in one API, plus commission.
3. **Pricing in cedis and a free tier:** confirm the shape in section 6, then set the numbers.
4. **Billing entity for Ghana** (Orin), and the VAT approach, with an accountant.
5. **Khaya plan** (Basic $14.95 → Enterprise $749/month) for Twi.
6. **Default proactive volume:** confirm one unprompted push a day plus urgent alerts.
7. **Second country after Ghana:** Nigeria or Kenya.

---

## Sources
**Competitors**
- OpenAI: [Introducing dots](https://openai.com/index/introducing-dots); [DataCamp explainer](https://www.datacamp.com/blog/openai-dots); [eesel review](https://www.eesel.ai/blog/openai-dots-review); [Zen Aegis review](https://zenaegis.com/openai-dots-review/); [pricing](https://agentmsgr.com/blog/openai-dots-pricing).
- xAI: [Grok Bot 1.0](https://x.ai/news/grok-bot-1-0); [CellCog](https://cellcog.ai/blog/grok-bot-1-0/); [Flavio Copes](https://flaviocopes.com/grok-bot-1-0); [usage limits](https://pasqualepillitteri.it/en/news/32587/grok-bot-1-0-shared-bots-slack-teams-meetings).
- Meta: [Introducing Muse](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent); [How we built safety into Muse](https://research.meta.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse); [Stripe Link for Muse](https://stripe.com/newsroom/news/stripe-helps-meta-muse-shop-with-link); [countries](https://builtwithmuse.com/blog/muse-available-countries).
- Others: [Claude Duet review](https://www.chatprd.ai/how-i-ai/claude-duet-review); [Duet nudges](https://aimaker.substack.com/p/claude-duet-review-and-use-cases); [Instinct review](https://the-ai-future.com/reviews/instinct-ai); [The Verge on Instinct](https://www.theverge.com/tech/1008254/instinct-agent-ai-hands-on-muse-dots); [Poke reviews](https://blog.saner.ai/poke-reviews); [availability by country](https://getpersonalaiagents.com/personal-ai-agent-availability-by-country); [Nigeria availability](https://aidedex.com/availability/nigeria).

**Trust and retention**
[Menlo Ventures](https://menlovc.com/perspective/2026-the-state-of-consumer-ai); [Ping Identity](https://press.pingidentity.com/2026-10-06-Ping-Identity-Survey-Finds-AI-Trust-Changes-When-Assistance-Turns-to-Action); [Proton](http://proton.me/blog/ai-chatbot-survey); [Nylas](https://www.nylas.com/blog/the-state-of-agentic-ai-h2-2026); [Adjust](https://www.adjust.com/blog/ai-app-trends-2026); [RevenueCat](https://www.revenuecat.com/state-of-subscription-apps).

**Platforms and policy**
[WhatsApp terms §4.7](https://www.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform); [Meta AI providers](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers); [EU interim measures](https://ec.europa.eu/commission/presscorner/detail/en/ip_26_1276); [Siri AI for developers](https://developer.apple.com/news/?id=gdk2umrf); [Siri AI Developer Preview](https://developer.apple.com/documentation/appintents/siri-ai-developer-preview); [Apple payment methods](https://support.apple.com/en-us/111741); [Google Play Ghana](https://support.google.com/googleplay/answer/2651410?co=GENIE.CountryCode%3DGH).

**Ghana**
[Hubtel API](https://code.hubtel.com/docs/api); [Paystack mobile money](https://paystack.com/docs/payments/payment-channels); [Khaya ASR/TTS](https://www.khaya.ai/features/automatic-speech-recognition); [GhanaNLP](https://ghananlp.org/); [Ghana language tools](https://techtrendi.com/blog/ai-twi-ga-ewe-ghana-language-tools-guide); [Telnyx Ghana numbers](https://telnyx.com/phone-numbers/ghana); [Odumsor](https://odumsor.com/about); [3News dumsor tool](https://3news.com/tools/dumsor); [passport portal](https://passport.mfa.gov.gh/); [phone and OS share](https://marketingparasite.com/blog/ghana-digital-marketing-statistics/); [WhatsApp reach in Africa](https://www.askyazi.com/articles/whatsapp-penetration-across-africa-statistics-by-country); [data affordability](https://www.ecofinagency.com/news-digital/0709-58677-ghana-plans-rural-4g-expansion-but-usage-barriers-remain); [paying for software with MoMo, and RTVAT](https://bizstackafrica.com/guides/pay-for-software-ghana-mtn-momo); [Data Protection Commission](https://dpc.gov.gh/registration); [Ghana AI rules](https://ailawradar.com/jurisdictions/ghana).
