import { useState, useEffect, useRef } from 'react';
import SelectField from './SelectField';
import './index.css';

const FREQUENCIES = [20, 63, 125, 250, 500, 1000, 4000, 8000];
const SAFE_BOOST_CAP = 12;

const DEFAULT_HOTKEYS = {
  volumeUp: 'CommandOrControl+Alt+Up',
  volumeDown: 'CommandOrControl+Alt+Down',
  boostUp: 'CommandOrControl+Shift+Up',
  boostDown: 'CommandOrControl+Shift+Down',
  profileNext: 'CommandOrControl+Alt+Right',
  profilePrev: 'CommandOrControl+Alt+Left'
};

const HOTKEY_LABELS = {
  volumeUp: 'Volume up',
  volumeDown: 'Volume down',
  boostUp: 'Preamp up',
  boostDown: 'Preamp down',
  profileNext: 'Next profile',
  profilePrev: 'Previous profile'
};

function formatAccel(accel = '') {
  return accel.replaceAll('CommandOrControl', 'Ctrl').replaceAll('+', ' + ');
}

function eventToAccelerator(event) {
  if (['Control', 'Meta', 'Alt', 'Shift'].includes(event.key)) return null;
  const parts = [];
  if (event.ctrlKey || event.metaKey) parts.push('CommandOrControl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  const special = { ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', ' ': 'Space' };
  let key = special[event.key] || event.key;
  if (key.length === 1) key = key.toUpperCase();
  parts.push(key);
  return parts.length > 1 ? parts.join('+') : null;
}

const THEME_COLORS = {
  blue: '#7dd3fc',
  red: '#fda4af',
  green: '#86efac'
};

function OSDOverlay() {
  const [osdData, setOsdData] = useState(null);
  const [peak, setPeak] = useState(0);
  const [clipping, setClipping] = useState(false);
  const [osdKey, setOsdKey] = useState(0);

  useEffect(() => {
    document.body.classList.add('osd');
    if (!window.electronAPI) return undefined;
    if (window.electronAPI.onShowOSD) {
      window.electronAPI.onShowOSD((data) => {
        setOsdData(data);
        setOsdKey(k => k + 1);
        if (typeof data?.peak === 'number') setPeak(data.peak);
      });
    }
    if (window.electronAPI.onAudioMeter) {
      window.electronAPI.onAudioMeter((data) => {
        setPeak(data.peak || 0);
        setClipping(Boolean(data.clipping));
      });
    }
    return undefined;
  }, []);

  if (!osdData) return null;
  return (
    <div className="osd-card" key={osdKey}>
      <div className="osd-title">{osdData.title}</div>
      <div className="osd-value">{osdData.value}</div>
      <div className={`osd-meter ${clipping ? 'clipping' : ''}`}>
        <div className="osd-meter-fill" style={{ width: `${Math.min(100, peak * 100)}%` }} />
      </div>
    </div>
  );
}

function App() {
  const isOSD = window.location.search.includes('osd=true');
  const [activeTab, setActiveTab] = useState('main');
  const [volume, setVolume] = useState(50);
  const [boost, setBoost] = useState(0);
  const [preset, setPreset] = useState('Flat');
  const [autoStart, setAutoStart] = useState(false);
  const [theme, setTheme] = useState('blue');
  const [customEQ, setCustomEQ] = useState([0, 0, 0, 0, 0, 0, 0, 0]);
  const [preferredDevice, setPreferredDevice] = useState('');
  const [allowHighBoost, setAllowHighBoost] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [activeProfileId, setActiveProfileId] = useState('');
  const [devices, setDevices] = useState([]);
  const [defaultDevice, setDefaultDevice] = useState('');
  const [apoStatus, setApoStatus] = useState({ installed: false, writable: false, loading: true });
  const [audioSessions, setAudioSessions] = useState([]);
  const [settingsReady, setSettingsReady] = useState(false);
  const [clipping, setClipping] = useState(false);
  const [visualizerLive, setVisualizerLive] = useState(false);
  const [captureReason, setCaptureReason] = useState('');
  const [captureNonce, setCaptureNonce] = useState(0);
  const [firstRunComplete, setFirstRunComplete] = useState(true);
  const [firstRunStep, setFirstRunStep] = useState(0);
  const [hotkeys, setHotkeys] = useState(DEFAULT_HOTKEYS);
  const [osd, setOsd] = useState({ enabled: true, timeoutMs: 2000, displayId: 0 });
  const [displays, setDisplays] = useState([]);
  const [appInfo, setAppInfo] = useState({ version: '0.1.0', packaged: false, elevated: false });
  const [updateStatus, setUpdateStatus] = useState({ state: 'idle' });
  const [recordingKey, setRecordingKey] = useState('');
  const [hotkeyError, setHotkeyError] = useState('');
  const [apoWriteError, setApoWriteError] = useState('');

  const volumeDebounce = useRef(null);
  const boostDebounce = useRef(null);
  const canvasRef = useRef(null);
  const analyserRef = useRef(null);
  const freqDataRef = useRef(null);
  const liveTheme = useRef('blue');
  const meterTimer = useRef(null);

  useEffect(() => { liveTheme.current = theme; }, [theme]);

  const boostCap = allowHighBoost ? 40 : SAFE_BOOST_CAP;
  const deviceMismatch = Boolean(preferredDevice && defaultDevice && preferredDevice !== defaultDevice);
  const estimatedClip = (volume / 100) * Math.pow(10, boost / 20) >= 1 && boost > 0;

  const getCustomEQString = (eqArray) => {
    return `GraphicEQ: ${FREQUENCIES.map((freq, i) => `${freq} ${eqArray[i]}`).join('; ')}`;
  };

  const pushBoost = (dbValue, nextPreset = preset, nextEQ = customEQ, device = preferredDevice) => {
    if (!window.electronAPI || !apoStatus.installed || !apoStatus.writable) return;
    window.electronAPI.setBoost({
      dbValue,
      preset: nextPreset === 'Custom' ? getCustomEQString(nextEQ) : nextPreset,
      customEQ: nextEQ,
      deviceName: device
    });
  };

  const applyLoadedSettings = (settings) => {
    const vol = typeof settings.masterVolume === 'number' ? settings.masterVolume : 50;
    const boostVal = typeof settings.boost === 'number' ? settings.boost : 0;
    const cap = settings.allowHighBoost ? 40 : SAFE_BOOST_CAP;
    setVolume(vol);
    setBoost(Math.min(boostVal, cap));
    setPreset(settings.preset || 'Flat');
    setAutoStart(Boolean(settings.autoStart));
    setTheme(settings.theme || 'blue');
    if (settings.customEQ) setCustomEQ(settings.customEQ);
    setPreferredDevice(settings.preferredDevice || '');
    setAllowHighBoost(Boolean(settings.allowHighBoost));
    setProfiles(Array.isArray(settings.profiles) ? settings.profiles : []);
    setActiveProfileId(settings.activeProfileId || '');
    setFirstRunComplete(Boolean(settings.firstRunComplete));
    setHotkeys({ ...DEFAULT_HOTKEYS, ...(settings.hotkeys || {}) });
    setOsd({ enabled: true, timeoutMs: 2000, displayId: 0, ...(settings.osd || {}) });
  };

  useEffect(() => {
    if (isOSD) return undefined;

    if (window.electronAPI) {
      window.electronAPI.getSettings().then(settings => {
        applyLoadedSettings(settings);
        const vol = typeof settings.masterVolume === 'number' ? settings.masterVolume : 50;
        window.electronAPI.setVolume(vol);
        setSettingsReady(true);
      }).catch(() => setSettingsReady(true));

      window.electronAPI.checkApo().then(status => {
        setApoStatus({ ...status, loading: false });
        if (status.installed && status.writable) {
          window.electronAPI.getSettings().then(s => {
            const eqStr = s.preset === 'Custom' ? getCustomEQString(s.customEQ) : s.preset;
            window.electronAPI.setBoost({
              dbValue: typeof s.boost === 'number' ? s.boost : 0,
              preset: eqStr,
              customEQ: s.customEQ,
              deviceName: s.preferredDevice || ''
            });
          });
        }
      });

      window.electronAPI.getAudioDevices?.().then(info => {
        setDevices(info.devices || []);
        setDefaultDevice(info.defaultDevice || '');
      }).catch(() => {});

      window.electronAPI.getDisplays?.().then(setDisplays).catch(() => {});
      window.electronAPI.getAppInfo?.().then(setAppInfo).catch(() => {});

      window.electronAPI.onVolumeChanged((vol) => setVolume(vol));
      window.electronAPI.onBoostHotkey((val) => setBoost(val));
      window.electronAPI.onBoostReset?.((val) => setBoost(val));
      window.electronAPI.onProfileApplied?.((settings) => applyLoadedSettings(settings));
      window.electronAPI.onDevicesChanged?.((info) => {
        setDevices(info.devices || []);
        setDefaultDevice(info.defaultDevice || '');
      });
      window.electronAPI.onApoWriteResult?.((result) => {
        setApoWriteError(result.ok ? '' : (result.error || 'Could not write Equalizer APO config'));
        if (!result.ok) {
          window.electronAPI.checkApo().then(status => setApoStatus({ ...status, loading: false }));
        }
      });
      window.electronAPI.onUpdateStatus?.((status) => setUpdateStatus(status || { state: 'idle' }));
      window.electronAPI.onHotkeyError?.((err) => setHotkeyError(err?.message || 'Shortcut unavailable'));
    } else {
      setApoStatus({ installed: false, writable: false, loading: false });
      setSettingsReady(true);
    }

    return () => {
      if (volumeDebounce.current) clearTimeout(volumeDebounce.current);
      if (boostDebounce.current) clearTimeout(boostDebounce.current);
      if (meterTimer.current) clearInterval(meterTimer.current);
    };
  }, [isOSD]);

  useEffect(() => {
    if (isOSD) return;
    document.body.className = `theme-${theme}`;
  }, [theme, isOSD]);

  useEffect(() => {
    if (isOSD) return;
    if (window.electronAPI && settingsReady && !apoStatus.loading) {
      window.electronAPI.saveSettings({
        masterVolume: volume,
        boost,
        preset,
        autoStart,
        theme,
        customEQ,
        preferredDevice,
        allowHighBoost,
        profiles,
        activeProfileId,
        firstRunComplete,
        hotkeys,
        osd
      });
    }
  }, [volume, boost, preset, autoStart, theme, customEQ, preferredDevice, allowHighBoost, profiles, activeProfileId, firstRunComplete, hotkeys, osd, apoStatus.loading, settingsReady, isOSD]);

  useEffect(() => {
    let interval;
    if (!isOSD && activeTab === 'mixer' && window.electronAPI) {
      const fetchSessions = async () => {
        const sessions = await window.electronAPI.getAudioSessions();
        setAudioSessions(sessions);
      };
      fetchSessions();
      interval = setInterval(fetchSessions, 1000);
    }
    return () => clearInterval(interval);
  }, [activeTab, isOSD]);

  useEffect(() => {
    if (isOSD) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const canvasCtx = canvas.getContext('2d');
    let raf = 0;
    let stopped = false;

    const drawFake = (dataArray) => {
      const maxAmplitude = 180;
      for (let i = 0; i < dataArray.length; i++) {
        const target = (Math.sin(Date.now() / 200 + i * 0.2) * 0.5 + 0.5) * maxAmplitude * 0.15;
        dataArray[i] = dataArray[i] * 0.8 + target * 0.2;
      }
    };

    const paint = (dataArray) => {
        canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
        const gap = 2;
        const barWidth = Math.max(2, (canvas.width / dataArray.length) - gap);
        let x = 0;
        const accentColor = THEME_COLORS[liveTheme.current] || '#7dd3fc';
        for (let i = 0; i < dataArray.length; i++) {
          const t = dataArray[i] / 255;
          const barHeight = Math.max(3, t * canvas.height);
          const gradient = canvasCtx.createLinearGradient(0, canvas.height, 0, canvas.height - barHeight);
          gradient.addColorStop(0, accentColor);
          gradient.addColorStop(1, 'rgba(255,255,255,0.22)');
          canvasCtx.globalAlpha = 0.28 + t * 0.72;
          canvasCtx.fillStyle = gradient;
          canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
          x += barWidth + gap;
        }
        canvasCtx.globalAlpha = 1;
    };

    const tick = () => {
      if (stopped || !canvasRef.current) return;
      const analyser = analyserRef.current;
      const dataArray = freqDataRef.current || new Uint8Array(64);
      if (analyser) {
        analyser.getByteFrequencyData(dataArray);
      } else {
        drawFake(dataArray);
      }
      freqDataRef.current = dataArray;
      paint(dataArray);
      raf = requestAnimationFrame(tick);
    };

    const startCapture = async () => {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        });
        stream.getVideoTracks().forEach(track => track.stop());
        if (!stream.getAudioTracks().length) {
          stream.getTracks().forEach(track => track.stop());
          setVisualizerLive(false);
          setCaptureReason('no-audio');
          freqDataRef.current = new Uint8Array(64);
          return;
        }
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.75;
        source.connect(analyser);
        analyserRef.current = analyser;
        freqDataRef.current = new Uint8Array(analyser.frequencyBinCount);
        setVisualizerLive(true);
        setCaptureReason('');

        meterTimer.current = setInterval(() => {
          const bins = freqDataRef.current;
          if (!bins || !window.electronAPI?.sendAudioMeter) return;
          let sum = 0;
          let max = 0;
          for (let i = 0; i < bins.length; i++) {
            const n = bins[i] / 255;
            sum += n;
            if (n > max) max = n;
          }
          const peak = Math.max(max, sum / bins.length);
          const isClip = max >= 0.97;
          setClipping(isClip);
          window.electronAPI.sendAudioMeter({ peak, clipping: isClip });
        }, 80);
      } catch (e) {
        const reason = e?.name === 'NotAllowedError' ? 'permission' : 'unavailable';
        console.warn('Loopback visualizer unavailable, using fallback', e);
        setVisualizerLive(false);
        setCaptureReason(reason);
        freqDataRef.current = new Uint8Array(64);
      }
    };

    startCapture();
    tick();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      if (meterTimer.current) clearInterval(meterTimer.current);
    };
  }, [isOSD, captureNonce]);

  const handleVolumeChange = (e) => {
    const val = parseInt(e.target.value, 10);
    setVolume(val);
    if (window.electronAPI) {
      if (volumeDebounce.current) clearTimeout(volumeDebounce.current);
      volumeDebounce.current = setTimeout(() => window.electronAPI.setVolume(val), 50);
    }
  };

  const handleBoostChange = (e) => {
    const val = Math.min(boostCap, parseFloat(e.target.value));
    setBoost(val);
    if (boostDebounce.current) clearTimeout(boostDebounce.current);
    boostDebounce.current = setTimeout(() => pushBoost(val), 100);
  };

  const handlePresetChange = (e) => {
    const p = e.target.value;
    setPreset(p);
    pushBoost(boost, p);
  };

  const handleCustomEQChange = (index, val) => {
    const newEQ = [...customEQ];
    newEQ[index] = parseFloat(val);
    setCustomEQ(newEQ);
    if (preset === 'Custom') pushBoost(boost, 'Custom', newEQ);
  };

  const handleDeviceChange = (e) => {
    const id = e.target.value;
    setPreferredDevice(id);
    pushBoost(boost, preset, customEQ, id);
  };

  const handleHighBoostToggle = (checked) => {
    if (checked) {
      const ok = window.confirm('Allow boost above +12 dB? High gain can clip and damage speakers or hearing.');
      if (!ok) return;
    } else if (boost > SAFE_BOOST_CAP) {
      setBoost(SAFE_BOOST_CAP);
      pushBoost(SAFE_BOOST_CAP);
    }
    setAllowHighBoost(checked);
  };

  const handleProfileChange = (e) => {
    const id = e.target.value;
    if (!id || !window.electronAPI?.applyProfile) return;
    window.electronAPI.applyProfile(id);
  };

  const handleSaveProfile = () => {
    if (!window.electronAPI?.saveProfile) return;
    let id = activeProfileId;
    let name = profiles.find(p => p.id === id)?.name;
    if (!id) {
      name = window.prompt('Profile name', 'Custom');
      if (!name) return;
      id = `profile-${Date.now()}`;
    }
    const profile = { id, name, masterVolume: volume, boost, preset, customEQ: [...customEQ] };
    window.electronAPI.saveProfile(profile);
    setProfiles(prev => {
      const next = [...prev];
      const index = next.findIndex(p => p.id === id);
      if (index >= 0) next[index] = profile;
      else next.push(profile);
      return next;
    });
    setActiveProfileId(id);
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

  useEffect(() => {
    if (!recordingKey) return undefined;
    const onKey = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        setRecordingKey('');
        return;
      }
      const accel = eventToAccelerator(event);
      if (!accel) return;
      setHotkeys(prev => ({ ...prev, [recordingKey]: accel }));
      setRecordingKey('');
      setHotkeyError('');
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recordingKey]);

  const finishFirstRun = () => {
    setFirstRunComplete(true);
    window.electronAPI?.completeFirstRun?.();
  };

  const captureLabel = visualizerLive
    ? 'Output'
    : captureReason === 'permission'
      ? 'Capture blocked'
      : captureReason === 'no-audio'
        ? 'No loopback audio'
        : captureReason === 'unavailable'
          ? 'Meter unavailable'
          : 'Standby';

  if (isOSD) return <OSDOverlay />;

  return (
    <div className="app-container">
      <div className="atmosphere" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      <div className="topbar">
        <div className="topbar-main">
          <div className="brand">
            <span className={`brand-mark ${visualizerLive ? 'live' : ''}`} aria-hidden="true">
              <svg viewBox="0 0 32 32" width="18" height="18">
                <rect width="32" height="32" rx="8" fill="#07080c" />
                <rect x="1.1" y="1.1" width="29.8" height="29.8" rx="6.9" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.1" />
                <path d="M7 10.2h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <rect x="8.1" y="18.2" width="2.3" height="7.6" rx="1.05" fill="currentColor" fillOpacity="0.5" />
                <rect x="12.3" y="14.4" width="2.3" height="11.4" rx="1.05" fill="currentColor" fillOpacity="0.78" />
                <rect x="16.5" y="12.1" width="2.3" height="13.7" rx="1.05" fill="currentColor" />
                <rect x="20.7" y="15.8" width="2.3" height="10" rx="1.05" fill="currentColor" fillOpacity="0.68" />
              </svg>
            </span>
            <h1>Headroom</h1>
          </div>
          <div className="window-controls">
            <button className="win-btn minimize interactive" onClick={handleMinimize}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
            <button className="win-btn close interactive" onClick={handleClose}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </div>
        <div className="tabs-container interactive">
          <button className={`tab-btn ${activeTab === 'main' ? 'active' : ''}`} onClick={() => setActiveTab('main')}>Mix</button>
          <button className={`tab-btn ${activeTab === 'mixer' ? 'active' : ''}`} onClick={() => setActiveTab('mixer')}>Apps</button>
          <button className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>Settings</button>
        </div>
      </div>

      <div className="hero" style={{ '--level': Math.max(0.12, volume / 100) }}>
        <canvas ref={canvasRef} width="640" height="160" className="audio-visualizer"></canvas>
        <div className="hero-veil" />
        <div className="hero-readout">
          <div className="hero-kicker">{captureLabel}</div>
          <div className="hero-primary">{volume}<span>%</span></div>
          <div className="hero-secondary">
            <span>+{boost.toFixed(1)} dB</span>
            {(clipping || estimatedClip) && <span className="clip-badge">CLIP</span>}
          </div>
        </div>
      </div>

      <div className="control-section" key={activeTab}>
        {activeTab === 'main' ? (
          <>
            <div className="panel interactive">
              <div className="setting-item">
                <label>Output device</label>
                <SelectField
                  className="full-select"
                  value={preferredDevice}
                  onChange={(next) => handleDeviceChange({ target: { value: next } })}
                  options={[
                    { value: '', label: `System default (${defaultDevice || 'current'})` },
                    ...devices.map(device => ({
                      value: device.id,
                      label: `${device.name}${device.isDefault ? ' · default' : ''}`
                    }))
                  ]}
                />
              </div>
              {deviceMismatch && (
                <div className="warn-banner">
                  System default is {defaultDevice}. Targeting {preferredDevice}.
                </div>
              )}
            </div>

            <div className="panel">
              <div className="slider-container">
                <div className="slider-header">
                  <span className="slider-label">
                    Master
                    <span className="hint interactive" tabIndex={0} aria-label="About master volume">
                      <span className="hint-mark" aria-hidden="true">i</span>
                      <span className="hint-tip" role="tooltip">
                        Windows endpoint volume. 100% is the system limit. It does not add analog or APO gain on its own.
                      </span>
                    </span>
                  </span>
                  <span className="slider-value">{volume}%</span>
                </div>
                <input type="range" min="0" max="100" value={volume} onChange={handleVolumeChange} className="standard-volume interactive" style={{ '--val': `${volume}%` }} />
              </div>

              <div className="slider-container">
                <div className="slider-header">
                  <span className="slider-label">
                    Preamp gain
                    <span className="hint interactive" tabIndex={0} aria-label="About preamp gain">
                      <span className="hint-mark" aria-hidden="true">i</span>
                      <span className="hint-tip" role="tooltip">
                        Equalizer APO preamp, applied after the Windows mixer. Positive dB is how you go past 100%. Watch CLIP; the default cap is +12 dB.
                      </span>
                    </span>
                  </span>
                  <span className="slider-value boost">+{boost.toFixed(1)} dB</span>
                </div>
                <input type="range" min="0" max={boostCap} step="0.5" value={Math.min(boost, boostCap)} onChange={handleBoostChange} disabled={!apoStatus.installed || !apoStatus.writable} className="boost-volume interactive" style={{ '--val': `${(Math.min(boost, boostCap) / boostCap) * 100}%`, opacity: apoStatus.installed && apoStatus.writable ? 1 : 0.4 }} />
                <div className="boost-safety interactive">
                  <label className="switch">
                    <input type="checkbox" checked={allowHighBoost} onChange={(e) => handleHighBoostToggle(e.target.checked)} />
                    <span className="slider-toggle"></span>
                  </label>
                  <span>Unlock +40 dB ceiling</span>
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="settings-row">
                <div className="setting-item" style={{ flex: 1 }}>
                  <label>Profile</label>
                  <SelectField
                    value={activeProfileId}
                    onChange={(next) => handleProfileChange({ target: { value: next } })}
                    options={[
                      { value: '', label: 'Unsaved session' },
                      ...profiles.map(profile => ({ value: profile.id, label: profile.name }))
                    ]}
                  />
                </div>
                <button className="interactive profile-save-btn" onClick={handleSaveProfile}>Save</button>
              </div>
              <div className="settings-row">
                <div className="setting-item">
                  <label>EQ</label>
                  <SelectField
                    value={preset}
                    onChange={(next) => handlePresetChange({ target: { value: next } })}
                    disabled={!apoStatus.installed || !apoStatus.writable}
                    options={[
                      { value: 'Flat', label: 'Flat' },
                      { value: 'Bass Boost', label: 'Bass' },
                      { value: 'Movie Mode', label: 'Cinema' },
                      { value: 'Custom', label: 'Custom' }
                    ]}
                  />
                </div>
                <div className="setting-item">
                  <label>Look</label>
                  <SelectField
                    value={theme}
                    onChange={setTheme}
                    options={[
                      { value: 'blue', label: 'Ion' },
                      { value: 'red', label: 'Ember' },
                      { value: 'green', label: 'Aura' }
                    ]}
                  />
                </div>
                <div className="setting-item">
                  <label>Launch</label>
                  <label className="switch interactive">
                    <input type="checkbox" checked={autoStart} onChange={(e) => setAutoStart(e.target.checked)} />
                    <span className="slider-toggle"></span>
                  </label>
                </div>
              </div>
            </div>

            {preset === 'Custom' && apoStatus.installed && apoStatus.writable && (
              <div className="panel custom-eq-container interactive">
                {FREQUENCIES.map((freq, i) => (
                  <div key={freq} className="eq-band">
                    <label>{freq >= 1000 ? `${freq / 1000}k` : freq}</label>
                    <input type="range" min="-12" max="12" step="0.5" value={customEQ[i]} onChange={(e) => handleCustomEQChange(i, e.target.value)} />
                    <label>{customEQ[i] > 0 ? '+' : ''}{customEQ[i]}</label>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : activeTab === 'mixer' ? (
          <div className="panel mixer-panel interactive">
            {audioSessions.length === 0 ? (
              <div className="empty-state">No active sessions</div>
            ) : (
              audioSessions.map((session) => (
                <div key={session.id} className="app-mixer-item">
                  <div className="app-info">
                    <span className="app-name">{session.name}</span>
                  </div>
                  <input type="range" min="0" max="100" value={session.volume} onChange={(e) => handleSessionVolume(session.id, e.target.value)} className="standard-volume interactive" style={{ '--val': `${session.volume}%` }} />
                  <button className={`app-mute-btn ${session.mute ? 'muted' : ''}`} onClick={() => handleSessionMute(session.id, !session.mute)}>
                    {session.mute ? (
                       <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
                    ) : (
                       <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
                    )}
                  </button>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="panel setup-panel interactive">
            <div className="setup-block">
              <label>Updates</label>
              <p className="setup-copy">v{appInfo.version}{appInfo.packaged ? '' : ' · development'}{appInfo.elevated ? ' · admin' : ''}</p>
              <div className="settings-row">
                <button className="interactive profile-save-btn" onClick={() => window.electronAPI?.checkUpdates?.()}>Check updates</button>
                {updateStatus.state === 'ready' && (
                  <button className="interactive profile-save-btn" onClick={() => window.electronAPI?.installUpdate?.()}>Install & restart</button>
                )}
              </div>
              <p className="setup-copy muted">
                {updateStatus.state === 'checking' && 'Checking GitHub releases…'}
                {updateStatus.state === 'available' && `Update ${updateStatus.version} available`}
                {updateStatus.state === 'downloading' && `Downloading ${Math.round(updateStatus.percent || 0)}%`}
                {updateStatus.state === 'ready' && `Ready to install ${updateStatus.version || ''}`}
                {updateStatus.state === 'current' && 'Already on the latest release'}
                {updateStatus.state === 'dev' && 'Updates run from a packed installer, not npm dev'}
                {updateStatus.state === 'error' && (updateStatus.message || 'Update check failed')}
                {updateStatus.state === 'idle' && 'Uses GitHub releases for this project'}
              </p>
            </div>

            <div className="setup-block">
              <label>Loopback meter</label>
              <p className="setup-copy">{visualizerLive ? 'Live output capture is active.' : (
                captureReason === 'permission' ? 'Windows blocked screen/audio capture. Allow it, then retry.'
                : captureReason === 'no-audio' ? 'A capture stream started without an audio track. Retry after playing sound.'
                : 'Meter is idle. Retry if you expected live bars.'
              )}</p>
              <button className="interactive profile-save-btn" onClick={() => setCaptureNonce(n => n + 1)}>Retry capture</button>
            </div>

            <div className="setup-block">
              <label>Overlay</label>
              <div className="boost-safety">
                <label className="switch">
                  <input type="checkbox" checked={osd.enabled !== false} onChange={(e) => setOsd(prev => ({ ...prev, enabled: e.target.checked }))} />
                  <span className="slider-toggle"></span>
                </label>
                <span>Show OSD on hotkeys</span>
              </div>
              <div className="setting-item">
                <label>Display</label>
                <SelectField
                  className="full-select"
                  value={osd.displayId || 0}
                  onChange={(next) => setOsd(prev => ({ ...prev, displayId: Number(next) }))}
                  options={[
                    { value: 0, label: 'Primary' },
                    ...displays.map(display => ({
                      value: display.id,
                      label: `${display.label}${display.primary ? ' · primary' : ''}`
                    }))
                  ]}
                />
              </div>
              <div className="slider-container">
                <div className="slider-header">
                  <span className="slider-label">Timeout</span>
                  <span className="slider-value">{Math.round((osd.timeoutMs || 2000) / 100) / 10}s</span>
                </div>
                <input type="range" min="800" max="5000" step="100" value={osd.timeoutMs || 2000} onChange={(e) => setOsd(prev => ({ ...prev, timeoutMs: Number(e.target.value) }))} className="standard-volume interactive" style={{ '--val': `${(((osd.timeoutMs || 2000) - 800) / 4200) * 100}%` }} />
              </div>
              <button className="interactive profile-save-btn" onClick={() => window.electronAPI?.previewOsd?.()}>Preview overlay</button>
            </div>

            <div className="setup-block">
              <label>Hotkeys</label>
              <p className="setup-copy muted">Click a binding, then press the new chord. Esc cancels.</p>
              {hotkeyError && <div className="warn-banner">{hotkeyError}</div>}
              {Object.keys(HOTKEY_LABELS).map((id) => (
                <div className="hotkey-row" key={id}>
                  <span>{HOTKEY_LABELS[id]}</span>
                  <button className={`interactive hotkey-btn ${recordingKey === id ? 'recording' : ''}`} onClick={() => setRecordingKey(id)}>
                    {recordingKey === id ? 'Press keys…' : formatAccel(hotkeys[id])}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className={`apo-status ${!apoStatus.loading && (!apoStatus.installed || !apoStatus.writable) ? 'missing' : ''}`}>
        {apoStatus.loading ? (
          <div>Syncing audio engine</div>
        ) : apoStatus.installed && apoStatus.writable ? (
          <>
            <div><span className="status-indicator ok"></span>Equalizer APO live</div>
            <button className="interactive text-btn" onClick={() => window.electronAPI?.resetApo()}>Reset gain</button>
          </>
        ) : apoStatus.installed ? (
          <div>
            <span className="status-indicator error"></span>Engine locked — needs write access
            {!appInfo.elevated && (
              <button className="interactive text-btn" onClick={() => window.electronAPI?.relaunchElevated?.()}>Run as admin</button>
            )}
          </div>
        ) : (
          <div>
            <span className="status-indicator error"></span>Engine missing
            <button className="interactive download-btn" onClick={() => window.electronAPI && window.electronAPI.installApo()}>
              Install
            </button>
          </div>
        )}
      </div>

      {!firstRunComplete && settingsReady && (
        <div className="first-run interactive">
          <div className="first-run-card">
            {firstRunStep === 0 && (
              <>
                <p className="hero-kicker">Setup</p>
                <h2>Headroom needs Equalizer APO</h2>
                <p className="setup-copy">Boost and EQ write into the APO config for your playback device. This takes about a minute.</p>
                <button className="interactive profile-save-btn" onClick={() => setFirstRunStep(1)}>Continue</button>
              </>
            )}
            {firstRunStep === 1 && (
              <>
                <p className="hero-kicker">Audio engine</p>
                <h2>{apoStatus.loading ? 'Checking…' : apoStatus.installed ? (apoStatus.writable ? 'Engine is ready' : 'Engine is locked') : 'Engine not found'}</h2>
                <p className="setup-copy">
                  {!apoStatus.installed && 'Install Equalizer APO, then configure it for your headphones or speakers in its Configurator.'}
                  {apoStatus.installed && !apoStatus.writable && 'Windows is blocking writes to Program Files. Relaunch Headroom as administrator, or grant write access to the APO config folder.'}
                  {apoStatus.installed && apoStatus.writable && 'Headroom can write Preamp and EQ into config.txt.'}
                </p>
                <div className="settings-row">
                  {!apoStatus.installed && (
                    <button className="interactive profile-save-btn" onClick={() => window.electronAPI?.installApo?.()}>Install engine</button>
                  )}
                  {apoStatus.installed && !apoStatus.writable && !appInfo.elevated && (
                    <button className="interactive profile-save-btn" onClick={() => window.electronAPI?.relaunchElevated?.()}>Run as admin</button>
                  )}
                  <button className="interactive profile-save-btn" onClick={() => { window.electronAPI?.checkApo?.().then(status => setApoStatus({ ...status, loading: false })); setFirstRunStep(2); }}>Next</button>
                </div>
              </>
            )}
            {firstRunStep === 2 && (
              <>
                <p className="hero-kicker">Output</p>
                <h2>Choose the device to process</h2>
                <SelectField
                  className="full-select"
                  value={preferredDevice}
                  onChange={(next) => handleDeviceChange({ target: { value: next } })}
                  options={[
                    { value: '', label: `All devices / system default (${defaultDevice || 'current'})` },
                    ...devices.map(device => ({ value: device.id, label: device.name }))
                  ]}
                />
                <p className="setup-copy muted">If bass or movies sound wrong later, this is usually why — APO was targeting the other output.</p>
                <button className="interactive profile-save-btn" onClick={() => setFirstRunStep(3)}>Next</button>
              </>
            )}
            {firstRunStep === 3 && (
              <>
                <p className="hero-kicker">Ready</p>
                <h2>Tray, hotkeys, overlay</h2>
                <p className="setup-copy">Close goes to the tray. Remap shortcuts and OSD display under Settings. A Windows reboot may be required after installing Equalizer APO.</p>
                <div className="boost-safety">
                  <label className="switch">
                    <input type="checkbox" checked={autoStart} onChange={(e) => setAutoStart(e.target.checked)} />
                    <span className="slider-toggle"></span>
                  </label>
                  <span>Launch at login</span>
                </div>
                <button className="interactive profile-save-btn" onClick={finishFirstRun}>Enter Headroom</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
