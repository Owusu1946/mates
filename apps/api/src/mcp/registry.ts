/** Phase 1 only permits explicitly configured, read-only system servers. */
export const sailServer = {
  id: "sail",
  name: "Sail",
  url: "https://sailrides.co/mcp",
  tools: ["search_places", "resolve_place", "plan_trip", "compare_rides", "plan_public_transport"],
} as const;

export type SystemServer = { id: string; name: string; url: string; tools: readonly string[]; timeoutMs?: number };
