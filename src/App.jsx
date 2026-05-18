import { useState, useEffect, useRef } from 'react';
import './index.css';

function App() {
  const [volume, setVolume] = useState(50);
  const [boost, setBoost] = useState(0);
  const [preset, setPreset] = useState('Flat');
  const [autoStart, setAutoStart] = useState(false);
  const [apoStatus, setApoStatus] = useState({ installed: false, writable: false, loading: true });
  
  const volumeDebounce = useRef(null);
  const boostDebounce = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (window.electronAPI) {
      // Load Settings
      window.electronAPI.getSettings().then(settings => {
        setVolume(settings.masterVolume);
        setBoost(settings.boost);
        setPreset(settings.preset);
        setAutoStart(settings.autoStart);
        window.electronAPI.setVolume(settings.masterVolume);
      });

      window.electronAPI.checkApo().then(status => {
        setApoStatus({ ...status, loading: false });
        if (status.installed) {
          window.electronAPI.getSettings().then(s => {
             window.electronAPI.setBoost({ dbValue: s.boost, preset: s.preset });
          });
        }
      });

      window.electronAPI.onVolumeChanged((vol) => setVolume(vol));
      window.electronAPI.onBoostHotkey((diff) => {
        setBoost(prev => {
          const newVal = Math.min(40, Math.max(0, prev + diff));
          window.electronAPI.setBoost({ dbValue: newVal, preset });
          return newVal;
        });
      });

      setupVisualizer();
    } else {
      setApoStatus({ installed: false, writable: false, loading: false });
    }

    return () => {
      if (volumeDebounce.current) clearTimeout(volumeDebounce.current);
      if (boostDebounce.current) clearTimeout(boostDebounce.current);
    };
  }, []);

  // Save settings whenever they change
  useEffect(() => {
    if (window.electronAPI && !apoStatus.loading) {
      window.electronAPI.saveSettings({ masterVolume: volume, boost, preset, autoStart });
    }
  }, [volume, boost, preset, autoStart, apoStatus.loading]);

  const setupVisualizer = () => {
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const canvasCtx = canvas.getContext('2d');
      const bufferLength = 64;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
        requestAnimationFrame(draw);
        
        // Simulate frequency data based on volume and boost
        const maxAmplitude = (volume / 100) * 255;
        const boostFactor = 1 + (boost / 40);
        
        for (let i = 0; i < bufferLength; i++) {
           // Create a nice fake wave form
           const target = (Math.sin(Date.now() / 200 + i * 0.2) * 0.5 + 0.5) * maxAmplitude * boostFactor;
           // Smooth it out
           dataArray[i] = dataArray[i] * 0.8 + target * 0.2 + (Math.random() * 10);
        }

        canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
        const barWidth = (canvas.width / bufferLength) * 1.5;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = Math.min(canvas.height, dataArray[i] / 255 * canvas.height);
          const r = barHeight * 2 + 25 * (i/bufferLength);
          const g = 100;
          const b = 255 - (i/bufferLength)*100;
          
          canvasCtx.fillStyle = `rgb(${r},${g},${b})`;
          canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
          x += barWidth + 1;
        }
      };
      draw();
    } catch (e) {
      console.error('Visualizer error:', e);
    }
  };

  const handleVolumeChange = (e) => {
    const val = parseInt(e.target.value, 10);
    setVolume(val);
    if (window.electronAPI) {
      if (volumeDebounce.current) clearTimeout(volumeDebounce.current);
      volumeDebounce.current = setTimeout(() => {
        window.electronAPI.setVolume(val);
      }, 50);
    }
  };

  const handleBoostChange = (e) => {
    const val = parseFloat(e.target.value);
    setBoost(val);
    if (window.electronAPI && apoStatus.installed) {
      if (boostDebounce.current) clearTimeout(boostDebounce.current);
      boostDebounce.current = setTimeout(() => {
        window.electronAPI.setBoost({ dbValue: val, preset });
      }, 100);
    }
  };

  const handlePresetChange = (e) => {
    const p = e.target.value;
    setPreset(p);
    if (window.electronAPI && apoStatus.installed) {
      window.electronAPI.setBoost({ dbValue: boost, preset: p });
    }
  };

  const handleClose = () => { if (window.electronAPI) window.electronAPI.closeWindow(); };
  const handleMinimize = () => { if (window.electronAPI) window.electronAPI.minimizeWindow(); };

  return (
    <div className="app-container">
      <div className="window-controls">
        <button className="win-btn minimize interactive" onClick={handleMinimize}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
        <button className="win-btn close interactive" onClick={handleClose}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>

      <div className="header">
        <h1>VolBooster</h1>
        <p>System Audio Control</p>
      </div>

      <div className="control-section">
        {/* Standard Volume Control */}
        <div className="slider-container">
          <div className="slider-header">
            <span className="slider-label">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
              </svg>
              Master Volume
            </span>
            <span className="slider-value">{volume}%</span>
          </div>
          <input type="range" min="0" max="100" value={volume} onChange={handleVolumeChange} className="standard-volume interactive" style={{ '--val': `${volume}%` }} />
        </div>

        {/* Boost Volume Control */}
        <div className="slider-container">
          <div className="slider-header">
            <span className="slider-label" style={{ color: 'var(--boost-color)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>
              APO Boost Gain
            </span>
            <span className="slider-value boost">+{boost.toFixed(1)} dB</span>
          </div>
          <input type="range" min="0" max="40" step="0.5" value={boost} onChange={handleBoostChange} disabled={!apoStatus.installed} className="boost-volume interactive" style={{ '--val': `${(boost / 40) * 100}%`, opacity: apoStatus.installed ? 1 : 0.4 }} />
        </div>
        
        {/* Presets and Auto-Start Settings */}
        <div className="settings-row">
          <div className="setting-item">
            <label>EQ Profile</label>
            <select className="interactive" value={preset} onChange={handlePresetChange} disabled={!apoStatus.installed}>
              <option value="Flat">Flat</option>
              <option value="Bass Boost">Bass Boost</option>
              <option value="Movie Mode">Movie Mode</option>
            </select>
          </div>
          <div className="setting-item toggle-item">
            <label>Auto-Start</label>
            <label className="switch interactive">
              <input type="checkbox" checked={autoStart} onChange={(e) => setAutoStart(e.target.checked)} />
              <span className="slider-toggle round"></span>
            </label>
          </div>
        </div>
      </div>

      <div className="visualizer-container">
        <canvas ref={canvasRef} width="300" height="40" className="audio-visualizer"></canvas>
      </div>

      {/* APO Status */}
      <div className={`apo-status ${!apoStatus.loading && !apoStatus.installed ? 'missing' : ''}`} style={{ marginTop: '10px', padding: '10px' }}>
        {apoStatus.loading ? (
          <div>Checking Audio Engine...</div>
        ) : apoStatus.installed ? (
          <div><span className="status-indicator ok"></span> Engine Active</div>
        ) : (
          <div style={{ color: 'var(--boost-color)' }}>
            <span className="status-indicator error"></span>
            <strong>APO Not Found</strong>
            <button className="interactive download-btn" onClick={() => window.electronAPI && window.electronAPI.installApo()} style={{ display: 'block', margin: '4px auto 0' }}>
              Install Engine
            </button>
          </div>
        )}
      </div>

      <div className="footer" style={{ marginTop: '10px' }}>
        Powered by Electron & React
      </div>
    </div>
  );
}

export default App;
