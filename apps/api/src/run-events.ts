import { z } from "zod";

export const runEventTypeSchema = z.enum([
  "progress",
  "run.started",
  "run.completed",
  "run.waiting",
  "run.failed",
  "run.cancelled",
  "memory.updated",
]);

export const runStreamEventSchema = z.object({
  version: z.literal(1),
  sequence: z.number().int().positive(),
  type: runEventTypeSchema,
  timestamp: z.string().datetime(),
  payload: z.record(z.string(), z.unknown()),
});
export type RunStreamEvent = z.infer<typeof runStreamEventSchema>;
export type RunEventType = z.infer<typeof runEventTypeSchema>;

export function parseRunEventCursor(query: string | undefined, lastEventId: string | undefined): number | null {
  const value = lastEventId?.trim() || query || "0";
  if (!/^\d+$/.test(value)) return null;
  const cursor = Number(value);
  return Number.isSafeInteger(cursor) ? cursor : null;
}

export function encodeRunEvent(event: RunStreamEvent): Uint8Array {
  const parsed = runStreamEventSchema.parse(event);
  return new TextEncoder().encode(`id: ${parsed.sequence}\nevent: ${parsed.type}\ndata: ${JSON.stringify(parsed)}\n\n`);
}

export function terminalRunStatus(status: string): boolean {
  return ["completed", "failed", "cancelled", "waiting"].includes(status);
}
