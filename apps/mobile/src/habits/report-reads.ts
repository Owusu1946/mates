import { runRequest } from "../chat/background-chat";

type ReadType = "feed" | "deck" | "call_notes" | "meeting_notes" | "link" | "watch" | "nudge";
type Read = { type: ReadType; ref?: string; label?: string; chatId?: string; at: string };

let queue: Read[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let tokenSource: (() => Promise<string | null>) | null = null;

/**
 * What the user opens in the app (a result, a deck, notes, a link), for habit learning. Batched and
 * sent at most every 30 seconds; titles only, and dropped quietly if it can't be sent. The server
 * ignores it when habit learning is off.
 */
export function reportRead(getToken: () => Promise<string | null>, read: Omit<Read, "at">) {
  tokenSource = getToken;
  queue.push({ ...read, label: read.label?.slice(0, 160), at: new Date().toISOString() });
  if (queue.length >= 20) return void flush();
  timer ??= setTimeout(() => void flush(), 30_000);
}

async function flush() {
  if (timer) clearTimeout(timer);
  timer = null;
  const events = queue.splice(0, 50);
  if (!events.length || !tokenSource) return;
  await runRequest(tokenSource, "activity", { events }).catch(() => undefined);
}
