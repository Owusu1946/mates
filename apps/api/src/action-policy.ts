// Unknown tools and executable workbenches require consent, even for a claimed read.
export function isReadOnlyComposioCall(name: string, batch: { tool_slug?: string }[]) {
  if (["COMPOSIO_SEARCH_TOOLS", "COMPOSIO_GET_TOOL_SCHEMAS"].includes(name)) return true;
  return name === "COMPOSIO_MULTI_EXECUTE_TOOL" && batch.length > 0 && batch.every(tool => isReadSlug(tool.tool_slug ?? ""));
}

const isReadSlug = (slug: string) =>
  /_(GET|FETCH|LIST|SEARCH|QUERY|READ|FIND|RETRIEVE|CHECK|LOOKUP|EXTRACT|DESCRIBE|COUNT)(_|$)/.test(slug) &&
  !/_(CREATE|UPDATE|UPSERT|SEND|DELETE|REMOVE|INSERT|ADD|EDIT|WRITE|POST|PATCH|EXECUTE|RUN|APPEND|MOVE|COPY|UPLOAD|PURCHASE|PAY|INVITE|SHARE|ASSIGN|ARCHIVE|MARK|SET|IMPORT)(_|$)/.test(slug);

/**
 * Owner decision (2026-11-06): Cooper acts without asking, sends and replies included, as
 * long as the action comes from the user's own request. Reads run quietly; writes are listed
 * on the reply's Done card, with Undo wherever an inverse exists.
 */
export type ActionTier = "read" | "write";

export function actionTier(slug: string): ActionTier {
  return isReadSlug(slug) ? "read" : "write";
}

export function batchTier(slugs: string[]): ActionTier {
  return slugs.length && slugs.every(isReadSlug) ? "read" : "write";
}

/**
 * Drops empty optional values the model fills in by habit (`start_date: ""` beside a real
 * `start_datetime`), which apps reject or treat as conflicting.
 */
export function cleanArguments(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (value === "" || value === null || value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === "object" && !Array.isArray(value)) {
      const nested = cleanArguments(value as Record<string, unknown>);
      if (Object.keys(nested).length === 0) continue;
      out[key] = nested;
    } else out[key] = value;
  }
  return out;
}

const humanize = (slug: string) =>
  slug
    .split("_")
    .slice(1)
    .map((word, i) => (i === 0 ? word.charAt(0) + word.slice(1).toLowerCase() : word.toLowerCase()))
    .join(" ");

function when(start: unknown, end: unknown, timezone: unknown) {
  if (typeof start !== "string") return null;
  const zone = typeof timezone === "string" ? timezone : undefined;
  const format = (iso: string, withDate: boolean) => {
    try {
      return new Date(iso).toLocaleString("en-GB", { timeZone: zone, ...(withDate ? { weekday: "short", day: "numeric", month: "short" } : {}), hour: "2-digit", minute: "2-digit" });
    } catch {
      return iso;
    }
  };
  return `${format(start, true)}${typeof end === "string" ? `–${format(end, false)}` : ""}${zone ? ` (${zone})` : ""}`;
}

/** Plain-language title and details for an app action; never raw arguments. */
export function describeAction(slug: string, args: Record<string, unknown>, done = false): { title: string; details: { label: string; value: string }[] } {
  const details: { label: string; value: string }[] = [];
  const add = (label: string, value: unknown) => {
    if (typeof value === "string" && value.trim()) details.push({ label, value: value.trim().slice(0, 400) });
    else if (Array.isArray(value) && value.length) details.push({ label, value: value.map((v) => (typeof v === "string" ? v : (v as { email?: string })?.email ?? "")).filter(Boolean).join(", ") });
  };
  if (/^GOOGLECALENDAR_(CREATE|UPDATE|PATCH)_EVENT$/.test(slug)) {
    const name = typeof args.summary === "string" ? `“${args.summary}”` : "an event";
    add("When", when(args.start_datetime, args.end_datetime, args.timezone));
    add("Guests", args.attendees);
    if (args.create_meeting_room === true) details.push({ label: "Video", value: "Google Meet" });
    return { title: `${slug.includes("CREATE") ? (done ? "Created" : "Create") : done ? "Updated" : "Update"} ${name}`, details };
  }
  if (/^GMAIL_(SEND_EMAIL|CREATE_EMAIL_DRAFT|REPLY_TO_THREAD)$/.test(slug)) {
    add("To", args.recipient_email ?? args.to);
    add("Subject", args.subject);
    add("Message", args.body ?? args.message_body);
    const verb = slug === "GMAIL_CREATE_EMAIL_DRAFT" ? (done ? "Drafted" : "Draft") : slug === "GMAIL_REPLY_TO_THREAD" ? "Reply to" : "Send";
    return { title: `${verb} an email`, details };
  }
  if (slug === "SLACK_SEND_MESSAGE") {
    add("Channel", args.channel);
    add("Message", args.text ?? args.markdown_text);
    return { title: "Post in Slack", details };
  }
  add("Title", args.title ?? args.name ?? args.summary ?? args.subject);
  return { title: humanize(slug), details };
}

/** Plain-language progress line for the activity status. */
export function activityLabel(slug: string) {
  const known: Record<string, string> = {
    COMPOSIO_SEARCH_TOOLS: "Finding the right app",
    COMPOSIO_GET_TOOL_SCHEMAS: "Getting ready",
    GMAIL_FETCH_EMAILS: "Checking your inbox",
    GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID: "Reading an email",
    GMAIL_CREATE_EMAIL_DRAFT: "Drafting an email",
    GOOGLECALENDAR_FIND_FREE_SLOTS: "Checking when you're free",
    GOOGLECALENDAR_EVENTS_LIST: "Looking at your calendar",
    GOOGLECALENDAR_FIND_EVENT: "Looking at your calendar",
    GOOGLECALENDAR_CREATE_EVENT: "Adding it to your calendar",
    GOOGLECALENDAR_UPDATE_EVENT: "Updating your calendar",
    cooper_recall: "Looking through earlier chats",
    cooper_view_attachment: "Looking at your file",
    cooper_set_reminder: "Setting a reminder",
    cooper_assemble_team: "Assembling your team",
    cooper_mission_note: "Updating the team's notes",
    cooper_ship_code: "Setting up the computer",
    cooper_make_deck: "Planning the deck",
    cooper_edit_deck: "Updating the slides",
    cooper_watch: "Setting up the watch",
    cooper_watch_triggers: "Checking what it can watch",
  };
  return known[slug] ?? (slug.startsWith("COMPOSIO_") ? "Working with your apps" : humanize(slug) || "Working on it");
}

/** The inverse of a safe action, from its result, so the card can offer Undo. */
export function undoFor(slug: string, args: Record<string, unknown>, result: unknown): { tool_slug: string; arguments: Record<string, unknown> } | null {
  const find = (value: unknown, keys: string[]): string | null => {
    if (!value || typeof value !== "object") return null;
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (keys.includes(key) && typeof item === "string" && item) return item;
      const nested = find(item, keys);
      if (nested) return nested;
    }
    return null;
  };
  if (slug === "GOOGLECALENDAR_CREATE_EVENT") {
    const id = find(result, ["id", "event_id", "eventId"]);
    return id ? { tool_slug: "GOOGLECALENDAR_DELETE_EVENT", arguments: { event_id: id, calendar_id: typeof args.calendar_id === "string" ? args.calendar_id : "primary", send_updates: "all" } } : null;
  }
  if (slug === "GMAIL_CREATE_EMAIL_DRAFT") {
    const id = find(result, ["draft_id", "draftId", "id"]);
    return id ? { tool_slug: "GMAIL_DELETE_DRAFT", arguments: { draft_id: id } } : null;
  }
  return null;
}
