import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { createChatStore } from "./chats.js";
import { getDb } from "./db/client.js";
import { delegations, mates, slackRuns } from "./db/schema.js";
import { submitRun } from "./durable-runs.js";
import type { WorkflowCard } from "./integrations.js";
import { installFor, mateIdentity, slackApi } from "./slack.js";
import { drainSlackQueue } from "./slack-events.js";

/**
 * Results going back to Slack. Every run started from Slack has a `slack_runs` row; once the run
 * ends (finished, failed, stopped, or waiting for the person), its answer replaces the mate's "On it…"
 * message. Runs the person must act on get Slack buttons, and a press resumes the run.
 */

const DONE = ["completed", "failed", "cancelled", "waiting"];
const MAX_ATTEMPTS = 5;
type Content = Record<string, unknown>[];
type Block = Record<string, unknown>;

/** The answer's words, in order (as saveFinding reads them). */
export const answerText = (content: Content) =>
  content.filter((part) => part.type === "text").map((part) => String(part.text)).join("\n").trim();

/** The card a waiting run is waiting on, if any. */
export const waitingCard = (content: Content) =>
  content.map((part) => (part.type === "tool-call" ? (part.result as WorkflowCard | undefined) : undefined)).findLast((card) => card?.phase === "waiting");

/** Markdown from the model, in Slack's own dialect: *bold*, <url|links>, no headings. */
export function toMrkdwn(markdown: string) {
  return markdown
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "<$2|$1>")
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
    .replace(/^\s*[-*]\s+/gm, "• ");
}

/** Slack's limit for one section's text; longer answers are split across sections at natural breaks. */
const SECTION_LIMIT = 2900;
/** Sections per message (Slack allows 50 blocks); anything past this goes in follow-up messages. */
const SECTIONS_PER_MESSAGE = 40;

/** Splits a long answer at paragraph, then line, then word breaks, never mid-word. */
export function splitText(text: string, limit = SECTION_LIMIT) {
  const chunks: string[] = [];
  let rest = text.trim();
  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    const cut = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf("\n"), window.lastIndexOf(" "));
    const at = cut > limit * 0.5 ? cut : limit;
    chunks.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

const button = (text: string, value: string, style?: "primary" | "danger") => ({ type: "button", action_id: `mates_${value.slice(-40).replace(/[^\w-]/g, "_")}`, text: { type: "plain_text", text: text.slice(0, 75) }, value, ...(style ? { style } : {}) });
const linkButton = (text: string, url: string) => ({ type: "button", action_id: `mates_open_${text.length}`, text: { type: "plain_text", text }, url });
const section = (text: string): Block => ({ type: "section", text: { type: "mrkdwn", text: text.slice(0, 2900) } });
/** Opens the app from a Slack button (Slack buttons need http links), via our redirect page. */
const openApp = (path: string) => `${process.env.API_PUBLIC_URL ?? "https://mates-production.up.railway.app"}/v1/slack/open?to=${encodeURIComponent(path)}`;

/**
 * Buttons for whatever the run is waiting on. Each button's value is `<delegation id>|<choice>`, the
 * same choices the app sends when you tap its cards.
 */
export function waitingBlocks(card: WorkflowCard, delegationId: string): Block[] {
  const v = (choice: string) => `${delegationId}|${choice}`;
  switch (card.kind) {
    case "choice": {
      const options = card.options ?? [];
      const rows: Block[] = [];
      for (let i = 0; i < options.length; i += 5) rows.push({ type: "actions", elements: options.slice(i, i + 5).map((option) => button(option.label, v(option.id))) });
      return [section(`*${card.label}*`), ...rows];
    }
    case "plan": {
      const actions = card.plan?.actions ?? [];
      const list = actions.map((action) => `• ${action.title}`).join("\n");
      return [
        section(`*${card.plan?.summary || card.label}*${list ? `\n${list}` : ""}`),
        { type: "actions", elements: [button("Approve", v(`approve:${actions.map((action) => action.id).join(",")}`), "primary"), button("Decline", v("decline"), "danger")] },
      ];
    }
    case "approval": {
      const fields = (card.approvalFields ?? []).map((field) => `*${field.label}:* ${field.value}`).join("\n");
      return [section(`*${card.label}*${fields ? `\n${fields}` : ""}`), { type: "actions", elements: [button("Approve", v("approve"), "primary"), button("Decline", v("decline"), "danger")] }];
    }
    case "connection":
      return [
        section(`*${card.label}*\n${card.detail ?? `Connect ${card.name ?? "the app"} in Mates to carry on.`}`),
        { type: "actions", elements: [linkButton(`Connect ${card.name ?? "app"}`, openApp("connections")), button("Done, carry on", v("connected"), "primary")] },
      ];
    default:
      return [section(`*${card.label}*\nThis one needs you in the Mates app.`), { type: "actions", elements: [linkButton("Open Mates", openApp(""))] }];
  }
}

/** Web sources and pull requests from the run, as compact blocks under the answer. */
export function extrasBlocks(content: Content): Block[] {
  const cards = content.flatMap((part) => (part.type === "tool-call" ? [part.result as WorkflowCard] : []));
  const blocks: Block[] = [];
  for (const card of cards) {
    const pr = card?.code?.pr;
    if (pr) blocks.push({ ...section(`*Pull request #${pr.number}:* <${pr.url}|${pr.title}>${pr.files ? `\n${pr.files} files · +${pr.additions ?? 0} −${pr.deletions ?? 0}` : ""}`), accessory: { type: "button", action_id: `mates_pr_${pr.number}`, text: { type: "plain_text", text: "View PR" }, url: pr.url } });
  }
  const sources = cards.flatMap((card) => card?.sources ?? []).slice(0, 5);
  if (sources.length) blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `Sources: ${sources.map((source) => `<${source.url}|${source.title.slice(0, 60) || source.domain}>`).join(" · ")}`.slice(0, 2900) }] });
  return blocks;
}

type Message = { text: string; blocks?: Block[] };

/**
 * What the mate says when a run ends: the answer split into sections (more messages if it's very
 * long), then sources, pull requests, and the buttons for anything it's waiting on. The first message
 * replaces "On it…"; the rest follow in the thread.
 */
export function resultMessages(status: string, content: Content, error: string | null, delegationId: string): Message[] {
  if (status === "failed") return [{ text: `I couldn’t finish that. ${error ?? "Try asking again."}` }];
  if (status === "cancelled") return [{ text: "Stopped." }];
  const text = toMrkdwn(answerText(content));
  const card = status === "waiting" ? waitingCard(content) : undefined;
  const sections = splitText(text).map(section);
  const tail = [...extrasBlocks(content), ...(card ? waitingBlocks(card, delegationId) : [])];
  if (!sections.length && !tail.length) return [{ text: "Done." }];
  const parts: Block[][] = [];
  for (let i = 0; i < Math.max(sections.length, 1); i += SECTIONS_PER_MESSAGE) parts.push(sections.slice(i, i + SECTIONS_PER_MESSAGE));
  parts.at(-1)!.push(...tail);
  // Notifications and screen readers read `text`: the start of each part, in plain words.
  return parts.map((blocks, i) => ({ text: (i === 0 ? text || card?.label || "Done." : "(continued)").slice(0, 3000), blocks }));
}

/** The first message alone. */
export const resultMessage = (status: string, content: Content, error: string | null, delegationId: string) => resultMessages(status, content, error, delegationId)[0]!;

/** Posts every finished Slack run's answer. Safe to call often: rows are claimed once delivered. */
export async function deliverSlack() {
  const due = await getDb()
    .select({ slack: slackRuns, run: delegations })
    .from(slackRuns)
    .innerJoin(delegations, eq(slackRuns.delegationId, delegations.id))
    .where(and(isNull(slackRuns.deliveredAt), lt(slackRuns.attempts, MAX_ATTEMPTS), inArray(delegations.status, DONE)))
    .limit(25);
  for (const { slack, run } of due) {
    try {
      const install = await installFor(slack.teamId);
      if (!install) {
        await getDb().update(slackRuns).set({ deliveredAt: new Date(), deliveredStatus: "uninstalled" }).where(eq(slackRuns.delegationId, slack.delegationId));
        continue;
      }
      const [mate] = await getDb().select().from(mates).where(eq(mates.id, slack.mateId));
      const identity = mate ? mateIdentity(mate) : { username: "Mates" };
      const [first, ...rest] = resultMessages(run.status, run.content, run.error, run.id);
      const post = (message: Message) => slackApi(install.token, "chat.postMessage", { channel: slack.channelId, ...(slack.threadTs ? { thread_ts: slack.threadTs } : {}), unfurl_links: false, ...identity, ...message });
      // Replace "On it…" where we can; otherwise answer in the thread. Long answers continue below it.
      const updated = slack.statusTs ? await slackApi(install.token, "chat.update", { channel: slack.channelId, ts: slack.statusTs, ...first! }).then(() => true, () => false) : false;
      if (!updated) await post(first!);
      for (const message of rest) await post(message);
      await getDb().update(slackRuns).set({ deliveredAt: new Date(), deliveredStatus: run.status }).where(eq(slackRuns.delegationId, slack.delegationId));
      // Eyes while working; then a tick when done, a cross if it failed, a raised hand if it needs you.
      if (slack.askTs) {
        await slackApi(install.token, "reactions.remove", { channel: slack.channelId, timestamp: slack.askTs, name: "eyes" }).catch(() => undefined);
        const done = ({ completed: "white_check_mark", failed: "x", waiting: "raising_hand" } as Record<string, string>)[run.status];
        if (done) await slackApi(install.token, "reactions.add", { channel: slack.channelId, timestamp: slack.askTs, name: done }).catch(() => undefined);
      }
    } catch (error) {
      console.warn("slack_delivery_failed", { id: slack.delegationId, message: error instanceof Error ? error.message : String(error) });
      await getDb().update(slackRuns).set({ attempts: slack.attempts + 1 }).where(eq(slackRuns.delegationId, slack.delegationId));
    }
  }
  // Mates that just finished may have asks waiting for them.
  await drainSlackQueue().catch((error) => console.warn("slack_queue_drain_failed", { message: error instanceof Error ? error.message : String(error) }));
}

/** The conversation so far, ending with the person's last message, as a resume needs it. */
async function resumeTurns(userId: string, chatId: string) {
  const history = (await createChatStore().history(userId, chatId)) ?? [];
  const turns = history.slice(-40).flatMap(({ message }) => {
    const parts = Array.isArray(message.content) ? (message.content as { type?: string; text?: unknown }[]) : [];
    const content = parts.filter((p) => p.type === "text" && typeof p.text === "string").map((p) => String(p.text)).join("\n").trim().slice(0, 8000);
    return content && (message.role === "user" || message.role === "assistant") ? [{ role: message.role as "user" | "assistant", content }] : [];
  });
  while (turns.length && turns.at(-1)!.role !== "user") turns.pop();
  return turns;
}

type Interaction = { type: string; user?: { id: string }; team?: { id: string }; channel?: { id: string }; container?: { message_ts?: string }; actions?: { value?: string }[] };

/**
 * A button pressed on one of our messages. Only the person who asked can answer their mate; the
 * run resumes exactly as it would from the app, and its answer lands in the same message.
 */
export async function handleInteraction(payload: Interaction) {
  const value = payload.actions?.[0]?.value;
  const slackUserId = payload.user?.id;
  const teamId = payload.team?.id;
  const channelId = payload.channel?.id;
  if (payload.type !== "block_actions" || !value || !slackUserId || !teamId || !channelId) return;
  const split = value.indexOf("|");
  const [delegationId, choice] = [value.slice(0, split), value.slice(split + 1)];
  if (split < 0 || !choice) return;

  const [row] = await getDb().select({ slack: slackRuns, run: delegations }).from(slackRuns).innerJoin(delegations, eq(slackRuns.delegationId, delegations.id)).where(and(eq(slackRuns.delegationId, delegationId), eq(slackRuns.teamId, teamId)));
  const install = await installFor(teamId);
  if (!row || !install) return;
  if (row.slack.slackUserId !== slackUserId) {
    await slackApi(install.token, "chat.postEphemeral", { channel: channelId, user: slackUserId, text: "Only the person who asked can answer this one." });
    return;
  }
  const { run, slack } = row;
  const card = waitingCard(run.content);
  if (run.status !== "waiting" || !card || !run.chatId) return;
  const resumeRunId = card.resumeRunId ?? run.agentRunId ?? undefined;
  const label = choice.startsWith("approve") ? "Approved" : choice === "decline" ? "Declined" : "Got it";
  const ts = payload.container?.message_ts ?? slack.statusTs ?? undefined;
  if (ts) await slackApi(install.token, "chat.update", { channel: channelId, ts, text: `${label} · working on it…`, blocks: [section(`${label} by you · working on it…`)] }).catch(() => undefined);

  const next = await submitRun(slack.clerkUserId, {
    chatId: run.chatId,
    assistantMessageId: run.assistantMessageId,
    parentId: run.parentId ?? run.assistantMessageId,
    requestKey: `${run.assistantMessageId}_${resumeRunId ?? "new"}_${choice}`.slice(0, 160),
    messages: await resumeTurns(slack.clerkUserId, run.chatId),
    resumeRunId,
    choice: choice.slice(0, 200),
  });
  await getDb()
    .insert(slackRuns)
    .values({ delegationId: next.id, teamId, channelId, threadTs: slack.threadTs, statusTs: ts ?? null, mateId: slack.mateId, clerkUserId: slack.clerkUserId, slackUserId })
    .onConflictDoNothing();
}
