import { z } from 'zod';

/**
 * The agent's only way to reach Mates: the API, authorised by the call's signed token from the
 * dispatch metadata. The agent holds no database or provider secrets.
 */

export const dispatchSchema = z.object({
  callId: z.string().uuid(),
  callToken: z.string().min(10),
  userName: z.string().optional(),
  timezone: z.string().optional(),
  /** "meeting": the mate is sitting in on someone's meeting (Google Meet, Zoom, Teams), not a call with the user. */
  mode: z.enum(['call', 'meeting']).optional(),
});
export type Dispatch = z.infer<typeof dispatchSchema>;

const mateSchema = z.object({
  id: z.string(),
  name: z.string(),
  brief: z.string(),
  voice: z.string(),
  color: z.string(),
  shape: z.string(),
});
export type CallMate = z.infer<typeof mateSchema>;

export const contextSchema = z.object({
  callId: z.string(),
  leadMateId: z.string().nullable(),
  chatKind: z.string(),
  chatTitle: z.string(),
  mates: z.array(mateSchema).min(1),
  memories: z.array(z.string()),
  recent: z.array(z.object({ role: z.string(), content: z.string() })),
  keyterms: z.array(z.string()),
});
export type CallContext = z.infer<typeof contextSchema>;

export type TranscriptLine = { speaker: string; text: string; at: string };

export interface CallApi {
  context(): Promise<CallContext>;
  /** Hands work to the call's chat as a background run; resolves to the run id. */
  startTask(mateId: string, task: string): Promise<string>;
  /** Brings a mate into the call; resolves to everyone who has joined, with voices. */
  invite(mateId: string): Promise<CallMate[]>;
  end(report: { durationSec: number; transcript: TranscriptLine[] }): Promise<void>;
}

export class CallApiError extends Error {}

export function createCallApi(options: { baseUrl: string; dispatch: Dispatch; fetch?: typeof fetch }): CallApi {
  const send = options.fetch ?? fetch;
  const base = `${options.baseUrl.replace(/\/$/, '')}/v1/calls/${options.dispatch.callId}/agent`;
  const request = async (path: string, init: RequestInit & { timeoutMs?: number } = {}) => {
    const response = await send(`${base}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', 'x-call-token': options.dispatch.callToken },
      signal: AbortSignal.timeout(init.timeoutMs ?? 8_000),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new CallApiError(body?.error?.message ?? `The Mates API returned ${response.status}`);
    }
    return response.json() as Promise<unknown>;
  };
  return {
    async context() {
      return contextSchema.parse(await request('/context'));
    },
    async startTask(mateId, task) {
      const body = z.object({ runId: z.string() }).parse(await request('/tasks', { method: 'POST', body: JSON.stringify({ mateId, task }) }));
      return body.runId;
    },
    async invite(mateId) {
      const body = z.object({ mates: z.array(mateSchema) }).parse(await request('/mates', { method: 'POST', body: JSON.stringify({ mateId }) }));
      return body.mates;
    },
    async end(report) {
      // Shutdown hooks get about ten seconds; the API saves the transcript and answers at once.
      await request('/end', { method: 'POST', body: JSON.stringify(report), timeoutMs: 7_000 });
    },
  };
}
