# 12 · Image and video generation

## What competitors do
- The **Grok app** (not Grok Bot) has **Imagine**: images and short video clips from a description. ([Softwired](https://softwired.com.au/post/grok-features-explained))
- xAI's API offers `grok-imagine-video-1.5` (text-to-video, image-to-video, native 1080p). ([xAI release notes](https://docs.x.ai/developers/release-notes))

## How it works for users
- "Make a cover image for my newsletter", "turn this photo into a watercolour", "a 6-second clip of a car driving through Accra at sunset".
- The mate shows an **image card**: preview, Download, Share, Edit ("make the sky darker"), Use in deck.
- **Decks:** images can finally go on slides. The deck engine shipped with "no images at launch"; this unlocks a cover image and section images, as a later deck option.
- **Video:** a "Make a video" action on images, and on request. It shows a progress card (generation takes 30–120 seconds), then plays inline.

## Models and cost
Use the cheapest model that's good enough, through **OpenRouter** where available, so keys and metering stay in one place.

**Images:**

| Model | Price (list) | Use |
|---|---|---|
| **Gemini 2.5 Flash Image (Nano Banana)** | **$0.039 per image** (1,290 output tokens at $30 per 1M); batch $0.0195 ([Google](https://developers.googleblog.com/en/introducing-gemini-2-5-flash-image/)) | Default: fast, good at edits; retiring Mar 2027 |
| Nano Banana 2 (Gemini 3.1 Flash Image) | about $0.045 at 0.5K up to $0.15 at 4K ([lmmarketcap](https://lmmarketcap.com/pricing-page/model/nano-banana-2-gemini-3-1-flash-image)) | Higher quality; the successor |
| Flux Schnell / Z-Image Turbo | about $0.005–0.01 ([Segmind](https://blog.segmind.com/the-cheapest-ai-image-generation-api-for-developers-in-2026/), [Atlas](https://www.atlascloud.ai/blog/cheapest-ai-image-generation-api-2026)) | A cheap tier for many drafts |

**Video** (per second, indicative; resellers differ, so verify against vendor pages):

| Model | Price | Note |
|---|---|---|
| Veo 3.1 Lite | about $0.03 per second at 720p, $0.05 at 1080p ([CometAPI](https://www.cometapi.com/ai-video-api-pricing/)) | Cheapest good option |
| Grok Imagine 1.0 / 1.5 | about $0.05 / $0.08 per second ([invideo](https://invideo.io/blog/ai-video-model-pricing)) | 1080p |
| Kling 3.0 Standard | about $0.07 per second ([Atlas](https://www.atlascloud.ai/nl/blog/guides/2026-ai-video-api-face-off-comparing-price-fidelity-and-api-documentation)) | — |

(Sora 2's API shut down on 24 Sep 2026.)

**So:** an image costs about **$0.04**, and a 6-second 720p video costs about **$0.18–0.30**.

## Plan gating (fits the 40% cost budget)
| Plan | Images | Video |
|---|---|---|
| Starter | 10 per week | — |
| Plus | 40 per week | 30 seconds per week |
| Pro | 150 per week | 3 minutes per week |
| Max | 400 per week | 10 minutes per week |

These are charged through the usage meter as source `image` or `video`, with a weekly count cap on top so one burst can't empty a week.

## Architecture
1. **Tools:**
   - `make_image { prompt, size, reference_attachment_ids?, style? }`
   - `edit_image { attachment_id, instruction }`
   - `make_video { prompt | image_attachment_id, seconds ≤ 8, aspect }`
2. **Images** run synchronously in the run (about 5–15 seconds) through OpenRouter's image output, or Google directly. The result is saved with the existing `attachments` storage. **Move large media to object storage** (R2 or S3 with signed URLs): today's 4 MB database attachment limit and Postgres storage aren't right for media.
3. **Video** is asynchronous: a Trigger task `mate-video` submits the job, polls or receives a webhook, stores the MP4 in object storage, and updates the card, the same pattern as decks.
4. **Safety:**
   - provider moderation plus a prompt pre-check (no sexual content involving minors, no real-person sexual or deceptive content, no impersonation of public figures in political contexts);
   - C2PA or SynthID watermarks are kept;
   - "AI-generated" metadata on downloads.
5. **Metering** records the provider's reported cost or a price-table estimate.

## Delivery
1. Object storage for media (needed anyway), then images (make and edit) and the image card.
2. Images in decks (cover and section images).
3. Video (async) with caps.

## Open decisions
- Default image model: Nano Banana (cheaper) or Nano Banana 2 (better)? We recommend Nano Banana 2 at 0.5K by default, with Pro and Max getting 1K.
- Show video to Starter users as a teaser? We recommend not: it's expensive.
