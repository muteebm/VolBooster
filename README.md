<div align="center">
  <h1>Headroom</h1>
  <p><strong>Windows system volume, EQ, and preamp control.</strong></p>
  <img src="resources/icon.png" alt="Headroom" width="96"/>
</div>

Headroom is a Windows tray app for master volume, Equalizer APO preamp (past 100%), graphic EQ, per-app mix, profiles, hotkeys, and an on-screen overlay.

The GitHub repository remains `VolBooster`. The product name is Headroom. Existing Equalizer APO blocks still use `# --- VolBooster start ---` / `# --- VolBooster end ---` so current configs keep working. The installer `appId` stays `com.volbooster.pro` so settings are not reset.

## Features

- Master volume and Equalizer APO preamp, with a default +12 dB cap and an optional +40 dB unlock
- Output device targeting, profiles, and custom EQ bands
- Per-app session mix
- Loopback meter, remappable hotkeys, and OSD
- First-run Equalizer APO setup and silent launch at login

## Stack

- Electron, React 19, Vite
- `loudness` for Windows Core Audio volume
- [Equalizer APO](https://sourceforge.net/projects/equalizerapo/) for preamp and EQ via `config.txt`

## Getting started

1. Windows and Node.js 18+
2. Equalizer APO on the playback device you want to process (the app can launch the bundled installer)

```bash
git clone https://github.com/muteebm/VolBooster.git
cd VolBooster
npm install
npm run dev
```

Packaged installer:

```bash
npm run build
```

Output is in `release/`. Auto-update reads GitHub Releases on `muteebm/VolBooster`.

## License

MIT. See `LICENSE`. Equalizer APO is a separate GNU GPL project; Headroom only writes its plain-text config.
