'use client';

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';

// ============================================================================
// LocalSettings — personal UI / behavior preferences stored in localStorage.
// Includes accent color override, font size, density, wallpaper, sound,
// privacy toggles; per-room overrides (pin to top / mute).
// ============================================================================

export type AccentColor = 'aurora' | 'ocean' | 'forest' | 'sunset' | 'berry' | 'mono';
export type FontSize = 'sm' | 'md' | 'lg';
export type Density = 'compact' | 'comfortable';
export type Wallpaper = 'none' | 'aurora' | 'sunset' | 'ocean' | 'forest' | 'mist';
export type SoundPreset = 'none' | 'pop' | 'chime' | 'ding' | 'soft';

export interface LocalSettings {
  accent: AccentColor;
  font: FontSize;
  density: Density;
  wallpaper: Wallpaper;
  reduceMotion: boolean;
  sendOnEnter: boolean;
  showSeconds: boolean;
  clock12h: boolean;
  soundOnSend: boolean;
  soundOnReceive: boolean;
  soundPreset: SoundPreset;
  desktopNotifications: boolean;
  readReceipts: boolean;
  typingVisible: boolean;
  onlineVisible: boolean;
}

export const DEFAULT_SETTINGS: LocalSettings = {
  accent: 'aurora',
  font: 'md',
  density: 'comfortable',
  wallpaper: 'aurora',
  reduceMotion: false,
  sendOnEnter: true,
  showSeconds: false,
  clock12h: false,
  soundOnSend: true,
  soundOnReceive: true,
  soundPreset: 'pop',
  desktopNotifications: false,
  readReceipts: true,
  typingVisible: true,
  onlineVisible: true,
};

const STORAGE_KEY = 'holler_local_settings_v1';
const ROOMS_KEY = 'holler_room_prefs_v1';

export interface RoomLocalPrefs {
  pinnedTop?: boolean;
  muted?: boolean;
}

// ============================================================================
// Accent presets — override --primary, --ring, --chart-1 and gradient vars
// for both light and dark theme.
// ============================================================================

interface AccentVars {
  light: Record<string, string>;
  dark: Record<string, string>;
}

export const ACCENT_PRESETS: Record<AccentColor, { label: string; swatch: string; vars: AccentVars }> = {
  aurora: {
    label: 'Aurora',
    swatch: 'linear-gradient(135deg, #6d5bd8, #d670b8)',
    vars: { light: {}, dark: {} }, // default — no override
  },
  ocean: {
    label: 'Ocean',
    swatch: 'linear-gradient(135deg, #2fb3d6, #4f7cd6)',
    vars: {
      light: {
        '--primary': 'oklch(0.55 0.16 230)',
        '--ring': 'oklch(0.55 0.16 230)',
        '--chart-1': 'oklch(0.55 0.16 230)',
        '--sidebar-primary': 'oklch(0.55 0.16 230)',
        '--sidebar-ring': 'oklch(0.55 0.16 230)',
        '--grad-brand': 'linear-gradient(135deg, oklch(0.55 0.16 220), oklch(0.55 0.18 250))',
        '--grad-bubble': 'linear-gradient(135deg, oklch(0.55 0.15 220), oklch(0.55 0.17 250))',
      },
      dark: {
        '--primary': 'oklch(0.76 0.13 230)',
        '--ring': 'oklch(0.76 0.13 230)',
        '--chart-1': 'oklch(0.76 0.13 230)',
        '--sidebar-primary': 'oklch(0.76 0.13 230)',
        '--sidebar-ring': 'oklch(0.76 0.13 230)',
        '--grad-brand': 'linear-gradient(135deg, oklch(0.68 0.14 220), oklch(0.7 0.16 255))',
        '--grad-bubble': 'linear-gradient(135deg, oklch(0.52 0.13 220), oklch(0.5 0.15 255))',
      },
    },
  },
  forest: {
    label: 'Forest',
    swatch: 'linear-gradient(135deg, #2fbf8f, #5db35d)',
    vars: {
      light: {
        '--primary': 'oklch(0.55 0.14 160)',
        '--ring': 'oklch(0.55 0.14 160)',
        '--chart-1': 'oklch(0.55 0.14 160)',
        '--sidebar-primary': 'oklch(0.55 0.14 160)',
        '--sidebar-ring': 'oklch(0.55 0.14 160)',
        '--grad-brand': 'linear-gradient(135deg, oklch(0.55 0.14 150), oklch(0.55 0.14 175))',
        '--grad-bubble': 'linear-gradient(135deg, oklch(0.55 0.13 150), oklch(0.55 0.13 175))',
      },
      dark: {
        '--primary': 'oklch(0.76 0.13 160)',
        '--ring': 'oklch(0.76 0.13 160)',
        '--chart-1': 'oklch(0.76 0.13 160)',
        '--sidebar-primary': 'oklch(0.76 0.13 160)',
        '--sidebar-ring': 'oklch(0.76 0.13 160)',
        '--grad-brand': 'linear-gradient(135deg, oklch(0.68 0.13 150), oklch(0.7 0.13 180))',
        '--grad-bubble': 'linear-gradient(135deg, oklch(0.52 0.12 150), oklch(0.5 0.12 180))',
      },
    },
  },
  sunset: {
    label: 'Sunset',
    swatch: 'linear-gradient(135deg, #f5a623, #ef5c5c)',
    vars: {
      light: {
        '--primary': 'oklch(0.62 0.18 45)',
        '--ring': 'oklch(0.62 0.18 45)',
        '--chart-1': 'oklch(0.62 0.18 45)',
        '--sidebar-primary': 'oklch(0.62 0.18 45)',
        '--sidebar-ring': 'oklch(0.62 0.18 45)',
        '--grad-brand': 'linear-gradient(135deg, oklch(0.62 0.18 40), oklch(0.6 0.2 25))',
        '--grad-bubble': 'linear-gradient(135deg, oklch(0.6 0.17 40), oklch(0.6 0.19 25))',
      },
      dark: {
        '--primary': 'oklch(0.78 0.15 50)',
        '--ring': 'oklch(0.78 0.15 50)',
        '--chart-1': 'oklch(0.78 0.15 50)',
        '--sidebar-primary': 'oklch(0.78 0.15 50)',
        '--sidebar-ring': 'oklch(0.78 0.15 50)',
        '--grad-brand': 'linear-gradient(135deg, oklch(0.7 0.16 45), oklch(0.7 0.18 25))',
        '--grad-bubble': 'linear-gradient(135deg, oklch(0.55 0.14 45), oklch(0.55 0.16 25))',
      },
    },
  },
  berry: {
    label: 'Berry',
    swatch: 'linear-gradient(135deg, #d670b8, #ef5c8f)',
    vars: {
      light: {
        '--primary': 'oklch(0.58 0.21 340)',
        '--ring': 'oklch(0.58 0.21 340)',
        '--chart-1': 'oklch(0.58 0.21 340)',
        '--sidebar-primary': 'oklch(0.58 0.21 340)',
        '--sidebar-ring': 'oklch(0.58 0.21 340)',
        '--grad-brand': 'linear-gradient(135deg, oklch(0.58 0.21 330), oklch(0.6 0.22 355))',
        '--grad-bubble': 'linear-gradient(135deg, oklch(0.55 0.2 330), oklch(0.55 0.22 355))',
      },
      dark: {
        '--primary': 'oklch(0.77 0.17 340)',
        '--ring': 'oklch(0.77 0.17 340)',
        '--chart-1': 'oklch(0.77 0.17 340)',
        '--sidebar-primary': 'oklch(0.77 0.17 340)',
        '--sidebar-ring': 'oklch(0.77 0.17 340)',
        '--grad-brand': 'linear-gradient(135deg, oklch(0.7 0.18 330), oklch(0.72 0.18 355))',
        '--grad-bubble': 'linear-gradient(135deg, oklch(0.54 0.16 330), oklch(0.54 0.18 355))',
      },
    },
  },
  mono: {
    label: 'Mono',
    swatch: 'linear-gradient(135deg, #4b5163, #2c2f3d)',
    vars: {
      light: {
        '--primary': 'oklch(0.36 0.01 280)',
        '--ring': 'oklch(0.36 0.01 280)',
        '--chart-1': 'oklch(0.36 0.01 280)',
        '--sidebar-primary': 'oklch(0.36 0.01 280)',
        '--sidebar-ring': 'oklch(0.36 0.01 280)',
        '--grad-brand': 'linear-gradient(135deg, oklch(0.4 0.01 280), oklch(0.28 0.01 285))',
        '--grad-bubble': 'linear-gradient(135deg, oklch(0.42 0.01 280), oklch(0.32 0.01 285))',
      },
      dark: {
        '--primary': 'oklch(0.84 0.005 280)',
        '--ring': 'oklch(0.84 0.005 280)',
        '--chart-1': 'oklch(0.84 0.005 280)',
        '--sidebar-primary': 'oklch(0.84 0.005 280)',
        '--sidebar-ring': 'oklch(0.84 0.005 280)',
        '--grad-brand': 'linear-gradient(135deg, oklch(0.7 0.01 280), oklch(0.85 0.005 285))',
        '--grad-bubble': 'linear-gradient(135deg, oklch(0.5 0.01 280), oklch(0.62 0.005 285))',
      },
    },
  },
};

// ============================================================================
// Wallpaper presets — subtle gradients on chat background
// ============================================================================

export const WALLPAPER_PRESETS: Record<Wallpaper, { label: string; css: string }> = {
  none: { label: 'None', css: '' },
  aurora: {
    label: 'Aurora',
    css: `
      radial-gradient(900px 600px at 8% -10%, oklch(0.66 0.2 285 / 0.08), transparent 60%),
      radial-gradient(800px 500px at 105% 110%, oklch(0.68 0.2 345 / 0.07), transparent 62%),
      radial-gradient(700px 450px at 80% -20%, oklch(0.7 0.14 200 / 0.06), transparent 65%)`,
  },
  sunset: {
    label: 'Sunset',
    css: `
      radial-gradient(900px 600px at 12% 0%, oklch(0.78 0.16 50 / 0.1), transparent 60%),
      radial-gradient(800px 500px at 100% 100%, oklch(0.66 0.22 25 / 0.08), transparent 62%)`,
  },
  ocean: {
    label: 'Ocean',
    css: `
      radial-gradient(900px 600px at 5% 0%, oklch(0.7 0.13 230 / 0.1), transparent 60%),
      radial-gradient(800px 500px at 95% 100%, oklch(0.66 0.14 200 / 0.07), transparent 62%)`,
  },
  forest: {
    label: 'Forest',
    css: `
      radial-gradient(900px 600px at 10% 0%, oklch(0.7 0.13 160 / 0.08), transparent 60%),
      radial-gradient(800px 500px at 95% 100%, oklch(0.65 0.13 175 / 0.06), transparent 62%)`,
  },
  mist: {
    label: 'Mist',
    css: `
      radial-gradient(900px 600px at 50% -10%, oklch(0.85 0.02 280 / 0.18), transparent 60%),
      radial-gradient(800px 500px at 0% 110%, oklch(0.85 0.02 320 / 0.12), transparent 62%)`,
  },
};

// ============================================================================
// Font size scale
// ============================================================================

export const FONT_SIZE_SCALE: Record<FontSize, string> = {
  sm: '15px',
  md: '16px',
  lg: '17.5px',
};

// ============================================================================
// Storage helpers
// ============================================================================

function loadSettings(): LocalSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const p = JSON.parse(raw) as Partial<LocalSettings>;
    return { ...DEFAULT_SETTINGS, ...p };
  } catch { return DEFAULT_SETTINGS; }
}

function saveSettings(s: LocalSettings): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

function loadRoomPrefsMap(): Record<string, RoomLocalPrefs> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(ROOMS_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw);
    return p && typeof p === 'object' ? p : {};
  } catch { return {}; }
}

function saveRoomPrefsMap(map: Record<string, RoomLocalPrefs>): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(ROOMS_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

// ============================================================================
// Context
// ============================================================================

export interface LocalSettingsContextValue {
  settings: LocalSettings;
  update: (patch: Partial<LocalSettings>) => void;
  reset: () => void;
  roomPrefs: (roomId: string) => RoomLocalPrefs;
  setRoomPref: (roomId: string, patch: Partial<RoomLocalPrefs>) => void;
  playSound: (kind: 'send' | 'receive') => void;
}

const Ctx = createContext<LocalSettingsContextValue | null>(null);

export function LocalSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<LocalSettings>(DEFAULT_SETTINGS);
  const [roomMap, setRoomMap] = useState<Record<string, RoomLocalPrefs>>({});

  useEffect(() => {
    setSettings(loadSettings());
    setRoomMap(loadRoomPrefsMap());
  }, []);

  // Inject CSS variable overrides for accent + font-size + wallpaper.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const id = 'local-settings-vars';
    let el = document.getElementById(id) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = id;
      document.head.appendChild(el);
    }
    const preset = ACCENT_PRESETS[settings.accent] ?? ACCENT_PRESETS.aurora;
    const lightVars = Object.entries(preset.vars.light)
      .map(([k, v]) => `${k}: ${v};`).join(' ');
    const darkVars = Object.entries(preset.vars.dark)
      .map(([k, v]) => `${k}: ${v};`).join(' ');
    const fontScale = FONT_SIZE_SCALE[settings.font];
    const motionRule = settings.reduceMotion
      ? `*, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }`
      : '';
    el.textContent = `
      :root, .dark { --font-base: ${fontScale}; }
      :root:not(.dark) { ${lightVars} }
      .dark { ${darkVars} }
      ${motionRule}
    `;
    // Apply font size to <html>
    document.documentElement.style.setProperty('font-size', fontScale);
    // Density class on body
    document.body.classList.toggle('density-compact', settings.density === 'compact');
  }, [settings.accent, settings.font, settings.density, settings.reduceMotion]);

  const update = useCallback((patch: Partial<LocalSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    saveSettings(DEFAULT_SETTINGS);
    setSettings(DEFAULT_SETTINGS);
  }, []);

  const roomPrefs = useCallback((roomId: string): RoomLocalPrefs => {
    return roomMap[roomId] ?? {};
  }, [roomMap]);

  const setRoomPref = useCallback((roomId: string, patch: Partial<RoomLocalPrefs>) => {
    setRoomMap(prev => {
      const cur = prev[roomId] ?? {};
      const next = { ...prev, [roomId]: { ...cur, ...patch } };
      saveRoomPrefsMap(next);
      return next;
    });
  }, []);

  const playSound = useCallback((kind: 'send' | 'receive') => {
    if (kind === 'send' && !settings.soundOnSend) return;
    if (kind === 'receive' && !settings.soundOnReceive) return;
    if (settings.soundPreset === 'none') return;
    playPresetSound(settings.soundPreset, kind);
  }, [settings.soundOnSend, settings.soundOnReceive, settings.soundPreset]);

  const value = useMemo<LocalSettingsContextValue>(
    () => ({ settings, update, reset, roomPrefs, setRoomPref, playSound }),
    [settings, update, reset, roomPrefs, setRoomPref, playSound],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLocalSettings(): LocalSettingsContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLocalSettings must be used within <LocalSettingsProvider>');
  return ctx;
}

// ============================================================================
// Sound synth — Web Audio API, zero asset
// ============================================================================

let audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') {
      void audioCtx.resume();
    }
    return audioCtx;
  } catch { return null; }
}

function playPresetSound(preset: SoundPreset, kind: 'send' | 'receive') {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  // Slightly different feel: send = ascending, receive = descending.
  const isSend = kind === 'send';

  // Each preset = different oscillator waveform + frequency curve + envelope.
  const playTone = (freq: number, t0: number, dur: number, vol: number, type: OscillatorType = 'sine') => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(gain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  };

  if (preset === 'pop') {
    // Short pop — single sine with pitch dip
    const base = isSend ? 660 : 520;
    playTone(base, now, 0.13, 0.18, 'sine');
  } else if (preset === 'chime') {
    // Two-tone chime
    const f1 = isSend ? 880 : 700;
    const f2 = isSend ? 1175 : 525;
    playTone(f1, now, 0.15, 0.14, 'triangle');
    playTone(f2, now + 0.08, 0.18, 0.12, 'triangle');
  } else if (preset === 'ding') {
    // Bell-like with longer decay
    const f = isSend ? 1200 : 900;
    playTone(f, now, 0.4, 0.16, 'sine');
    playTone(f * 1.5, now, 0.25, 0.06, 'sine');
  } else if (preset === 'soft') {
    // Soft mellow low tone
    const f = isSend ? 440 : 350;
    playTone(f, now, 0.22, 0.14, 'sine');
  }
}

// ============================================================================
// Time formatting that respects showSeconds / clock12h
// ============================================================================

export function formatTimePref(ts: number, settings: LocalSettings): string {
  const d = new Date(ts);
  let hh: number;
  let ampm = '';
  if (settings.clock12h) {
    hh = d.getHours() % 12;
    if (hh === 0) hh = 12;
    ampm = d.getHours() >= 12 ? ' PM' : ' AM';
  } else {
    hh = d.getHours();
  }
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (settings.showSeconds) {
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}${ampm}`;
  }
  return `${settings.clock12h ? hh : String(hh).padStart(2, '0')}:${mm}${ampm}`;
}
