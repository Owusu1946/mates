import { randomUUID } from "node:crypto";
import { getComposio, getApp, getIntegrationSession } from "./integrations.js";

/** Calls one app tool as the user, through the same Composio session the mates use. */
export async function appTool(userId: string, slug: string, args: Record<string, unknown>): Promise<unknown> {
  const session = await getIntegrationSession(userId);
  const output = await getComposio().provider.executeToolCall(session, {
    id: `code_${randomUUID()}`,
    type: "function",
    function: { name: "COMPOSIO_MULTI_EXECUTE_TOOL", arguments: JSON.stringify({ tools: [{ tool_slug: slug, arguments: args }], thought: "Mates", sync_response_to_workbench: false }) },
  });
  return JSON.parse(output);
}

/** The first array anywhere in a tool's output whose items look right; tool outputs nest differently. */
export function findItems(value: unknown, looksRight: (item: Record<string, unknown>) => boolean, depth = 0): Record<string, unknown>[] {
  if (depth > 6 || !value || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    const items = value.filter((v): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v));
    if (items.length && items.some(looksRight)) return items.filter(looksRight);
    for (const item of value) {
      const found = findItems(item, looksRight, depth + 1);
      if (found.length) return found;
    }
    return [];
  }
  for (const child of Object.values(value)) {
    const found = findItems(child, looksRight, depth + 1);
    if (found.length) return found;
  }
  return [];
}


/** Whether the user has this app connected and working (e.g. "googlecalendar"). */
export async function appConnected(userId: string, slug: string) {
  try {
    const app = await getApp(await getIntegrationSession(userId), slug);
    return !!app?.connected;
  } catch {
    return false;
  }
}
