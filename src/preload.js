const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('appInfo', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  }
})

contextBridge.exposeInMainWorld('tvAPI', {
  // Passing no value toggles; pass true/false to set the state explicitly.
  setFullscreen: (value) =>
    ipcRenderer.invoke('window:set-fullscreen', typeof value === 'boolean' ? value : undefined),
  isFullscreen: () => ipcRenderer.invoke('window:get-fullscreen'),
  onFullscreenChange: (callback) => {
    if (typeof callback !== 'function') return () => {}
    const listener = (_event, isFullscreen) => callback(Boolean(isFullscreen))
    ipcRenderer.on('window:fullscreen-changed', listener)
    return () => ipcRenderer.removeListener('window:fullscreen-changed', listener)
  },
  minimize: () => ipcRenderer.invoke('window:minimize'),
  close: () => ipcRenderer.invoke('window:close'),
  toggleAlwaysOnTop: () => ipcRenderer.invoke('window:toggle-always-on-top'),
  isAlwaysOnTop: () => ipcRenderer.invoke('window:get-always-on-top'),

  // Settings persistence + media picking
  loadStore: () => ipcRenderer.invoke('store:load'),
  saveStore: (data) => ipcRenderer.invoke('store:save', data),
  saveStoreSync: (data) => {
    try {
      return ipcRenderer.sendSync('store:save-sync', data)
    } catch (err) {
      return false
    }
  },
  pickMedia: () => ipcRenderer.invoke('dialog:pick-media'),
  prepareMedia: (file) => ipcRenderer.invoke('media:prepare', file),
  // Electron no longer exposes File.path, this resolves the real path for drag & drop.
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file) || ''
    } catch (err) {
      return ''
    }
  }
})
