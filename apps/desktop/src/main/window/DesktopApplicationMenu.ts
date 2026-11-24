import * as Electron from "electron";
import { applicationMenuTemplate, textContextMenuTemplate } from "./DesktopApplicationMenu.logic.ts";

const WEBSITE = "https://agents.askorin.app";

/** macOS shows it in the menu bar; on Windows the title bar is ours so it stays hidden but its shortcuts work; Linux shows it on Alt. */
export function installApplicationMenu() {
  const template = applicationMenuTemplate(process.platform, !Electron.app.isPackaged, () => void Electron.shell.openExternal(WEBSITE));
  Electron.Menu.setApplicationMenu(Electron.Menu.buildFromTemplate(template));
  Electron.app.setAboutPanelOptions({ applicationName: "Mates", applicationVersion: Electron.app.getVersion() });
}

/** Electron shows no context menu by default; text gets the system's own. */
export function installTextContextMenu(contents: Electron.WebContents) {
  contents.on("context-menu", (_event, params) => {
    const template = textContextMenuTemplate(params);
    if (template) Electron.Menu.buildFromTemplate(template).popup();
  });
}
