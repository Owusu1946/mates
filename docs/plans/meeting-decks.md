# Decks in meetings: made from the conversation, presented by screen share

**Status:** built. The live checks below are still to do on real meetings.

## What it does

In a Google Meet, Zoom or Teams meeting, someone says something like "Nova, make a deck on what we've covered and walk us through it".

**Making the deck.** The mate's `start_task` sends the meeting transcript so far (the last 150 lines, trimmed to fit one turn) and the chat's last 20 turns along with the request. The deck is built from what was actually said.

**Presenting it.** `present_deck` makes the bot share a second page of ours, `/meet-share`, as its screen. The mate's camera tile keeps the talking mascot, with a "Presenting" pill.

**Talking it through.** The mate narrates each slide from its speaker notes, then moves on by itself (`go_to_slide`). It waits for its speech to finish before changing the slide. While a deck is up, short cues such as "next", "go back", "slide 4" or "stop" work without saying the mate's name. A deck that's still building is presented as soon as it's ready (checked every 5 seconds, for up to 3 minutes).

**When sharing is refused.** If the host has disabled screen sharing, or Recall refuses for any reason, the slides go on the mate's tile instead: full-frame, with the mascot in a corner. The mate says why.

## Where it lives

**API**
- `apps/api/src/presentation.ts`: finding decks, `present`, `stopPresenting`, the share-link token, and what the pages read.
- `apps/api/src/meetings.ts`: `startScreenshare` and `stopScreenshare` (Recall's `output_media` with the `screenshare` key).
- `apps/api/src/calls.ts`: `startCallTask` sends the transcript and recent chat; `transcriptTurn`.
- **Routes:**
  - `GET /v1/calls/:id/agent/decks`
  - `POST /v1/calls/:id/agent/present`
  - `POST /v1/calls/:id/agent/present/stop`
  - `GET /site/meetings/:id/presentation` and `/presentation/deck` (with `?s=` the share token, or `?t=` the camera page's token)
- **State:** `calls.meeting.presentation`, a jsonb field updated one key at a time with `jsonb_set`. Recall's status webhook uses the same approach, so neither write undoes the other.

**Voice agent**
- `voice-agent/src/presenting.ts`: the `present_deck`, `go_to_slide` and `stop_presenting` tools, the slide cues, and the narration prompt.
- `mates.ts` / `main.ts`: the transcript on `CallState`, and presenting stops when the call ends.

**Web**
- `apps/web/src/components/MeetShare.tsx` and `src/pages/meet-share.astro`: the share page. It polls every 700 ms and draws `sceneHtml(sceneOf(deck, i))` from `@muse-clone/decks`, so slides look the same as in the app and the PowerPoint export.
- `MeetBot.tsx`: the "Presenting" pill and the tile fallback.

## Live checks to do (each platform: Meet, Zoom, Teams)

1. **Camera and screen share at once.** Starting `screenshare` mid-call keeps the camera (mascot and voice) running.
   - Recall's request body takes both keys, but its docs don't say outright that both can run together.
   - If starting a screen share replaces the camera: the voice still comes from the camera page, so presenting would cut the mate's voice. In that case, switch `present()` to always use `tile` mode (one line in `presentation.ts`).
2. **Stopping.** `DELETE output_media { screenshare: true }` stops only the screen share.
3. **Host-restricted sharing.** Check what Recall returns: an error means the tile fallback kicks in. If Recall instead accepts the request and the share silently never appears, note it here; that case would need a check after starting.
4. **Readability.** Slides are readable at normal size in each app's presenter view. Narration matches the slide shown. "Next" and "back" feel responsive (within about a second).
5. **Cost.** Recall doesn't charge extra for the screen share. The bot already runs on `web_4_core`.

## Later

- A "Present" button on deck cards during a phone call.
- Slide changes noted in the meeting summary ("Nova presented the Q3 review").
- Practice mode: a one-to-one call where the mate plays the audience.
