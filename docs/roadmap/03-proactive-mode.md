# 03 · Proactive mode: it notices, then offers

## What competitors do
- **Dots: "proactive research".** When you aren't working with it, the dot looks through your connected apps for ways to help, using tools restricted to **read-only** at the programming level. It can't send, change content or control a browser.
  - It saves what it learns as its own private notes, then brings suggestions ("you never invoiced this client") that you approve.
  - Scheduled checks are separate and follow normal approval rules.
  - OpenAI doesn't train on proactive research notes. ([openai.com/index/introducing-dots](https://openai.com/index/introducing-dots/), [SEJ](https://www.searchenginejournal.com/openai-dots-read-only-proactive-research/591565/))

## How it works for users
- **Turn it on:** Settings → Mates → **Proactive**, on or off per mate. The user picks which connected apps it may look at (Gmail, Calendar, Slack, GitHub…) and a quiet time.
- **Daily summary:** once a day (default 8am local), plus when something urgent arrives, the mate posts a short **"Worth your attention"** list in its chat. Each item has a one-tap action:
  - "Invoice for the Acme article is 12 days overdue · **Draft a reminder**"
  - "Flight to Lagos tomorrow 07:10, check-in is open · **Check me in**" (where possible)
  - "Kwame asked for the deck Tuesday, no reply yet · **Draft a reply**"
- **It never acts on its own.** Taps go through the approval rules (01).
- **Learning:** "Not useful" on an item teaches it to skip that kind of item. That's stored as a skill-like preference (06).

## Architecture (cost-efficient)
The expensive mistake would be re-reading whole inboxes every hour. Instead we work from **deltas**:

1. **Event-driven intake.** Reuse **Composio triggers** (the watches webhook):
   - Gmail and Google Calendar push in real time.
   - Slack, GitHub and Linear push events.
   - For each enabled app we create one broad trigger per user (new email, new event or change, mentions, review requests).
   - Each event is stored compactly in a `signals` table (`userId, app, kind, ref, summary ≤ 300 chars, at`), using a cheap extraction: luna, a short prompt, about $0.0003.
2. **Sweep,** once a day per user (Trigger.dev task `mate-proactive-sweep`, scheduled by the dispatcher in the user's local morning):
   - Input: the last 24 hours of `signals`, open commitments from memory, today's calendar (a read-only Composio call), and the previous sweep's notes.
   - One structured call with luna returns `{ items: [{ title, why, evidence_ref, action: { kind, prompt } }] }` with **at most 5** items. A fallback model is used only if luna fails validation.
   - The mate's chat gets one message with the items. A push goes out only if an item is time-sensitive.
3. **Urgent path.** Signals classified `urgent` (from the boss or VIP list, a deadline within 24 hours, a security alert) can raise one immediate suggestion, at most 3 per day per user.
4. **Read-only enforcement.** The sweep and intake run with a **tool allowlist** of reads only, enforced in code by the action policy categories from 01, not just by the prompt.
5. **Notes.** `proactive_notes` per user: what was suggested, what was accepted or dismissed. These feed the next sweep and avoid repeats.
6. **Privacy.** Signals are kept for 14 days. Summaries are stored, not raw bodies. Users can view and clear them.

## Cost per active user
- Intake: about 50 signals a day × $0.0003 ≈ **$0.015**.
- Sweep: one call with about 6k tokens in and 600 out ≈ **$0.002**.
- Composio triggers: included in the plan; Gmail realtime has no polling cost.
- **Total: about $0.02 per user per day ≈ $0.60 per month.** That's within Plus or Pro budgets, so gate it at **Plus and up**, metered as usage source `proactive`.

## Delivery
1. Signals intake (Gmail and Calendar first) with triggers and the daily sweep. Suggestions only.
2. One-tap actions through runs and the approval rules.
3. Urgent path, learning from dismissals, and more apps.
4. Settings screen to choose apps and quiet time.

## Open decisions
- Default on or off for Plus users? We recommend opt-in, with a one-time suggestion card.
- The VIP list: inferred from email frequency, or set by the user?
