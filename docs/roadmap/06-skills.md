# 06 · Skills: teach it once

## What competitors do
- **Grok Bot:** a **skill** is a reusable set of instructions for how to do a task. It can cover the steps, the tools to use, the output, and which actions need approval. Skills are shared across all of a user's bots, while a **routine** belongs to one bot. You use a skill by asking for it by name. ([docs.x.ai](https://docs.x.ai/grok-bot/skills-routines-and-automations))
- **Anthropic's Agent Skills,** now an open standard (agentskills.io):
  - a skill is a folder with `SKILL.md`, whose frontmatter has `name` (≤ 64 characters) and `description` (≤ 1,024 characters);
  - **progressive disclosure**: only name and description load up front (about 100 tokens each), the body (< 5k tokens) loads when relevant, and bundled files load only when read.
  - Sources: [Anthropic engineering](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills), [Claude docs](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)

## How it works for users
- **Teaching:** "Remember how I do invoices: pull hours from the sheet, use my template, CC accounts@, net 14." The mate offers **"Save as a skill: Invoicing"**, shows a draft, and the user taps Save.
- **Using:** "Do my invoices for October" uses the Invoicing skill automatically, because its description matches. A small "Using: Invoicing" chip appears on the reply.
- **Managing:** Settings → Mates → **Skills**: list, edit (plain text), turn off, delete, and share with a group.
- **Starter skills:** a few useful ones ship by default (Weekly review, Meeting prep, Travel planner) and can be edited.
- **Learning from feedback:** "Not useful" on a proactive item (03) or repeated corrections can propose a skill update. The user always confirms.

## Architecture
1. **Table:** `skills` (`id, userId, name ≤ 64, description ≤ 1024, body ≤ 8k, tools text[], approvals jsonb, scope: all | mateId[], enabled, version, createdAt, updatedAt`). The shape is compatible with SKILL.md, so it can be imported and exported later.
2. **Discovery:** each run's system prompt lists enabled skills as `- {name}: {description}`. With 20 skills that's about 2k tokens; cap it at 30 and order by recent use.
3. **Loading.** A tool `use_skill { name }` returns the body, and the model calls it when a skill fits. Bodies stay out of context until needed, just like progressive disclosure.
4. **Saving.** A tool `save_skill { name, description, body }` emits a **draft card** (Save / Edit / Discard). Nothing is saved without a tap.
5. **Approvals:** a skill can tighten (never loosen) approval rules (01) for its own actions, e.g. "always ask before sending invoices".
6. **Playbooks:** we already have internal `playbooks.ts` for app know-how. Those stay system-level; skills are the user's own.
7. **Usage:** skills cost nothing extra beyond the tokens they add.

## Cost
About $0. The descriptions add about 100 tokens per skill per run, capped.

## Delivery
1. Table, list in the prompt, the `use_skill` and `save_skill` tools with a draft card.
2. Settings screen, edit, scope, starter skills.
3. Import and export as SKILL.md, plus proposals from feedback.

## Open decisions
- Should skills be per mate or shared by default? We recommend shared, like Grok Bot, with optional scoping.
