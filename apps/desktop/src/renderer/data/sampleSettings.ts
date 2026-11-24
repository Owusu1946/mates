/**
 * Apps, permissions and devices for the sample workspace, until Settings reaches the API
 * (connections, action grants, devices).
 */

export type AppConnection = { id: string; name: string; what: string; connected: boolean };

export const APPS: AppConnection[] = [
  { id: "gmail", name: "Gmail", what: "Read, sort and send email", connected: true },
  { id: "calendar", name: "Google Calendar", what: "See and book your time", connected: true },
  { id: "drive", name: "Google Drive", what: "Find and save documents", connected: false },
  { id: "notion", name: "Notion", what: "Notes and pages", connected: false },
  { id: "slack", name: "Slack", what: "Messages in your workspace", connected: false },
  { id: "github", name: "GitHub", what: "Code and pull requests", connected: true },
];

/** Standing permissions you've given, as the phone lists them: "Send emails to Kwesi in Gmail". */
export type Permission = { id: string; verb: string; target?: string; app: string };

export const PERMISSIONS: Permission[] = [
  { id: "p1", verb: "Send emails", target: "Kwesi", app: "Gmail" },
  { id: "p2", verb: "Accept invites", app: "Google Calendar" },
  { id: "p3", verb: "Book rides under GH¢60", app: "Bolt" },
];

export type Device = { id: string; name: string; kind: "desktop" | "phone"; detail: string; current?: boolean };

export const DEVICES: Device[] = [
  { id: "d1", name: "This computer", kind: "desktop", detail: "Mates for desktop", current: true },
  { id: "d2", name: "Ama's iPhone", kind: "phone", detail: "Active 2 h ago" },
];
