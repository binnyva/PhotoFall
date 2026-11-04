import { contextBridge, ipcRenderer } from 'electron'
import type { PhotoFallApi } from './api'

const on = (channel: string) => (cb: () => void) => {
  const listener = (): void => cb()
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: PhotoFallApi = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  getPlaylist: (rescan) => ipcRenderer.invoke('playlist:get', rescan),
  chooseFolder: () => ipcRenderer.invoke('folder:choose'),
  exitFullscreen: () => ipcRenderer.invoke('window:exit-fullscreen'),
  reportShown: (id) => ipcRenderer.send('state:shown', id),
  onOpenSettings: on('menu:settings'),
  onTogglePause: on('menu:toggle-pause'),
  onNext: on('menu:next'),
  onClear: on('menu:clear')
}

contextBridge.exposeInMainWorld('photofall', api)
