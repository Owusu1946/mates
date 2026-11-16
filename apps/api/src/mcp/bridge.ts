import { createHash } from "node:crypto";

type Tool = { name: string; description?: string; inputSchema: { [key: string]: unknown } };

function cleanSchema(value: unknown, depth = 0): unknown {
  if (depth > 20) throw new Error("MCP tool schema is too deeply nested");
  if (Array.isArray(value)) return value.map((item) => cleanSchema(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "$schema").map(([key, item]) => [key, cleanSchema(item, depth + 1)]));
}

/** Names remain reversible through the returned map, even after sanitizing and shortening. */
export function bridgeTools(server: { id: string; name: string }, tools: Tool[]) {
  const names = new Map<string, string>();
  const definitions = tools.map((tool) => {
    const raw = `mcp__${server.id}__${tool.name}`;
    const hash = createHash("sha256").update(raw).digest("hex").slice(0, 12);
    const name = `${raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 51)}_${hash}`;
    names.set(name, tool.name);
    const parameters = cleanSchema(tool.inputSchema);
    return { type: "function" as const, function: { name, description: `[${server.name}] ${tool.description ?? ""}`.slice(0, 1000), parameters } };
  });
  return { definitions, names };
}
