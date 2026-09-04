<p align="center">
  <img src="resources/icon.png" alt="Headroom" width="96" height="96">
</p>

<h1 align="center">Headroom</h1>

<p align="center">
  Windows tray app for system volume, Equalizer APO preamp (past 100%), EQ, and per-app mix.
</p>

<p align="center">
  <a href="https://github.com/muteebm/VolBooster/releases/latest"><img src="https://img.shields.io/github/v/release/muteebm/VolBooster?label=release" alt="Latest release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/platform-Windows-0078D4?logo=windows&logoColor=white" alt="Windows">
  <a href="https://github.com/muteebm/VolBooster/issues"><img src="https://img.shields.io/github/issues/muteebm/VolBooster" alt="Issues"></a>
</p>

The GitHub repository is still named **VolBooster**. The product is **Headroom**.

## Table of contents

- [Why it exists](#why-it-exists)
- [Features](#features)
- [Install](#install)
- [How it works](#how-it-works)
- [Development](#development)
- [Project layout](#project-layout)
- [Compatibility notes](#compatibility-notes)
- [Contributing](#contributing)
- [License](#license)

## Why it exists

Windows caps endpoint volume at 100%. Extra loudness usually means a system-wide DSP (most often [Equalizer APO](https://sourceforge.net/projects/equalizerapo/)) plus something that is not a buried `config.txt`. Headroom is that control surface: master volume, preamp, EQ, profiles, hotkeys, and a small overlay, without replacing APO itself.

## Features

- **Master volume** — Windows endpoint volume (the OS 0–100% ceiling).
- **Preamp gain** — Equalizer APO preamp after the mixer, so you can go past 100%. Default cap is **+12 dB**; **Unlock +40 dB** raises that ceiling. CLIP is shown when the sum looks unsafe.
- **Output targeting** — apply APO to the system default or a specific playback device.
- **EQ** — Flat, Bass, Cinema, or custom bands (20 Hz–8 kHz).
- **Profiles** — Night, Movies, Competitive, Headphones, plus save/cycle from the tray or hotkeys.
- **Apps tab** — per-session volume and mute via Windows audio sessions.
- **Hotkeys** — remappable chords (defaults below).
- **OSD** — overlay on hotkey, with display and timeout in Settings.
- **Tray** — close hides to tray; launch at login is optional.
- **First run** — Equalizer APO check, optional bundled installer, admin relaunch if `config.txt` is not writable.
- **Updates** — packaged builds check GitHub Releases.

### Default hotkeys

| Action | Default |
| --- | --- |
| Volume up / down | `Ctrl+Alt+Up` / `Ctrl+Alt+Down` |
| Preamp up / down | `Ctrl+Shift+Up` / `Ctrl+Shift+Down` |
| Next / previous profile | `Ctrl+Alt+Right` / `Ctrl+Alt+Left` |

Remap them under **Settings**. Esc cancels a capture.

## Install

Windows only (Core Audio + Equalizer APO).

1. Download **Headroom-Setup-0.1.0.exe** (or newer) from [Releases](https://github.com/muteebm/VolBooster/releases/latest).
2. Run the installer. Close goes to the tray; quit from the tray menu.
3. On first launch, install or configure Equalizer APO for the device you actually listen on. A reboot is often required after APO’s own installer.

If bass or cinema EQ hits the wrong output, the Mix tab device picker is usually why — APO was targeting another endpoint.

## How it works

| Layer | Role |
| --- | --- |
| `loudness` | Windows Core Audio master volume |
| `native-sound-mixer` | Per-app sessions |
| Equalizer APO `config.txt` | Preamp and graphic EQ |
| Loopback capture | Live meter in the hero (falls back if Windows blocks capture) |

Headroom writes a managed block in `C:\Program Files\EqualizerAPO\config\config.txt`. It does not fork or patch Equalizer APO.

Settings live in Electron userData (`com.volbooster.pro` / Headroom), not in the repo.

## Development

**Needs:** Windows, Node.js 18+, npm.

```bash
git clone https://github.com/muteebm/VolBooster.git
cd VolBooster
npm install
npm run dev
```

`npm run dev` starts Vite on [http://localhost:5173](http://localhost:5173) and Electron. On Windows it also stamps the Headroom icon onto `electron.exe` so the taskbar is not the default Electron glyph.

```bash
npm run lint    # ESLint
npm run build   # Vite production bundle + NSIS installer in release/
```

Unsigned local builds are expected. Auto-update only runs in a **packaged** app and reads this GitHub repo’s releases (`latest.yml` plus the setup exe).

## Project layout

```
main.js              Electron main: tray, hotkeys, APO I/O, updater
preload.js           contextBridge API
src/                 React UI (Mix, Apps, Settings, first-run, OSD)
resources/           App icon and bundled Equalizer APO installer
scripts/             Icon render + Windows electron.exe icon stamp
```

## Compatibility notes

Do not rename these without a migration:

- Equalizer APO markers: `# --- VolBooster start ---` and `# --- VolBooster end ---` (existing user configs depend on them).
- electron-builder `appId`: `com.volbooster.pro` (changing it creates a new settings folder).

The npm package name remains `volbooster` for the same reason.

## Contributing

Issues and pull requests are welcome. This is a small Windows desktop app; the most useful contributions are ones you can dogfood on a real playback device.

### Good first directions

- Bugs in APO write / UAC / device targeting
- Hotkey or OSD edge cases (multi-monitor, games, overlay timeout)
- Meter / loopback capture reliability
- Accessibility and keyboard use in the renderer
- Docs, issue templates, and installer copy
- Tests around APO config parsing (there is little coverage today)

Please open an issue before a large UI rewrite or adding another audio engine.

### Pull requests

1. Fork and branch from `main` (`fix/…` or `feat/…`).
2. Keep the change scoped. Match existing style (React + CSS in `src/`, Electron in `main.js`).
3. Do not commit `node_modules`, `dist/`, or `release/`.
4. Do not change APO marker strings or `appId` unless the PR includes a migration.
5. Describe what you tested on Windows (dev vs packaged, APO installed or not).

```text
git checkout -b fix/short-description
npm run lint
npm run dev
```

Be specific in the PR: expected vs actual, and screenshots or a short capture when the UI changes.

Security-sensitive reports (arbitrary file write, installer path issues) can go in a [private security advisory](https://github.com/muteebm/VolBooster/security/advisories/new) instead of a public issue.

## License

[MIT](LICENSE).

Equalizer APO is a separate project under the **GNU GPL**. Headroom does not distribute modified APO source; it launches the upstream installer when bundled and writes a plain-text config block. See [Equalizer APO](https://sourceforge.net/projects/equalizerapo/) for that license.
