import * as Electron from "electron";
import * as NodeURL from "node:url";
import { APP_SCHEME, rendererFile } from "./DesktopScheme.logic.ts";

/**
 * Serves the bundled pages on mates://app/ (DesktopScheme.logic.ts). The scheme itself is
 * registered as privileged by Clerk's bridge, before the app is ready; this runs once it is.
 */
export function serveRenderer(root: string) {
  Electron.protocol.handle(APP_SCHEME, (request) => {
    const file = rendererFile(request.url, root);
    if (!file) return new Response("Not found", { status: 404 });
    return Electron.net.fetch(NodeURL.pathToFileURL(file).href);
  });
}
