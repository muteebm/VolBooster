<div align="center">
  <h1>🔊 VolBooster Pro</h1>
  <p><strong>A beautifully crafted, open-source Windows Volume Booster & Equalizer built with Electron and React.</strong></p>
  <img src="resources/tray_icon.png" alt="VolBooster Logo" width="100"/>
</div>

<br />

VolBooster Pro allows you to break past the standard Windows 100% volume limit. By directly hooking into the Windows Core Audio engine and injecting **Audio Processing Objects (APO)** via Equalizer APO, you can safely push your audio up to **+40 dB**, apply custom Graphic EQ profiles, and manage it all seamlessly from the background.

## ✨ Features

- **🚀 Limitless Volume Boost:** Push your system volume way past 100% (up to +40 dB) using programmatic Preamp adjustments.
- **🎛️ EQ Audio Profiles:** Quick-toggle between built-in EQ graphic presets like *Bass Boost*, *Movie Mode*, and *Flat*.
- **⚡ Global Hotkeys:** Adjust your system master volume (`Ctrl+Alt+Up/Down`) and your APO Boost (`Ctrl+Shift+Up/Down`) on the fly, even while in-game.
- **🌊 Dynamic Visualizer:** A beautiful, responsive real-time audio frequency visualizer built into the UI.
- **👻 System Tray Integration:** Frameless glassmorphism design that minimizes quietly to your Windows System Tray.
- **💾 Persistent Memory:** Automatically remembers your volume, boost, and preset settings across reboots.
- **⚙️ Auto-Start Support:** Native Windows registry integration to launch silently on system boot.

---

## 🛠️ Tech Stack

*   **Framework:** Electron (Node.js main process, Chromium renderer)
*   **Frontend:** React 19, Vite, Vanilla CSS
*   **Audio Engines:** 
    *   `loudness` (Node.js wrapper for Windows Core Audio APIs)
    *   [Equalizer APO](https://sourceforge.net/projects/equalizerapo/) (System-level driver injection)

---

## 🚀 Getting Started

### Prerequisites
1. **Windows OS** (Required for Core Audio and APO).
2. **Node.js** (v18+ recommended).
3. **Equalizer APO:** This application dynamically modifies Equalizer APO's configuration files. You must have Equalizer APO installed and configured for your playback devices. 
   *(Note: The app includes a bundled installer if you don't have it!)*

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/volbooster.git
   cd volbooster
   ```

2. Install the dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```
   *This command leverages `concurrently` to spin up Vite and Electron simultaneously.*

### Building for Production
To package the app into a standalone `.exe` installer for Windows:
```bash
npm run build
```
This uses `electron-builder` to bundle the application. The output will be located in the `dist` or `release` directory.

---

## 🤝 Contributing

We welcome contributions from the community! Whether you're fixing bugs, adding new EQ profiles, or improving the visualizer, your help is appreciated.

1. **Fork** the repository.
2. Create a new branch: `git checkout -b feature/your-feature-name`
3. Make your changes and commit them: `git commit -m "Add some feature"`
4. Push to the branch: `git push origin feature/your-feature-name`
5. Open a **Pull Request** explaining your changes!

### Areas for Future Development
*   *Per-Application Volume Control* using advanced Windows Audio Session APIs.
*   *Custom EQ Band Sliders* in the UI so users can build their own profiles.
*   *True DesktopCapturer Visualizer* using internal WebAudio routing.

---

## 📄 License
This project is open-source and licensed under the MIT License. See the `LICENSE` file for more details. 

*(Note: Equalizer APO is an independent project licensed under GNU GPL. VolBooster does not modify its source code, but rather interacts with its plain-text configuration files).*
