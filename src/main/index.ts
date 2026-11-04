import { app, BrowserWindow, dialog, ipcMain, Menu, powerSaveBlocker, shell } from 'electron'
import { join } from 'node:path'
import type { Settings } from '@shared/types'
import { buildPlaylist, lookup } from './library'
import { handleScheme, registerScheme } from './protocol'
import { loadSettings, sanitize, saveSettings } from './settings'
import { flushState, setLastShown } from './state'

registerScheme()
// Give the compositor more GPU memory for tiles. Large Retina/5K screens with a pile of big
// photos can run past Chromium's default budget, which shows as blank parts of cards.
app.commandLine.appendSwitch('force-gpu-mem-available-mb', '2048')

let win: BrowserWindow | null = null
let settings: Settings

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    fullscreen: !process.env.PHOTOFALL_WINDOWED,
    backgroundColor: '#17130f',
    title: 'PhotoFall',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // Videos start on their own, with sound when the setting allows it.
      autoplayPolicy: 'no-user-gesture-required'
    }
  })
  win.once('ready-to-show', () => win?.show())
  win.on('closed', () => (win = null))
  // Never navigate away or open new windows from the slideshow.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())

  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

function buildMenu(): void {
  const send = (channel: string) => () => win?.webContents.send(channel)
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: send('menu:settings') },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      },
      {
        label: 'Slideshow',
        submenu: [
          { label: 'Pause / Resume', accelerator: 'Space', registerAccelerator: false, click: send('menu:toggle-pause') },
          { label: 'Next', accelerator: 'Right', registerAccelerator: false, click: send('menu:next') },
          { label: 'Clear Pile', accelerator: 'CmdOrCtrl+K', click: send('menu:clear') }
        ]
      },
      {
        label: 'View',
        submenu: [{ role: 'togglefullscreen' }, { role: 'toggleDevTools' }]
      },
      { role: 'windowMenu' }
    ])
  )
}

function registerIpc(): void {
  ipcMain.handle('settings:get', () => settings)
  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => {
    settings = sanitize(patch ?? {}, settings)
    saveSettings(settings)
    return settings
  })
  ipcMain.handle('playlist:get', (_e, rescan?: boolean) => buildPlaylist(settings, rescan === true))
  ipcMain.handle('folder:choose', async () => {
    const opts: Electron.OpenDialogOptions = {
      title: 'Choose a folder of photos and videos',
      defaultPath: settings.sourceFolder,
      properties: ['openDirectory']
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    return res.canceled ? null : (res.filePaths[0] ?? null)
  })
  ipcMain.on('state:shown', (_e, id: unknown) => {
    const entry = typeof id === 'string' ? lookup(id) : undefined
    if (entry) setLastShown(entry.path)
  })
  ipcMain.handle('window:exit-fullscreen', () => {
    if (win?.isFullScreen()) win.setFullScreen(false)
  })
}

app.whenReady().then(() => {
  settings = loadSettings()
  handleScheme()
  registerIpc()
  buildMenu()
  createWindow()
  // Keep the display awake while the slideshow is open.
  powerSaveBlocker.start('prevent-display-sleep')
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => flushState())
app.on('window-all-closed', () => app.quit())
