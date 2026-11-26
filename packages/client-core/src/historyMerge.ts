/**
 * Bringing an open chat up to date without redrawing it. assistant-ui's `thread.import()` replaces
 * the whole thread, so the import is everything on screen with only what changed swapped in: new
 * messages, messages whose content changed, and messages whose parent is now known. Unchanged
 * messages keep their objects, so their rows don't redraw.
 *
 * Pure, so it runs and is tested anywhere (node --test). From apps/mobile/src/chat/history-merge.ts;
 * the phone moves onto this copy in a later change.
 */

export type HistoryMessage = { id: string };
export type HistoryItem<M extends HistoryMessage = HistoryMessage> = { message: M; parentId: string | null };
export type HistoryRepository<M extends HistoryMessage = HistoryMessage> = { headId?: string | null; messages: HistoryItem<M>[] };

/** JSON with object keys sorted and dates as ISO strings, so two copies of one message compare equal. */
export function canonical(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export const sameMessage = (a: unknown, b: unknown) => canonical(a) === canonical(b);

export type MergeOptions = {
  /** Every message's parent as the server knows it (pages arrive with their top re-rooted). */
  realParents: Map<string, string | null>;
  /** The server's newest message; the chat moves to it only if that extends what's on screen. */
  serverHead?: string | null;
  /** Never move the chat to another message (loading older history). */
  keepHead?: boolean;
  same?: (a: unknown, b: unknown) => boolean;
};

/**
 * The thread to import to bring `current` up to date with `incoming` (server rows, with their
 * real parents), or null when nothing would change. `changed` lists the messages that differ, and
 * `connected` says whether the incoming rows join onto what's on screen (a refresh that fell too
 * far behind doesn't, and needs a bigger page).
 *
 * - A new message joins under its parent once that parent is on screen or arriving; one whose
 *   parent is older than anything loaded starts a branch at the top (paging fills in above later).
 * - A message already on screen is sent again only if its content or parent changed.
 * - A message shown at the top (its parent wasn't loaded yet) is linked under that parent once it
 *   arrives, which is how "load earlier" joins the pages up.
 * - The head only moves forward along the branch on screen, so a chat the user switched to another
 *   branch, or moved on since, is never yanked back.
 */
export function planMerge<M extends HistoryMessage>(current: HistoryRepository<M>, incoming: HistoryItem<M>[], options: MergeOptions): { headId: string | null; messages: HistoryItem<M>[]; changed: string[]; connected: boolean } | null {
  const same = options.same ?? sameMessage;
  const known = new Map(current.messages.map((item) => [item.message.id, item]));
  const incomingIds = new Set(incoming.map((item) => item.message.id));
  const parents = new Map<string, string | null>(current.messages.map((item) => [item.message.id, item.parentId]));
  const accepted = new Set<string>();
  const out = new Map<string, HistoryItem<M>>();
  const ready = (id: string | null) => id === null || known.has(id) || accepted.has(id);

  // Parents first: keep passing over what's left until nothing more can be placed.
  let pending = incoming.filter((item) => item.message?.id);
  for (let progress = true; pending.length && progress; ) {
    progress = false;
    const next: HistoryItem<M>[] = [];
    for (const item of pending) {
      const id = item.message.id;
      const real = item.parentId ?? null;
      const existing = known.get(id);
      if (!ready(real) && incomingIds.has(real!) && real !== id) {
        next.push(item); // its parent is arriving too; place that first
        continue;
      }
      // Parent on screen or arriving: use it. Otherwise keep where it is, or start at the top.
      const parent = ready(real) ? real : existing ? existing.parentId : null;
      if (existing) {
        if (!same(existing.message, item.message) || existing.parentId !== parent) {
          out.set(id, { message: item.message, parentId: parent });
          parents.set(id, parent);
        }
      } else {
        accepted.add(id);
        out.set(id, { message: item.message, parentId: parent });
        parents.set(id, parent);
      }
      progress = true;
    }
    pending = next;
  }

  const isAncestor = (ancestor: string, of: string) => {
    for (let id: string | null | undefined = of, n = 0; id && n < 10_000; n++) {
      if (id === ancestor) return true;
      id = parents.get(id);
    }
    return false;
  };

  // Messages shown at the top whose real parent has now arrived: link them under it.
  for (const item of current.messages) {
    const id = item.message.id;
    if ((out.get(id)?.parentId ?? item.parentId) !== null) continue;
    const real = options.realParents.get(id);
    if (!real || real === id || !ready(real) || isAncestor(id, real)) continue;
    out.set(id, { message: out.get(id)?.message ?? item.message, parentId: real });
    parents.set(id, real);
  }

  const currentHead = current.headId ?? current.messages.at(-1)?.message.id ?? null;
  let headId = currentHead;
  const candidate = options.serverHead && (known.has(options.serverHead) || accepted.has(options.serverHead)) ? options.serverHead : null;
  if (!options.keepHead && candidate) {
    if (!currentHead) headId = candidate;
    else if (candidate !== currentHead && isAncestor(currentHead, candidate)) headId = candidate;
  }
  if (!headId && !currentHead) headId = [...accepted].at(-1) ?? null;
  if (!out.size && headId === currentHead) return null;
  // Incoming rows join on if any of them sits under a message that was already on screen.
  const connected = !current.messages.length || incoming.some((item) => item.parentId === null || known.has(item.message.id) || (item.parentId !== null && known.has(item.parentId)));
  const messages = current.messages.map((item) => out.get(item.message.id) ?? item);
  for (const id of accepted) messages.push(out.get(id)!);
  return { headId, messages, changed: [...out.keys()], connected };
}

/** A page as a chat on its own: messages whose parent isn't in the page start at the top. */
export function rootPage<M extends HistoryMessage>(items: HistoryItem<M>[]): HistoryItem<M>[] {
  const ids = new Set(items.map((item) => item.message.id));
  return items.map((item) => (item.parentId && !ids.has(item.parentId) ? { ...item, parentId: null } : item));
}
