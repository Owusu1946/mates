# 07 · Import memory from another assistant

## What competitors do
- **Claude** (Mar 2026): get an extraction prompt from claude.com/import-memory, paste it into ChatGPT, and it outputs all memories as one text block. Paste that block into Claude under Settings → Capabilities → Memory. It **adds to** existing memory without overwriting it.
  - It moves memory (preferences and context), **not chat history**. ChatGPT's data export doesn't include saved memory entries, so the prompt route is the practical one.
  - Sources: [TechCabal](https://techcabal.com/2026/05/27/4-easy-steps-to-move-your-chatgpt-memory-to-claude/), [PCWorld](https://pcworld.com/article/3076376/claude-can-now-import-chat-histories-from-chatgpt-and-other-ais.html)
- **Dots** start with context from the user's ChatGPT memory, and have an "Import from another agent" guide. ([learn.chatgpt.com](https://learn.chatgpt.com/docs/dots))

## How it works for users
- **Onboarding (optional step) or Settings → Memory → Import:**
  1. Pick a source: ChatGPT, Claude, Gemini or Grok.
  2. Tap **Copy prompt**. The app opens that assistant (deep link or web).
  3. The user pastes the prompt there, copies the answer, comes back and pastes it into Mates.
  4. They see a **preview list** of what will be saved, with checkboxes, then tap **Import**.
- **It adds to existing memory:** duplicates are merged and conflicts are shown ("ChatGPT says you live in Kumasi; Mates has Accra. Keep which?").

## Architecture
1. **The extraction prompt,** one tuned per source, asking for a plain list: one fact per line, grouped (identity, work, preferences, people, projects, ongoing tasks), with no commentary.
2. **`POST /v1/memories/import { source, text ≤ 50k }`:**
   1. One structured luna call turns the text into `{ text, category, importance }[]`, capped at 150 items, and drops sensitive categories (health, finance numbers, credentials) unless the user ticks them.
   2. **Dedupe** against existing memories with embeddings (`embeddings.ts`, cosine above 0.9 counts as the same) and a cheap model merge for near-duplicates.
   3. Return the preview. Nothing is saved until confirmed.
3. **`POST /v1/memories/import/confirm { items }`:** inserts through the existing `memories` code (`memory.ts`), with `source: "import:<assistant>"` so they can be filtered or deleted as a group.
4. **Export (the reverse):** Settings → Memory → **Export** copies the user's Mates memories as text. It's good for trust, and some regions require data portability.

## Cost
About **$0.002 per import** (one structured call plus about 150 embeddings at $0.02 per 1M tokens). It's negligible and not worth gating; allow it on all plans.

## Delivery
1. Import endpoint, preview, confirm; Settings entry.
2. Onboarding step and deep links to each assistant.
3. Export.

## Open decisions
- Should onboarding show it to everyone or only to people who say they used another assistant? We recommend a single "Coming from ChatGPT?" card.
