import * as Electron from "electron";
import * as NodeURL from "node:url";
import { applyAppIdentity } from "./app/DesktopAppIdentity.ts";
import { startLifecycle } from "./app/DesktopLifecycle.ts";
import { installWebLinkGuards } from "./app/DesktopWebLinks.ts";
import { installApplicationMenu } from "./window/DesktopApplicationMenu.ts";
import { createMainWindow, followAppearance } from "./window/DesktopWindow.ts";

/** Where the app is put together. Each module owns one concern; this only wires them in order. */

const preload = NodeURL.fileURLToPath(new URL("../preload/index.cjs", import.meta.url));
const file = NodeURL.fileURLToPath(new URL("../renderer/index.html", import.meta.url));
const url = process.env.ELECTRON_RENDERER_URL ?? null;
// Packaged Linux builds take their icon from the .desktop entry; unpackaged ones need it on the window.
const icon = !Electron.app.isPackaged && process.platform === "linux" ? NodeURL.fileURLToPath(new URL("../../build/icon.png", import.meta.url)) : undefined;

applyAppIdentity();

startLifecycle({
  onReady: () => {
    installWebLinkGuards(url ?? NodeURL.pathToFileURL(file).href);
    installApplicationMenu();
    followAppearance();
  },
  openWindow: () => createMainWindow({ preload, url, file, icon }),
});
