import { useState, useEffect, useRef } from 'react';
import './index.css';

const FREQUENCIES = [20, 63, 125, 250, 500, 1000, 4000, 8000];

const THEME_COLORS = {
  blue: '#3b82f6',
  red: '#ef4444',
  green: '#10b981'
};

function App() {
  const [activeTab, setActiveTab] = useState('main');
  const [volume, setVolume] = useState(50);
  const [boost, setBoost] = useState(0);
  const [preset, setPreset] = useState('Flat');
  const [autoStart, setAutoStart] = useState(false);
  const [theme, setTheme] = useState('blue');
  const [customEQ, setCustomEQ] = useState([0, 0, 0, 0, 0, 0, 0, 0]);
  const [apoStatus, setApoStatus] = useState({ installed: false, writable: false, loading: true });
  const [audioSessions, setAudioSessions] = useState([]);
  
  // Refs for debouncing IPC calls
  const volumeDebounce = useRef(null);
  const boostDebounce = useRef(null);
  
  // Refs for the Visualizer loop to read live state
  const canvasRef = useRef(null);
  const liveVolume = useRef(50);
  const liveBoost = useRef(0);
  const liveTheme = useRef('blue');

  // Sync refs with state
  useEffect(() => { liveVolume.current = volume; }, [volume]);
  useEffect(() => { liveBoost.current = boost; }, [boost]);
  useEffect(() => { liveTheme.current = theme; }, [theme]);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getSettings().then(settings => {
        setVolume(settings.masterVolume !== undefined ? settings.masterVolume : 50);
        setBoost(settings.boost || 0);
        setPreset(settings.preset || 'Flat');
        setAutoStart(settings.autoStart || false);
        setTheme(settings.theme || 'blue');
        if (settings.customEQ) setCustomEQ(settings.customEQ);
        window.electronAPI.setVolume(settings.masterVolume || 50);
      });

      window.electronAPI.checkApo().then(status => {
        setApoStatus({ ...status, loading: false });
        if (status.installed) {
          window.electronAPI.getSettings().then(s => {
             const eqStr = s.preset === 'Custom' ? getCustomEQString(s.customEQ) : s.preset;
             window.electronAPI.setBoost({ dbValue: s.boost || 0, preset: eqStr });
          });
        }
      });

      window.electronAPI.onVolumeChanged((vol) => setVolume(vol));
      window.electronAPI.onBoostHotkey((diff) => {
        setBoost(prev => {
          const newVal = Math.min(40, Math.max(0, prev + diff));
          window.electronAPI.getSettings().then(s => {
            const eqStr = s.preset === 'Custom' ? getCustomEQString(s.customEQ) : s.preset;
            window.electronAPI.setBoost({ dbValue: newVal, preset: eqStr });
          });
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

  // Sync theme to CSS
  useEffect(() => {
    document.body.className = `theme-${theme}`;
  }, [theme]);

  // Save settings whenever they change
  useEffect(() => {
    if (window.electronAPI && !apoStatus.loading) {
      window.electronAPI.saveSettings({ masterVolume: volume, boost, preset, autoStart, theme, customEQ });
    }
  }, [volume, boost, preset, autoStart, theme, customEQ, apoStatus.loading]);

  // Audio Mixer Polling
  useEffect(() => {
    let interval;
    if (activeTab === 'mixer' && window.electronAPI) {
      const fetchSessions = async () => {
        const sessions = await window.electronAPI.getAudioSessions();
        setAudioSessions(sessions);
      };
      fetchSessions();
      interval = setInterval(fetchSessions, 1000);
    }
    return () => clearInterval(interval);
  }, [activeTab]);

  const setupVisualizer = () => {
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const canvasCtx = canvas.getContext('2d');
      const bufferLength = 64;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
        requestAnimationFrame(draw);
        if (!canvasRef.current) return;
        
        // Read from Refs so it's always up to date inside the closure!
        const currentVol = liveVolume.current;
        const currentBoost = liveBoost.current;
        const currentTheme = liveTheme.current;

        const maxAmplitude = (currentVol / 100) * 255;
        const boostFactor = 1 + (currentBoost / 40);
        
        for (let i = 0; i < bufferLength; i++) {
           const target = (Math.sin(Date.now() / 200 + i * 0.2) * 0.5 + 0.5) * maxAmplitude * boostFactor;
           dataArray[i] = dataArray[i] * 0.8 + target * 0.2 + (Math.random() * 10);
        }

        canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
        const barWidth = (canvas.width / bufferLength) * 1.5;
        let x = 0;

        const accentColor = THEME_COLORS[currentTheme] || '#3b82f6';

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = Math.min(canvas.height, dataArray[i] / 255 * canvas.height);
          canvasCtx.fillStyle = accentColor;
          canvasCtx.globalAlpha = 0.5 + (i/bufferLength)*0.5;
          canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
          x += barWidth + 1;
        }
      };
      draw();
    } catch (e) {
      console.error('Visualizer error:', e);
    }
  };

  const getCustomEQString = (eqArray) => {
    return `GraphicEQ: ${FREQUENCIES.map((freq, i) => `${freq} ${eqArray[i]}`).join('; ')}`;
  };

  const handleVolumeChange = (e) => {
    const val = parseInt(e.target.value, 10);
    setVolume(val);
    if (window.electronAPI) {
      if (volumeDebounce.current) clearTimeout(volumeDebounce.current);
      volumeDebounce.current = setTimeout(() => window.electronAPI.setVolume(val), 50);
    }
  };

  const handleBoostChange = (e) => {
    const val = parseFloat(e.target.value);
    setBoost(val);
    if (window.electronAPI && apoStatus.installed) {
      if (boostDebounce.current) clearTimeout(boostDebounce.current);
      boostDebounce.current = setTimeout(() => {
        const eqStr = preset === 'Custom' ? getCustomEQString(customEQ) : preset;
        window.electronAPI.setBoost({ dbValue: val, preset: eqStr });
      }, 100);
    }
  };

  const handlePresetChange = (e) => {
    const p = e.target.value;
    setPreset(p);
    if (window.electronAPI && apoStatus.installed) {
      const eqStr = p === 'Custom' ? getCustomEQString(customEQ) : p;
      window.electronAPI.setBoost({ dbValue: boost, preset: eqStr });
    }
  };

  const handleCustomEQChange = (index, val) => {
    const newEQ = [...customEQ];
    newEQ[index] = parseFloat(val);
    setCustomEQ(newEQ);
    
    if (window.electronAPI && apoStatus.installed && preset === 'Custom') {
      window.electronAPI.setBoost({ dbValue: boost, preset: getCustomEQString(newEQ) });
    }
  };

  const handleSessionVolume = (id, vol) => {
    if (window.electronAPI) {
      window.electronAPI.setSessionVolume({ id, volume: parseInt(vol, 10) });
      setAudioSessions(prev => prev.map(s => s.id === id ? { ...s, volume: vol } : s));
    }
  };

  const handleSessionMute = (id, mute) => {
    if (window.electronAPI) {
      window.electronAPI.setSessionMute({ id, mute });
      setAudioSessions(prev => prev.map(s => s.id === id ? { ...s, mute } : s));
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

      <div className="header" style={{ marginBottom: '16px' }}>
        <h1>VolBooster Pro</h1>
      </div>

      <div className="tabs-container interactive">
        <button className={`tab-btn ${activeTab === 'main' ? 'active' : ''}`} onClick={() => setActiveTab('main')}>Main</button>
        <button className={`tab-btn ${activeTab === 'mixer' ? 'active' : ''}`} onClick={() => setActiveTab('mixer')}>App Mixer</button>
      </div>

      {/* 
        Fix 1: We removed overflowY: 'auto' so the hover glows don't accidentally trigger scrollbars.
        We just rely on the larger window size to contain everything cleanly.
      */}
      <div className="control-section" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {activeTab === 'main' ? (
          <>
            <div className="slider-container">
              <div className="slider-header">
                <span className="slider-label">Master Volume</span>
                <span className="slider-value">{volume}%</span>
              </div>
              <input type="range" min="0" max="100" value={volume} onChange={handleVolumeChange} className="standard-volume interactive" style={{ '--val': `${volume}%` }} />
            </div>

            <div className="slider-container">
              <div className="slider-header">
                <span className="slider-label" style={{ color: 'var(--boost-color)' }}>APO Boost Gain</span>
                <span className="slider-value boost">+{boost.toFixed(1)} dB</span>
              </div>
              <input type="range" min="0" max="40" step="0.5" value={boost} onChange={handleBoostChange} disabled={!apoStatus.installed} className="boost-volume interactive" style={{ '--val': `${(boost / 40) * 100}%`, opacity: apoStatus.installed ? 1 : 0.4 }} />
            </div>
            
            <div className="settings-row" style={{ marginTop: 'auto' }}>
              <div className="setting-item">
                <label>EQ Profile</label>
                <select className="interactive" value={preset} onChange={handlePresetChange} disabled={!apoStatus.installed}>
                  <option value="Flat">Flat</option>
                  <option value="Bass Boost">Bass Boost</option>
                  <option value="Movie Mode">Movie Mode</option>
                  <option value="Custom">Custom</option>
                </select>
              </div>
              <div className="setting-item toggle-item">
                <label>Theme</label>
                <select className="interactive" value={theme} onChange={(e) => setTheme(e.target.value)}>
                  <option value="blue">Deep Space</option>
                  <option value="red">Cyberpunk</option>
                  <option value="green">Toxic</option>
                </select>
              </div>
            </div>

            {preset === 'Custom' && apoStatus.installed && (
              <div className="custom-eq-container interactive">
                {FREQUENCIES.map((freq, i) => (
                  <div key={freq} className="eq-band">
                    <label>{freq >= 1000 ? `${freq/1000}k` : freq}</label>
                    <input type="range" min="-12" max="12" step="0.5" value={customEQ[i]} onChange={(e) => handleCustomEQChange(i, e.target.value)} />
                    <label style={{ fontSize: '9px' }}>{customEQ[i] > 0 ? '+' : ''}{customEQ[i]}</label>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="app-mixer-list interactive">
            {audioSessions.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '20px' }}>No active audio apps found.</div>
            ) : (
              audioSessions.map((session) => (
                <div key={session.id} className="app-mixer-item">
                  <div className="app-info">
                    <span className="app-name">{session.name}</span>
                  </div>
                  <input type="range" min="0" max="100" value={session.volume} onChange={(e) => handleSessionVolume(session.id, e.target.value)} className="standard-volume interactive" style={{ '--val': `${session.volume}%` }} />
                  <button className={`app-mute-btn ${session.mute ? 'muted' : ''}`} onClick={() => handleSessionMute(session.id, !session.mute)}>
                    {session.mute ? (
                       <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
                    ) : (
                       <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
                    )}
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* 
        Fix 2: We moved the visualizer-container completely OUTSIDE of the activeTab condition.
        Now it never gets unmounted, preventing the "empty box" bug when you switch back to Main!
      */}
      <div className="visualizer-container" style={{ marginTop: 'auto' }}>
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
    </div>
  );
}

export default App;
