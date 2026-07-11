import './styles/main.css';
import { GameLoop } from './engine/GameLoop';
import { InputManager } from './engine/InputManager';
import { AudioManager } from './engine/AudioManager';
import { Haptics } from './engine/Haptics';
import { ParticleSystem } from './engine/ParticleSystem';
import { drawBackdrop, drawBubble, drawGate } from './engine/Renderer';
import { GameSession } from './game/GameSession';
import { VARIANTS } from './game/Variant';
import { VARIANT_META, variantIcon } from './game/variantMeta';
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
// The canvas element's rendered size is the single source of truth: game logic,
// the bitmap and pointer coordinates (measured against the same rect in
// InputManager) must all share one coordinate space. window.innerHeight is NOT
// that space on iOS Safari — the layout viewport that `height: 100%` resolves
// against is taller when the toolbar is visible, which stretched the bitmap
// (oval bubbles) and shifted every tap past the hitboxes.
function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const rect = canvas.getBoundingClientRect();
  cssW = rect.width;
  cssH = rect.height;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Setting canvas.width clears the bitmap; repaint now if the loop isn't running.
  if (!session) drawBackdrop(ctx, cssW, cssH, 0, store.get().accessibility.invertColors);
}
window.addEventListener('resize', resize);
// iOS fires these (not always window.resize) when the URL bar collapses/expands
// or the phone rotates, and both change the layout viewport.
window.visualViewport?.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
resize();

// ---------- i18n ----------
function applyStaticTranslations(): void {
  document.documentElement.lang = getLang();
  document.title = t('doc.title');
  $('i18n-splash-sub').textContent = t('splash.sub');
  $('i18n-note-compare').innerHTML = t('splash.note.compare');
  $('i18n-note-privacy').innerHTML = t('splash.note.privacy');
  $('i18n-note-settings').innerHTML = t('splash.note.settings');
  $('i18n-note-info').innerHTML = t('splash.note.info');
  $('info-title').textContent = t('info.title');
  $('btn-close-info').setAttribute('aria-label', t('info.close'));
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
    session.update(dtMs, now, cssW, cssH, input.position());
    // 3) Render — gate rings first so bubbles pass over them
    const gateY = session.gateY();
    if (gateY !== null) {
      for (const b of session.bubbles) {
        if (b.state === 'alive' || b.state === 'growing') {
          drawGate(ctx, b.x, gateY, b.radius + 9, s.accessibility.invertColors);
        }
      }
    }
    for (const b of session.bubbles) {
      const remaining = 1 - (now - b.spawnTime) / b.lifetimeMs;
      drawBubble(ctx, {
        x: b.x,
        y: b.y,
        radius: b.radius,
        color: b.color,
        scale: b.scale,
        glow: b.highlightUntil > now ? 1 : s.accessibility.reduceMotion ? 0 : b.state === 'popping' ? 1 : 0.55,
        // No countdown ring on permanent targets (finger tapping test).
        ringProgress:
          b.state === 'alive' && b.vy === 0 && b.lifetimeMs < 600_000 ? Math.max(0, remaining) : undefined,
        highContrast: s.accessibility.highContrastTargets,
        distractor: b.distractor,
        label: b.label,
        featureRing: b.featureRing,
        featureDot: b.featureDot,
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
    sequenceErrors: session.sequenceErrorCount,
    report: session.variantReport(),
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
    else if (!infoEl.hidden) closeInfo();
    else if (cancelCountdown) {
      cancelCountdown();
      splash.hidden = false;
    } else if (statsPanel.classList.contains('open')) toggleStatsPanel(false);
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
  for (const meta of VARIANT_META) {
    const card = document.createElement('button');
    card.className = 'variant-card';
    card.type = 'button';
    card.setAttribute('role', 'radio');
    const label = t(`variant.${meta.id}.label` as Parameters<typeof t>[0]);
    const tagline = t(`variant.${meta.id}.tagline` as Parameters<typeof t>[0]);
    card.innerHTML = `<span class="variant-icon">${variantIcon(meta)}</span><h3>${label}</h3><p>${tagline}</p>`;
    if (meta.implemented) {
      card.setAttribute('aria-checked', String(store.get().variant === meta.id));
      card.addEventListener('click', () => {
        store.update((s) => { s.variant = meta.id as GameVariantId; });
        for (const c of variantPicker.children) c.setAttribute('aria-checked', 'false');
        card.setAttribute('aria-checked', 'true');
      });
    } else {
      // Shadowed until the variant is built: visible in the menu, not selectable.
      card.disabled = true;
      card.setAttribute('aria-checked', 'false');
      card.insertAdjacentHTML('beforeend', `<span class="variant-soon">${t('variant.soon')}</span>`);
    }
    variantPicker.append(card);
  }
}
buildVariantPicker();

// ---------- Info page (what each game measures) ----------
const infoEl = $('info');

function buildInfoBody(): void {
  const body = $('info-body');
  body.replaceChildren();
  body.insertAdjacentHTML('beforeend', `<p class="info-intro">${t('info.intro')}</p>`);
  for (const meta of VARIANT_META) {
    const label = t(`variant.${meta.id}.label` as Parameters<typeof t>[0]);
    const text = t(`variant.${meta.id}.info` as Parameters<typeof t>[0]);
    const soon = meta.implemented ? '' : ` <span class="variant-soon">${t('variant.soon')}</span>`;
    body.insertAdjacentHTML(
      'beforeend',
      `<section class="info-item${meta.implemented ? '' : ' info-item--soon'}">` +
        `<span class="variant-icon">${variantIcon(meta)}</span>` +
        `<h3>${label}${soon}</h3><p>${text}</p></section>`,
    );
  }
}

function openInfo(): void {
  buildInfoBody(); // rebuilt on every open so it always matches the current language
  infoEl.hidden = false;
  $('btn-close-info').focus();
}
function closeInfo(): void {
  infoEl.hidden = true;
}
$('btn-close-info').addEventListener('click', closeInfo);

// ---------- Pre-round countdown ----------
const countdownEl = $('countdown');
const countdownTask = $('countdown-task');
const countdownNum = $('countdown-num');
let cancelCountdown: (() => void) | null = null;

/** Shows the task sentence + 3-2-1-Go over the game screen, then calls onDone. The session (and its timers) is only created after the countdown, so nothing is measured before "Go". */
function runCountdown(onDone: () => void): void {
  const s = store.get();
  countdownTask.textContent = t(`variant.${s.variant}.play` as Parameters<typeof t>[0]);
  countdownEl.hidden = false;
  const steps = [
    { text: '3', ms: 750, final: false },
    { text: '2', ms: 750, final: false },
    { text: '1', ms: 750, final: false },
    { text: t('countdown.go'), ms: 650, final: true },
  ];
  let i = 0;
  let timer = 0;
  const show = (): void => {
    const step = steps[i++];
    countdownNum.textContent = step.text;
    // Restart the pop animation for every tick.
    countdownNum.classList.remove('tick');
    void countdownNum.offsetWidth;
    countdownNum.classList.add('tick');
    audio.playCountTick(step.final);
    timer = window.setTimeout(i < steps.length ? show : () => {
      countdownEl.hidden = true;
      cancelCountdown = null;
      onDone();
    }, step.ms);
  };
  cancelCountdown = () => {
    clearTimeout(timer);
    countdownEl.hidden = true;
    cancelCountdown = null;
  };
  show();
}

function startGame(): void {
  audio.warmUp();
  const s = store.get();
  if (!VARIANTS[s.variant]) return; // unbuilt id can't be selected in the UI, but guard anyway
  splash.hidden = true;
  runCountdown(beginRound);
}

function beginRound(): void {
  const s = store.get();
  const variant = VARIANTS[s.variant];
  if (!variant) return;
  sessionStartIso = new Date().toISOString();
  session = new GameSession(
    variant,
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
// Delegated: the settings/info links inside the splash note are re-created on language switch.
document.addEventListener('click', (e) => {
  const id = (e.target as HTMLElement).id;
  if (id === 'link-settings') openSettings();
  else if (id === 'link-info') openInfo();
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
