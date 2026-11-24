/**
 * Where a URL may go. The app's own pages are the dev server in development and the bundled
 * index.html when installed; anything else is someone else's site.
 */

export function isAppUrl(url: string, appEntry: string): boolean {
  if (appEntry.startsWith("file:")) return url.split(/[?#]/)[0] === appEntry;
  return url === appEntry || url.startsWith(appEntry.endsWith("/") ? appEntry : `${appEntry}/`);
}

/**
 * The permissions the app's own pages get: only writing to the clipboard (copying an import
 * prompt). Electron routes clipboard writes through the permission handlers, so refusing
 * everything would break Copy. Anything else, or any other page, is refused.
 */
const ALLOWED_PERMISSIONS = new Set(["clipboard-sanitized-write"]);

export function isAllowedPermission(permission: string, pageUrl: string, appEntry: string): boolean {
  return ALLOWED_PERMISSIONS.has(permission) && isAppUrl(pageUrl, appEntry);
}

/** A link that should open in the system browser, or null when it should open nowhere. */
export function externalUrl(url: string): string | null {
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}
