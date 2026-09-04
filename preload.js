const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getVolume: () => ipcRenderer.invoke('get-volume'),
  setVolume: (volume) => ipcRenderer.send('set-volume', volume),
  checkApo: () => ipcRenderer.invoke('check-apo'),
  getBoost: () => ipcRenderer.invoke('get-boost'),
  setBoost: (data) => ipcRenderer.send('set-boost', data),
  resetApo: () => ipcRenderer.send('reset-apo'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  installApo: () => ipcRenderer.send('install-apo'),
  closeWindow: () => ipcRenderer.send('close-window'),
  minimizeWindow: () => ipcRenderer.send('minimize-window'),

  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.send('save-settings', settings),
  completeFirstRun: () => ipcRenderer.send('complete-first-run'),

  getAudioDevices: () => ipcRenderer.invoke('get-audio-devices'),
  applyProfile: (id) => ipcRenderer.send('apply-profile', id),
  saveProfile: (profile) => ipcRenderer.send('save-profile', profile),

  getAudioSessions: () => ipcRenderer.invoke('get-audio-sessions'),
  setSessionVolume: (data) => ipcRenderer.send('set-session-volume', data),
  setSessionMute: (data) => ipcRenderer.send('set-session-mute', data),

  sendAudioMeter: (data) => ipcRenderer.send('audio-meter', data),
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  relaunchElevated: () => ipcRenderer.send('relaunch-elevated'),
  previewOsd: () => ipcRenderer.send('preview-osd'),
  checkUpdates: () => ipcRenderer.send('check-updates'),
  installUpdate: () => ipcRenderer.send('install-update'),

  onVolumeChanged: (callback) => ipcRenderer.on('volume-changed', (event, vol) => callback(vol)),
  onBoostHotkey: (callback) => ipcRenderer.on('boost-hotkey', (event, diff) => callback(diff)),
  onBoostReset: (callback) => ipcRenderer.on('boost-reset', (event, val) => callback(val)),
  onShowOSD: (callback) => ipcRenderer.on('show-osd', (event, data) => callback(data)),
  onAudioMeter: (callback) => ipcRenderer.on('audio-meter', (event, data) => callback(data)),
  onProfileApplied: (callback) => ipcRenderer.on('profile-applied', (event, settings) => callback(settings)),
  onDevicesChanged: (callback) => ipcRenderer.on('devices-changed', (event, data) => callback(data)),
  onApoWriteResult: (callback) => ipcRenderer.on('apo-write-result', (event, data) => callback(data)),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (event, data) => callback(data)),
  onHotkeyError: (callback) => ipcRenderer.on('hotkey-error', (event, data) => callback(data))
});
