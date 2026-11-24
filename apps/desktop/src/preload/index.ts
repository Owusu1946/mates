import { contextBridge, ipcRenderer } from "electron";

/**
 * The only things the page can reach in the app: which system it's on, and telling the app the
 * colour scheme so the parts the system draws match. Nothing here can reach Node or the disk.
 */
contextBridge.exposeInMainWorld("mates", {
  platform: process.platform,
  setColorScheme: (scheme: string) => ipcRenderer.send("mates:color-scheme", scheme),
});
