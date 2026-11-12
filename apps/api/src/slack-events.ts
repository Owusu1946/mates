import { eq } from "drizzle-orm";
import { createChatStore } from "./chats.js";
import { getDb } from "./db/client.js";
import { mates, slackRuns } from "./db/schema.js";
import { submitRun } from "./durable-runs.js";
import { ensureDefaultMate, mateChatId, type Mate } from "./mates.js";
import { installFor, linkedUser, mateIdentity, slackApi, uninstall } from "./slack.js";

/**
 * Work arriving from Slack: a mention or DM from a linked person becomes a run for the mate they
 * named, in that mate's own chat (so Slack and the app share one conversation). Only the person's own
 * words become instructions; nobody can give another person's mates work.
 */

/** Which mate a message is for: "Kojo, …", "ask Kojo to …", "kojo: …". No name → the lead mate. */
export function pickMate<M extends Pick<Mate, "name">>(text: string, crew: M[], lead: M): { mate: M; task: string } {
  const clean = text.replace(/<@[A-Z0-9]+>/g, "").trim();
  const lower = clean.toLowerCase();
  const asked = lower.startsWith("ask ") ? 4 : 0;
  for (const mate of [...crew].sort((a, b) => b.name.length - a.name.length)) {
    const name = mate.name.toLowerCase();
    if (lower.startsWith(name, asked) && /^($|[\s,:.!?])/.test(lower.slice(asked + name.length))) {
      const rest = clean.slice(asked + name.length).replace(/^[\s,:.!?-]+/, "").replace(/^to\s+/i, "");
      return { mate, task: rest || clean };
    }
  }
  return { mate: lead, task: clean };
}

/** A Slack message id, made safe for chat message ids (letters, digits, - and _). */
const safeId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 120);

/**
 * `dm`: a direct message with the app (only the asker can see replies anyway). `inThread`: reply in a
 * thread under the ask (channel mentions, or a DM thread); otherwise post at the top level (/mates).
 */
type Ask = { teamId: string; channelId: string; slackUserId: string; text: string; threadTs?: string; ts?: string; key: string; dm: boolean; inThread: boolean };

/** Slack's "Connect your Mates account" button: through our redirect, since Slack buttons need http links. */
const connectBlocks = (teamId: string, slackUserId: string) => {
  const url = `${process.env.API_PUBLIC_URL ?? "https://mates-production.up.railway.app"}/v1/slack/connect?team=${encodeURIComponent(teamId)}&user=${encodeURIComponent(slackUserId)}`;
  return [
    { type: "section", text: { type: "mrkdwn", text: "Connect your Mates account first, and your mates will answer you here. Open this on your phone with Mates installed." } },
    { type: "actions", elements: [{ type: "button", style: "primary", text: { type: "plain_text", text: "Connect Mates" }, url }] },
  ];
};

/** Turns the mate's recent conversation into the run's message history, ending with the new ask. */
async function turnsFor(userId: string, chatId: string, task: string) {
  const history = (await createChatStore().history(userId, chatId)) ?? [];
  const turns = history.slice(-20).flatMap(({ message }) => {
    const parts = Array.isArray(message.content) ? (message.content as { type?: string; text?: unknown }[]) : [];
    const content = parts.filter((p) => p.type === "text" && typeof p.text === "string").map((p) => String(p.text)).join("\n").trim().slice(0, 8000);
    return content && (message.role === "user" || message.role === "assistant") ? [{ role: message.role as "user" | "assistant", content }] : [];
  });
  return [...turns, { role: "user" as const, content: task.slice(0, 8000) }].slice(-40);
}

/** One ask from Slack, from a mention, a DM or /mates. Replies are posted in the same place. */
export async function handleAsk(ask: Ask) {
  const install = await installFor(ask.teamId);
  if (!install) return;
  const thread = ask.inThread ? (ask.threadTs ?? ask.ts) : undefined;
  const reply = (body: Record<string, unknown>) => slackApi<{ ts?: string }>(install.token, "chat.postMessage", { channel: ask.channelId, ...(thread ? { thread_ts: thread } : {}), ...body });

  const userId = await linkedUser(ask.teamId, ask.slackUserId);
  if (!userId) {
    const blocks = connectBlocks(ask.teamId, ask.slackUserId);
    if (ask.dm) await reply({ text: "Connect your Mates account first.", blocks });
    else await slackApi(install.token, "chat.postEphemeral", { channel: ask.channelId, user: ask.slackUserId, text: "Connect your Mates account first.", blocks });
    return;
  }

  const lead = await ensureDefaultMate(userId);
  const crew = await getDb().select().from(mates).where(eq(mates.clerkUserId, userId));
  const { mate, task } = pickMate(ask.text, crew, lead);
  if (!task) return;
  const identity = mateIdentity(mate);
  const chatId = mateChatId(mate.id);
  const id = safeId(ask.key);

  try {
    const run = await submitRun(userId, { chatId, requestKey: `slack:${ask.key}`.slice(0, 160), assistantMessageId: `slack_a_${id}`, parentId: `slack_u_${id}`, messages: await turnsFor(userId, chatId, task) });
    // A retried event finds the run it already started: nothing new to post.
    const [known] = await getDb().select({ id: slackRuns.delegationId }).from(slackRuns).where(eq(slackRuns.delegationId, run.id));
    if (known) return;
    const status = await reply({ ...identity, text: "On it…" }).catch(() => null);
    await getDb()
      .insert(slackRuns)
      .values({ delegationId: run.id, teamId: ask.teamId, channelId: ask.channelId, threadTs: thread ?? status?.ts ?? "", statusTs: status?.ts ?? null, mateId: mate.id, clerkUserId: userId, slackUserId: ask.slackUserId })
      .onConflictDoNothing();
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const text =
      code === "RUN_ALREADY_ACTIVE" ? `I’m still on your last task. I’ll pick this up once it’s done.` : code === "WORKER_NOT_CONFIGURED" ? "I can’t take new work right now. Try again in a little while." : "Something went wrong starting that. Try again in a moment.";
    if (code !== "RUN_ALREADY_ACTIVE" && code !== "WORKER_NOT_CONFIGURED") console.warn("slack_ask_failed", { message: code });
    await reply({ ...identity, text }).catch(() => undefined);
  }
}

/** The app's Home tab, drawn for each person: their own mates and how to ask them, or how to connect. */
export async function publishHome(teamId: string, slackUserId: string) {
  const install = await installFor(teamId);
  if (!install) return;
  const userId = await linkedUser(teamId, slackUserId);
  const header = { type: "header", text: { type: "plain_text", text: "Your mates, in Slack" } };
  const blocks: Record<string, unknown>[] = userId
    ? await (async () => {
        const lead = await ensureDefaultMate(userId);
        const crew = await getDb().select().from(mates).where(eq(mates.clerkUserId, userId));
        const rows = [lead, ...crew.filter((mate) => mate.id !== lead.id)].map((mate) => ({
          type: "context",
          elements: [{ type: "image", image_url: mateIdentity(mate).icon_url, alt_text: mate.name }, { type: "mrkdwn", text: `*${mate.name}*${mate.id === lead.id ? " · lead" : ""}${mate.role ? ` · ${mate.role}` : ""}` }],
        }));
        return [
          header,
          { type: "section", text: { type: "mrkdwn", text: "Mention *@Mates* in any channel and say which mate you need, or send a DM here. Your mates reply in the thread under their own names, and ask before they send anything." } },
          { type: "divider" },
          ...rows,
          { type: "context", elements: [{ type: "mrkdwn", text: "Try: `@Mates Kojo, find a time with Efua next week`  ·  `/mates ask Ama to find a venue for Saturday`" }] },
        ];
      })()
    : [header, ...connectBlocks(teamId, slackUserId)];
  await slackApi(install.token, "views.publish", { user_id: slackUserId, view: { type: "home", blocks } });
}

type SlackEvent = { type: string; user?: string; text?: string; channel?: string; channel_type?: string; ts?: string; thread_ts?: string; bot_id?: string; subtype?: string; tab?: string };
type Envelope = { type: string; team_id?: string; event_id?: string; event?: SlackEvent };

/** Everything Slack sends to /v1/slack/events, after its signature has been checked. */
export async function handleSlackEvent(envelope: Envelope) {
  const event = envelope.event;
  const teamId = envelope.team_id;
  if (envelope.type !== "event_callback" || !event || !teamId) return;
  if (event.type === "app_uninstalled" || event.type === "tokens_revoked") return uninstall(teamId);
  if (event.type === "app_home_opened") return event.tab === "home" && event.user ? publishHome(teamId, event.user) : undefined;
  // Ignore anything a bot wrote (including ourselves), edits, joins and other system messages.
  if (event.bot_id || event.subtype || !event.user || !event.channel || !event.ts) return;
  const dm = event.type === "message" && event.channel_type === "im";
  if (event.type !== "app_mention" && !dm) return;
  await handleAsk({ teamId, channelId: event.channel, slackUserId: event.user, text: event.text ?? "", threadTs: event.thread_ts, ts: event.ts, key: envelope.event_id ?? `${event.channel}-${event.ts}`, dm, inThread: !dm || !!event.thread_ts });
}

/** `/mates ask Kojo to …`: posted at the top level of the channel, as the named mate. */
export async function handleSlashCommand(form: URLSearchParams) {
  const [teamId, channelId, slackUserId] = [form.get("team_id"), form.get("channel_id"), form.get("user_id")];
  if (!teamId || !channelId || !slackUserId) return;
  await handleAsk({ teamId, channelId, slackUserId, text: form.get("text") ?? "", key: `cmd-${form.get("trigger_id") ?? Date.now()}`, dm: channelId.startsWith("D"), inThread: false });
}
