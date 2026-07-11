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
import { getLang, resolveLang, setLang, t } from './i18n';
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

// ---------- i18n ----------
function applyStaticTranslations(): void {
  document.documentElement.lang = getLang();
  document.title = t('doc.title');
  $('i18n-splash-sub').textContent = t('splash.sub');
  $('i18n-note-compare').innerHTML = t('splash.note.compare');
  $('i18n-note-privacy').innerHTML = t('splash.note.privacy');
  $('i18n-note-settings').innerHTML = t('splash.note.settings');
  $('btn-start').textContent = t('splash.start');
  $('i18n-credit').innerHTML = t('splash.credit');
  $('i18n-all-metrics').textContent = t('stats.allMetrics');
  $('btn-export-pdf').textContent = t('stats.exportPdf');
  $('btn-end-session').textContent = t('stats.endSession');
  $('settings-title').textContent = t('set.title');
  $('btn-close-settings').setAttribute('aria-label', t('set.close'));
  $('btn-reset-settings').textContent = t('set.reset');
  $('btn-done-settings').textContent = t('set.done');
  $('i18n-gate').textContent = t('gate.rotate');
}

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
  if (session) session.roundDurationMs = s.roundDurationSec * 1000;

  const lang = resolveLang(s.language);
  if (lang !== getLang()) {
    setLang(lang);
    applyStaticTranslations();
    buildVariantPicker();
    if (settingsBuilt) buildSettingsPanel($('settings-body'), store, testSound);
  }
}
store.onChange(applySettings);

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

    if (session.finished && !roundEndHandled) {
      roundEndHandled = true;
      input.stop();
      audio.playFanfare();
      toggleStatsPanel(true);
    }
  }
});

// ---------- Top pill & stats panel ----------
const pill = $<HTMLButtonElement>('top-pill');
const pillTime = $('pill-time');
const pillScore = $('pill-score');
const pillHigh = $('pill-high');
const statsPanel = $('stats-panel');
let pillLastSecond = -1;
let roundEndHandled = false;

function updatePill(now: number): void {
  if (!session) return;
  // Count down: the pill shows time remaining in the round.
  const remainMs = Math.max(0, session.roundDurationMs - session.elapsedMs(now));
  const sec = Math.ceil(remainMs / 1000);
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
    durationMs: Math.min(session.elapsedMs(performance.now()), session.roundDurationMs),
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
    const label = t(`variant.${v.id}.label` as Parameters<typeof t>[0]);
    const tagline = t(`variant.${v.id}.tagline` as Parameters<typeof t>[0]);
    card.innerHTML = `<h3>${label}</h3><p>${tagline}</p>`;
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
  session.roundDurationMs = s.roundDurationSec * 1000;
  roundEndHandled = false;
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
  roundEndHandled = false;
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
// Delegated: the settings link inside the splash note is re-created on language switch.
document.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).id === 'link-settings') openSettings();
});
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

// Initial application (also resolves language and translates the static UI if needed).
applySettings();

// Render one backdrop frame behind the splash so the page never flashes white.
drawBackdrop(ctx, cssW, cssH, 0, store.get().accessibility.invertColors);
