# 08 · Mates place phone calls

## What competitors do
- **Grok Bot** (4 Nov 2026): places phone calls. **You approve each call**, it must say it's a virtual assistant, and it can't reach emergency services. ([Creators Toolbox](https://creatorstoolbox.com/updates/grok))
- **Meta Muse** calls US businesses, for paid subscribers only. **Yelp's assistant** calls restaurants to join waitlists. ([TPS](https://tpsreport.news/news/grok-bot-mac-apple-mail-messages-notes-integration), [CNET](https://www.cnet.com/tech/services-and-software/yelps-ai-assistant-can-call-a-restaurant-and-join-the-waitlist-for-you/))

## How it works for users
- "Nova, call Luigi's and book a table for 4 at 8 tonight." Nova shows a **call card**: the number (found on the web or from contacts), the goal, the key details, and the first line it will say. The user taps **Call** (approval rules 01: "Call or text someone" defaults to Ask).
- During the call the card shows **Live** with a running transcript; the user can **listen in** or **take over** (hand off).
- After the call: an outcome card ("Booked for 4 at 20:00 under Kenneth, confirmation: none given"), the transcript, and follow-ups (add to calendar).
- **Rules the mate always follows:**
  - it opens with "Hi, I'm Nova, an AI assistant calling for Kenneth";
  - no emergency numbers, no premium-rate numbers, no cold sales, no calls to personal numbers the user didn't provide;
  - it stays within the goal and ends politely if asked;
  - it never shares payment details unless the user approved that specific detail.

## Architecture
1. **Telephony:** LiveKit SIP **outbound trunk** through a carrier.
   - LiveKit's own phone numbers are aimed at inbound; outbound needs a trunk. ([LiveKit docs](https://docs.livekit.io/telephony/making-calls/outbound-calls/), [community](https://community.livekit.io/c/telephony/11))
   - Carriers (US list prices, per minute outbound):
     - **Telnyx about $0.005**, plus its $0.002 Voice API fee on its own platform;
     - **Plivo $0.0046**;
     - **Twilio Elastic SIP $0.01**.
   - Sources: [Telnyx](https://telnyx.com/pricing/elastic-sip), [Plivo](https://www.plivo.com/livekit/)
   - **Pick:** Telnyx or Plivo. One shared **caller ID number per region** (about $1 per month), with **CNAM** set to "Mates Assistant".
2. **The call runs in the voice agent we already have** (`voice-agent/`), in a new `mode: "outbound"`:
   - The dispatch carries `{ goal, details, persona, callee, maxMs }`.
   - The agent dials with `CreateSIPParticipant`.
   - Prompt rules: disclose AI in the first sentence, stay on goal, avoid hold-loop costs (hang up after 10 minutes on hold; offer a callback), and recognise voicemail (leave a short message or not, per the user's choice).
3. **Recording and transcript:** the existing transcript pipeline and call card. Recording audio is off by default because consent laws differ.
4. **Live view:** the app joins the LiveKit room as a listener, and **take over** swaps the agent's audio for the user's mic. The call infrastructure already exists (`call-live.ts`).
5. **Number lookup:** web search or Google Places (through Parallel or Composio) when the user gives a business name. The number is always shown to the user before dialing.
6. **Metering:** `phone` usage = carrier minutes + agent minutes (LiveKit about $0.032 per minute today).
   - **Total about $0.04–0.05 per minute.**
   - **Gate:** Pro and up, with a monthly minute cap per plan (e.g. Pro 60, Max 200).

## Legal (needs counsel before launch)
- **US:** the FCC's Feb 2024 ruling treats **AI-generated voices as "artificial" under the TCPA**. Calls to *residential and mobile* numbers need prior express consent.
  - **Business-to-business informational calls** (booking a table, asking opening hours) are generally outside the telemarketing consent rules, but **never** use this for marketing.
  - Some states (e.g. California) add AI disclosure duties, and an FCC proposal would require AI disclosure at the start of every call. **We disclose on every call anyway.**
  - Sources: [Wiley](https://wiley.law/alert-FCC-Extends-Regulatory-Reach-Over-AI-Announces-TCPA-Restrictions-Cover-AI-Generated-Voices-in-Outbound-Calls), [Perkins Coie](https://perkinscoie.com/insights/update/fcc-proposes-new-rules-ai-generated-content-calls-and-texts)
- **Other countries** (UK, EU, Ghana, Nigeria): launch **US and UK business numbers first** and allowlist countries as counsel clears them.
- **Fraud and abuse:** caps per user per day (e.g. 10 calls), blocked categories (emergency, government impersonation, debt collection), a business-number check (Places lookup or line-type lookup at about $0.005), and an audit log of every call.

## Delivery
1. Trunk and number, the outbound agent mode, the call card with approval, the transcript and outcome. US business numbers only.
2. Live listen and take over, voicemail handling, retries and callbacks.
3. More countries after legal review; calendar and booking follow-ups.

## Open decisions
- Use the user's own caller ID (verified) or our shared "Mates Assistant" number? We recommend the shared number. It's simpler and safer, and callbacks route to the mate.
- Should the cap be minutes or calls?
