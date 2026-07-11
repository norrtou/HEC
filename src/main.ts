import './styles/main.css';
import { GameLoop } from './engine/GameLoop';
import { InputManager } from './engine/InputManager';
import { AudioManager } from './engine/AudioManager';
import { Haptics } from './engine/Haptics';
import { ParticleSystem } from './engine/ParticleSystem';
import { drawBackdrop, drawBubble } from './engine/Renderer';
import { GameSession } from './game/GameSession';
import { VARIANTS } from './game/Variant';
import { buildSessionStats } from './stats/StatsEngine';
import { exportCsv, exportJson } from './stats/exporters';
import { SettingsStore } from './ui/settingsStore';
import { buildSettingsPanel } from './ui/settingsPanel';
import { renderStatsPanel } from './ui/statsPanel';
import type { GameVariantId, SessionStats } from './types';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>('game-canvas');
const ctx = canvas.getContext('2d', { alpha: false })!;
const store = new SettingsStore();
const audio = new AudioManager();
const haptics = new Haptics();
const particles = new ParticleSystem();
const input = new InputManager(canvas);

let session: GameSession | null = null;
let sessionStartIso = '';
let highScore = store.loadHighScore();
let cssW = 0;
let cssH = 0;

// ---------- Canvas sizing ----------
function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  cssW = window.innerWidth;
  cssH = window.innerHeight;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// ---------- Settings application ----------
function applySettings(): void {
  const s = store.get();
  const root = document.documentElement;
  root.dataset.invert = String(s.accessibility.invertColors);
  root.dataset.reduceMotion = String(s.accessibility.reduceMotion);
  root.style.setProperty('--ui-scale', String(s.accessibility.uiScale));
  root.style.setProperty('--font-scale', String(s.accessibility.fontScale));
  audio.setEnabled(s.audio.soundEnabled);
  audio.setVolume(s.audio.soundVolume);
  haptics.setEnabled(s.audio.hapticsEnabled);
  particles.setReduceMotion(s.accessibility.reduceMotion);
  session?.setDifficulty(s.difficulty);
  session?.setMotor(s.motor);
}
store.onChange(applySettings);
applySettings();

// ---------- Game loop ----------
const loop = new GameLoop((dtMs, now) => {
  const s = store.get();
  drawBackdrop(ctx, cssW, cssH, now, s.accessibility.invertColors);

  if (session) {
    // 1) Process input captured since last frame (timestamps were already taken in the event handler)
    session.processSamples(input.drain());
    // 2) Advance game state
    session.update(dtMs, now, cssW, cssH);
    // 3) Render
    for (const b of session.bubbles) {
      const remaining = 1 - (now - b.spawnTime) / b.lifetimeMs;
      drawBubble(ctx, {
        x: b.x,
        y: b.y,
        radius: b.radius,
        color: b.color,
        scale: b.scale,
        glow: s.accessibility.reduceMotion ? 0 : b.state === 'popping' ? 1 : 0.55,
        ringProgress: b.state === 'alive' && b.vy === 0 ? Math.max(0, remaining) : undefined,
        highContrast: s.accessibility.highContrastTargets,
      });
    }
    particles.render(ctx);
    updatePill(now);
  }
});

// ---------- Top pill & stats panel ----------
const pill = $<HTMLButtonElement>('top-pill');
const pillTime = $('pill-time');
const pillScore = $('pill-score');
const pillHigh = $('pill-high');
const statsPanel = $('stats-panel');
let pillLastSecond = -1;

function updatePill(now: number): void {
  if (!session) return;
  const sec = Math.floor(session.elapsedMs(now) / 1000);
  if (sec !== pillLastSecond) {
    pillLastSecond = sec;
    pillTime.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  }
}

function currentStats(): SessionStats | null {
  if (!session) return null;
  return buildSessionStats({
    trials: session.trials,
    falseAlarms: session.falseAlarms,
    variant: store.get().variant,
    startedAtIso: sessionStartIso,
    durationMs: session.elapsedMs(performance.now()),
    pointerTypesUsed: [...session.pointerTypesUsed],
    pxPerMm: store.get().calibration.pxPerMm,
    highScore,
  });
}

function toggleStatsPanel(open?: boolean): void {
  const willOpen = open ?? !statsPanel.classList.contains('open');
  if (willOpen) {
    const stats = currentStats();
    if (stats) renderStatsPanel($('stats-grid'), $('stats-full'), stats);
    statsPanel.hidden = false;
    requestAnimationFrame(() => statsPanel.classList.add('open'));
  } else {
    statsPanel.classList.remove('open');
    setTimeout(() => { statsPanel.hidden = true; }, 300);
  }
  pill.setAttribute('aria-expanded', String(willOpen));
}
pill.addEventListener('click', () => toggleStatsPanel());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!settingsEl.hidden) closeSettings();
    else if (statsPanel.classList.contains('open')) toggleStatsPanel(false);
  }
});

// ---------- Exports ----------
$('btn-export-csv').addEventListener('click', () => {
  const s = currentStats();
  if (s) exportCsv(s);
});
$('btn-export-json').addEventListener('click', () => {
  const s = currentStats();
  if (s) exportJson(s);
});
$('btn-export-pdf').addEventListener('click', async () => {
  const s = currentStats();
  if (!s) return;
  const { exportPdf } = await import('./stats/pdfReport');
  exportPdf(s);
});

// ---------- Splash & variant picker ----------
const splash = $('splash');
const variantPicker = $('variant-picker');

function buildVariantPicker(): void {
  variantPicker.replaceChildren();
  for (const v of Object.values(VARIANTS)) {
    const card = document.createElement('button');
    card.className = 'variant-card';
    card.type = 'button';
    card.setAttribute('role', 'radio');
    card.setAttribute('aria-checked', String(store.get().variant === v.id));
    card.innerHTML = `<h3>${v.label}</h3><p>${v.tagline}</p>`;
    card.addEventListener('click', () => {
      store.update((s) => { s.variant = v.id as GameVariantId; });
      for (const c of variantPicker.children) c.setAttribute('aria-checked', 'false');
      card.setAttribute('aria-checked', 'true');
    });
    variantPicker.append(card);
  }
}
buildVariantPicker();

function startGame(): void {
  audio.warmUp();
  const s = store.get();
  sessionStartIso = new Date().toISOString();
  session = new GameSession(
    VARIANTS[s.variant],
    s.difficulty,
    s.motor,
    particles,
    audio,
    haptics,
    {
      onScoreChange(score) {
        pillScore.textContent = String(score);
      },
      onHighScore(score) {
        highScore = score;
        store.saveHighScore(score);
        pillHigh.textContent = `★ ${score}`;
      },
    },
    highScore,
  );
  pillScore.textContent = '0';
  pillHigh.textContent = `★ ${highScore}`;
  pillLastSecond = -1;
  splash.hidden = true;
  pill.hidden = false;
  input.start();
  loop.start();
}

function endSession(): void {
  toggleStatsPanel(false);
  input.stop();
  loop.stop();
  session = null;
  pill.hidden = true;
  splash.hidden = false;
  ctx.clearRect(0, 0, cssW, cssH);
}

$('btn-start').addEventListener('click', startGame);
$('btn-end-session').addEventListener('click', endSession);

// ---------- Settings dialog ----------
const settingsEl = $('settings');
let settingsBuilt = false;

function testSound(): void {
  // The click on the test button is itself a user gesture, so warmUp is always allowed here.
  audio.warmUp();
  audio.playPop();
}

function openSettings(): void {
  if (!settingsBuilt) {
    buildSettingsPanel($('settings-body'), store, testSound);
    settingsBuilt = true;
  }
  settingsEl.hidden = false;
  $('btn-close-settings').focus();
}
function closeSettings(): void {
  settingsEl.hidden = true;
}
$('link-settings').addEventListener('click', openSettings);
$('btn-close-settings').addEventListener('click', closeSettings);
$('btn-done-settings').addEventListener('click', closeSettings);
$('btn-reset-settings').addEventListener('click', () => {
  store.reset();
  buildSettingsPanel($('settings-body'), store, testSound);
});

// ---------- Orientation gate ----------
const gate = $('orientation-gate');
function checkOrientation(): void {
  const portrait = window.matchMedia('(orientation: portrait)').matches;
  const smallish = Math.min(window.screen.width, window.screen.height) < 900;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  gate.hidden = !(portrait && smallish && coarse);
}
window.matchMedia('(orientation: portrait)').addEventListener('change', checkOrientation);
window.addEventListener('resize', checkOrientation);
checkOrientation();

// Render one backdrop frame behind the splash so the page never flashes white.
drawBackdrop(ctx, cssW, cssH, 0, store.get().accessibility.invertColors);
