import { app, BrowserWindow, ipcMain, shell, Tray, Menu, globalShortcut, desktopCapturer, screen } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { execFile, execSync, spawn } from 'child_process';
import loudness from 'loudness';
import nativeSoundMixer from 'native-sound-mixer';
import electronUpdater from 'electron-updater';

const { autoUpdater } = electronUpdater;

const SoundMixer = nativeSoundMixer.default;
const DeviceType = nativeSoundMixer.DeviceType;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_ID = 'com.volbooster.pro';
const ICON_PNG = path.join(__dirname, 'resources', 'icon.png');
const ICON_ICO = path.join(__dirname, 'resources', 'icon.ico');
const APP_ICON = fs.existsSync(ICON_ICO) ? ICON_ICO : ICON_PNG;

function packagedResource(...parts) {
  const inside = path.join(__dirname, ...parts);
  if (!app.isPackaged) return inside;
  const unpacked = inside.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`);
  if (unpacked !== inside && fs.existsSync(unpacked)) return unpacked;
  const extra = path.join(process.resourcesPath, ...parts);
  if (fs.existsSync(extra)) return extra;
  return inside;
}

if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID);
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

let mainWindow;
let osdWindow;
let tray = null;
let isQuitting = false;
let currentVolCache = 50;
let currentBoostCache = 0;
let osdHideTimer = null;
let osdVisible = false;
let lastDefaultDevice = '';

const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');
const APO_CONFIG_PATH = 'C:\\Program Files\\EqualizerAPO\\config\\config.txt';
const VB_START = '# --- VolBooster start ---';
const VB_END = '# --- VolBooster end ---';
const EQ_FREQS = [20, 63, 125, 250, 500, 1000, 4000, 8000];
const SAFE_BOOST_CAP = 12;

const EQ_PRESETS = {
  'Flat': '',
  'Bass Boost': 'GraphicEQ: 20 5; 25 5; 31.5 5; 40 4; 50 3; 63 2; 80 1; 100 0.5',
  'Movie Mode': 'GraphicEQ: 500 1; 1000 3; 2000 4; 4000 3; 8000 1'
};

const DEFAULT_PROFILES = [
  { id: 'night', name: 'Night', masterVolume: 30, boost: 0, preset: 'Flat', customEQ: [0, 0, 0, 0, 0, 0, 0, 0] },
  { id: 'movies', name: 'Movies', masterVolume: 70, boost: 8, preset: 'Movie Mode', customEQ: [0, 0, 0, 0, 0, 0, 0, 0] },
  { id: 'competitive', name: 'Competitive', masterVolume: 80, boost: 4, preset: 'Flat', customEQ: [0, 0, 0, 0, 0, 0, 0, 0] },
  { id: 'headphones', name: 'Headphones', masterVolume: 50, boost: 6, preset: 'Bass Boost', customEQ: [0, 0, 0, 0, 0, 0, 0, 0] }
];

let lastApoWriteError = '';

const DEFAULT_HOTKEYS = {
  volumeUp: 'CommandOrControl+Alt+Up',
  volumeDown: 'CommandOrControl+Alt+Down',
  boostUp: 'CommandOrControl+Shift+Up',
  boostDown: 'CommandOrControl+Shift+Down',
  profileNext: 'CommandOrControl+Alt+Right',
  profilePrev: 'CommandOrControl+Alt+Left'
};

const DEFAULT_OSD = {
  enabled: true,
  timeoutMs: 2000,
  displayId: 0
};

const DEFAULT_SETTINGS = {
  masterVolume: 50,
  boost: 0,
  preset: 'Flat',
  autoStart: false,
  theme: 'blue',
  customEQ: [0, 0, 0, 0, 0, 0, 0, 0],
  preferredDevice: '',
  allowHighBoost: false,
  profiles: DEFAULT_PROFILES,
  activeProfileId: '',
  firstRunComplete: false,
  hotkeys: DEFAULT_HOTKEYS,
  osd: DEFAULT_OSD
};

function isHiddenLaunch(argv = process.argv) {
  if (argv.includes('--hidden')) return true;
  try {
    return Boolean(app.getLoginItemSettings().wasOpenedAtLogin);
  } catch {
    return false;
  }
}

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
      const merged = { ...DEFAULT_SETTINGS, ...parsed };
      if (!Array.isArray(merged.profiles) || merged.profiles.length === 0) {
        merged.profiles = DEFAULT_PROFILES;
      }
      if (!Array.isArray(merged.customEQ) || merged.customEQ.length !== 8) {
        merged.customEQ = [...DEFAULT_SETTINGS.customEQ];
      }
      merged.hotkeys = { ...DEFAULT_HOTKEYS, ...(parsed.hotkeys || {}) };
      merged.osd = { ...DEFAULT_OSD, ...(parsed.osd || {}) };
      if (parsed.firstRunComplete === undefined) merged.firstRunComplete = true;
      return merged;
    }
  } catch (e) {
    console.error('Error loading settings', e);
  }
  return { ...DEFAULT_SETTINGS, profiles: DEFAULT_PROFILES.map(p => ({ ...p, customEQ: [...p.customEQ] })) };
}

function applyLoginItem(autoStart) {
  app.setLoginItemSettings({
    openAtLogin: Boolean(autoStart),
    args: autoStart ? ['--hidden'] : []
  });
}

function saveSettings(partial = {}) {
  try {
    const prev = loadSettings();
    const settings = { ...prev, ...partial };
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
    if (typeof settings.boost === 'number') currentBoostCache = settings.boost;
    applyLoginItem(settings.autoStart);
    if (JSON.stringify(prev.hotkeys) !== JSON.stringify(settings.hotkeys)) registerHotkeys();
    if (JSON.stringify(prev.osd) !== JSON.stringify(settings.osd)) positionOSD();
    const profilesChanged = JSON.stringify(prev.profiles) !== JSON.stringify(settings.profiles)
      || prev.activeProfileId !== settings.activeProfileId;
    if (profilesChanged) rebuildTray();
    return settings;
  } catch (e) {
    console.error('Error saving settings', e);
    return loadSettings();
  }
}

function maxBoost(settings = loadSettings()) {
  return settings.allowHighBoost ? 40 : SAFE_BOOST_CAP;
}

function clampBoost(value, settings = loadSettings()) {
  return Math.min(maxBoost(settings), Math.max(0, Number(value) || 0));
}

function eqLineFrom(preset, customEQ) {
  if (preset === 'Custom' && Array.isArray(customEQ)) {
    return `GraphicEQ: ${EQ_FREQS.map((freq, i) => `${freq} ${customEQ[i] ?? 0}`).join('; ')}`;
  }
  if (typeof preset === 'string' && preset.startsWith('GraphicEQ')) return preset;
  return EQ_PRESETS[preset] || '';
}

function getRenderDevices() {
  const devices = [];
  const seen = new Set();
  let defaultDevice = '';
  try {
    const def = SoundMixer.getDefaultDevice(DeviceType.RENDER);
    defaultDevice = def?.name || '';
  } catch (e) {}
  try {
    SoundMixer.devices.forEach(device => {
      if (device.type !== DeviceType.RENDER) return;
      if (!device.name || seen.has(device.name)) return;
      seen.add(device.name);
      devices.push({
        id: device.name,
        name: device.name,
        isDefault: device.name === defaultDevice
      });
    });
  } catch (e) {
    console.error('Error listing devices', e);
  }
  return { devices, defaultDevice };
}

function isElevated() {
  if (process.platform !== 'win32') return true;
  try {
    execSync('net session', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function relaunchElevated() {
  const exe = process.execPath;
  const args = process.argv.slice(1).filter(a => a !== '--hidden');
  const argStr = args.map(a => `'${String(a).replace(/'/g, "''")}'`).join(',');
  const ps = argStr
    ? `Start-Process -FilePath '${exe.replace(/'/g, "''")}' -ArgumentList ${argStr} -Verb RunAs`
    : `Start-Process -FilePath '${exe.replace(/'/g, "''")}' -Verb RunAs`;
  spawn('powershell.exe', ['-NoProfile', '-Command', ps], { detached: true, stdio: 'ignore' }).unref();
  isQuitting = true;
  app.quit();
}

function notifyRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function getDisplayList() {
  const primary = screen.getPrimaryDisplay();
  return screen.getAllDisplays().map((display, index) => ({
    id: display.id,
    label: display.label || `Display ${index + 1}`,
    primary: display.id === primary.id,
    bounds: display.workArea
  }));
}

function positionOSD() {
  if (!osdWindow || osdWindow.isDestroyed()) return;
  const settings = loadSettings();
  const displays = screen.getAllDisplays();
  const wanted = settings.osd?.displayId;
  const display = displays.find(d => d.id === wanted) || screen.getPrimaryDisplay();
  const { x, y, width, height } = display.workArea;
  const osdWidth = 300;
  const osdHeight = 118;
  const margin = 20;
  osdWindow.setBounds({
    x: Math.round(x + width - osdWidth - margin),
    y: Math.round(y + height - osdHeight - margin),
    width: osdWidth,
    height: osdHeight
  });
}

function writeApoConfig({ dbValue, preset, customEQ, deviceName }) {
  const eqLine = eqLineFrom(preset, customEQ);
  const blockLines = [VB_START];
  if (deviceName) blockLines.push(`Device: ${deviceName}`);
  blockLines.push(`Preamp: ${dbValue} dB`);
  if (eqLine) blockLines.push(eqLine);
  blockLines.push(VB_END);
  const block = blockLines.join('\n');

  let content = '';
  try {
    content = fs.readFileSync(APO_CONFIG_PATH, 'utf-8');
  } catch (err) {
    throw err;
  }

  const start = content.indexOf(VB_START);
  const end = content.indexOf(VB_END);
  if (start !== -1 && end !== -1 && end > start) {
    content = `${content.slice(0, start).trimEnd()}\n${block}\n${content.slice(end + VB_END.length).trimStart()}`.trim() + '\n';
  } else {
    const preampRegex = /^Preamp:\s*(-?\d+(\.\d+)?)\s*dB/im;
    const eqRegex = /^GraphicEQ:.*$/im;
    const lines = content.split('\n').filter(line => !preampRegex.test(line) && !eqRegex.test(line) && line.trim() !== '');
    lines.push(block);
    content = lines.join('\n') + '\n';
  }

  try {
    fs.writeFileSync(APO_CONFIG_PATH, content, 'utf-8');
    lastApoWriteError = '';
    notifyRenderer('apo-write-result', { ok: true });
  } catch (error) {
    lastApoWriteError = error.message || 'Write failed';
    notifyRenderer('apo-write-result', { ok: false, error: lastApoWriteError, elevated: isElevated() });
    throw error;
  }
}

function applyApoFromSettings(settings, boostOverride) {
  const dbValue = clampBoost(boostOverride !== undefined ? boostOverride : settings.boost, settings);
  currentBoostCache = dbValue;
  writeApoConfig({
    dbValue,
    preset: settings.preset,
    customEQ: settings.customEQ,
    deviceName: settings.preferredDevice || ''
  });
  return dbValue;
}

function showOSD(data) {
  const settings = loadSettings();
  if (settings.osd && settings.osd.enabled === false) return;
  if (!osdWindow || osdWindow.isDestroyed()) return;
  positionOSD();
  if (osdHideTimer) clearTimeout(osdHideTimer);
  osdVisible = true;
  osdWindow.webContents.send('show-osd', data);
  osdWindow.showInactive();
  const timeout = Math.min(8000, Math.max(800, Number(settings.osd?.timeoutMs) || 2000));
  osdHideTimer = setTimeout(() => {
    osdVisible = false;
    if (osdWindow && !osdWindow.isDestroyed()) osdWindow.hide();
  }, timeout);
}

function rebuildTray() {
  if (!tray) return;
  const settings = loadSettings();
  const profileItems = (settings.profiles || []).map(profile => ({
    label: profile.name,
    type: 'radio',
    checked: settings.activeProfileId === profile.id,
    click: () => applyProfile(profile.id)
  }));

  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Headroom', click: () => { if (mainWindow) mainWindow.show(); } },
    { type: 'separator' },
    { label: 'Profiles', submenu: profileItems.length ? profileItems : [{ label: 'No profiles', enabled: false }] },
    { label: 'Reset APO to 0 dB', click: () => resetApoBoost() },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } }
  ]));
}

function applyProfile(id) {
  const settings = loadSettings();
  const profile = (settings.profiles || []).find(p => p.id === id);
  if (!profile) return;

  const next = {
    ...settings,
    masterVolume: profile.masterVolume,
    boost: clampBoost(profile.boost, settings),
    preset: profile.preset,
    customEQ: Array.isArray(profile.customEQ) ? profile.customEQ : settings.customEQ,
    activeProfileId: profile.id
  };

  saveSettings(next);
  currentVolCache = next.masterVolume;
  loudness.setVolume(next.masterVolume).catch(() => {});
  try {
    applyApoFromSettings(next);
  } catch (e) {
    console.error('Error applying profile APO', e);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('profile-applied', next);
  }
  showOSD({ title: 'Profile', value: profile.name, peak: 0 });
}

function cycleProfile(direction) {
  const settings = loadSettings();
  const profiles = settings.profiles || [];
  if (!profiles.length) return;
  const index = Math.max(0, profiles.findIndex(p => p.id === settings.activeProfileId));
  const next = profiles[(index + direction + profiles.length) % profiles.length];
  applyProfile(next.id);
}

function resetApoBoost() {
  const settings = saveSettings({ boost: 0 });
  try {
    applyApoFromSettings(settings, 0);
  } catch (e) {
    console.error('Error resetting APO', e);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('boost-reset', 0);
  }
  showOSD({ title: 'APO Boost', value: '+0.0 dB' });
}

function attachLoopbackHandler(win) {
  win.webContents.session.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'] });
      callback({ video: sources[0], audio: 'loopback' });
    } catch (e) {
      console.error('Loopback capture handler failed', e);
      callback({});
    }
  });
}

function createWindow(startHidden) {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 760,
    title: 'Headroom',
    icon: APP_ICON,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hidden',
    resizable: false,
    backgroundColor: '#07080c',
  });

  attachLoopbackHandler(mainWindow);
  mainWindow.setIcon(APP_ICON);

  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    if (!startHidden) mainWindow.show();
  });
  mainWindow.webContents.on('did-finish-load', () => {
    setupUpdater();
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createOSDWindow() {
  osdWindow = new BrowserWindow({
    width: 300,
    height: 118,
    title: 'Headroom',
    icon: APP_ICON,
    show: false,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  osdWindow.setIgnoreMouseEvents(true);
  positionOSD();

  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    osdWindow.loadURL('http://localhost:5173/?osd=true');
  } else {
    osdWindow.loadFile(path.join(__dirname, 'dist', 'index.html'), { search: 'osd=true' });
  }

  osdWindow.on('ready-to-show', () => {
    osdWindow.hide();
  });
}

function createTray() {
  tray = new Tray(ICON_PNG);
  tray.setToolTip('Headroom');
  rebuildTray();
  tray.on('double-click', () => {
    if (mainWindow) mainWindow.show();
  });
}

function registerHotkeys() {
  globalShortcut.unregisterAll();
  const keys = loadSettings().hotkeys || DEFAULT_HOTKEYS;

  const bind = (accelerator, handler) => {
    if (!accelerator) return;
    try {
      const ok = globalShortcut.register(accelerator, handler);
      if (!ok) notifyRenderer('hotkey-error', { accelerator, message: 'Shortcut already in use' });
    } catch (e) {
      notifyRenderer('hotkey-error', { accelerator, message: 'Invalid shortcut' });
    }
  };

  bind(keys.volumeUp, async () => {
    try {
      currentVolCache = Math.min(100, currentVolCache + 5);
      loudness.setVolume(currentVolCache).catch(() => {});
      notifyRenderer('volume-changed', currentVolCache);
      showOSD({ title: 'Master Volume', value: `${currentVolCache}%` });
    } catch (e) {}
  });

  bind(keys.volumeDown, async () => {
    try {
      currentVolCache = Math.max(0, currentVolCache - 5);
      loudness.setVolume(currentVolCache).catch(() => {});
      notifyRenderer('volume-changed', currentVolCache);
      showOSD({ title: 'Master Volume', value: `${currentVolCache}%` });
    } catch (e) {}
  });

  bind(keys.boostUp, () => {
    const settings = loadSettings();
    currentBoostCache = clampBoost(currentBoostCache + 5, settings);
    saveSettings({ boost: currentBoostCache });
    try { applyApoFromSettings({ ...settings, boost: currentBoostCache }); } catch (e) {}
    notifyRenderer('boost-hotkey', currentBoostCache);
    showOSD({ title: 'APO Boost', value: `+${currentBoostCache.toFixed(1)} dB` });
  });

  bind(keys.boostDown, () => {
    const settings = loadSettings();
    currentBoostCache = clampBoost(currentBoostCache - 5, settings);
    saveSettings({ boost: currentBoostCache });
    try { applyApoFromSettings({ ...settings, boost: currentBoostCache }); } catch (e) {}
    notifyRenderer('boost-hotkey', currentBoostCache);
    showOSD({ title: 'APO Boost', value: `+${currentBoostCache.toFixed(1)} dB` });
  });

  bind(keys.profileNext, () => cycleProfile(1));
  bind(keys.profilePrev, () => cycleProfile(-1));
}

let updaterBound = false;

function setupUpdater() {
  if (!updaterBound) {
    updaterBound = true;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('checking-for-update', () => notifyRenderer('update-status', { state: 'checking' }));
    autoUpdater.on('update-available', (info) => notifyRenderer('update-status', { state: 'available', version: info.version }));
    autoUpdater.on('update-not-available', () => notifyRenderer('update-status', { state: 'current' }));
    autoUpdater.on('error', (error) => notifyRenderer('update-status', { state: 'error', message: error?.message || 'Update failed' }));
    autoUpdater.on('download-progress', (progress) => notifyRenderer('update-status', { state: 'downloading', percent: progress.percent }));
    autoUpdater.on('update-downloaded', (info) => notifyRenderer('update-status', { state: 'ready', version: info.version }));
  }
  if (!app.isPackaged) {
    notifyRenderer('update-status', { state: 'dev' });
    return;
  }
  autoUpdater.checkForUpdates().catch(() => {});
}

function watchDefaultDevice() {
  setInterval(() => {
    const info = getRenderDevices();
    if (info.defaultDevice && info.defaultDevice !== lastDefaultDevice) {
      lastDefaultDevice = info.defaultDevice;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('devices-changed', info);
      }
    }
  }, 3000);
}

if (gotTheLock) {
  app.on('second-instance', (_event, commandLine) => {
    if (isHiddenLaunch(commandLine)) return;
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    const startHidden = isHiddenLaunch();
    const settings = loadSettings();
    currentBoostCache = clampBoost(settings.boost, settings);
    applyLoginItem(settings.autoStart);

    createTray();
    createWindow(startHidden);
    createOSDWindow();
    registerHotkeys();
    watchDefaultDevice();
    lastDefaultDevice = getRenderDevices().defaultDevice;

    loudness.getVolume().then(v => { currentVolCache = v; }).catch(() => {});

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow(false);
        createOSDWindow();
      } else if (mainWindow) {
        mainWindow.show();
      }
    });
  });
}

app.on('window-all-closed', () => {
  // Tray app: stay running until Quit.
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (osdHideTimer) clearTimeout(osdHideTimer);
});

app.on('before-quit', () => {
  isQuitting = true;
  try {
    if (fs.existsSync(APO_CONFIG_PATH)) {
      const settings = loadSettings();
      writeApoConfig({
        dbValue: 0,
        preset: settings.preset,
        customEQ: settings.customEQ,
        deviceName: settings.preferredDevice || ''
      });
    }
  } catch (error) {
    console.error('Error resetting APO boost on quit:', error);
  }
});

ipcMain.handle('get-volume', async () => {
  try {
    const vol = await loudness.getVolume();
    currentVolCache = vol;
    return vol;
  } catch (error) {
    console.error('Error getting volume:', error);
    return 50;
  }
});

ipcMain.on('set-volume', async (event, volume) => {
  try {
    currentVolCache = volume;
    await loudness.setVolume(volume);
  } catch (error) {
    console.error('Error setting volume:', error);
  }
});

ipcMain.handle('check-apo', async () => {
  const elevated = isElevated();
  try {
    await fs.promises.access(APO_CONFIG_PATH, fs.constants.F_OK);
  } catch (error) {
    return { installed: false, writable: false, elevated, path: APO_CONFIG_PATH, lastError: lastApoWriteError };
  }
  try {
    await fs.promises.access(APO_CONFIG_PATH, fs.constants.W_OK);
    return { installed: true, writable: true, elevated, path: APO_CONFIG_PATH, lastError: lastApoWriteError };
  } catch (error) {
    return { installed: true, writable: false, elevated, path: APO_CONFIG_PATH, lastError: lastApoWriteError || error.message };
  }
});

ipcMain.handle('get-boost', async () => {
  try {
    const content = await fs.promises.readFile(APO_CONFIG_PATH, 'utf-8');
    const match = content.match(/^Preamp:\s*(-?\d+(\.\d+)?)\s*dB/im);
    if (match) return parseFloat(match[1]);
    return 0;
  } catch (error) {
    return 0;
  }
});

ipcMain.on('set-boost', async (event, { dbValue, preset, customEQ, deviceName }) => {
  try {
    const settings = loadSettings();
    const clamped = clampBoost(dbValue, settings);
    currentBoostCache = clamped;
    writeApoConfig({
      dbValue: clamped,
      preset: preset ?? settings.preset,
      customEQ: customEQ ?? settings.customEQ,
      deviceName: deviceName !== undefined ? deviceName : (settings.preferredDevice || '')
    });
  } catch (error) {
    console.error('Error setting APO boost:', error);
  }
});

ipcMain.on('reset-apo', () => {
  resetApoBoost();
});

ipcMain.handle('get-app-info', () => ({
  version: app.getVersion(),
  packaged: app.isPackaged,
  elevated: isElevated(),
  name: app.getName()
}));

ipcMain.handle('get-displays', () => getDisplayList());

ipcMain.on('relaunch-elevated', () => relaunchElevated());

ipcMain.on('complete-first-run', () => {
  saveSettings({ firstRunComplete: true });
});

ipcMain.on('preview-osd', () => {
  showOSD({ title: 'Overlay', value: 'Preview' });
});

ipcMain.on('check-updates', () => {
  if (!app.isPackaged) {
    notifyRenderer('update-status', { state: 'dev' });
    return;
  }
  autoUpdater.checkForUpdates().catch((error) => {
    notifyRenderer('update-status', { state: 'error', message: error.message });
  });
});

ipcMain.on('install-update', () => {
  autoUpdater.quitAndInstall(false, true);
});

ipcMain.handle('get-settings', () => loadSettings());

ipcMain.on('save-settings', (event, settings) => {
  saveSettings(settings);
});

ipcMain.handle('get-audio-devices', () => getRenderDevices());

ipcMain.on('apply-profile', (event, id) => {
  applyProfile(id);
});

ipcMain.on('save-profile', (event, profile) => {
  const settings = loadSettings();
  const profiles = [...(settings.profiles || [])];
  const index = profiles.findIndex(p => p.id === profile.id);
  if (index >= 0) {
    profiles[index] = { ...profiles[index], ...profile };
  } else {
    profiles.push(profile);
  }
  saveSettings({ profiles, activeProfileId: profile.id });
});

ipcMain.on('audio-meter', (event, data) => {
  if (osdVisible && osdWindow && !osdWindow.isDestroyed()) {
    osdWindow.webContents.send('audio-meter', data);
  }
});

ipcMain.on('open-external', (event, url) => {
  shell.openExternal(url);
});

ipcMain.on('install-apo', () => {
  const installerPath = packagedResource('resources', 'EqualizerAPO64.exe');
  execFile(installerPath, (error) => {
    if (error) console.error('Failed to launch Equalizer APO installer:', error);
  });
});

ipcMain.on('close-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});

ipcMain.on('minimize-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.minimize();
});

ipcMain.handle('get-audio-sessions', () => {
  try {
    const sessionsMap = new Map();
    SoundMixer.devices.forEach(device => {
      if (device.type !== DeviceType.RENDER) return;
      device.sessions.forEach(session => {
        let name = session.name || '';
        if (!name) return;
        if (name.toLowerCase().endsWith('.exe')) {
          name = name.substring(0, name.length - 4);
        }
        name = name.charAt(0).toUpperCase() + name.slice(1);
        if (name === 'System Sounds') return;
        if (!sessionsMap.has(session.appName)) {
          sessionsMap.set(session.appName, {
            id: session.appName,
            name: name,
            volume: Math.round(session.volume * 100),
            mute: session.mute
          });
        }
      });
    });
    return Array.from(sessionsMap.values());
  } catch (e) {
    console.error('Error fetching audio sessions:', e);
    return [];
  }
});

ipcMain.on('set-session-volume', (event, { id, volume }) => {
  try {
    SoundMixer.devices.forEach(device => {
      const session = device.sessions.find(s => s.appName === id);
      if (session) session.volume = volume / 100;
    });
  } catch (e) {}
});

ipcMain.on('set-session-mute', (event, { id, mute }) => {
  try {
    SoundMixer.devices.forEach(device => {
      const session = device.sessions.find(s => s.appName === id);
      if (session) session.mute = mute;
    });
  } catch (e) {}
});
