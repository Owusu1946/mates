import * as Electron from "electron";
import { externalUrl, isAllowedPermission, isAppUrl } from "./DesktopWebLinks.logic.ts";

/**
 * Keeps every page on the app's own pages: navigation and redirects elsewhere are blocked, new
 * windows never open (https links go to the system browser), webviews can't attach, and every
 * permission is refused except the few the app's own pages need (DesktopWebLinks.logic.ts).
 */
export function installWebLinkGuards(appEntry: string, exempt: (contents: Electron.WebContents) => boolean = () => false) {
  Electron.app.on("web-contents-created", (_event, contents) => {
    // The page panel shows web pages on purpose and keeps its own rules (DesktopPageView.ts).
    if (exempt(contents)) return;
    const block = (event: { preventDefault(): void }, url: string) => {
      if (!isAppUrl(url, appEntry)) event.preventDefault();
    };
    contents.on("will-navigate", block);
    contents.on("will-redirect", block);
    contents.on("will-attach-webview", (event) => event.preventDefault());
    contents.setWindowOpenHandler(({ url }) => {
      const external = externalUrl(url);
      if (external) void Electron.shell.openExternal(external);
      return { action: "deny" };
    });
  });

  Electron.session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => callback(isAllowedPermission(permission, contents.getURL(), appEntry)));
  Electron.session.defaultSession.setPermissionCheckHandler((contents, permission) => (contents ? isAllowedPermission(permission, contents.getURL(), appEntry) : false));
}
