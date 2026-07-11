import type { Settings } from '../types';
import { DIFFICULTY_LIMITS, DIFFICULTY_PRESETS } from '../game/DifficultyModel';
import type { SettingsStore } from './settingsStore';

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

export function buildSettingsPanel(container: HTMLElement, store: SettingsStore, onTestSound?: () => void): void {
  container.replaceChildren();

  // ---- Tempo & svårighet ----
  container.append(el('h3', undefined, 'Tempo & svårighet'));

  const presetRow = el('div', 'setting-row');
  const presetLabel = el('label');
  presetLabel.append('Utgångsläge');
  presetLabel.append(el('span', 'hint', 'Startpunkt — varje reglage nedan kan sedan finjusteras fritt.'));
  const presetWrap = el('div');
  (['calm', 'standard', 'fast'] as const).forEach((p) => {
    const names = { calm: 'Lugn', standard: 'Standard', fast: 'Snabb' };
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
      label: 'Tid mellan bubblor',
      min: L.spawnIntervalMs.min, max: L.spawnIntervalMs.max, step: L.spawnIntervalMs.step,
      get: (s) => s.difficulty.spawnIntervalMs,
      set: (s, v) => { s.difficulty.spawnIntervalMs = v; },
      format: (v) => `${(v / 1000).toFixed(2)} s`,
    }),
    sliderRow(store, {
      label: 'Bubblans livslängd',
      hint: 'Hur länge en bubbla finns kvar innan den räknas som miss.',
      min: L.targetLifetimeMs.min, max: L.targetLifetimeMs.max, step: L.targetLifetimeMs.step,
      get: (s) => s.difficulty.targetLifetimeMs,
      set: (s, v) => { s.difficulty.targetLifetimeMs = v; },
      format: (v) => `${(v / 1000).toFixed(1)} s`,
    }),
    sliderRow(store, {
      label: 'Bubblans storlek',
      min: L.targetRadiusPx.min, max: L.targetRadiusPx.max, step: L.targetRadiusPx.step,
      get: (s) => s.difficulty.targetRadiusPx,
      set: (s, v) => { s.difficulty.targetRadiusPx = v; },
      format: (v) => `${v} px`,
    }),
    sliderRow(store, {
      label: 'Max antal samtidigt',
      min: L.maxConcurrent.min, max: L.maxConcurrent.max, step: L.maxConcurrent.step,
      get: (s) => s.difficulty.maxConcurrent,
      set: (s, v) => { s.difficulty.maxConcurrent = v; },
      format: (v) => `${v}`,
    }),
    sliderRow(store, {
      label: 'Rörelsehastighet',
      hint: 'Gäller varianter där bubblorna rör sig.',
      min: L.speedPxPerSec.min, max: L.speedPxPerSec.max, step: L.speedPxPerSec.step,
      get: (s) => s.difficulty.speedPxPerSec,
      set: (s, v) => { s.difficulty.speedPxPerSec = v; },
      format: (v) => `${v} px/s`,
    }),
  );

  // ---- Motorik ----
  container.append(el('h3', undefined, 'Motorik & träffytor'));
  container.append(
    sliderRow(store, {
      label: 'Förstorad träffyta',
      hint: 'Osynlig extra marginal runt varje bubbla. Precisionen mäts fortfarande mot bubblans mittpunkt.',
      min: 0, max: 60, step: 2,
      get: (s) => s.motor.hitboxPaddingPx,
      set: (s, v) => { s.motor.hitboxPaddingPx = v; },
      format: (v) => (v === 0 ? 'Av' : `+${v} px`),
    }),
    toggleRow(store, {
      label: 'Ignorera darrningar',
      hint: 'Filtrerar bort upprepade tryck tätt inpå varandra (t.ex. vid tremor) så de inte räknas som felklick.',
      get: (s) => s.motor.tremorFilterEnabled,
      set: (s, v) => { s.motor.tremorFilterEnabled = v; },
    }),
    sliderRow(store, {
      label: 'Darrfilter: radie',
      min: 10, max: 80, step: 5,
      get: (s) => s.motor.tremorFilterRadiusPx,
      set: (s, v) => { s.motor.tremorFilterRadiusPx = v; },
      format: (v) => `${v} px`,
    }),
    sliderRow(store, {
      label: 'Darrfilter: tidsfönster',
      min: 100, max: 800, step: 50,
      get: (s) => s.motor.tremorFilterWindowMs,
      set: (s, v) => { s.motor.tremorFilterWindowMs = v; },
      format: (v) => `${v} ms`,
    }),
  );

  // ---- Tillgänglighet ----
  container.append(el('h3', undefined, 'Tillgänglighet & utseende'));
  container.append(
    toggleRow(store, {
      label: 'Inverterade färger',
      hint: 'Ljus bakgrund med mörka detaljer i stället för svart.',
      get: (s) => s.accessibility.invertColors,
      set: (s, v) => { s.accessibility.invertColors = v; },
    }),
    toggleRow(store, {
      label: 'Extra kontrast på bubblor',
      hint: 'Vit konturlinje runt varje bubbla.',
      get: (s) => s.accessibility.highContrastTargets,
      set: (s, v) => { s.accessibility.highContrastTargets = v; },
    }),
    sliderRow(store, {
      label: 'Gränssnittets skala',
      min: 0.8, max: 1.6, step: 0.05,
      get: (s) => s.accessibility.uiScale,
      set: (s, v) => { s.accessibility.uiScale = v; },
      format: (v) => `${Math.round(v * 100)}%`,
    }),
    sliderRow(store, {
      label: 'Textstorlek',
      min: 0.9, max: 1.4, step: 0.05,
      get: (s) => s.accessibility.fontScale,
      set: (s, v) => { s.accessibility.fontScale = v; },
      format: (v) => `${Math.round(v * 100)}%`,
    }),
    toggleRow(store, {
      label: 'Minska rörelser',
      hint: 'Färre partiklar och animationer. Påverkar inte mätningarna.',
      get: (s) => s.accessibility.reduceMotion,
      set: (s, v) => { s.accessibility.reduceMotion = v; },
    }),
  );

  // ---- Ljud & haptik ----
  container.append(el('h3', undefined, 'Ljud & haptik'));
  container.append(
    toggleRow(store, {
      label: 'Ljud',
      get: (s) => s.audio.soundEnabled,
      set: (s, v) => { s.audio.soundEnabled = v; },
    }),
    sliderRow(store, {
      label: 'Volym',
      min: 0, max: 1, step: 0.05,
      get: (s) => s.audio.soundVolume,
      set: (s, v) => { s.audio.soundVolume = v; },
      format: (v) => `${Math.round(v * 100)}%`,
    }),
    toggleRow(store, {
      label: 'Vibration',
      hint: 'Om enheten stöder det.',
      get: (s) => s.audio.hapticsEnabled,
      set: (s, v) => { s.audio.hapticsEnabled = v; },
    }),
  );
  if (onTestSound) {
    const testRow = el('div', 'setting-row');
    const testLabel = el('label');
    testLabel.append('Testa ljudet');
    testLabel.append(el('span', 'hint', 'Spelar upp pop-ljudet så du kan kontrollera volym och att ljudet fungerar.'));
    const testBtn = el('button', 'btn', 'Spela pop');
    testBtn.type = 'button';
    testBtn.addEventListener('click', onTestSound);
    testRow.append(testLabel, testBtn);
    container.append(testRow);
  }

  // ---- Kalibrering ----
  container.append(el('h3', undefined, 'Kalibrering (mm-precision)'));
  const box = el('div', 'calib-box');
  const desc = el('p', undefined,
    'Utan kalibrering antas standardupplösning (96 dpi), vilket kan slå fel på verkliga millimetermått. ' +
    'Lägg ett vanligt betalkort mot skärmen och dra reglaget tills fältet nedan är exakt lika brett som kortet (85,6 mm).');
  desc.style.margin = '0';
  const bar = el('div', 'calib-bar');
  const slider = el('input');
  slider.type = 'range';
  slider.min = '150';
  slider.max = '700';
  slider.step = '1';
  slider.style.width = '100%';
  slider.setAttribute('aria-label', 'Kalibrera skärmens millimeterskala');
  const CARD_MM = 85.6;
  const current = store.get().calibration.pxPerMm;
  const startPx = current ? current * CARD_MM : (96 / 25.4) * CARD_MM;
  slider.value = String(Math.round(startPx));
  bar.style.width = `${slider.value}px`;
  const status = el('p', undefined, current ? `Kalibrerad: ${current.toFixed(2)} px/mm` : 'Ej kalibrerad — nominell skala används.');
  status.style.margin = '0';
  slider.addEventListener('input', () => {
    bar.style.width = `${slider.value}px`;
    const pxPerMm = Number(slider.value) / CARD_MM;
    store.update((s) => { s.calibration.pxPerMm = Math.round(pxPerMm * 100) / 100; });
    status.textContent = `Kalibrerad: ${pxPerMm.toFixed(2)} px/mm`;
  });
  const clearBtn = el('button', 'btn btn-quiet', 'Rensa kalibrering');
  clearBtn.type = 'button';
  clearBtn.style.marginTop = '0.6rem';
  clearBtn.addEventListener('click', () => {
    store.update((s) => { s.calibration.pxPerMm = null; });
    status.textContent = 'Ej kalibrerad — nominell skala används.';
  });
  box.append(desc, bar, slider, status, clearBtn);
  container.append(box);
}
