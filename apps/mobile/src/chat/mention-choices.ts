export const CHIEF_OF_STAFF = "Chief of Staff";

export type MentionMate = { id: string; name: string };

/** Mates offered in the @ menu. Groups offer their members; a direct chat offers the user's other mates. */
export function mentionMatesForChat<G extends MentionMate, O extends MentionMate>(input: {
  kind: string | null | undefined;
  primaryMateId: string | null;
  groupMembers: G[];
  ownedMates: O[];
  query: string;
}): Array<G | O> {
  const query = input.query.trim().toLowerCase();
  const source = input.kind === "group"
    ? input.groupMembers
    : input.kind === "mate"
      ? input.ownedMates.filter((mate) => mate.id !== input.primaryMateId)
      : [];
  return source.filter((mate) => mate.name.toLowerCase().includes(query)).slice(0, 6);
}

/** Replaces the in-progress `@` token. A picked mate keeps its id so a duplicate name or a later rename cannot reroute the message. */
export function mentionDraft(text: string, name: string, id?: string) {
  const at = text.lastIndexOf("@");
  const tag = id ? `@${name}{${id}}` : `@${name}`;
  return `${text.slice(0, Math.max(0, at))}${tag} `;
}

const MENTION_ID = String.raw`@([^\n{}]{1,80}?)\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}`;

/** The draft a person reads. The stored message still carries the mate id. */
export function visibleMentionText(text: string) {
  return text.replace(new RegExp(MENTION_ID, "gi"), "@$1");
}

/** Keep picked IDs when editing text around a mention; editing the mention itself makes it plain text. */
export function preserveMentionIds(previous: string, nextVisible: string) {
  const oldVisible = visibleMentionText(previous);
  let prefix = 0;
  while (prefix < oldVisible.length && prefix < nextVisible.length && oldVisible[prefix] === nextVisible[prefix]) prefix++;
  let suffix = 0;
  while (suffix < oldVisible.length - prefix && suffix < nextVisible.length - prefix && oldVisible[oldVisible.length - 1 - suffix] === nextVisible[nextVisible.length - 1 - suffix]) suffix++;
  const oldEnd = oldVisible.length - suffix;
  const shift = nextVisible.length - oldVisible.length;
  const tokens: { start: number; visible: string; raw: string }[] = [];
  let removed = 0;
  for (const match of previous.matchAll(new RegExp(MENTION_ID, "gi"))) {
    const start = (match.index ?? 0) - removed;
    const visible = `@${match[1]}`;
    const end = start + visible.length;
    if (end <= prefix || start >= oldEnd) tokens.push({ start: start >= oldEnd ? start + shift : start, visible, raw: match[0] });
    removed += match[0].length - visible.length;
  }
  let result = nextVisible;
  for (const token of tokens.reverse()) {
    if (result.slice(token.start, token.start + token.visible.length) === token.visible)
      result = `${result.slice(0, token.start)}${token.raw}${result.slice(token.start + token.visible.length)}`;
  }
  return result;
}

/** Web Search takes the `@` token out of the draft. It is not a mate. */
export function webSearchDraft(text: string) {
  const at = text.lastIndexOf("@");
  const prefix = text.slice(0, Math.max(0, at)).trimEnd();
  return prefix ? `${prefix} ` : "";
}

/** Refresh the chat list only after a tagged run finishes, so a draft mention cannot change who is attached. */
export function collaboratorRefreshDue(wasRunning: boolean, running: boolean, tagged: boolean) {
  return wasRunning && !running && tagged;
}

/** Chief of Staff coordinates a direct chat. It is not one of the user's mates. */
export function showChiefOfStaff(kind: string | null | undefined, query: string) {
  if (kind !== "mate") return false;
  const text = query.trim().toLowerCase();
  return "chief of staff".startsWith(text);
}
