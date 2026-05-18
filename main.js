import { app, BrowserWindow, ipcMain, shell, Tray, Menu, globalShortcut, desktopCapturer, Notification, screen } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import loudness from 'loudness';
import { execFile } from 'child_process';
import nativeSoundMixer from 'native-sound-mixer';

const SoundMixer = nativeSoundMixer.default;
const DeviceType = nativeSoundMixer.DeviceType;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let osdWindow;
let tray = null;
let isQuitting = false;
let currentVolCache = 50;

// Settings Path
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');
const DEFAULT_SETTINGS = {
  masterVolume: 50,
  boost: 0,
  preset: 'Flat',
  autoStart: false,
  theme: 'blue',
  customEQ: [0, 0, 0, 0, 0, 0, 0, 0]
};

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
    }
  } catch (e) {
    console.error('Error loading settings', e);
  }
  return DEFAULT_SETTINGS;
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
    
    // Handle Auto Start
    app.setLoginItemSettings({
      openAtLogin: settings.autoStart,
      openAsHidden: true
    });
  } catch (e) {
    console.error('Error saving settings', e);
  }
}

const EQ_PRESETS = {
  'Flat': '',
  'Bass Boost': 'GraphicEQ: 20 5; 25 5; 31.5 5; 40 4; 50 3; 63 2; 80 1; 100 0.5',
  'Movie Mode': 'GraphicEQ: 500 1; 1000 3; 2000 4; 4000 3; 8000 1'
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 350,
    height: 750,
    icon: path.join(__dirname, 'resources', 'tray_icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hidden',
    resizable: false,
    backgroundColor: '#0f172a',
  });

  // Check if we are in dev mode
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createOSDWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  const osdWidth = 300;
  const osdHeight = 100;
  const margin = 20;

  osdWindow = new BrowserWindow({
    width: osdWidth,
    height: osdHeight,
    x: width - osdWidth - margin,
    y: height - osdHeight - margin,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  osdWindow.setIgnoreMouseEvents(true);

  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    osdWindow.loadURL('http://localhost:5173/?osd=true');
  } else {
    osdWindow.loadFile(path.join(__dirname, 'dist', 'index.html'), { search: 'osd=true' });
  }
}

app.whenReady().then(() => {
  createWindow();
  createOSDWindow();
  
  loudness.getVolume().then(v => currentVolCache = v).catch(()=>{});

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      createOSDWindow();
    }
  });

  tray = new Tray(path.join(__dirname, 'resources', 'tray_icon.png'));
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show VolBooster', click: () => mainWindow.show() },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } }
  ]);
  tray.setToolTip('VolBooster');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    mainWindow.show();
  });

  // Global Hotkeys
  globalShortcut.register('CommandOrControl+Alt+Up', async () => {
    try {
      currentVolCache = Math.min(100, currentVolCache + 5);
      loudness.setVolume(currentVolCache).catch(()=>{});
      if (mainWindow) mainWindow.webContents.send('volume-changed', currentVolCache);
      if (osdWindow) osdWindow.webContents.send('show-osd', { title: 'Master Volume', value: `${currentVolCache}%` });
    } catch(e){}
  });

  globalShortcut.register('CommandOrControl+Alt+Down', async () => {
    try {
      currentVolCache = Math.max(0, currentVolCache - 5);
      loudness.setVolume(currentVolCache).catch(()=>{});
      if (mainWindow) mainWindow.webContents.send('volume-changed', currentVolCache);
      if (osdWindow) osdWindow.webContents.send('show-osd', { title: 'Master Volume', value: `${currentVolCache}%` });
    } catch(e){}
  });

  globalShortcut.register('CommandOrControl+Shift+Up', () => {
    if (mainWindow) mainWindow.webContents.send('boost-hotkey', 5);
    if (osdWindow) osdWindow.webContents.send('show-osd', { title: 'APO Boost', value: '+ Increased' });
  });

  globalShortcut.register('CommandOrControl+Shift+Down', () => {
    if (mainWindow) mainWindow.webContents.send('boost-hotkey', -5);
    if (osdWindow) osdWindow.webContents.send('show-osd', { title: 'APO Boost', value: '- Decreased' });
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  try {
    const APO_CONFIG_PATH = 'C:\\Program Files\\EqualizerAPO\\config\\config.txt';
    if (fs.existsSync(APO_CONFIG_PATH)) {
      let content = fs.readFileSync(APO_CONFIG_PATH, 'utf-8');
      const preampRegex = /^Preamp:\s*(-?\d+(\.\d+)?)\s*dB/im;
      if (preampRegex.test(content)) {
        content = content.replace(preampRegex, `Preamp: 0 dB`);
        fs.writeFileSync(APO_CONFIG_PATH, content, 'utf-8');
      }
    }
  } catch (error) {
    console.error('Error resetting APO boost on quit:', error);
  }
});

// --- System Volume IPC Handlers (via loudness) ---

ipcMain.handle('get-volume', async () => {
  try {
    const vol = await loudness.getVolume();
    return vol;
  } catch (error) {
    console.error('Error getting volume:', error);
    return 50; // Fallback
  }
});

ipcMain.on('set-volume', async (event, volume) => {
  try {
    await loudness.setVolume(volume);
  } catch (error) {
    console.error('Error setting volume:', error);
  }
});

// --- Equalizer APO Boost IPC Handlers ---

// Typical path for Equalizer APO config
const APO_CONFIG_PATH = 'C:\\Program Files\\EqualizerAPO\\config\\config.txt';

ipcMain.handle('check-apo', async () => {
  try {
    await fs.promises.access(APO_CONFIG_PATH, fs.constants.F_OK);
    // Also check if we have write access
    await fs.promises.access(APO_CONFIG_PATH, fs.constants.W_OK);
    return { installed: true, writable: true };
  } catch (error) {
    console.log('APO access error:', error);
    return { installed: false, writable: false };
  }
});

ipcMain.handle('get-boost', async () => {
  try {
    const content = await fs.promises.readFile(APO_CONFIG_PATH, 'utf-8');
    // Looking for a line like "Preamp: 10 dB"
    const match = content.match(/^Preamp:\s*(-?\d+(\.\d+)?)\s*dB/im);
    if (match) {
      return parseFloat(match[1]);
    }
    return 0; // Default if not found
  } catch (error) {
    return 0;
  }
});

ipcMain.on('set-boost', async (event, { dbValue, preset }) => {
  try {
    let content = '';
    try {
      content = await fs.promises.readFile(APO_CONFIG_PATH, 'utf-8');
    } catch(err) {}
    
    const preampRegex = /^Preamp:\s*(-?\d+(\.\d+)?)\s*dB/im;
    const eqRegex = /^GraphicEQ:.*$/im;
    
    const newPreampLine = `Preamp: ${dbValue} dB`;
    const eqLine = preset.startsWith('GraphicEQ') ? preset : (EQ_PRESETS[preset] || '');

    let lines = content.split('\n');
    let hasPreamp = false;
    let hasEq = false;

    lines = lines.map(line => {
      if (preampRegex.test(line)) {
        hasPreamp = true;
        return newPreampLine;
      }
      if (eqRegex.test(line)) {
        hasEq = true;
        return eqLine;
      }
      return line;
    }).filter(line => line.trim() !== '');

    if (!hasPreamp) lines.unshift(newPreampLine);
    if (!hasEq && eqLine) lines.push(eqLine);
    
    await fs.promises.writeFile(APO_CONFIG_PATH, lines.join('\n') + '\n', 'utf-8');
  } catch (error) {
    console.error('Error setting APO boost:', error);
  }
});

// Settings Handlers
ipcMain.handle('get-settings', () => {
  return loadSettings();
});

ipcMain.on('save-settings', (event, settings) => {
  saveSettings(settings);
});

// Desktop Capturer for Visualizer
ipcMain.handle('get-desktop-sources', async () => {
  const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] });
  return sources[0]?.id;
});

ipcMain.on('open-external', (event, url) => {
  shell.openExternal(url);
});

ipcMain.on('install-apo', (event) => {
  const installerPath = path.join(__dirname, 'resources', 'EqualizerAPO64.exe');
  execFile(installerPath, (error) => {
    if (error) {
      console.error('Failed to launch Equalizer APO installer:', error);
    }
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

// --- Per-App Volume Mixer IPC ---
ipcMain.handle('get-audio-sessions', () => {
  try {
    const sessionsMap = new Map();
    
    SoundMixer.devices.forEach(device => {
      // Only care about render devices
      if (device.type !== DeviceType.RENDER && device.type !== DeviceType.ALL) return;
      
      device.sessions.forEach(session => {
        let name = session.name || '';
        if (!name) return;
        
        // Clean up the name e.g. "opera" -> "Opera", "chrome.exe" -> "Chrome"
        if (name.toLowerCase().endsWith('.exe')) {
          name = name.substring(0, name.length - 4);
        }
        name = name.charAt(0).toUpperCase() + name.slice(1);
        
        if (name === 'System Sounds') return;
        
        // Deduplicate sessions from the same app (in case of multiple streams)
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
      if (session) {
        session.volume = volume / 100;
      }
    });
  } catch (e) {}
});

ipcMain.on('set-session-mute', (event, { id, mute }) => {
  try {
    SoundMixer.devices.forEach(device => {
      const session = device.sessions.find(s => s.appName === id);
      if (session) {
        session.mute = mute;
      }
    });
  } catch (e) {}
});
