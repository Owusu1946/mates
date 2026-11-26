import type { AppConnection } from "../settings/apps.logic.ts";

/** Apps for the sample workspace, as GET /v1/apps returns them, until the desktop reaches the API. */

const app = (slug: string, name: string, change: Partial<AppConnection> = {}): AppConnection => ({ slug, name, connected: false, noAuth: false, status: "INACTIVE", ...change });
const on = { connected: true, status: "ACTIVE" };

export const SAMPLE_APPS: AppConnection[] = [
  app("gmail", "Gmail", on),
  app("googlecalendar", "Google Calendar", { status: "EXPIRED" }),
  app("github", "GitHub", on),
  app("weathermap", "Weather", { noAuth: true, status: "ACTIVE" }),
  app("googledrive", "Google Drive"),
  app("googlesheets", "Google Sheets"),
  app("googledocs", "Google Docs"),
  app("outlook", "Outlook"),
  app("notion", "Notion"),
  app("slack", "Slack"),
  app("linear", "Linear"),
  app("trello", "Trello"),
  app("asana", "Asana"),
  app("todoist", "Todoist"),
  app("dropbox", "Dropbox"),
  app("figma", "Figma"),
  app("zoom", "Zoom"),
  app("calendly", "Calendly"),
  app("airtable", "Airtable"),
  app("hubspot", "HubSpot"),
  app("discord", "Discord"),
  app("spotify", "Spotify"),
  app("youtube", "YouTube"),
  app("twitter", "X"),
];
