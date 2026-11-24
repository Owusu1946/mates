/**
 * What the sidebar shows and how the keyboard reaches it. Rows read top to bottom (places, mates,
 * groups, code), and the first nine get Ctrl/⌘ 1–9, as T3 Code numbers its thread rows.
 */

export type Selection = { kind: "chat"; id: string } | { kind: "place"; id: string } | { kind: "repo"; id: string } | { kind: "run"; id: string };

/** T3 Code waits this long after Ctrl/⌘ goes down before showing the number badges. */
export const JUMP_HINT_DELAY_MS = 200;
export const JUMP_SLOTS = 9;

export const sameSelection = (a: Selection, b: Selection) => a.kind === b.kind && a.id === b.id;

/** The rows Ctrl/⌘ 1–9 jump to: mates first (the people you talk to most), then groups. */
export function jumpTargets(mateChatIds: string[], groupIds: string[]): Selection[] {
  return [...mateChatIds, ...groupIds].slice(0, JUMP_SLOTS).map((id) => ({ kind: "chat", id }));
}

/** The number a row shows while Ctrl/⌘ is held, or null when it has none. */
export function jumpNumber(targets: Selection[], row: Selection): number | null {
  const index = targets.findIndex((target) => sameSelection(target, row));
  return index < 0 ? null : index + 1;
}

/** Which digit key was pressed with Ctrl/⌘, as a target index, or null. */
export function jumpIndexForKey(key: string): number | null {
  return /^[1-9]$/.test(key) ? Number(key) - 1 : null;
}
