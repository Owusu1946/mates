import { z } from "zod";
import type { MeterContext } from "./usage/openrouter.js";
import { recordUsage, usdToMicros } from "./usage/record.js";

export const EMBEDDING_MODEL = process.env.OPENROUTER_EMBEDDING_MODEL ?? "openai/text-embedding-3-small";
/** Fixed by the model; the vector columns are declared with the same size. */
export const EMBEDDING_DIMENSIONS = 1536;
const MAX_INPUT_CHARS = 8_000;

const responseSchema = z.object({
  data: z.array(z.object({ index: z.number(), embedding: z.array(z.number()) })),
  usage: z.object({ prompt_tokens: z.number().optional(), cost: z.number().optional() }).optional(),
});
/** text-embedding-3-small, $0.02 per million tokens, for when the response carries no cost. */
const EMBEDDING_USD_PER_TOKEN = 0.02 / 1_000_000;

/** One batched OpenRouter call; returns vectors in input order. */
export async function embed(texts: string[], timeoutMs = 15_000, meter?: MeterContext): Promise<number[][]> {
  if (!texts.length) return [];
  const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts.map((text) => text.slice(0, MAX_INPUT_CHARS)) }),
  });
  if (!response.ok) throw new Error(`Embedding failed (${response.status})`);
  const { data, usage } = responseSchema.parse(await response.json());
  if (meter?.userId && usage)
    void recordUsage({ userId: meter.userId, source: meter.source, provider: "openrouter", model: EMBEDDING_MODEL, ref: meter.ref, inputTokens: usage.prompt_tokens, costMicros: usdToMicros(usage.cost ?? (usage.prompt_tokens ?? 0) * EMBEDDING_USD_PER_TOKEN), estimated: usage.cost === undefined });
  const vectors = [...data].sort((a, b) => a.index - b.index).map((item) => item.embedding);
  if (vectors.length !== texts.length || vectors.some((v) => v.length !== EMBEDDING_DIMENSIONS)) throw new Error("Unexpected embedding shape");
  return vectors;
}

export async function embedOne(text: string, timeoutMs?: number, meter?: MeterContext) {
  return (await embed([text], timeoutMs, meter))[0]!;
}
