import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { SystemServer } from "./registry.js";

const MAX_BYTES = 64 * 1024;
const TIMEOUT_MS = 15_000;

/** Bound data as it arrives, before the SDK parses it. */
async function boundedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, { ...init, redirect: "error" });
  if (!response.body) return response;
  let size = 0;
  const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      size += chunk.byteLength;
      if (size > MAX_BYTES) throw new Error("MCP response exceeds size limit");
      controller.enqueue(chunk);
    },
  }));
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}

export interface McpConnection {
  listTools(): Promise<Awaited<ReturnType<Client["listTools"]>>["tools"]>;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
}

/** Each operation has its own short-lived transport; no request data is cached. */
export async function withMcp<T>(server: SystemServer, run: (connection: McpConnection) => Promise<T>, signal?: AbortSignal): Promise<T> {
  const abort = signal ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS);
  const client = new Client({ name: "mates", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(server.url), {
    fetch: (input, init) => boundedFetch(input, { ...init, signal: init?.signal ? AbortSignal.any([abort, init.signal]) : abort }),
  });
  try {
    await client.connect(transport, { signal: abort });
    return await run({
      async listTools() {
        const all: Awaited<ReturnType<Client["listTools"]>>["tools"] = [];
        const seen = new Set<string>();
        let cursor: string | undefined;
        do {
          if (cursor && seen.has(cursor)) throw new Error("Repeated MCP cursor");
          if (cursor) seen.add(cursor);
          const page = await client.listTools(cursor ? { cursor } : undefined, { signal: abort });
          all.push(...page.tools.filter((tool) => server.tools.includes(tool.name)));
          if (seen.size > 100) throw new Error("Too many MCP pages");
          cursor = page.nextCursor;
        } while (cursor);
        return all;
      },
      async callTool(name, args) {
        if (!server.tools.includes(name)) throw new Error("Tool is not allowed");
        const result = await client.callTool({ name, arguments: args }, undefined, { signal: abort });
        if (result.isError) throw new Error("Sail could not complete this request");
        return result.structuredContent ?? result.content;
      },
    });
  } finally {
    await client.close().catch(() => {});
  }
}
