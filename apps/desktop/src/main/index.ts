import * as Electron from "electron";
import * as NodeURL from "node:url";
import { applyAppIdentity } from "./app/DesktopAppIdentity.ts";
import { startLifecycle } from "./app/DesktopLifecycle.ts";
import { installTray } from "./app/DesktopTray.ts";
import { installWebLinkGuards } from "./app/DesktopWebLinks.ts";
import { shortcutLabel } from "./summon/SummonWindow.logic.ts";
import { installHandoffs, installSummon } from "./summon/SummonWindow.ts";
import { installApplicationMenu } from "./window/DesktopApplicationMenu.ts";
import { createMainWindow, followAppearance } from "./window/DesktopWindow.ts";

/** Where the app is put together. Each module owns one concern; this only wires them in order. */

const preload = NodeURL.fileURLToPath(new URL("../preload/index.cjs", import.meta.url));
const file = NodeURL.fileURLToPath(new URL("../renderer/index.html", import.meta.url));
const summonFile = NodeURL.fileURLToPath(new URL("../renderer/summon.html", import.meta.url));
const url = process.env.ELECTRON_RENDERER_URL ?? null;
// Packaged Linux builds take their icon from the .desktop entry; unpackaged ones need it on the window.
const icon = !Electron.app.isPackaged && process.platform === "linux" ? NodeURL.fileURLToPath(new URL("../../build/icon.png", import.meta.url)) : undefined;

applyAppIdentity();

startLifecycle({
  onReady: ({ showMain }) => {
    installWebLinkGuards(url ?? NodeURL.pathToFileURL(file).href);
    installApplicationMenu();
    followAppearance();
    const handoffs = installHandoffs();
    const summon = installSummon({ preload, url, file: summonFile }, { openInMates: (handoff) => handoffs.deliver(showMain(), handoff) });
    installTray({ showMain, summon: summon.toggle, summonLabel: summon.shortcut && shortcutLabel(summon.shortcut, process.platform) });
  },
  openWindow: () => createMainWindow({ preload, url, file, icon }),
});
