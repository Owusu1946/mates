/**
 * Dictation for the composer: the phone records a short clip, we send it to Deepgram Nova-3's
 * pre-recorded endpoint and return the text. Key terms (the user's mates, apps, Ghana places)
 * steer it toward the names people actually say.
 */

const ENDPOINT = "https://api.deepgram.com/v1/listen";
/** Deepgram allows 500 tokens of key terms per request; ~40 short terms stays well inside it. */
const MAX_KEYTERMS = 40;

export const transcriptionConfigured = () => !!process.env.DEEPGRAM_API_KEY;

/** Names Deepgram would otherwise misspell, always boosted. */
export const BASE_KEYTERMS = [
  "Cooper",
  "Mates",
  "Notion",
  "Gmail",
  "Google Calendar",
  "WhatsApp",
  "GitHub",
  "Slack",
  "MTN",
  "Telecel",
  "MoMo",
  "Accra",
  "Kumasi",
  "Takoradi",
  "Tamale",
  "Cape Coast",
  "East Legon",
  "Legon",
  "Osu",
  "Madina",
  "Tema",
  "Kasoa",
  "Spintex",
  "cedis",
];

/** The user's own names first (they matter most), then the base list; deduped, capped. */
export function keytermsFor(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...names, ...BASE_KEYTERMS]) {
    const term = raw.replace(/[,;\n\r:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
    const key = term.toLowerCase();
    if (!term || seen.has(key)) continue;
    seen.add(key);
    out.push(term);
    if (out.length === MAX_KEYTERMS) break;
  }
  return out;
}

/** The request URL: Nova-3, English, punctuation and smart formatting, one keyterm per term. */
export function listenUrl(keyterms: string[]): string {
  const params = new URLSearchParams({ model: "nova-3", language: "en", smart_format: "true", punctuate: "true" });
  for (const term of keyterms) params.append("keyterm", term);
  return `${ENDPOINT}?${params.toString()}`;
}

/** The transcript from Deepgram's response; "" for no speech or an unexpected shape. */
export function transcriptOf(body: unknown): string {
  const text = (body as { results?: { channels?: { alternatives?: { transcript?: unknown }[] }[] } })?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
  return typeof text === "string" ? text.trim() : "";
}

export class TranscriptionError extends Error {}

export async function transcribe(audio: ArrayBuffer, options: { contentType: string; keyterms: string[]; signal?: AbortSignal }): Promise<string> {
  if (!audio.byteLength) return "";
  const url = listenUrl(options.keyterms);
  // One retry for a timeout or a server error; a 4xx is final.
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { authorization: `Token ${process.env.DEEPGRAM_API_KEY ?? ""}`, "content-type": options.contentType },
        body: audio,
        signal: AbortSignal.any([options.signal ?? new AbortController().signal, AbortSignal.timeout(30_000)]),
      });
      if (response.ok) return transcriptOf(await response.json());
      if (response.status < 500 || attempt) throw new TranscriptionError(`Deepgram returned ${response.status}`);
    } catch (error) {
      options.signal?.throwIfAborted();
      if (error instanceof TranscriptionError || attempt) throw error;
    }
  }
}
