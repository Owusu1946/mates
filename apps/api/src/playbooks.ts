import { getComposio } from "./integrations.js";

/**
 * Known-good tools for the apps people use most. Their argument schemas are fetched live from
 * Composio, so names are never guessed; a slug Composio no longer has is simply left out.
 * Listing them lets Cooper execute straight away instead of searching first.
 */
const PLAYBOOKS: Record<string, { tools: string[]; guidance: string }> = {
  gmail: {
    tools: ["GMAIL_FETCH_EMAILS", "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID", "GMAIL_SEND_EMAIL", "GMAIL_CREATE_EMAIL_DRAFT", "GMAIL_REPLY_TO_THREAD"],
    guidance:
      "Narrow GMAIL_FETCH_EMAILS with a Gmail `query` (e.g. `newer_than:7d -category:promotions`). It returns headers and snippets; open the messages that matter in full with GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID before judging what they ask for.",
  },
  googlecalendar: {
    tools: ["GOOGLECALENDAR_EVENTS_LIST", "GOOGLECALENDAR_FIND_FREE_SLOTS", "GOOGLECALENDAR_FIND_EVENT", "GOOGLECALENDAR_CREATE_EVENT", "GOOGLECALENDAR_UPDATE_EVENT", "GOOGLECALENDAR_DELETE_EVENT"],
    guidance:
      "Check GOOGLECALENDAR_FIND_FREE_SLOTS or GOOGLECALENDAR_EVENTS_LIST before choosing a time the user did not give. GOOGLECALENDAR_CREATE_EVENT with `create_meeting_room: true` adds a Google Meet link; always pass the user's `timezone`. Google applies the calendar's default notifications to new events.",
  },
  slack: { tools: ["SLACK_SEND_MESSAGE", "SLACK_LIST_ALL_CHANNELS", "SLACK_FETCH_CONVERSATION_HISTORY"], guidance: "Resolve the channel id before sending." },
  googledrive: { tools: ["GOOGLEDRIVE_FIND_FILE", "GOOGLEDRIVE_CREATE_FILE_FROM_TEXT"], guidance: "" },
  notion: { tools: ["NOTION_SEARCH_NOTION_PAGE", "NOTION_CREATE_NOTION_PAGE", "NOTION_ADD_PAGE_CONTENT"], guidance: "" },
};

type Schema = { properties?: Record<string, { type?: string; description?: string }>; required?: string[] };
const cache = new Map<string, { line: string | null; at: number }>();
const TTL = 6 * 3_600_000;

async function describe(slug: string) {
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < TTL) return hit.line;
  let line: string | null = null;
  try {
    const tool = (await getComposio().tools.getRawComposioToolBySlug(slug)) as { description?: string; inputParameters?: Schema };
    const schema = tool.inputParameters ?? {};
    const args = Object.entries(schema.properties ?? {})
      .slice(0, 24)
      .map(([name, prop]) => `${name}${schema.required?.includes(name) ? "*" : ""}:${prop.type ?? "any"}`)
      .join(", ");
    line = `- ${slug}(${args}) — ${(tool.description ?? "").split(/(?<=\.)\s/)[0]!.slice(0, 140)}`;
  } catch {
    line = null; // Unknown or renamed slug: leave it out rather than advertise a broken tool.
  }
  cache.set(slug, { line, at: Date.now() });
  return line;
}

/** Ready-to-use tools for the connected apps that have a playbook; null when none do. */
export async function playbookContext(connectedToolkits: string[]) {
  const toolkits = connectedToolkits.filter((slug) => PLAYBOOKS[slug]);
  if (!toolkits.length) return null;
  const sections = await Promise.all(
    toolkits.map(async (toolkit) => {
      const playbook = PLAYBOOKS[toolkit]!;
      const lines = (await Promise.all(playbook.tools.map(describe))).filter(Boolean);
      return lines.length ? `${toolkit}:\n${lines.join("\n")}${playbook.guidance ? `\nTip: ${playbook.guidance}` : ""}` : "";
    }),
  );
  const body = sections.filter(Boolean).join("\n\n");
  return body
    ? `Ready-to-use tools for the user's connected apps (args marked * are required). Call them through COMPOSIO_MULTI_EXECUTE_TOOL directly without COMPOSIO_SEARCH_TOOLS; use exact argument names. Search only for apps or actions not listed here, or if a listed tool fails as unknown.\n${body}`
    : null;
}
