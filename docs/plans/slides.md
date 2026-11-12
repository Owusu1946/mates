# Mates make decks

Ask a mate for slides in the chat ("Nova, a 6-slide pitch for…"); the deck fills in live in the chat,
opens full screen with speaker notes, changes by chat or by tapping a slide (with undo), and shares as
an editable PowerPoint file. The landing's `DeckDemo` promised this; its `Decks` section stays hidden
until PDF and Google Slides export exist.

## How it works (release 1)
The mate never writes PowerPoint or layout code. It fills in a validated **deck document**, and code we
own draws it, identically in the app and in PowerPoint.

```
chat ── mate researches with its usual tools ──► cooper_make_deck { topic, audience, facts+links, slide_count }
  → decks row + worker task "mate-deck" → live card in the chat
  worker: outline (1 call) → each slide (1 call, 4 at a time, shared cached prefix) → validate → repair once → else bullets
  → app polls GET /v1/decks/:id while it builds → ready: push notification
edits: cooper_edit_deck or POST /v1/decks/:id/edits → worker "mate-deck-edit" patches only the named slides → new version
undo:  POST /v1/decks/:id/undo → restores the version before the last change, as a new version
share: GET /v1/decks/:id/export.pptx (made on demand) → iOS/Android share sheet
```

- **`packages/decks`** (`@muse-clone/decks`): the deck schema (10 layouts: title, section, bullets,
  two-column, big-number, chart, quote, timeline, comparison, closing), hard text limits, the palette
  from the mate's gradient (light/dark, contrast-tested for every mate colour), and `sceneOf()`, which
  turns a slide into shapes on a 1280×720 canvas. Both the app and PowerPoint draw those shapes. A fit
  test proves the longest allowed text fits every box.
- **Rules enforced in code, not prompts:** text over a limit is sent back to the model, never cut;
  `big-number` and `chart` slides must cite a source id or be the user's own figures; citation tags in
  text are stripped (figures cite through `sourceIds`; the PowerPoint ends with a Sources slide).
- **API:** `apps/api/src/decks.ts` (tools, `buildDeck`, edits, undo, card, limits), `deck-pptx.ts`
  (pptxgenjs: editable text, native charts, notes), routes in `app.ts`, worker tasks in
  `trigger/agent.ts`, migration 0026 (`decks`, `deck_versions`, last 30 versions kept).
- **App:** `src/decks/` (native slide renderer, live card, data hook + share) and `app/(app)/deck/[id].tsx`.

## Cost and limits
About **0.2–0.6¢ per deck** (6–8 slides, 10–20 s) on the default chat model; an edit is a fraction of
that. Cost is recorded on every deck and version (`cost_usd`). Guards: ≤ 20 slides, one build at a
time per user, `DECK_DAILY_LIMIT` builds + edits per day (default 30), `max_tokens` on every call.

## Settings
`DECKS_ENABLED=true` (API and worker), optional `DECK_MODEL`, `DECK_DAILY_LIMIT`.

## Quality checks
- `pnpm --filter @muse-clone/decks test`, `apps/api` `src/decks.test.ts`.
- `pnpm tsx --env-file=.env scripts/golden-decks.ts <dir>` builds five fixed decks (pitch, QBR, lesson,
  project update, research summary) to .json and .pptx (~2¢); open them in PowerPoint, Keynote and
  Google Slides before a release.

## Next
1. **Share more ways:** PDF (the scene as HTML, printed by Browserbase), Google Slides (the .pptx
   uploaded to Drive with conversion; check that Composio's Drive upload converts), the .pptx in the
   Slack thread when asked from Slack (needs the `files:write` scope).
2. **Images:** stock photos or AI images on an `image` layout.
3. **Practise:** a rehearsal call where the mate has the deck and notes and asks the hard questions.
4. **Present:** the mate in Meet/Zoom/Teams shows the current slide on its camera tile and moves on at
   "next slide".
5. **Brand templates:** the user's colours, fonts and logo, or their own .pptx template.
