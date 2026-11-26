import * as Electron from "electron";
import { PAGE_PARTITION, pageAction, pageBounds, pageUrl } from "./DesktopPageView.logic.ts";

/**
 * The page panel (T3 Code's desktop web previews): a web page opened beside the chat, like a
 * citation, in a WebContentsView laid over the panel's place in the window. It's sandboxed in its
 * own session, with no preload, no permissions and no downloads, so a page can't reach the app or
 * your Mates session. Links stay in the panel; anything that isn't a web page goes nowhere. The
 * page tells the app what it shows (address, title, loading, back and forward), and the app says
 * where the panel is and when it's hidden.
 */

const views = new Map<number, Electron.WebContentsView>();

/** The pages' own session, set up once: nothing may ask for permissions, and nothing downloads. */
let pageSession: Electron.Session | null = null;
export function pagesSession(): Electron.Session {
  if (pageSession) return pageSession;
  pageSession = Electron.session.fromPartition(PAGE_PARTITION);
  pageSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  pageSession.setPermissionCheckHandler(() => false);
  pageSession.on("will-download", (event) => event.preventDefault());
  return pageSession;
}

/** Whether a webContents is the page panel's (the app's own link guards leave it to this module). */
export const isPageContents = (contents: Electron.WebContents) => pageSession !== null && contents.session === pageSession;

function sendState(window: Electron.BrowserWindow, view: Electron.WebContentsView, error?: string) {
  if (window.isDestroyed()) return;
  const contents = view.webContents;
  window.webContents.send("mates:page-state", {
    url: contents.getURL(),
    title: contents.getTitle(),
    loading: contents.isLoading(),
    canGoBack: contents.navigationHistory.canGoBack(),
    canGoForward: contents.navigationHistory.canGoForward(),
    ...(error ? { error } : {}),
  });
}

function viewFor(window: Electron.BrowserWindow): Electron.WebContentsView {
  const existing = views.get(window.id);
  if (existing) return existing;
  const view = new Electron.WebContentsView({ webPreferences: { session: pagesSession(), sandbox: true, contextIsolation: true, nodeIntegration: false } });
  view.setVisible(false);
  window.contentView.addChildView(view);
  views.set(window.id, view);
  const contents = view.webContents;
  // Links open in the panel; only web pages, never other apps or files.
  contents.setWindowOpenHandler(({ url }) => {
    const page = pageUrl(url);
    if (page) void contents.loadURL(page);
    return { action: "deny" };
  });
  contents.on("will-navigate", (event, url) => {
    if (!pageUrl(url)) event.preventDefault();
  });
  contents.on("will-attach-webview", (event) => event.preventDefault());
  const update = () => sendState(window, view);
  contents.on("did-start-loading", update);
  contents.on("did-stop-loading", update);
  contents.on("did-navigate", update);
  contents.on("did-navigate-in-page", update);
  contents.on("page-title-updated", update);
  contents.on("did-fail-load", (_event, code, description, _url, isMainFrame) => {
    // -3 is a navigation the page itself replaced: not a failure.
    if (isMainFrame && code !== -3) sendState(window, view, description || "This page couldn’t load.");
  });
  window.once("closed", () => close(window.id));
  return view;
}

function close(windowId: number) {
  const view = views.get(windowId);
  if (!view) return;
  views.delete(windowId);
  const window = Electron.BrowserWindow.fromId(windowId);
  if (window && !window.isDestroyed()) window.contentView.removeChildView(view);
  view.webContents.close();
}

const windowOf = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) => Electron.BrowserWindow.fromWebContents(event.sender);

/** The page panel's messages from the app's windows. Pages themselves can send nothing. */
export function installPageView() {
  Electron.ipcMain.on("mates:page-open", (event, raw: unknown) => {
    const window = windowOf(event);
    const url = pageUrl(raw);
    if (!window || !url) return;
    void viewFor(window).webContents.loadURL(url);
  });
  Electron.ipcMain.on("mates:page-bounds", (event, raw: unknown, visible: unknown) => {
    const window = windowOf(event);
    const view = window && views.get(window.id);
    if (!view) return;
    const bounds = pageBounds(raw);
    view.setBounds(bounds);
    view.setVisible(visible === true && bounds.width > 0 && bounds.height > 0);
  });
  Electron.ipcMain.on("mates:page-action", (event, raw: unknown) => {
    const window = windowOf(event);
    const contents = window && views.get(window.id)?.webContents;
    const action = pageAction(raw);
    if (!contents || !action) return;
    if (action === "back" && contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack();
    if (action === "forward" && contents.navigationHistory.canGoForward()) contents.navigationHistory.goForward();
    if (action === "reload") contents.reload();
    if (action === "stop") contents.stop();
  });
  Electron.ipcMain.on("mates:page-external", (event) => {
    const window = windowOf(event);
    const page = window && pageUrl(views.get(window.id)?.webContents.getURL());
    if (page) void Electron.shell.openExternal(page);
  });
  Electron.ipcMain.on("mates:page-close", (event) => {
    const window = windowOf(event);
    if (window) close(window.id);
  });
}
