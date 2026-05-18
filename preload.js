const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getVolume: () => ipcRenderer.invoke('get-volume'),
  setVolume: (volume) => ipcRenderer.send('set-volume', volume),
  checkApo: () => ipcRenderer.invoke('check-apo'),
  getBoost: () => ipcRenderer.invoke('get-boost'),
  setBoost: (data) => ipcRenderer.send('set-boost', data),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  installApo: () => ipcRenderer.send('install-apo'),
  closeWindow: () => ipcRenderer.send('close-window'),
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  
  // Settings & Presets
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.send('save-settings', settings),
  
  // Visualizer Source
  getDesktopSources: () => ipcRenderer.invoke('get-desktop-sources'),

  // Per-App Mixer
  getAudioSessions: () => ipcRenderer.invoke('get-audio-sessions'),
  setSessionVolume: (data) => ipcRenderer.send('set-session-volume', data),
  setSessionMute: (data) => ipcRenderer.send('set-session-mute', data),

  // Hotkey Events
  onVolumeChanged: (callback) => ipcRenderer.on('volume-changed', (event, vol) => callback(vol)),
  onBoostHotkey: (callback) => ipcRenderer.on('boost-hotkey', (event, diff) => callback(diff)),
  onShowOSD: (callback) => ipcRenderer.on('show-osd', (event, data) => callback(data))
});
