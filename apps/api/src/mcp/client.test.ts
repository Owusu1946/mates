import { afterEach, describe, expect, it, vi } from "vitest";
import { withMcp } from "./client.js";

const server = { id: "test", name: "Test", url: "https://example.com/mcp", tools: ["allowed"] };

afterEach(() => vi.unstubAllGlobals());

function mockServer(handler: (method: string, params: Record<string, unknown>) => unknown) {
  const requests: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url, init: RequestInit) => {
    const message = JSON.parse(String(init.body)) as { id?: number; method: string; params?: Record<string, unknown> };
    requests.push(message.method);
    if (message.id === undefined) return new Response(null, { status: 202 });
    const result = message.method === "initialize"
      ? { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "test", version: "1" } }
      : handler(message.method, message.params ?? {});
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }), { headers: { "content-type": "application/json" } });
  }));
  return requests;
}

describe("MCP client", () => {
  it("follows paginated discovery and filters tools by the server allow-list", async () => {
    mockServer((method, params) => {
      if (method !== "tools/list") throw new Error("unexpected request");
      return params.cursor ? { tools: [{ name: "blocked", inputSchema: { type: "object" } }] } : { tools: [{ name: "allowed", inputSchema: { type: "object" } }], nextCursor: "next" };
    });
    const result = await withMcp(server, (client) => client.listTools());
    expect(result.map((tool) => tool.name)).toEqual(["allowed"]);
  });

  it("rejects unlisted tools without calling the server", async () => {
    const requests = mockServer(() => { throw new Error("unexpected request"); });
    await expect(withMcp(server, (client) => client.callTool("blocked", {}))).rejects.toThrow("not allowed");
    expect(requests).not.toContain("tools/call");
  });

  it("rejects oversized tool responses", async () => {
    mockServer(() => ({ content: [{ type: "text", text: "x".repeat(70_000) }] }));
    await expect(withMcp(server, (client) => client.callTool("allowed", {}))).rejects.toThrow();
  });

  it("does not expose the server's tool-error text", async () => {
    mockServer(() => ({ isError: true, content: [{ type: "text", text: "sensitive internal detail" }] }));
    await expect(withMcp(server, (client) => client.callTool("allowed", {}))).rejects.toThrow("Test could not complete this request");
  });

  it("rejects an already-aborted request", async () => {
    mockServer(() => ({ tools: [] }));
    const controller = new AbortController();
    controller.abort();
    await expect(withMcp(server, (client) => client.listTools(), controller.signal)).rejects.toThrow();
  });

  it("does not leak an HTTP error body", async () => {
    mockServer(() => ({ tools: [] }));
    const fetchMock = vi.mocked(fetch);
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url, init) => {
      const message = JSON.parse(String(init?.body)) as { method: string };
      return message.method === "tools/call" ? new Response("private coordinates", { status: 500 }) : original(url, init);
    });
    await expect(withMcp(server, (client) => client.callTool("allowed", {}))).rejects.toThrow("Test could not complete this request");
  });

  it("applies a separate timeout to each call", async () => {
    mockServer(() => ({ content: [{ type: "text", text: "ok" }] }));
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      const message = JSON.parse(String(init?.body)) as { method: string };
      if (message.method === "tools/call") await new Promise((resolve) => setTimeout(resolve, 35));
      return original(url, init);
    });
    await expect(withMcp({ ...server, timeoutMs: 60 }, async (client) => {
      await client.callTool("allowed", {});
      await client.callTool("allowed", {});
      return true;
    })).resolves.toBe(true);
  });

  it("returns a concise timeout when a request stalls", async () => {
    mockServer(() => ({ content: [] }));
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      const message = JSON.parse(String(init?.body)) as { method: string };
      if (message.method !== "tools/call") return original(url, init);
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });
    });
    await expect(withMcp({ ...server, timeoutMs: 30 }, (client) => client.callTool("allowed", {}))).rejects.toThrow("Test is taking too long");
  });
});
