/**
 * What a mate is doing right now, in words, from the app tool it is calling and what it is
 * sending: "Writing the heading “Day 1: Stone Town”", "Sending the email to ama@…", "Adding a
 * checklist". Specific for the apps used most; a readable verb + object + app for the rest.
 */

const APPS: Record<string, string> = {
  notion: "Notion",
  gmail: "Gmail",
  googlecalendar: "your calendar",
  googledocs: "Google Docs",
  googlesheets: "Google Sheets",
  googledrive: "Google Drive",
  googleslides: "Google Slides",
  slack: "Slack",
  github: "GitHub",
  linear: "Linear",
  trello: "Trello",
  asana: "Asana",
  airtable: "Airtable",
  hubspot: "HubSpot",
  outlook: "Outlook",
  discord: "Discord",
  calendly: "Calendly",
  figma: "Figma",
  jira: "Jira",
  shopify: "Shopify",
  stripe: "Stripe",
  dropbox: "Dropbox",
  zoom: "Zoom",
  twitter: "X",
};

type Args = Record<string, unknown>;

const clip = (text: string, max = 40) => {
  const one = text.replace(/\s+/g, " ").trim();
  if (one.length <= max) return one;
  // Cut back to the last whole word, so a title never ends on a fragment.
  const cut = one.slice(0, max - 1).trimEnd();
  const space = cut.lastIndexOf(" ");
  return `${(space > max - 14 ? cut.slice(0, space) : cut).trimEnd()}…`;
};
const quote = (text: string | null) => (text ? `“${clip(text)}”` : null);
const str = (args: Args, ...keys: string[]) => {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value) && typeof value[0] === "string" && value[0].trim()) return value[0].trim();
  }
  return null;
};

/** The visible text of a Notion-style block, wherever it keeps it. */
function blockText(block: Args): string | null {
  const direct = str(block, "content", "text", "title", "plain_text", "name");
  if (direct) return direct;
  for (const value of Object.values(block)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === "object") {
          const found = blockText(item as Args);
          if (found) return found;
        }
      }
    } else if (value && typeof value === "object") {
      const found = blockText(value as Args);
      if (found) return found;
    }
  }
  return null;
}

/** Every block in the arguments, as { kind, text }, in order. Tolerates the shapes Notion tools use. */
function blocksIn(value: unknown, out: { kind: string; text: string | null }[] = []) {
  if (Array.isArray(value)) {
    for (const item of value) blocksIn(item, out);
  } else if (value && typeof value === "object") {
    const record = value as Args;
    const kind = typeof record.block_property === "string" ? record.block_property : typeof record.type === "string" ? record.type : null;
    if (kind && /heading|paragraph|bullet|numbered|to_do|todo|toggle|quote|callout|code|table|divider|image|bookmark/.test(kind)) {
      out.push({ kind, text: blockText(record) });
    } else {
      for (const child of Object.values(record)) blocksIn(child, out);
    }
  }
  return out;
}

function describeBlocks(args: Args): string {
  const blocks = blocksIn(args);
  if (!blocks.length) return "Writing on the page";
  const heading = blocks.find((block) => block.kind.includes("heading") && block.text);
  if (blocks.length > 1 && heading) return `Writing the ${quote(heading.text)} section`;
  const first = blocks[0]!;
  if (first.kind.includes("heading")) return first.text ? `Writing the heading ${quote(first.text)}` : "Writing a heading";
  if (/to_do|todo/.test(first.kind)) return "Adding a checklist";
  if (/bullet|numbered/.test(first.kind)) return "Adding a list";
  if (first.kind.includes("table")) return "Building a table";
  if (first.kind.includes("divider")) return "Adding a divider";
  if (first.kind.includes("image")) return "Adding an image";
  if (first.kind.includes("code")) return "Adding a code block";
  if (first.kind.includes("quote") || first.kind.includes("callout")) return "Adding a callout";
  return "Writing a paragraph";
}

const recipient = (args: Args) => {
  const to = str(args, "recipient_email", "to", "recipient", "email");
  return to ? clip(to, 32) : null;
};

/** Hand-written lines for the tools people meet most. */
function known(slug: string, args: Args): string | null {
  switch (slug) {
    case "COMPOSIO_SEARCH_TOOLS":
      return "Finding the right app";
    case "COMPOSIO_GET_TOOL_SCHEMAS":
      return "Getting ready";
    // Notion
    case "NOTION_CREATE_NOTION_PAGE":
    case "NOTION_CREATE_PAGE": {
      const title = str(args, "title", "name");
      return title ? `Creating ${quote(title)} in Notion` : "Creating a page in Notion";
    }
    case "NOTION_ADD_PAGE_CONTENT":
    case "NOTION_ADD_MULTIPLE_PAGE_CONTENT":
    case "NOTION_APPEND_BLOCK_CHILDREN":
    case "NOTION_APPEND_TEXT_BLOCKS":
    case "NOTION_APPEND_CONTENT_BLOCKS":
      return describeBlocks(args);
    case "NOTION_UPDATE_PAGE":
      return "Updating the page";
    case "NOTION_SEARCH_NOTION_PAGE": {
      const q = str(args, "query");
      return q ? `Searching Notion for ${quote(q)}` : "Looking through your Notion";
    }
    case "NOTION_INSERT_ROW_DATABASE":
      return "Adding a row to the database";
    case "NOTION_QUERY_DATABASE":
    case "NOTION_FETCH_DATA":
      return "Reading your Notion";
    // Gmail
    case "GMAIL_SEND_EMAIL": {
      const to = recipient(args);
      return to ? `Sending the email to ${to}` : "Sending the email";
    }
    case "GMAIL_CREATE_EMAIL_DRAFT": {
      const to = recipient(args);
      return to ? `Drafting an email to ${to}` : "Drafting an email";
    }
    case "GMAIL_REPLY_TO_THREAD":
      return "Writing a reply";
    case "GMAIL_FETCH_EMAILS": {
      const q = str(args, "query");
      return q ? `Searching your inbox for ${quote(q)}` : "Checking your inbox";
    }
    case "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID":
      return "Reading an email";
    // Calendar
    case "GOOGLECALENDAR_FIND_FREE_SLOTS":
      return "Checking when you’re free";
    case "GOOGLECALENDAR_EVENTS_LIST":
    case "GOOGLECALENDAR_FIND_EVENT":
      return "Looking at your calendar";
    case "GOOGLECALENDAR_CREATE_EVENT": {
      const title = str(args, "summary", "title");
      return title ? `Adding ${quote(title)} to your calendar` : "Adding it to your calendar";
    }
    case "GOOGLECALENDAR_UPDATE_EVENT":
      return "Updating your calendar";
    // Docs and Sheets
    case "GOOGLEDOCS_CREATE_DOCUMENT":
    case "GOOGLEDOCS_CREATE_DOCUMENT_MARKDOWN": {
      const title = str(args, "title");
      return title ? `Creating the doc ${quote(title)}` : "Creating a doc";
    }
    case "GOOGLESHEETS_CREATE_GOOGLE_SHEET1":
    case "GOOGLESHEETS_CREATE_SPREADSHEET": {
      const title = str(args, "title");
      return title ? `Creating the sheet ${quote(title)}` : "Creating a sheet";
    }
    // Slack and GitHub
    case "SLACK_SEND_MESSAGE":
    case "SLACK_CHAT_POST_MESSAGE":
    case "SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL": {
      const channel = str(args, "channel", "channel_name");
      return channel ? `Posting in ${channel.startsWith("#") || channel.startsWith("C") ? channel : `#${channel}`}` : "Posting in Slack";
    }
    case "GITHUB_CREATE_AN_ISSUE":
    case "GITHUB_CREATE_ISSUE": {
      const title = str(args, "title");
      return title ? `Opening the issue ${quote(title)}` : "Opening an issue";
    }
    default:
      return null;
  }
}

const VERBS: [RegExp, string][] = [
  [/^(CREATE|NEW|MAKE)$/, "Creating"],
  [/^(ADD|APPEND|INSERT)$/, "Adding"],
  [/^(UPDATE|EDIT|PATCH|MODIFY|RENAME)$/, "Updating"],
  [/^(DELETE|REMOVE|TRASH)$/, "Removing"],
  [/^(SEND|POST|PUBLISH)$/, "Sending"],
  [/^(REPLY|RESPOND)$/, "Replying to"],
  [/^(SEARCH|FIND|QUERY|LOOKUP)$/, "Searching"],
  [/^(GET|FETCH|LIST|READ|RETRIEVE|VIEW)$/, "Reading"],
  [/^(UPLOAD|IMPORT)$/, "Uploading"],
  [/^(DOWNLOAD|EXPORT)$/, "Exporting"],
  [/^(MOVE|COPY|DUPLICATE)$/, "Moving"],
  [/^(SHARE|INVITE)$/, "Sharing"],
  [/^ARCHIVE$/, "Archiving"],
  [/^(SCHEDULE|BOOK)$/, "Scheduling"],
];

/** Any other tool: "NOTION_CREATE_COMMENT" → "Creating a comment in Notion". */
function generic(slug: string): string {
  const words = slug.split("_").filter(Boolean);
  const toolkit = words[0]?.toLowerCase() ?? "";
  const app = APPS[toolkit];
  const rest = words.slice(1);
  const at = rest.findIndex((word) => VERBS.some(([pattern]) => pattern.test(word)));
  if (at === -1) {
    const what = rest.join(" ").toLowerCase();
    return what ? `Working on ${what}${app ? ` in ${app}` : ""}` : app ? `Working in ${app}` : "Working on it";
  }
  const verb = VERBS.find(([pattern]) => pattern.test(rest[at]!))![1];
  const object = rest
    .slice(at + 1)
    .filter((word) => !/^(A|AN|THE|TO|FROM|IN|BY|ID|DETAILS|DATA|INFO)$/.test(word) && word.toLowerCase() !== toolkit)
    .join(" ")
    .toLowerCase();
  const reading = verb === "Reading" || verb === "Searching";
  const thing = object ? (reading ? object : /^[aeiou]/.test(object) ? `an ${object}` : `a ${object}`) : reading ? "" : "it";
  const phrase = reading && !object ? `${verb} ${app ?? "your apps"}` : `${verb} ${thing}`.trim();
  return app && !(reading && !object) ? `${phrase} in ${app}` : phrase;
}

export function describeStep(slug: string, args: Args = {}): string {
  return known(slug, args) ?? (slug.startsWith("COMPOSIO_") ? "Working with your apps" : generic(slug));
}
