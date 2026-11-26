/**
 * Permissions and devices for the sample workspace, until Settings reaches the API (action
 * grants, devices). Apps live in sampleApps.ts.
 */

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
