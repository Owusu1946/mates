/**
 * What the command palette (Ctrl/⌘ K) lists and in what order, after T3 Code's. Typing narrows
 * every group at once; a name that starts with what you typed beats one that only contains it,
 * and letters typed in order ("dkm" for "Dark mode") still match, last.
 */

export type CommandGroup = "Go to" | "Runs" | "Actions";

export type Command = {
  id: string;
  label: string;
  group: CommandGroup;
  /** Quiet text on the right, like a role, a repo or a shortcut. */
  hint?: string;
  /** Other words it answers to. */
  keywords?: string[];
};

export const GROUP_ORDER: CommandGroup[] = ["Go to", "Runs", "Actions"];

/** How well `text` matches `query`: 3 starts with it, 2 has a word starting with it, 1 contains it, 0.5 has its letters in order, 0 none. */
export function matchScore(text: string, query: string): number {
  const hay = text.toLowerCase();
  const needle = query.trim().toLowerCase();
  if (!needle) return 1;
  if (hay.startsWith(needle)) return 3;
  if (hay.split(/[\s/·-]+/).some((word) => word.startsWith(needle))) return 2;
  if (hay.includes(needle)) return 1;
  let at = 0;
  for (const char of hay) if (char === needle[at]) at++;
  return at === needle.length ? 0.5 : 0;
}

/** The commands that match, best first within each group, groups in their usual order. */
export function rankCommands<T extends Command>(commands: T[], query: string): T[] {
  const scored = commands
    .map((command, index) => ({ command, index, score: Math.max(matchScore(command.label, query), ...(command.keywords ?? []).map((word) => matchScore(word, query) * 0.9)) }))
    .filter((entry) => entry.score > 0);
  return GROUP_ORDER.flatMap((group) =>
    scored
      .filter((entry) => entry.command.group === group)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map((entry) => entry.command),
  );
}

/** Arrow keys move through the list and wrap at the ends. */
export function moveActive(active: number, count: number, step: 1 | -1): number {
  if (count === 0) return 0;
  return (active + step + count) % count;
}
