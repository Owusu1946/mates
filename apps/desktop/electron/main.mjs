import { app, BrowserWindow, dialog } from 'electron'
import { fileURLToPath } from 'node:url'

const indexPath = fileURLToPath(new URL('../dist/index.html', import.meta.url))
const iconPath = fileURLToPath(new URL('../../../brand/mates-avatar.png', import.meta.url))

app.setName('Mates')

async function openWindow() {
  const window = new BrowserWindow({
    title: 'Mates',
    width: 1152,
    height: 780,
    minWidth: 680,
    minHeight: 560,
    backgroundColor: '#f9f8f4',
    icon: iconPath,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.once('ready-to-show', () => window.show())

  const devUrl = app.isPackaged ? undefined : process.env.MATES_DESKTOP_DEV_URL
  try {
    if (devUrl) {
      await window.loadURL(devUrl)
    } else {
      await window.loadFile(indexPath)
    }
  } catch (error) {
    console.error(error)
    dialog.showErrorBox('Could not open Mates', 'Run the desktop build before starting Mates.')
    app.exit(1)
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
void app.whenReady().then(() => {
  void openWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void openWindow()
  })
})
