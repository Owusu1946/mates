import { createClerkBridge } from "@clerk/electron";
import { storage } from "@clerk/electron/storage";
import * as Electron from "electron";
import * as NodeURL from "node:url";
import { applyAppIdentity } from "./app/DesktopAppIdentity.ts";
import { startLifecycle } from "./app/DesktopLifecycle.ts";
import { installDesktopPrefs } from "./app/DesktopPrefs.ts";
import { APP_HOST, APP_ORIGIN, APP_SCHEME } from "./app/DesktopScheme.logic.ts";
import { serveRenderer } from "./app/DesktopScheme.ts";
import { installTray } from "./app/DesktopTray.ts";
import { installWebLinkGuards } from "./app/DesktopWebLinks.ts";
import { shortcutLabel } from "./summon/SummonWindow.logic.ts";
import { installNotch } from "./notch/NotchWindow.ts";
import { installHandoffs, installSummon } from "./summon/SummonWindow.ts";
import { installApplicationMenu } from "./window/DesktopApplicationMenu.ts";
import { createMainWindow, followAppearance } from "./window/DesktopWindow.ts";

/** Where the app is put together. Each module owns one concern; this only wires them in order. */

const preload = NodeURL.fileURLToPath(new URL("../preload/index.cjs", import.meta.url));
const rendererRoot = NodeURL.fileURLToPath(new URL("../renderer", import.meta.url));
// The dev server in development; installed, the bundled pages on mates://app.
const url = process.env.ELECTRON_RENDERER_URL ?? APP_ORIGIN;
// Packaged Linux builds take their icon from the .desktop entry; unpackaged ones need it on the window.
const icon = !Electron.app.isPackaged && process.platform === "linux" ? NodeURL.fileURLToPath(new URL("../../build/icon.png", import.meta.url)) : undefined;

applyAppIdentity();

// Settings' choices about the app itself, applied once everything they touch exists.
let prefs: ReturnType<typeof installDesktopPrefs> | null = null;

const primary = startLifecycle({
  onReady: ({ showMain }) => {
    serveRenderer(rendererRoot);
    installWebLinkGuards(url);
    installApplicationMenu();
    followAppearance();
    const handoffs = installHandoffs();
    const openInMates = (handoff: Parameters<typeof handoffs.deliver>[1]) => handoffs.deliver(showMain(), handoff);
    // On a MacBook with a notch, the shortcut opens the notch on that screen; elsewhere, the pill.
    const notch = installNotch({ preload, url }, { openInMates });
    const summon = installSummon({ preload, url }, { openInMates, intercept: notch.toggle });
    installTray({ showMain, summon: summon.toggle, summonLabel: summon.shortcut && shortcutLabel(summon.shortcut, process.platform) });
    prefs = installDesktopPrefs({ summon, notch });
  },
  quitOnClose: () => prefs?.quitOnClose() ?? false,
  openWindow: () => createMainWindow({ preload, url, icon }),
});

if (primary) {
  // Signing in (desktop-app.md, Signing in): the Mates session, encrypted with the system's keystore,
  // and Apple or Google finishing in the system browser and coming back on mates://app/. It
  // registers the scheme, so it runs before Electron is ready; our lifecycle owns the one-copy lock.
  const clerk = createClerkBridge({
    storage: storage({ name: "mates-session" }),
    renderer: { scheme: APP_SCHEME, host: APP_HOST },
    manageSingleInstanceLock: false,
    userAgent: `Mates/${Electron.app.getVersion()}`,
  });
  Electron.app.on("before-quit", () => clerk.cleanup());
}
