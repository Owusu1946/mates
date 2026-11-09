import { DateTime } from "luxon";
import { z } from "zod";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "./db/client.js";
import { chats, delegations, deliveries, deviceTokens, findings } from "./db/schema.js";

export async function deliverFindings() {
  // Opt-in never sends a backlog; retries are independent from agent execution.
  await getDb().execute(sql`INSERT INTO deliveries(delegation_id,token)
    SELECT f.delegation_id,d.token FROM findings f JOIN device_tokens d ON d.clerk_user_id=f.clerk_user_id
    WHERE d.enabled=true AND f.created_at>=d.updated_at AND f.created_at>now()-interval '7 days'
    ON CONFLICT (delegation_id,token) DO NOTHING`);
  const due = await getDb().select().from(deliveries).where(and(inArray(deliveries.status, ["pending", "receipt_pending"]), lte(deliveries.nextAttemptAt, new Date()))).limit(50);
  for (const delivery of due) {
    const [device] = await getDb().select().from(deviceTokens).where(eq(deviceTokens.token, delivery.token));
    const [run] = await getDb().select().from(delegations).where(eq(delegations.id, delivery.delegationId));
    if (!device?.enabled || device.clerkUserId !== run?.clerkUserId) {
      await getDb().update(deliveries).set({ status: "disabled" }).where(eq(deliveries.id, delivery.id));
      continue;
    }
    if (delivery.status === "receipt_pending") {
      try {
        const response = await expoRequest("getReceipts", { ids: [delivery.receiptId] });
        const receipt = response.data?.[delivery.receiptId!];
        if (!receipt) continue;
        await getDb().update(deliveries).set({ status: receipt.status === "ok" ? "delivered" : "failed", error: receipt.status === "ok" ? null : "Push delivery was rejected" }).where(eq(deliveries.id, delivery.id));
        if (receipt.details?.error === "DeviceNotRegistered") await getDb().update(deviceTokens).set({ enabled: false }).where(eq(deviceTokens.token, device.token));
      } catch { /* Receipt polling never repeats the notification. */ }
      continue;
    }
    const local = DateTime.now().setZone(device.timezone);
    const quiet = device.quietStart === device.quietEnd ? false : device.quietStart < device.quietEnd ? local.hour >= device.quietStart && local.hour < device.quietEnd : local.hour >= device.quietStart || local.hour < device.quietEnd;
    if (quiet) {
      let end = local.set({ hour: device.quietEnd, minute: 0, second: 0, millisecond: 0 });
      if (end <= local) end = end.plus({ days: 1 });
      await getDb().update(deliveries).set({ nextAttemptAt: end.toJSDate() }).where(eq(deliveries.id, delivery.id));
      continue;
    }
    const [claimed] = await getDb().update(deliveries).set({ status: "sending", attempts: sql`${deliveries.attempts} + 1` }).where(and(eq(deliveries.id, delivery.id), eq(deliveries.status, "pending"))).returning();
    if (!claimed) continue;
    try {
      // Mates and groups speak under their own name, and a tap opens their chat; everything else
      // comes from the app and opens the result in the feed.
      const [chat] = run.chatId ? await getDb().select({ kind: chats.kind, title: chats.title }).from(chats).where(eq(chats.id, run.chatId)) : [];
      const title = chat && (chat.kind === "mate" || chat.kind === "group") ? chat.title : "Mates";
      const result = await expoRequest("send", { to: device.token, title, body: run.status === "waiting" ? "Your attention is needed to continue a task." : "Your task result is ready.", data: { delegationId: run.id, chatId: run.chatId, chatKind: chat?.kind ?? null, url: `mates://feed?runId=${run.id}` }, sound: "default" });
      const ticket = result.data;
      await getDb().update(deliveries).set({ status: ticket?.status === "ok" && ticket.id ? "receipt_pending" : "failed", receiptId: ticket?.id ?? null, error: ticket?.status === "ok" ? null : "Push request was rejected", nextAttemptAt: new Date(Date.now() + 120_000) }).where(eq(deliveries.id, delivery.id));
      if (ticket?.details?.error === "DeviceNotRegistered") await getDb().update(deviceTokens).set({ enabled: false }).where(eq(deviceTokens.token, device.token));
    } catch {
      // The provider might have accepted it before a timeout. Never resend blindly.
      await getDb().update(deliveries).set({ status: "uncertain", error: "Notification outcome is unknown. Your result is saved in Mates." }).where(eq(deliveries.id, delivery.id));
    }
  }
}

/** Sends one notification to every enabled device of a user; true when any device accepted it. */
export async function pushToUser(userId: string, message: { title: string; body: string; data: Record<string, unknown> }) {
  const devices = await getDb().select().from(deviceTokens).where(and(eq(deviceTokens.clerkUserId, userId), eq(deviceTokens.enabled, true)));
  let accepted = false;
  for (const device of devices) {
    try {
      const result = await expoRequest("send", { to: device.token, ...message, sound: "default", priority: "high" });
      if (result.data?.status === "ok") accepted = true;
      if (result.data?.details?.error === "DeviceNotRegistered") await getDb().update(deviceTokens).set({ enabled: false }).where(eq(deviceTokens.token, device.token));
    } catch { /* One failing device must not block the others. */ }
  }
  return accepted;
}

async function expoRequest(path: string, payload: unknown): Promise<any> {
  const response = await fetch(`https://exp.host/--/api/v2/push/${path}`, { method: "POST", signal: AbortSignal.timeout(10_000), headers: { "content-type": "application/json", ...(process.env.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) }, body: JSON.stringify(payload) });
  if (!response.ok) throw new Error("PUSH_PROVIDER_UNAVAILABLE");
  return response.json();
}

export async function retryDelivery(userId: string, runId: string) {
  if (!z.string().uuid().safeParse(runId).success) return false;
  const [run] = await getDb().select().from(delegations).where(and(eq(delegations.id, runId), eq(delegations.clerkUserId, userId)));
  if (!run) return false;
  await getDb().update(deliveries).set({ status: "pending", error: null, nextAttemptAt: new Date() }).where(and(eq(deliveries.delegationId, runId), eq(deliveries.status, "failed")));
  return true;
}
