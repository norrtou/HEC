import type { Settings } from '../types';
import { DIFFICULTY_PRESETS, clampDifficulty } from '../game/DifficultyModel';

/**
 * Settings live in localStorage only — device-local preferences, never sent
 * anywhere. Measurement data is deliberately NOT persisted (see privacy note
 * on the splash screen); only the high score and these preferences survive
 * a reload.
 */
const KEY = 'hec-settings-v1';
const HIGHSCORE_KEY = 'hec-highscore-v1';

export function defaultSettings(): Settings {
  return {
    accessibility: {
      invertColors: false,
      uiScale: 1,
      reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      highContrastTargets: false,
      fontScale: 1,
    },
    motor: {
      hitboxPaddingPx: 0,
      tremorFilterEnabled: false,
      tremorFilterRadiusPx: 30,
      tremorFilterWindowMs: 300,
    },
    audio: {
      soundEnabled: true,
      soundVolume: 0.6,
      hapticsEnabled: true,
    },
    calibration: {
      pxPerMm: null,
    },
    difficulty: { ...DIFFICULTY_PRESETS.standard },
    variant: 'random',
    roundDurationSec: 60,
    language: 'auto',
  };
}

type Listener = (s: Settings) => void;

export class SettingsStore {
  private settings: Settings;
  private listeners: Listener[] = [];

  constructor() {
    this.settings = this.load();
  }

  private load(): Settings {
    const base = defaultSettings();
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return base;
      const saved = JSON.parse(raw) as Partial<Settings>;
      return {
        accessibility: { ...base.accessibility, ...saved.accessibility },
        motor: { ...base.motor, ...saved.motor },
        audio: { ...base.audio, ...saved.audio },
        calibration: { ...base.calibration, ...saved.calibration },
        difficulty: clampDifficulty({ ...base.difficulty, ...saved.difficulty }),
        variant: saved.variant ?? base.variant,
        roundDurationSec: Math.min(600, Math.max(15, saved.roundDurationSec ?? base.roundDurationSec)),
        language: saved.language ?? base.language,
      };
    } catch {
      return base;
    }
  }

  get(): Settings {
    return this.settings;
  }

  update(mutate: (s: Settings) => void): void {
    mutate(this.settings);
    this.settings.difficulty = clampDifficulty(this.settings.difficulty);
    try {
      localStorage.setItem(KEY, JSON.stringify(this.settings));
    } catch {
      /* storage full or blocked — settings still apply for this session */
    }
    for (const l of this.listeners) l(this.settings);
  }

  reset(): void {
    this.settings = defaultSettings();
    try {
      localStorage.removeItem(KEY);
    } catch { /* ignore */ }
    for (const l of this.listeners) l(this.settings);
  }

  onChange(fn: Listener): void {
    this.listeners.push(fn);
  }

  loadHighScore(): number {
    try {
      return Number(localStorage.getItem(HIGHSCORE_KEY)) || 0;
    } catch {
      return 0;
    }
  }

  saveHighScore(v: number): void {
    try {
      localStorage.setItem(HIGHSCORE_KEY, String(v));
    } catch { /* ignore */ }
  }
}
