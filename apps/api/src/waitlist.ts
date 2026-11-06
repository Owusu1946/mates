import { count, eq, lte } from "drizzle-orm";
import { getDb } from "./db/client.js";
import { waitlist } from "./db/schema.js";

/** A plausible address, lower-cased and trimmed, or null. Deliverability is the email's job. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null;
}

/**
 * Adds someone to the waitlist and returns their place in line. Joining twice is not an error:
 * they keep their original place, and `already` lets the page say so.
 */
export async function joinWaitlist(email: string, referrer: string | null) {
  const db = getDb();
  const [created] = await db.insert(waitlist).values({ email, referrer }).onConflictDoNothing({ target: waitlist.email }).returning({ id: waitlist.id });
  const id = created?.id ?? (await db.select({ id: waitlist.id }).from(waitlist).where(eq(waitlist.email, email)))[0]?.id;
  if (id === undefined) throw new Error("waitlist row missing after insert");
  const [place] = await db.select({ n: count() }).from(waitlist).where(lte(waitlist.id, id));
  return { position: Number(place?.n ?? 0), already: !created };
}

export async function waitlistSize() {
  const [row] = await getDb().select({ n: count() }).from(waitlist);
  return Number(row?.n ?? 0);
}
