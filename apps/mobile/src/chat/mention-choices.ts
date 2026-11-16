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

/** Replaces the in-progress `@` token with the chosen name. Nothing is attached until that message is sent. */
export function mentionDraft(text: string, name: string) {
  const at = text.lastIndexOf("@");
  return `${text.slice(0, Math.max(0, at))}@${name} `;
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
