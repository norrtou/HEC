import type { Settings } from '../types';
import { DIFFICULTY_LIMITS, DIFFICULTY_PRESETS } from '../game/DifficultyModel';
import type { SettingsStore } from './settingsStore';
import { t } from '../i18n';

interface SliderSpec {
  label: string;
  hint?: string;
  min: number;
  max: number;
  step: number;
  get(s: Settings): number;
  set(s: Settings, v: number): void;
  format(v: number): string;
}

interface ToggleSpec {
  label: string;
  hint?: string;
  get(s: Settings): boolean;
  set(s: Settings, v: boolean): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

let idSeq = 0;

function sliderRow(store: SettingsStore, spec: SliderSpec): HTMLElement {
  const row = el('div', 'setting-row');
  const id = `set-${idSeq++}`;
  const label = el('label');
  label.htmlFor = id;
  label.append(spec.label);
  if (spec.hint) label.append(el('span', 'hint', spec.hint));
  const input = el('input');
  input.type = 'range';
  input.id = id;
  input.min = String(spec.min);
  input.max = String(spec.max);
  input.step = String(spec.step);
  input.value = String(spec.get(store.get()));
  const val = el('span', 'val', spec.format(spec.get(store.get())));
  input.addEventListener('input', () => {
    const v = Number(input.value);
    store.update((s) => spec.set(s, v));
    val.textContent = spec.format(v);
  });
  store.onChange((s) => {
    input.value = String(spec.get(s));
    val.textContent = spec.format(spec.get(s));
  });
  row.append(label, input, val);
  return row;
}

function toggleRow(store: SettingsStore, spec: ToggleSpec): HTMLElement {
  const row = el('div', 'setting-row');
  const id = `set-${idSeq++}`;
  const label = el('label');
  label.htmlFor = id;
  label.append(spec.label);
  if (spec.hint) label.append(el('span', 'hint', spec.hint));
  const input = el('input');
  input.type = 'checkbox';
  input.id = id;
  input.checked = spec.get(store.get());
  input.addEventListener('change', () => store.update((s) => spec.set(s, input.checked)));
  store.onChange((s) => { input.checked = spec.get(s); });
  row.append(label, input);
  return row;
}

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s} s`;
  return s === 0 ? `${m} min` : `${m}:${String(s).padStart(2, '0')} min`;
}

export function buildSettingsPanel(container: HTMLElement, store: SettingsStore, onTestSound?: () => void): void {
  container.replaceChildren();

  // ---- Language ----
  container.append(el('h3', undefined, t('set.lang')));
  const langRow = el('div', 'setting-row');
  const langWrap = el('div');
  langWrap.setAttribute('role', 'radiogroup');
  langWrap.setAttribute('aria-label', t('set.lang'));
  const langOptions: [Settings['language'], string][] = [
    ['auto', t('set.lang.auto')],
    ['sv', 'Svenska'],
    ['en', 'English'],
  ];
  for (const [value, label] of langOptions) {
    const b = el('button', 'btn btn-quiet', label);
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(store.get().language === value));
    if (store.get().language === value) b.classList.add('btn-accent');
    b.addEventListener('click', () => store.update((s) => { s.language = value; }));
    langWrap.append(b);
  }
  langRow.append(langWrap);
  container.append(langRow);

  // ---- Pace & difficulty ----
  container.append(el('h3', undefined, t('set.tempo')));

  container.append(
    sliderRow(store, {
      label: t('set.roundDuration'),
      hint: t('set.roundDuration.hint'),
      min: 15, max: 600, step: 15,
      get: (s) => s.roundDurationSec,
      set: (s, v) => { s.roundDurationSec = v; },
      format: fmtDuration,
    }),
  );

  const presetRow = el('div', 'setting-row');
  const presetLabel = el('label');
  presetLabel.append(t('set.preset'));
  presetLabel.append(el('span', 'hint', t('set.preset.hint')));
  const presetWrap = el('div');
  (['calm', 'standard', 'fast'] as const).forEach((p) => {
    const names = { calm: t('set.preset.calm'), standard: t('set.preset.standard'), fast: t('set.preset.fast') };
    const b = el('button', 'btn btn-quiet', names[p]);
    b.type = 'button';
    b.addEventListener('click', () => store.update((s) => { s.difficulty = { ...DIFFICULTY_PRESETS[p] }; }));
    presetWrap.append(b);
  });
  presetRow.append(presetLabel, presetWrap);
  container.append(presetRow);

  const L = DIFFICULTY_LIMITS;
  container.append(
    sliderRow(store, {
      label: t('set.spawnInterval'),
      min: L.spawnIntervalMs.min, max: L.spawnIntervalMs.max, step: L.spawnIntervalMs.step,
      get: (s) => s.difficulty.spawnIntervalMs,
      set: (s, v) => { s.difficulty.spawnIntervalMs = v; },
      format: (v) => `${(v / 1000).toFixed(2)} s`,
    }),
    sliderRow(store, {
      label: t('set.lifetime'),
      hint: t('set.lifetime.hint'),
      min: L.targetLifetimeMs.min, max: L.targetLifetimeMs.max, step: L.targetLifetimeMs.step,
      get: (s) => s.difficulty.targetLifetimeMs,
      set: (s, v) => { s.difficulty.targetLifetimeMs = v; },
      format: (v) => `${(v / 1000).toFixed(1)} s`,
    }),
    sliderRow(store, {
      label: t('set.size'),
      min: L.targetRadiusPx.min, max: L.targetRadiusPx.max, step: L.targetRadiusPx.step,
      get: (s) => s.difficulty.targetRadiusPx,
      set: (s, v) => { s.difficulty.targetRadiusPx = v; },
      format: (v) => `${v} px`,
    }),
    sliderRow(store, {
      label: t('set.maxConcurrent'),
      min: L.maxConcurrent.min, max: L.maxConcurrent.max, step: L.maxConcurrent.step,
      get: (s) => s.difficulty.maxConcurrent,
      set: (s, v) => { s.difficulty.maxConcurrent = v; },
      format: (v) => `${v}`,
    }),
    sliderRow(store, {
      label: t('set.speed'),
      hint: t('set.speed.hint'),
      min: L.speedPxPerSec.min, max: L.speedPxPerSec.max, step: L.speedPxPerSec.step,
      get: (s) => s.difficulty.speedPxPerSec,
      set: (s, v) => { s.difficulty.speedPxPerSec = v; },
      format: (v) => `${v} px/s`,
    }),
  );

  // ---- Motor skills ----
  container.append(el('h3', undefined, t('set.motor')));
  container.append(
    sliderRow(store, {
      label: t('set.hitbox'),
      hint: t('set.hitbox.hint'),
      min: 0, max: 60, step: 2,
      get: (s) => s.motor.hitboxPaddingPx,
      set: (s, v) => { s.motor.hitboxPaddingPx = v; },
      format: (v) => (v === 0 ? t('set.off') : `+${v} px`),
    }),
    toggleRow(store, {
      label: t('set.tremor'),
      hint: t('set.tremor.hint'),
      get: (s) => s.motor.tremorFilterEnabled,
      set: (s, v) => { s.motor.tremorFilterEnabled = v; },
    }),
    sliderRow(store, {
      label: t('set.tremorRadius'),
      min: 10, max: 80, step: 5,
      get: (s) => s.motor.tremorFilterRadiusPx,
      set: (s, v) => { s.motor.tremorFilterRadiusPx = v; },
      format: (v) => `${v} px`,
    }),
    sliderRow(store, {
      label: t('set.tremorWindow'),
      min: 100, max: 800, step: 50,
      get: (s) => s.motor.tremorFilterWindowMs,
      set: (s, v) => { s.motor.tremorFilterWindowMs = v; },
      format: (v) => `${v} ms`,
    }),
  );

  // ---- Accessibility ----
  container.append(el('h3', undefined, t('set.a11y')));
  container.append(
    toggleRow(store, {
      label: t('set.invert'),
      hint: t('set.invert.hint'),
      get: (s) => s.accessibility.invertColors,
      set: (s, v) => { s.accessibility.invertColors = v; },
    }),
    toggleRow(store, {
      label: t('set.contrast'),
      hint: t('set.contrast.hint'),
      get: (s) => s.accessibility.highContrastTargets,
      set: (s, v) => { s.accessibility.highContrastTargets = v; },
    }),
    sliderRow(store, {
      label: t('set.uiScale'),
      min: 0.8, max: 1.6, step: 0.05,
      get: (s) => s.accessibility.uiScale,
      set: (s, v) => { s.accessibility.uiScale = v; },
      format: (v) => `${Math.round(v * 100)}%`,
    }),
    sliderRow(store, {
      label: t('set.fontScale'),
      min: 0.9, max: 1.4, step: 0.05,
      get: (s) => s.accessibility.fontScale,
      set: (s, v) => { s.accessibility.fontScale = v; },
      format: (v) => `${Math.round(v * 100)}%`,
    }),
    toggleRow(store, {
      label: t('set.reduceMotion'),
      hint: t('set.reduceMotion.hint'),
      get: (s) => s.accessibility.reduceMotion,
      set: (s, v) => { s.accessibility.reduceMotion = v; },
    }),
  );

  // ---- Sound & haptics ----
  container.append(el('h3', undefined, t('set.audio')));
  container.append(
    toggleRow(store, {
      label: t('set.sound'),
      get: (s) => s.audio.soundEnabled,
      set: (s, v) => { s.audio.soundEnabled = v; },
    }),
    sliderRow(store, {
      label: t('set.volume'),
      min: 0, max: 1, step: 0.05,
      get: (s) => s.audio.soundVolume,
      set: (s, v) => { s.audio.soundVolume = v; },
      format: (v) => `${Math.round(v * 100)}%`,
    }),
    toggleRow(store, {
      label: t('set.haptics'),
      hint: t('set.haptics.hint'),
      get: (s) => s.audio.hapticsEnabled,
      set: (s, v) => { s.audio.hapticsEnabled = v; },
    }),
  );
  if (onTestSound) {
    const testRow = el('div', 'setting-row');
    const testLabel = el('label');
    testLabel.append(t('set.testSound'));
    testLabel.append(el('span', 'hint', t('set.testSound.hint')));
    const testBtn = el('button', 'btn', t('set.playPop'));
    testBtn.type = 'button';
    testBtn.addEventListener('click', onTestSound);
    testRow.append(testLabel, testBtn);
    container.append(testRow);
  }

  // ---- Calibration ----
  container.append(el('h3', undefined, t('set.calib')));
  const box = el('div', 'calib-box');
  const desc = el('p', undefined, t('set.calib.desc'));
  desc.style.margin = '0';
  const bar = el('div', 'calib-bar');
  const slider = el('input');
  slider.type = 'range';
  slider.min = '150';
  slider.max = '700';
  slider.step = '1';
  slider.style.width = '100%';
  slider.setAttribute('aria-label', t('set.calib.aria'));
  const CARD_MM = 85.6;
  const current = store.get().calibration.pxPerMm;
  const startPx = current ? current * CARD_MM : (96 / 25.4) * CARD_MM;
  slider.value = String(Math.round(startPx));
  bar.style.width = `${slider.value}px`;
  const status = el('p', undefined, current ? t('set.calib.done', { v: current.toFixed(2) }) : t('set.calib.none'));
  status.style.margin = '0';
  slider.addEventListener('input', () => {
    bar.style.width = `${slider.value}px`;
    const pxPerMm = Number(slider.value) / CARD_MM;
    store.update((s) => { s.calibration.pxPerMm = Math.round(pxPerMm * 100) / 100; });
    status.textContent = t('set.calib.done', { v: pxPerMm.toFixed(2) });
  });
  const clearBtn = el('button', 'btn btn-quiet', t('set.calib.clear'));
  clearBtn.type = 'button';
  clearBtn.style.marginTop = '0.6rem';
  clearBtn.addEventListener('click', () => {
    store.update((s) => { s.calibration.pxPerMm = null; });
    status.textContent = t('set.calib.none');
  });
  box.append(desc, bar, slider, status, clearBtn);
  container.append(box);
}
