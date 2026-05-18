import { app, BrowserWindow, ipcMain, shell, Tray, Menu, globalShortcut, desktopCapturer } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import loudness from 'loudness';
import { execFile } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let tray = null;
let isQuitting = false;

// Settings Path
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');
const DEFAULT_SETTINGS = {
  masterVolume: 50,
  boost: 0,
  preset: 'Flat',
  autoStart: false
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
    height: 550,
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

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
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
      let vol = await loudness.getVolume();
      vol = Math.min(100, vol + 5);
      await loudness.setVolume(vol);
      if (mainWindow) mainWindow.webContents.send('volume-changed', vol);
    } catch(e){}
  });

  globalShortcut.register('CommandOrControl+Alt+Down', async () => {
    try {
      let vol = await loudness.getVolume();
      vol = Math.max(0, vol - 5);
      await loudness.setVolume(vol);
      if (mainWindow) mainWindow.webContents.send('volume-changed', vol);
    } catch(e){}
  });

  globalShortcut.register('CommandOrControl+Shift+Up', () => {
    if (mainWindow) mainWindow.webContents.send('boost-hotkey', 5);
  });

  globalShortcut.register('CommandOrControl+Shift+Down', () => {
    if (mainWindow) mainWindow.webContents.send('boost-hotkey', -5);
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
    const eqLine = EQ_PRESETS[preset] || '';

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
  // We just need a source to get system audio. 
  // Typically capturing the entire screen ('screen:0:0') gives loopback audio.
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
