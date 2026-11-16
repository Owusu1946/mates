import { createHash } from "node:crypto";

type Tool = { name: string; description?: string; inputSchema: { [key: string]: unknown } };

/** Names remain reversible through the returned map, even after sanitizing and shortening. */
export function bridgeTools(server: { id: string; name: string }, tools: Tool[]) {
  const names = new Map<string, string>();
  const definitions = tools.map((tool) => {
    const raw = `mcp__${server.id}__${tool.name}`;
    const hash = createHash("sha256").update(raw).digest("hex").slice(0, 12);
    const name = `${raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 51)}_${hash}`;
    names.set(name, tool.name);
    const { $schema: _schema, ...parameters } = tool.inputSchema;
    return { type: "function" as const, function: { name, description: `[${server.name}] ${tool.description ?? ""}`.slice(0, 1000), parameters } };
  });
  return { definitions, names };
}
