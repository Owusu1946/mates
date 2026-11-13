import type { UsageSource } from "../db/schema.js";
import { recordUsage, usdToMicros } from "./record.js";

/** OpenRouter's usage block, sent on a response (or a stream's last chunk) when asked for. */
export type OpenRouterUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  cost?: number;
  is_byok?: boolean;
  prompt_tokens_details?: { cached_tokens?: number };
  cost_details?: { upstream_inference_cost?: number };
};

/** Asks OpenRouter to report what the request cost, in the response or a stream's final chunk. */
export function metered<T extends Record<string, unknown>>(body: T): T & { usage: { include: true } } {
  return { ...body, usage: { include: true } };
}

export function readUsage(usage: OpenRouterUsage | null | undefined) {
  // With our own provider key OpenRouter's fee is `cost` and the provider's bill is upstream.
  const usd = (usage?.cost ?? 0) + (usage?.is_byok ? (usage.cost_details?.upstream_inference_cost ?? 0) : 0);
  return {
    costMicros: usdToMicros(usd),
    inputTokens: usage?.prompt_tokens ?? 0,
    cachedTokens: usage?.prompt_tokens_details?.cached_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
  };
}

export type MeterContext = { userId: string | null | undefined; source: UsageSource; ref?: string | null; key?: string };

/** Records one OpenRouter response's cost against the person it was for. */
export async function meterOpenRouter(context: MeterContext, model: string, usage: OpenRouterUsage | null | undefined) {
  if (!context.userId || !usage) return;
  await recordUsage({ userId: context.userId, source: context.source, provider: "openrouter", model, ref: context.ref, key: context.key, ...readUsage(usage) });
}

/**
 * Passes a streamed OpenRouter response through untouched while watching for the final usage chunk,
 * then records it. For streams that go straight to a consumer rather than through our own parser.
 */
export function meterStream(response: Response, context: MeterContext, model: string): Response {
  if (!response.ok || !response.body || !context.userId) return response;
  const decoder = new TextDecoder();
  let buffer = "";
  let usage: OpenRouterUsage | undefined;
  const scan = (final: boolean) => {
    const lines = buffer.split(/\r?\n/);
    buffer = final ? "" : (lines.pop() ?? "");
    for (const line of lines) {
      if (!line.startsWith("data:") || !line.includes('"usage"')) continue;
      try {
        const chunk = JSON.parse(line.slice(5).trim()) as { usage?: OpenRouterUsage };
        if (chunk.usage) usage = chunk.usage;
      } catch {}
    }
  };
  const body = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        scan(false);
        controller.enqueue(chunk);
      },
      flush() {
        scan(true);
        void meterOpenRouter(context, model, usage);
      },
    }),
  );
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}
