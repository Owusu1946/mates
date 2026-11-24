import * as Electron from "electron";

/** Must match appId in electron-builder.yml, or Windows won't group the taskbar icon or show notifications. */
export const APP_ID = "app.askorin.mates.desktop";

/**
 * Windows ties the taskbar entry and notifications to this id. Unpackaged runs use Electron's own
 * executable so a dev build doesn't group with an installed Mates.
 */
export function applyAppIdentity() {
  if (process.platform !== "win32") return;
  Electron.app.setAppUserModelId(Electron.app.isPackaged ? APP_ID : process.execPath);
}
