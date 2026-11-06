import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./db/client.js";
import { reminders } from "./db/schema.js";
import { pushToUser } from "./delivery.js";

export const reminderInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().max(500).optional(),
  link: z.string().url().max(2_000).optional(),
  remindAt: z.string().datetime({ offset: true }),
});

export async function createReminder(userId: string, chatId: string | null, input: z.infer<typeof reminderInputSchema>) {
  const remindAt = new Date(input.remindAt);
  if (remindAt.getTime() < Date.now() - 60_000) throw new Error("That reminder time has already passed.");
  const [row] = await getDb()
    .insert(reminders)
    .values({ clerkUserId: userId, chatId, title: input.title, body: input.body ?? null, link: input.link ?? null, remindAt })
    .returning();
  return row!;
}

export function upcomingReminders(userId: string) {
  return getDb()
    .select()
    .from(reminders)
    .where(and(eq(reminders.clerkUserId, userId), eq(reminders.status, "pending"), gte(reminders.remindAt, new Date(Date.now() - 60_000))))
    .orderBy(asc(reminders.remindAt))
    .limit(100);
}

export async function cancelReminder(userId: string, id: string) {
  if (!z.string().uuid().safeParse(id).success) return false;
  const rows = await getDb()
    .update(reminders)
    .set({ status: "cancelled" })
    .where(and(eq(reminders.id, id), eq(reminders.clerkUserId, userId), eq(reminders.status, "pending")))
    .returning({ id: reminders.id });
  return rows.length > 0;
}

/**
 * Run by the minute dispatcher. Each due reminder is claimed atomically before sending, so a
 * second dispatcher can never deliver it twice; a reminder over an hour late is not sent at all.
 */
export async function deliverReminders() {
  const now = new Date();
  const claimed = await getDb()
    .update(reminders)
    .set({ status: "sending" })
    .where(and(eq(reminders.status, "pending"), lte(reminders.remindAt, now), gte(reminders.remindAt, new Date(now.getTime() - 3_600_000))))
    .returning();
  await getDb()
    .update(reminders)
    .set({ status: "failed" })
    .where(and(eq(reminders.status, "pending"), lte(reminders.remindAt, new Date(now.getTime() - 3_600_000))));
  const sent: string[] = [];
  const failed: string[] = [];
  for (const reminder of claimed) {
    const accepted = await pushToUser(reminder.clerkUserId, {
      title: reminder.title,
      body: reminder.body ?? "It's time.",
      data: { reminderId: reminder.id, chatId: reminder.chatId, url: reminder.link ?? undefined },
    });
    (accepted ? sent : failed).push(reminder.id);
  }
  if (sent.length) await getDb().update(reminders).set({ status: "sent" }).where(inArray(reminders.id, sent));
  if (failed.length) await getDb().update(reminders).set({ status: "failed" }).where(inArray(reminders.id, failed));
}

export const reminderTool = {
  type: "function" as const,
  function: {
    name: "cooper_set_reminder",
    description:
      "Set a Cooper reminder: a push notification to the user at a set time. For meetings, set it 10 minutes before the start and pass the event's Meet link. Runs immediately; the user can undo it.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short, e.g. 'Budget review with Ama in 10 minutes'." },
        remind_at: { type: "string", description: "ISO time with UTC offset." },
        message: { type: "string" },
        link: { type: "string", description: "https link opened from the notification, e.g. the Meet link." },
      },
      required: ["title", "remind_at"],
      additionalProperties: false,
    },
  },
};

export async function runReminderTool(userId: string, chatId: string | null, raw: Record<string, unknown>) {
  const link = typeof raw.link === "string" && raw.link.startsWith("https://") ? raw.link : undefined;
  const input = reminderInputSchema.safeParse({ title: raw.title, body: raw.message || undefined, link, remindAt: raw.remind_at });
  if (!input.success) return { error: "A reminder needs a title and an ISO time with a UTC offset." } as const;
  try {
    return { reminder: await createReminder(userId, chatId, input.data) } as const;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not set the reminder." } as const;
  }
}
