import * as Electron from "electron";
import iconPath from "../../../build/icon.png?asset";

// Kept for the app's lifetime: a tray that's garbage-collected disappears from the screen.
let tray: Electron.Tray | null = null;

/**
 * Mates in the tray (the menu bar on a Mac), so it's still there with the window closed: open the
 * app, ask a mate from the summon bar, or quit. Who's working, Pause and See activity join it
 * with lending (desktop-app.md, "Tray / menu bar").
 */
export function installTray({ showMain, summon, summonLabel }: { showMain: () => void; summon: () => void; summonLabel: string | null }) {
  const size = process.platform === "darwin" ? 18 : 16;
  tray = new Electron.Tray(Electron.nativeImage.createFromPath(iconPath).resize({ width: size, height: size }));
  tray.setToolTip("Mates");
  tray.setContextMenu(
    Electron.Menu.buildFromTemplate([
      { label: "Open Mates", click: showMain },
      { label: summonLabel ? `Ask a mate…    ${summonLabel}` : "Ask a mate…", click: summon },
      { type: "separator" },
      { label: "Quit Mates", role: "quit" },
    ]),
  );
  // Windows and Linux open the app on a click; the menu is on right-click. A Mac shows the menu.
  if (process.platform !== "darwin") tray.on("click", showMain);
}
