import { z } from "zod";

export const EMBEDDING_MODEL = process.env.OPENROUTER_EMBEDDING_MODEL ?? "openai/text-embedding-3-small";
/** Fixed by the model; the vector columns are declared with the same size. */
export const EMBEDDING_DIMENSIONS = 1536;
const MAX_INPUT_CHARS = 8_000;

const responseSchema = z.object({ data: z.array(z.object({ index: z.number(), embedding: z.array(z.number()) })) });

/** One batched OpenRouter call; returns vectors in input order. */
export async function embed(texts: string[], timeoutMs = 15_000): Promise<number[][]> {
  if (!texts.length) return [];
  const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts.map((text) => text.slice(0, MAX_INPUT_CHARS)) }),
  });
  if (!response.ok) throw new Error(`Embedding failed (${response.status})`);
  const { data } = responseSchema.parse(await response.json());
  const vectors = [...data].sort((a, b) => a.index - b.index).map((item) => item.embedding);
  if (vectors.length !== texts.length || vectors.some((v) => v.length !== EMBEDDING_DIMENSIONS)) throw new Error("Unexpected embedding shape");
  return vectors;
}

export async function embedOne(text: string, timeoutMs?: number) {
  return (await embed([text], timeoutMs))[0]!;
}
