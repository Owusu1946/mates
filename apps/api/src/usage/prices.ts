/**
 * Our cost for work that isn't billed per model token, in micro-dollars, from each provider's
 * published pay-as-you-go price (checked November 2026). Each can be overridden with an env var of
 * the same name prefixed PRICE_, e.g. PRICE_CALL_MINUTE=40000. Bump PRICE_VERSION whenever these
 * change, so every recorded event says which prices it was costed with.
 */
export const PRICE_VERSION = 1;

const DEFAULTS = {
  /**
   * One minute of a voice call on LiveKit Inference: Deepgram Nova-3 STT $0.0048, Inworld TTS-2
   * ~600 chars × $25/1M = $0.015, GPT-5.6 Luna ~3k in + 175 out ≈ $0.0008, agent session $0.01,
   * WebRTC and transfer $0.001.
   */
  CALL_MINUTE: 31_600,
  /** A meeting minute: the same voice agent plus Recall.ai's bot at $0.50 an hour. */
  MEETING_MINUTE: 31_600 + 8_333,
  /** Browserbase, $0.12 per browser hour (billed by the minute, one-minute minimum). */
  BROWSER_MINUTE: 2_000,
  /** Modal sandbox, 2 CPU and 4 GiB: about $0.13 an hour. */
  SANDBOX_MINUTE: 2_100,
  /** Parallel Search: $1 per 1,000 fast requests, $5 per 1,000 advanced. */
  SEARCH_FAST: 1_000,
  SEARCH_ADVANCED: 5_000,
  /** Parallel Extract: $1 per 1,000 URLs. */
  EXTRACT_URL: 1_000,
  /** Deepgram Nova-3 pre-recorded, about $0.0043 a minute. */
  TRANSCRIBE_MINUTE: 4_300,
} as const;

export type PriceName = keyof typeof DEFAULTS;

export function price(name: PriceName): number {
  const raw = process.env[`PRICE_${name}`];
  const value = raw === undefined || raw === "" ? NaN : Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : DEFAULTS[name];
}

/** Cost of `seconds` of something priced per minute, billed to the second with a minimum. */
export function perMinute(name: PriceName, seconds: number, minimumSeconds = 0): number {
  return Math.round((price(name) * Math.max(seconds, minimumSeconds)) / 60);
}
