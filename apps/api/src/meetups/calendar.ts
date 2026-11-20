import { and, desc, eq } from "drizzle-orm";
import { appConnected, appTool, findItems } from "../app-tools.js";
import { getDb } from "../db/client.js";
import { deviceTokens } from "../db/schema.js";
import type { Interval } from "./slots.js";

/**
 * Calendars for finding a time: when someone is busy (never what they're doing) and booking the one
 * event everyone is invited to. Busy times live only in memory for the search; nothing here is
 * stored or logged.
 */

type RawEvent = {
  status?: string;
  transparency?: string;
  eventType?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
};

/** Busy intervals from a Google Calendar events list: free and declined events don't count, nor all-day ones unless out of office. */
export function busyFrom(events: RawEvent[]): Interval[] {
  const busy: Interval[] = [];
  for (const event of events) {
    if (event.status === "cancelled" || event.transparency === "transparent") continue;
    if (event.attendees?.some((a) => a.self && a.responseStatus === "declined")) continue;
    if (event.start?.dateTime && event.end?.dateTime) {
      const start = Date.parse(event.start.dateTime);
      const end = Date.parse(event.end.dateTime);
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) busy.push({ start, end });
    } else if (event.start?.date && event.end?.date && event.eventType === "outOfOffice") {
      busy.push({ start: Date.parse(`${event.start.date}T00:00:00Z`), end: Date.parse(`${event.end.date}T00:00:00Z`) });
    }
  }
  return busy;
}

/** When this person is busy between `from` and `to`; null when they have no Google Calendar connected. */
export async function busyFor(userId: string, from: number, to: number): Promise<Interval[] | null> {
  if (!(await appConnected(userId, "googlecalendar"))) return null;
  try {
    const output = await appTool(userId, "GOOGLECALENDAR_EVENTS_LIST", {
      calendarId: "primary", timeMin: new Date(from).toISOString(), timeMax: new Date(to).toISOString(), singleEvents: true, orderBy: "startTime", maxResults: 250,
    });
    return busyFrom(findItems(output, (item) => typeof item.start === "object") as RawEvent[]);
  } catch {
    return null;
  }
}

/** Their timezone and quiet hours, from their most recently used phone. */
export async function clockFor(userId: string): Promise<{ timezone: string; quiet: { start: number; end: number } }> {
  const [device] = await getDb().select().from(deviceTokens).where(and(eq(deviceTokens.clerkUserId, userId), eq(deviceTokens.enabled, true))).orderBy(desc(deviceTokens.updatedAt)).limit(1);
  return { timezone: device?.timezone ?? "Africa/Accra", quiet: { start: device?.quietStart ?? 22, end: device?.quietEnd ?? 8 } };
}

/** A verified email for inviting someone as a guest. */
export async function emailFor(userId: string): Promise<string | null> {
  try {
    const { createClerkClient } = await import("@clerk/backend");
    const user = await createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! }).users.getUser(userId);
    const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId && e.verification?.status === "verified");
    return (primary ?? user.emailAddresses.find((e) => e.verification?.status === "verified"))?.emailAddress ?? null;
  } catch {
    return null;
  }
}

/**
 * Books the meeting in the organiser's Google Calendar with everyone else as guests, so each gets a
 * real invite. Null without Google (the card then offers a calendar file instead).
 */
export async function bookEvent(organiser: string, event: { title: string; start: number; end: number; timezone: string; place?: string | null; guests: string[]; note?: string }): Promise<{ eventId: string | null; link: string | null } | null> {
  if (!(await appConnected(organiser, "googlecalendar"))) return null;
  const output = await appTool(organiser, "GOOGLECALENDAR_CREATE_EVENT", {
    calendar_id: "primary",
    summary: event.title,
    start_datetime: new Date(event.start).toISOString(),
    end_datetime: new Date(event.end).toISOString(),
    timezone: event.timezone,
    attendees: event.guests,
    send_updates: "all",
    ...(event.place ? { location: event.place } : {}),
    description: event.note ?? "Arranged by your mates on Mates.",
  });
  const created = findItems(output, (item) => typeof item.id === "string" && ("htmlLink" in item || "start" in item))[0];
  return { eventId: (created?.id as string | undefined) ?? null, link: (created?.htmlLink as string | undefined) ?? null };
}

/** A calendar file for one meeting, for people without Google Calendar. */
export function icsFor(event: { id: string; title: string; start: number; end: number; place?: string | null }) {
  const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const escape = (text: string) => text.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\r?\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Mates//Find a time//EN", "METHOD:PUBLISH", "BEGIN:VEVENT",
    `UID:${event.id}@mates`, `DTSTAMP:${stamp(Date.now())}`, `DTSTART:${stamp(event.start)}`, `DTEND:${stamp(event.end)}`,
    `SUMMARY:${escape(event.title)}`, ...(event.place ? [`LOCATION:${escape(event.place)}`] : []),
    "END:VEVENT", "END:VCALENDAR", "",
  ].join("\r\n");
}
