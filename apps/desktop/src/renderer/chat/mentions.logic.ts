/**
 * The @ menu, as the phone has it (packages/api-contract/src/chat-mentions.ts, kept in step by
 * hand so the desktop never pulls in server code): type @ and pick web search, Chief of Staff,
 * a mate or a connected app. A pick leaves the draft and rides along with the message as a chip.
 */

export type MentionMate = { id: string; name: string };
export type MentionApp = { slug: string; name: string };

export type MentionChoice =
  | { kind: "web"; id: "web" }
  | { kind: "chief"; id: "chief" }
  | { kind: "mate"; id: string; mate: MentionMate }
  | { kind: "app"; id: string; app: MentionApp };

/** What's picked for the next message. */
export type MentionPicks = { web: boolean; chief: boolean; mates: MentionMate[]; app: MentionApp | null };

export const NO_PICKS: MentionPicks = { web: false, chief: false, mates: [], app: null };

const MAX_EACH = 6;

/** The word after an @ the cursor is in, or null: "@es" at the end of "ask @es" gives "es". */
export function mentionQuery(textBeforeCursor: string): string | null {
  const match = textBeforeCursor.match(/(?:^|\s)@([^\s@]*)$/);
  return match ? match[1]!.toLowerCase() : null;
}

/** The draft without the @ word being typed, keeping what's after the cursor. */
export function withoutMention(text: string, cursor: number): string {
  const before = text.slice(0, cursor);
  const at = before.lastIndexOf("@");
  const kept = before.slice(0, Math.max(0, at)).trimEnd();
  const after = text.slice(cursor).trimStart();
  return [kept, after].filter(Boolean).join(" ") + (kept && !after ? " " : "");
}

/**
 * Everything the @ offers for this chat and word, in the phone's order: web search while the
 * word could still be it, Chief of Staff in a direct chat, then mates (a group's members, or your
 * other mates in a direct chat), then connected apps. What's already picked isn't offered again.
 */
export function mentionChoices(input: {
  query: string;
  kind: "mate" | "group" | "thread";
  primaryMateId: string;
  members: MentionMate[];
  ownedMates: MentionMate[];
  connectedApps: MentionApp[];
  picks: MentionPicks;
}): MentionChoice[] {
  const query = input.query.trim().toLowerCase();
  const choices: MentionChoice[] = [];
  if (!input.picks.web && ("web search".includes(query) || "search".startsWith(query))) choices.push({ kind: "web", id: "web" });
  if (input.kind === "mate" && !input.picks.chief && "chief of staff".startsWith(query)) choices.push({ kind: "chief", id: "chief" });
  const pool = input.kind === "group" ? input.members : input.kind === "mate" ? input.ownedMates.filter((mate) => mate.id !== input.primaryMateId) : [];
  const picked = new Set(input.picks.mates.map((mate) => mate.id));
  for (const mate of pool.filter((candidate) => !picked.has(candidate.id) && candidate.name.toLowerCase().includes(query)).slice(0, MAX_EACH)) {
    choices.push({ kind: "mate", id: `mate:${mate.id}`, mate });
  }
  for (const app of input.connectedApps.filter((candidate) => candidate.slug !== input.picks.app?.slug && `${candidate.name} ${candidate.slug}`.toLowerCase().includes(query)).slice(0, MAX_EACH)) {
    choices.push({ kind: "app", id: `app:${app.slug}`, app });
  }
  return choices;
}

/** Adds a pick: mates gather, one app at a time (a new one replaces it), web search and Chief of Staff switch on. */
export function addPick(picks: MentionPicks, choice: MentionChoice): MentionPicks {
  if (choice.kind === "web") return { ...picks, web: true };
  if (choice.kind === "chief") return { ...picks, chief: true };
  if (choice.kind === "app") return { ...picks, app: choice.app };
  return picks.mates.some((mate) => mate.id === choice.mate.id) ? picks : { ...picks, mates: [...picks.mates, choice.mate] };
}

export const hasPicks = (picks: MentionPicks) => picks.web || picks.chief || picks.mates.length > 0 || picks.app !== null;

/** The picks as the message keeps them. */
export function tagsOf(picks: MentionPicks): { kind: "web" | "chief" | "mate" | "app"; id: string; label: string }[] {
  return [
    ...picks.mates.map((mate) => ({ kind: "mate" as const, id: mate.id, label: mate.name })),
    ...(picks.app ? [{ kind: "app" as const, id: picks.app.slug, label: picks.app.name }] : []),
    ...(picks.web ? [{ kind: "web" as const, id: "web", label: "Web search" }] : []),
    ...(picks.chief ? [{ kind: "chief" as const, id: "chief", label: "Chief of Staff" }] : []),
  ];
}
