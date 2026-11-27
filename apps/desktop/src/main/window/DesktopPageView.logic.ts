/**
 * The page panel: a web page opened beside the chat (a citation, a source), in its own sandboxed
 * view (DesktopPageView.ts). Only web pages open there; anything else is refused.
 */

/** Pages live in their own session, apart from the app's: no app data, no shared sign-ins. */
export const PAGE_PARTITION = "persist:mates-pages";

/** A web page the panel may show: http or https, without a username or password in it. */
export function pageUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 4096) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export type PageBounds = { x: number; y: number; width: number; height: number };

/** Where the page sits in the window, in whole pixels, never negative; nothing sensible is no space at all. */
export function pageBounds(raw: unknown): PageBounds {
  const value = (raw ?? {}) as Partial<Record<keyof PageBounds, unknown>>;
  const whole = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);
  return { x: whole(value.x), y: whole(value.y), width: whole(value.width), height: whole(value.height) };
}

export type PageAction = "back" | "forward" | "reload" | "stop";
const ACTIONS: readonly PageAction[] = ["back", "forward", "reload", "stop"];
export const pageAction = (raw: unknown): PageAction | null => (ACTIONS.includes(raw as PageAction) ? (raw as PageAction) : null);
