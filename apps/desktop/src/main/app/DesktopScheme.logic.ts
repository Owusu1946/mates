import * as NodePath from "node:path";

/**
 * The installed app serves its pages from mates://app/ instead of file://. Clerk only accepts a
 * stable origin it can allow-list, and the same scheme carries Apple and Google sign-in back from
 * the system browser (desktop-app.md, Signing in).
 */
export const APP_SCHEME = "mates";
export const APP_HOST = "app";
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

/**
 * The file under `root` that a mates://app/ request asks for, or null when it isn't one of the
 * app's own files: another host, or a path that climbs out of the folder.
 */
export function rendererFile(requestUrl: string, root: string): string | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (url.protocol !== `${APP_SCHEME}:` || url.host !== APP_HOST) return null;
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  const file = NodePath.resolve(root, `.${path === "/" ? "/index.html" : path}`);
  const relative = NodePath.relative(root, file);
  return relative && !relative.startsWith("..") && !NodePath.isAbsolute(relative) ? file : null;
}

/** Site icons are served on mates://app/favicon/<site> (DesktopFavicons.ts), fetched by the app rather than the page. */
export const FAVICON_PATH = "/favicon/";

/** The site a mates://app/favicon/<site> request is for, or null when it isn't a plain host name. */
export function faviconSite(requestUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (url.protocol !== `${APP_SCHEME}:` || url.host !== APP_HOST || !url.pathname.startsWith(FAVICON_PATH)) return null;
  let site: string;
  try {
    site = decodeURIComponent(url.pathname.slice(FAVICON_PATH.length)).toLowerCase();
  } catch {
    return null;
  }
  return /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(site) ? site : null;
}

/**
 * Where to look for a site's icon, best first: DuckDuckGo's (as the phone shows), the site's own,
 * then Google's, which answers every site (a plain globe when it has nothing better).
 */
export const faviconSources = (site: string) => [`https://icons.duckduckgo.com/ip3/${site}.ico`, `https://${site}/favicon.ico`, `https://www.google.com/s2/favicons?domain=${site}&sz=64`];

/** App logos are served on mates://app/logo?src=<url> (DesktopFavicons.ts), only from where Composio keeps them. */
export const LOGO_PATH = "/logo";

/** Hosts an app's logo may come from: Composio's own, and its open logo set on GitHub (via jsDelivr). */
const LOGO_HOST = /(^|\.)composio\.dev$/;
const LOGO_REPO = /^\/gh\/ComposioHQ\//;

/** The logo a mates://app/logo request asks for, when it's an https address Composio keeps logos at; null otherwise. */
export function logoSource(requestUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (url.protocol !== `${APP_SCHEME}:` || url.host !== APP_HOST || url.pathname !== LOGO_PATH) return null;
  const raw = url.searchParams.get("src");
  if (!raw) return null;
  try {
    const logo = new URL(raw);
    if (logo.protocol !== "https:" || logo.username || logo.password || logo.port) return null;
    const allowed = LOGO_HOST.test(logo.hostname) || (logo.hostname === "cdn.jsdelivr.net" && LOGO_REPO.test(logo.pathname));
    return allowed ? logo.href : null;
  } catch {
    return null;
  }
}
