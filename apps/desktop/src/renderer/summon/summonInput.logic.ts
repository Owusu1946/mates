/**
 * Picking a mate in the summon bar by typing `@`, as the plan describes: "@es" at the end of what
 * you're typing lists the mates whose names start with "es"; choosing one takes the mention out
 * of the text and makes it the mate you're asking.
 */

const MENTION = /(^|\s)@([\p{L}\p{N}_-]*)$/u;

/** What follows the `@` you're typing, or null when you aren't typing a mention. */
export function mentionQuery(text: string): string | null {
  return MENTION.exec(text)?.[2] ?? null;
}

/** The text with the mention you were typing taken out. */
export function withoutMention(text: string): string {
  return text.replace(MENTION, "$1");
}

/** Mates whose names start with the query, then those that contain it. */
export function matchMates<T extends { name: string; role: string }>(mates: T[], query: string): T[] {
  const needle = query.toLowerCase();
  const starts = mates.filter((mate) => mate.name.toLowerCase().startsWith(needle));
  const contains = mates.filter((mate) => !starts.includes(mate) && (mate.name.toLowerCase().includes(needle) || mate.role.toLowerCase().includes(needle)));
  return [...starts, ...contains];
}
