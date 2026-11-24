import { contextBridge, ipcRenderer } from "electron";

/** Listens to one message from the app; the returned function stops listening. */
function subscribe(channel: string, listener: () => void) {
  const handler = () => listener();
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.off(channel, handler);
}

/**
 * The only things a page can reach in the app: which system it's on, the colour scheme, the
 * summon bar's few controls, and conversations handed over from the bar. Nothing here can reach
 * Node or the disk, and the app checks everything a page sends.
 */
contextBridge.exposeInMainWorld("mates", {
  platform: process.platform,
  setColorScheme: (scheme: string) => ipcRenderer.send("mates:color-scheme", scheme),
  summon: {
    resize: (height: number) => ipcRenderer.send("mates:summon-resize", height),
    hide: () => ipcRenderer.send("mates:summon-hide"),
    openInMates: (handoff: unknown) => ipcRenderer.send("mates:summon-open", handoff),
    onShown: (listener: () => void) => subscribe("mates:summon-shown", listener),
  },
  notch: {
    setInteractive: (interactive: boolean) => ipcRenderer.send("mates:notch-interactive", interactive),
    focus: () => ipcRenderer.send("mates:notch-focus"),
    blur: () => ipcRenderer.send("mates:notch-blur"),
    openInMates: (handoff: unknown) => ipcRenderer.send("mates:notch-open", handoff),
    onToggle: (listener: () => void) => subscribe("mates:notch-toggle", listener),
  },
  takeHandoff: () => ipcRenderer.invoke("mates:take-handoff"),
  onHandoff: (listener: () => void) => subscribe("mates:handoff-ready", listener),
});
