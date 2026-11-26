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
