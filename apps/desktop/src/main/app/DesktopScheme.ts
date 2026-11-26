import * as Electron from "electron";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { APP_SCHEME, rendererFile } from "./DesktopScheme.logic.ts";

/**
 * Serves the bundled pages on mates://app/ (DesktopScheme.logic.ts). The scheme itself is
 * registered as privileged by Clerk's bridge, before the app is ready; this runs once it is.
 */
/**
 * In development, mates:// links must start Electron *with this project*. Clerk's bridge registers
 * the scheme as plain electron.exe, which is right for an installed app, but unpackaged Windows
 * then opens Apple or Google's way back as if the link were an app to run ("Unable to find
 * Electron app at …?__clerk_oauth_attempt=…"). Electron's fix: pass the app's folder too. Run it
 * after the bridge, so this registration is the one that stays.
 */
export function registerDevProtocolClient() {
  if (!process.defaultApp || process.argv.length < 2) return;
  Electron.app.setAsDefaultProtocolClient(APP_SCHEME, process.execPath, [NodePath.resolve(process.argv[1]!)]);
}

export function serveRenderer(root: string) {
  Electron.protocol.handle(APP_SCHEME, (request) => {
    const file = rendererFile(request.url, root);
    if (!file) return new Response("Not found", { status: 404 });
    return Electron.net.fetch(NodeURL.pathToFileURL(file).href);
  });
}
