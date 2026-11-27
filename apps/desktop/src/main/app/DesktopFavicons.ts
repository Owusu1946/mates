import * as Electron from "electron";
import { faviconSources } from "./DesktopScheme.logic.ts";

/**
 * Site icons for web citations and sources (mates://app/favicon/<site>) and app logos
 * (mates://app/logo?src=<url>), fetched by the app rather than by the page. The page loads them from the app's own origin, so its CSP stays closed to the
 * web, and the app can try more than one place: DuckDuckGo's icon (as the phone shows), the site's
 * own, then Google's. Answers are kept for the session, so each site is asked once.
 */

type Icon = { body: ArrayBuffer; type: string } | null;

const cache = new Map<string, Promise<Icon>>();
/** Sites kept before the oldest are dropped. */
const CACHE_LIMIT = 500;
/** A slow source gives way to the next. */
const SOURCE_TIMEOUT_MS = 4000;
/** Larger than any icon; anything bigger isn't one. */
const MAX_BYTES = 256 * 1024;

async function fetchIcon(site: string): Promise<Icon> {
  for (const url of faviconSources(site)) {
    try {
      const response = await Electron.net.fetch(url, { signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS) });
      const type = response.headers.get("content-type") ?? "";
      // A 404 with a placeholder image (DuckDuckGo's) means it has nothing: try the next.
      if (!response.ok || !type.startsWith("image/")) continue;
      const body = await response.arrayBuffer();
      if (body.byteLength > 0 && body.byteLength <= MAX_BYTES) return { body, type };
    } catch {
      // Offline, slow or refused: try the next.
    }
  }
  return null;
}

/** The icon for a site, from the session's cache or fetched once. */
function iconFor(site: string): Promise<Icon> {
  let icon = cache.get(site);
  if (!icon) {
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
    icon = fetchIcon(site);
    cache.set(site, icon);
  }
  return icon;
}

/** The response for mates://app/favicon/<site>: the icon, or 404 so the page shows the site's letter. */
export async function faviconResponse(site: string): Promise<Response> {
  const icon = await iconFor(site);
  if (!icon) return new Response("No icon", { status: 404 });
  return new Response(icon.body, { headers: { "content-type": icon.type, "cache-control": "max-age=86400" } });
}

const logos = new Map<string, Promise<Icon>>();

async function fetchLogo(url: string): Promise<Icon> {
  try {
    const response = await Electron.net.fetch(url, { signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS) });
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || !type.startsWith("image/")) return null;
    const body = await response.arrayBuffer();
    return body.byteLength > 0 && body.byteLength <= MAX_BYTES ? { body, type } : null;
  } catch {
    return null;
  }
}

/**
 * The response for mates://app/logo?src=<url>: an app's logo from where Composio keeps it
 * (DesktopScheme.logic.ts logoSource), kept for the session, or 404 so the page shows its tile.
 */
export async function logoResponse(url: string): Promise<Response> {
  let logo = logos.get(url);
  if (!logo) {
    if (logos.size >= CACHE_LIMIT) logos.delete(logos.keys().next().value!);
    logo = fetchLogo(url);
    logos.set(url, logo);
  }
  const icon = await logo;
  if (!icon) return new Response("No logo", { status: 404 });
  // SVG logos draw as images only: no scripts run in an <img>.
  return new Response(icon.body, { headers: { "content-type": icon.type, "cache-control": "max-age=86400" } });
}
