# 01 · Approval rules: act / ask / hand off / block

## What competitors do
- **Dots: Custom Rules.** Each kind of action gets one of four settings:
  1. **Act without asking.**
  2. **Act if pre-approved**, meaning the user approved this exact thing earlier.
  3. **Ask before acting.**
  4. **Hand off to you**: the user does it themselves.

  On top of that, **Auto-review** checks every action that affects accounts or shares information against the instructions, the rules and built-in safety rules. Custom rules can't override the safety rules, and workspace admins can turn custom rules off. ([learn.chatgpt.com/docs/dots/controls](https://learn.chatgpt.com/docs/dots/controls))
- **Grok Bot:** the same idea, called "Approvals and Auto-review". Mail a routine writes waits as a draft until the user presses Send. ([cursor.com/help/grok-bot/approvals](https://cursor.com/help/grok-bot/approvals))

## Where Mates is today
- **The policy:** `apps/api/src/action-policy.ts` says the owner decided in Nov 2026 that mates act without asking, sends included, as long as the action comes from the user's own request.
- **The old approval path is dead code:** `planTool` and `waiting_action` exist but nothing uses them.
- **It matters more now:** watches (#71) and the future proactive mode, email, calls and texting all act while the user isn't watching.

## How it works for users
**Settings → Mates → What mates can do**, one row per category, each with a four-way picker:

| Category | Examples | Default |
|---|---|---|
| Read | search mail, read calendar, look up | Act |
| Draft | create drafts and notes, no one else sees them | Act |
| Send as you | send email or Slack messages as you, post | Act when you asked in chat · **Ask** when a watch, routine or proactive suggestion does it |
| Change your data | edit or delete events, docs, tasks | Act (undo where possible) |
| Spend money | purchases, bookings with payment | **Ask** |
| Share or invite | share docs, add people | **Ask** |
| Call or text someone | phone calls (08), SMS (09) | **Ask** |
| Delete | delete emails, files, events | **Ask** |

- **Per-app overrides** sit under each row, for example "Gmail sends: Ask" or "Calendar: Act".
- **"Ask" in practice:** the run pauses with an approval card in chat and sends a push notification ("Nova wants to send this email to Ama. Approve or edit?"). The user can approve, edit then approve, or decline.
- **When the user is away:** the card waits up to 24 hours, then the action is dropped with a note.
- **"Hand off":** the mate prepares everything (a draft, a link, a filled form) and gives the user a one-tap way to do it themselves.

## Architecture (our code)
1. **Classifier:** extend `actionTier()` into `actionCategory(slug, args): Category`. Keep it as a static table plus regexes over Composio slugs (`*_SEND_*`, `*_DELETE_*`, `*_CREATE_EVENT`, …) and our own tools. Unknown writes default to the stricter category.
2. **Rules storage:** add a `profiles.actionRules jsonb` column, shaped as `{ [category]: { default: Mode, apps?: { [toolkit]: Mode } } }`. Defaults live in code; only overrides are stored.
3. **Context:** every run knows its **origin**, one of `chat | routine | watch | proactive | channel`. That origin already exists as `usageSource` or the `requestKey` prefix. "Send as you" defaults to Ask when the origin isn't `chat`.
4. **The gate,** in `agent-chat.ts` where `executeToolCall` runs:
   - `mode = resolve(rules, category, toolkit, origin)`;
   - `act`: execute;
   - `ask`: revive the approval path. Persist the pending call, as `pendingActionCall` already does. Set run status `waiting_approval`, push a notification, and resume on approve (POST `/v1/runs/:id/approve`) using the existing resume flow (`resumeRunId`, `choice`);
   - `handoff`: return the prepared payload as a card;
   - `block`: return a tool error the model must explain.
5. **Pre-approved,** the Dots "act if pre-approved" setting: watches and routines store the approved action at setup. The gate treats "the action matches the setup approval" as approved. We already pass the approved action in the run prompt; we'd add a structured match on toolkit and recipient.
6. **Auto-review:** a cheap structured model check (luna, about $0.0005) runs only for `ask`-eligible categories that are set to `act`. It checks: does this action match what the user asked, does it send data to a new recipient, does it contain secrets? A failure becomes `ask`. These checks are recorded with usage source `review`.
7. **Audit:** every gated action writes an `action_log` row (`userId, runId, category, toolkit, mode, decision, at`). It powers "What mates did" in Settings and support cases.

## Cost
- Rules: none.
- Auto-review: about $0.0005 per consequential action, and only on acting-without-asking writes. Expect under $0.01 per user per month.

## Safety
- Built-in rules can't be overridden: no sending money above $X without asking, no sharing outside the account's domain without asking.
- Every "act" write still shows a Done card with Undo where we can.

## Delivery
1. Classifier and rules with defaults (no UI). Origin-aware "Send as you" applies to watches and routines.
2. Revive the approval card and resume path, with push notifications.
3. Settings screen and per-app overrides.
4. Auto-review and the audit log.

## Open decisions
- Should "Send as you" from chat stay "Act"? That's today's owner decision, and we recommend keeping it.
- How long an approval waits (24 hours proposed).
