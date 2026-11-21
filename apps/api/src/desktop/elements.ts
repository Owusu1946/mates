import { INTERACTIVE_ROLES, type ScreenElement } from "./types.js";

/**
 * One node of an AT-SPI accessibility tree, as both providers report it: Daytona's
 * `accessibility.getTree()`, and our `mates-a11y` script on E2B (scripts/computer/mates-a11y.py).
 */
export type RawNode = { id?: string; role?: string; name?: string; states?: string[]; bounds?: { x?: number; y?: number; width?: number; height?: number }; children?: RawNode[] };

/** Flattens the accessibility tree to the visible controls a person could act on. */
export function flattenElements(root: RawNode | undefined, limit: number, screen = { width: 1024, height: 768 }): ScreenElement[] {
  const out: ScreenElement[] = [];
  const walk = (node: RawNode) => {
    if (out.length >= limit) return;
    const b = node.bounds;
    const states = node.states ?? [];
    const onScreen = !!b && (b.width ?? 0) > 0 && (b.height ?? 0) > 0 && (b.x ?? -1) >= 0 && (b.y ?? -1) >= 0 && (b.x ?? 0) < screen.width && (b.y ?? 0) < screen.height;
    // Chrome reports its controls without "showing" (just enabled, sensitive); on-screen bounds and
    // no "invisible" stand in for it there.
    const shown = states.includes("showing") || states.includes("visible") || (states.length > 0 && !states.includes("invisible"));
    if (node.id && node.role && INTERACTIVE_ROLES.has(node.role) && onScreen && shown) {
      out.push({ id: node.id, role: node.role, name: (node.name ?? "").slice(0, 80), bounds: { x: b!.x!, y: b!.y!, width: b!.width!, height: b!.height! }, focused: states.includes("focused") });
    }
    for (const child of node.children ?? []) walk(child);
  };
  if (root) walk(root);
  return out;
}
