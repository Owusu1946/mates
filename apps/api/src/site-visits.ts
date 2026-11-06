import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "./db/client.js";
import { siteVisits } from "./db/schema.js";

/**
 * Page views for the landing site, counted without cookies or stored IPs. A visitor is a salted
 * hash of IP, browser and day, so the same person counts once a day and can't be traced back.
 */

export type Device = "mobile" | "tablet" | "desktop";

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|slack|linkedin|embedly|headless|lighthouse|pingdom|uptime/i;
export const isBot = (ua: string) => !ua || BOT.test(ua);

export function deviceOf(ua: string): Device {
  if (/ipad|tablet|kindle|silk|playbook|(android(?!.*mobile))/i.test(ua)) return "tablet";
  if (/mobi|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) return "mobile";
  return "desktop";
}

/** Where the visit came from, as a bare host. Visits from the site itself, or with no referrer, are direct. */
export function referrerHost(referrer: string | undefined, siteHost: string): string | null {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "").toLowerCase();
    return !host || host === siteHost ? null : host.slice(0, 120);
  } catch {
    return null;
  }
}

export function visitorId(ip: string, ua: string, day: string, salt: string) {
  return createHash("sha256").update(`${salt}|${ip}|${ua}|${day}`).digest("hex").slice(0, 24);
}

/** A clean path: starts with "/", no query or fragment, at most 200 characters. */
export function cleanPath(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/")) return null;
  const path = raw.split(/[?#]/)[0]!.slice(0, 200);
  return /^\/[\w\-./~%]*$/.test(path) ? path : null;
}

export const dayKey = (date: Date) => date.toISOString().slice(0, 10);

/** One entry per day for the last `days` days, oldest first, zero where nothing was recorded. */
export function fillDays(rows: { day: string; views: number; visitors: number }[], days: number, now: Date) {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  return Array.from({ length: days }, (_, i) => {
    const day = dayKey(new Date(now.getTime() - (days - 1 - i) * 86_400_000));
    const row = byDay.get(day);
    return { day, views: row?.views ?? 0, visitors: row?.visitors ?? 0 };
  });
}

export async function recordVisit(input: { path: unknown; referrer?: string; ua: string; ip: string; siteHost: string; now?: Date }) {
  const path = cleanPath(input.path);
  if (!path || isBot(input.ua)) return false;
  const now = input.now ?? new Date();
  await getDb()
    .insert(siteVisits)
    .values({
      path,
      referrer: referrerHost(input.referrer, input.siteHost),
      device: deviceOf(input.ua),
      visitor: visitorId(input.ip, input.ua, dayKey(now), process.env.VISIT_SALT ?? "mates-site"),
      at: now,
    });
  return true;
}

export async function visitStats(days: number, now = new Date()) {
  const since = new Date(now.getTime() - (days - 1) * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);
  const db = getDb();
  const live = new Date(now.getTime() - 30 * 60_000);
  const [daily, totals, referrers, devices, paths, recent] = await db.batch([
    db.execute(sql`select to_char(${siteVisits.at} at time zone 'UTC', 'YYYY-MM-DD') as day, count(*)::int as views, count(distinct ${siteVisits.visitor})::int as visitors from ${siteVisits} where ${siteVisits.at} >= ${since} group by 1 order by 1`),
    db.execute(sql`select count(*)::int as views, count(distinct ${siteVisits.visitor})::int as visitors from ${siteVisits} where ${siteVisits.at} >= ${since}`),
    db.execute(sql`select coalesce(${siteVisits.referrer}, 'Direct') as name, count(*)::int as views from ${siteVisits} where ${siteVisits.at} >= ${since} group by 1 order by 2 desc limit 8`),
    db.execute(sql`select ${siteVisits.device} as name, count(*)::int as views from ${siteVisits} where ${siteVisits.at} >= ${since} group by 1 order by 2 desc`),
    db.execute(sql`select ${siteVisits.path} as name, count(*)::int as views from ${siteVisits} where ${siteVisits.at} >= ${since} group by 1 order by 2 desc limit 8`),
    db.execute(sql`select count(distinct ${siteVisits.visitor})::int as visitors from ${siteVisits} where ${siteVisits.at} >= ${live}`),
  ]);
  type Row = Record<string, unknown>;
  const list = (result: { rows: Row[] }) => result.rows.map((row) => ({ name: String(row.name), views: Number(row.views) }));
  const total = totals.rows[0] as Row | undefined;
  return {
    days,
    generatedAt: now.toISOString(),
    totals: { views: Number(total?.views ?? 0), visitors: Number(total?.visitors ?? 0) },
    liveVisitors: Number((recent.rows[0] as Row | undefined)?.visitors ?? 0),
    daily: fillDays(daily.rows.map((row: Row) => ({ day: String(row.day), views: Number(row.views), visitors: Number(row.visitors) })), days, now),
    referrers: list(referrers),
    devices: list(devices),
    paths: list(paths),
  };
}
