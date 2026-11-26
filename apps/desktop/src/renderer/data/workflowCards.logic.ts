import type { BriefRow, Card } from "./sampleCrew.ts";

/**
 * The cards in a mate's reply (the API's WorkflowCard, apps/api/src/integrations.ts) as the cards
 * the desktop draws. Pure, so every kind's rules are tested without React. The phone's rules hold:
 *
 * - A card still running in a reply that was stopped reads as stopped (chat-thread.tsx shownCard).
 * - The "Starting" placeholder a run begins with shows nothing (workflow-card.tsx).
 * - Speaker cards split a group's reply into rows already (messages.logic.ts), so they're not cards.
 * - A kind the desktop can't act on yet says what it is, and sends you to the phone when it's
 *   waiting for you.
 *
 * Only the fields read here are declared: importing the API's type would pull its source into the
 * desktop's build.
 */

type Mateish = { id: string; name: string };
type ApiCard = {
  kind: string;
  phase: "running" | "done" | "error" | "waiting";
  label: string;
  detail?: string;
  resumeRunId?: string;
  toolkit?: string;
  name?: string;
  logo?: string;
  stage?: string;
  activity?: { label: string; state: "running" | "done" }[];
  startedAt?: string;
  finishedAt?: string;
  approval?: { category: string; targets: string[]; canAlways: boolean; choice?: "allow" | "always" | "decline"; reason?: string; more?: string[] };
  approvalFields?: { label: string; value: string }[];
  options?: { id: string; label: string; detail?: string; toolkit?: string }[];
  items?: { sourceId: string; title: string; subtitle?: string; preview?: string; url?: string }[];
  followUps?: { label: string; prompt: string }[];
  plan?: { summary: string; actions: { id: string; title: string; app?: string; details: { label: string; value: string }[]; status: "proposed" | "running" | "done" | "failed" | "skipped"; error?: string; undo?: { kind: "app" | "reminder"; id: string } }[] };
  sources?: { id: string; url: string; title: string; domain: string; publishedAt: string | null; favicon?: string }[];
  memory?: { id: string; text: string; action: "saved" | "updated" | "forgotten" };
  memories?: { count: number };
  routineId?: string;
  routineVersion?: number;
  nextRunAt?: string;
  watch?: { watchId: string; version: number; title: string; condition: string; action: string; status: "active" | "paused" | "fired" | "expired" | "cancelled" | "failed"; every: string | null; app: string | null; lastNote: string | null; lastCheckedAt: string | null };
  comparison?: { perMate: { mate: Mateish & { role?: string }; recommendation: string; basis: string }[]; disagreements: string[]; suggestion: string };
  code?: { runId: string; repo: string; status: string; pr?: { number: number; title: string; files?: number } };
  handoff?: { from: Mateish; items: { mate: Mateish; task: string }[]; asked?: boolean };
  team?: { name: string; members: Mateish[] };
  mate?: Mateish & { role: string };
  note?: { title: string; author: string };
  consult?: { mate: Mateish; found: number };
  computer?: { goal: string; status: string; waitingFor?: string; question?: string; summary?: string };
  call?: { durationSec: number; summary: string };
  deck?: { title: string; status: string };
  page?: { title: string; status: string };
  prep?: { title: string };
  friendRequest?: { friendName: string; text: string; status: string };
};

export type CardContext = {
  /** The reply was stopped: anything still running in it stopped too. */
  stopped: boolean;
};

const cardOf = (part: unknown): ApiCard | null => {
  const value = part as { type?: string; result?: unknown };
  const result = value?.type === "tool-call" ? (value.result as ApiCard | undefined) : undefined;
  return result && typeof result === "object" && typeof result.kind === "string" ? result : null;
};

const shortDate = (iso: string | null | undefined) => {
  if (!iso) return "";
  const at = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isNaN(at.getTime()) ? "" : at.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(iso.length === 10 ? { timeZone: "UTC" } : {}) });
};
const when = (iso: string | null | undefined) => {
  if (!iso) return "";
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? "" : at.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
};
const rows = (pairs: { label: string; value: string }[] | undefined): BriefRow[] => (pairs ?? []).map((pair) => ({ label: pair.label, text: pair.value }));
const app = (card: ApiCard) => ({ slug: card.toolkit ?? "", name: card.name ?? card.toolkit ?? "" });

/** The run starting up, before it has anything to show. */
const isPlaceholder = (card: ApiCard) => card.kind === "step" && card.phase === "running" && !card.activity?.length && !card.stage && !card.logo;

/** One API card as the desktop's, or null when it shows nothing. */
export function toCard(api: ApiCard, context: CardContext): Card | null {
  const stopped = context.stopped && api.phase === "running";
  const phase = stopped ? "error" : api.phase;
  const label = stopped ? "Stopped" : api.label;

  switch (api.kind) {
    case "speaker":
      return null;
    case "step": {
      if (isPlaceholder(api) && !stopped) return null;
      if (!api.activity?.length) return phase === "error" ? { type: "summary", icon: "info", title: label, detail: api.detail, state: "error" } : null;
      return { type: "activity", label, steps: api.activity.map((step) => ({ label: step.label, done: step.state === "done" })), startedAt: api.startedAt, finishedAt: api.finishedAt, state: stopped ? "stopped" : phase === "error" ? "error" : phase === "running" ? "running" : "done" };
    }
    case "approval": {
      const choice = api.approval?.choice;
      return {
        type: "approval",
        title: api.label,
        detail: api.approval?.reason ?? api.detail ?? "",
        meta: [api.name, ...(api.approval?.targets ?? [])].filter(Boolean).join(" · "),
        allow: "Allow",
        state: choice === "decline" ? "skipped" : choice ? "allowed" : api.phase === "waiting" ? "open" : api.phase === "done" ? "allowed" : "skipped",
        canAlways: api.approval?.canAlways ?? false,
        fields: rows(api.approvalFields),
        targets: [...(api.approval?.targets ?? []), ...(api.approval?.more ?? [])],
        resumeRunId: api.resumeRunId,
      };
    }
    case "choice":
      return { type: "choice", title: api.label, detail: api.detail, options: (api.options ?? []).map((option) => ({ id: option.id, label: option.label, detail: option.detail, app: option.toolkit })), state: api.phase === "waiting" ? "open" : "done", resumeRunId: api.resumeRunId };
    case "results":
      return {
        type: "results",
        app: app(api),
        title: api.label,
        items: (api.items ?? []).map((item) => ({ id: item.sourceId, from: item.subtitle ?? "", title: item.title, snippet: item.preview ?? "", time: "", url: item.url })),
        followUps: api.followUps,
      };
    case "plan": {
      const actions = (api.plan?.actions ?? []).map((action) => ({
        id: action.id,
        app: { slug: action.app ?? "", name: action.app ?? "" },
        label: action.title,
        detail: action.details.map((detail) => detail.value).join(" · ") || undefined,
        selected: action.status !== "skipped",
        ...(action.status !== "proposed" ? { status: action.status } : {}),
        ...(action.error ? { error: action.error } : {}),
        ...(action.undo ? { undo: action.undo } : {}),
      }));
      const state = api.phase === "waiting" ? "review" : actions.some((action) => action.status === "running") || api.phase === "running" ? "running" : actions.every((action) => action.status === "skipped" || !action.status) ? "declined" : "done";
      return { type: "plan", title: api.plan?.summary || api.label, state, actions, resumeRunId: api.resumeRunId };
    }
    case "connection":
      return { type: "connect", app: app(api), reason: api.detail ?? api.label, state: api.phase === "done" ? "connected" : "needed", resumeRunId: api.resumeRunId };
    case "sources":
      return api.sources?.length ? { type: "sources", sources: api.sources.map((source) => ({ id: source.id, url: source.url, title: source.title, domain: source.domain, ...(source.publishedAt ? { published: shortDate(source.publishedAt) } : {}), ...(source.favicon ? { favicon: source.favicon } : {}) })) } : null;
    case "memory":
      return api.memory ? { type: "memory", id: api.memory.id, text: api.memory.text, action: api.memory.action } : null;
    case "memories":
      return { type: "memory", text: api.detail ?? `${api.memories?.count ?? 0} things about you`, action: "updated" };
    case "schedule":
      return { type: "schedule", routineId: api.routineId, version: api.routineVersion, title: api.label, when: api.detail ?? "", next: when(api.nextRunAt), status: "active" };
    case "watch":
      return api.watch ? { type: "watch", watchId: api.watch.watchId, version: api.watch.version, title: api.watch.title, condition: api.watch.condition, action: api.watch.action, every: api.watch.every, app: api.watch.app, lastNote: api.watch.lastNote, lastChecked: when(api.watch.lastCheckedAt) || null, status: api.watch.status } : null;
    case "comparison":
      return api.comparison ? { type: "comparison", suggestion: api.comparison.suggestion, perMate: api.comparison.perMate.map((entry) => ({ mateId: entry.mate.id, recommendation: entry.recommendation, basis: entry.basis })), disagreements: api.comparison.disagreements } : null;
    case "code":
      return api.code ? { type: "run", runId: api.code.runId, title: api.code.pr?.title ?? api.label, project: api.code.repo, files: api.code.pr?.files ?? 0, ...(api.code.pr ? { pr: api.code.pr.number } : {}) } : null;
    case "handoff":
      return { type: "summary", icon: "users", title: api.label, detail: api.handoff?.items.map((item) => `${item.mate.name}: ${item.task}`).join(" · "), state: phase };
    case "team":
      return { type: "summary", icon: "users", title: api.team?.name ?? api.label, detail: api.team?.members.map((member) => member.name).join(", "), state: phase };
    case "mate":
      return { type: "summary", icon: "users", title: api.mate ? `${api.mate.name} joined your crew` : api.label, detail: api.mate?.role, state: phase };
    case "note":
      return { type: "summary", icon: "file", title: api.note?.title ?? api.label, detail: api.note ? `Note by ${api.note.author}` : api.detail, state: phase };
    case "consult":
      return { type: "summary", icon: "brain", title: api.label, detail: api.detail, state: phase };
    case "call":
      return { type: "summary", icon: "phone", title: api.label, detail: api.call?.summary ?? api.detail, state: phase };
    case "computer":
      return { type: "summary", icon: "monitor", title: api.computer?.goal ?? api.label, detail: api.computer?.question ?? api.computer?.summary ?? api.detail, state: phase, onPhone: phase === "waiting" };
    case "browser":
      return { type: "summary", icon: "globe", title: label, detail: api.detail, state: phase, onPhone: phase === "waiting" };
    default:
      // Decks, pages, rides, meeting prep, friend requests, GitHub: what it is, and the phone when it needs you.
      return { type: "summary", icon: api.kind === "prep" ? "clock" : api.kind === "deck" || api.kind === "page" ? "file" : "info", title: label, detail: api.detail, state: phase, onPhone: phase === "waiting" };
  }
}

/** A reply's cards in order, ready to draw. */
export function cardsOf(content: readonly unknown[], context: CardContext): Card[] {
  return content.flatMap((part) => {
    const api = cardOf(part);
    const card = api && toCard(api, context);
    return card ? [card] : [];
  });
}
