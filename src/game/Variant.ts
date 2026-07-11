import type { GameVariantId, TrialRecord } from '../types';
import type { Bubble } from './Bubble';
import { BUBBLE_PALETTE } from '../engine/Renderer';

export interface CorsiReport {
  kind: 'corsi';
  /** longest correctly reproduced sequence length */
  span: number;
  sequencesCompleted: number;
  sequencesFailed: number;
}

export interface PursuitReport {
  kind: 'pursuit';
  /** ms the target was alive and being measured */
  totalMs: number;
  onTargetMs: number;
  meanDistPx: number | null;
  rmsDistPx: number | null;
}

export type VariantReport = CorsiReport | PursuitReport;

export interface PointerPoint {
  x: number;
  y: number;
  t: number;
}

export interface SpawnPoint {
  x: number;
  y: number;
  vy: number; // px/s, signed (negative = upward)
  /** no-go target: tapping it is an inhibition failure (Go/No-Go variant) */
  distractor?: boolean;
  /** fixed color override; default is the cycling palette */
  color?: string;
  /** per-target radius override (Fitts variant varies target width per trial) */
  radius?: number;
  /** text drawn on the bubble (Trail Making numbers/letters) */
  label?: string;
  /** position in an ordered sequence; taps out of order are rejected via acceptHit */
  order?: number;
  /** sequence wave metadata for per-wave stats (Trail Making) */
  wave?: number;
  waveKind?: 'A' | 'B';
  /** stop-signal variant: turn into a no-go target this many ms after spawn */
  stopAfterMs?: number;
  /** visual search: form features and wave metadata */
  featureRing?: boolean;
  featureDot?: boolean;
  searchSetSize?: number;
  searchKind?: 'feature' | 'conjunction';
}

export interface PlayArea {
  w: number;
  h: number;
  marginPx: number;
  topSafeMarginPx: number; // keep clear of the discreet top pill
}

export interface GameVariant {
  id: GameVariantId;
  /** Pick where the next target should appear. speedPxPerSec is the user's difficulty speed, for variants that drive their own motion. */
  nextSpawn(area: PlayArea, radius: number, seq: number, speedPxPerSec: number): SpawnPoint;
  /** Has this target expired for a reason other than the shared lifetime timer? (e.g. drifted off-screen) */
  isOutOfBounds(x: number, y: number, radius: number, area: PlayArea): boolean;
  /** Pacing the paradigm requires regardless of user difficulty settings. */
  overrides?: {
    maxConcurrent?: number;
    spawnIntervalMs?: number;
    /** scales the user's target lifetime (e.g. Fitts wants a generous window) */
    lifetimeMultiplier?: number;
  };
  /**
   * Target survives being hit (finger tapping test): every tap is recorded as
   * a trial but the bubble never pops. Also bypasses the tremor filter, since
   * rapid same-spot taps are the whole point of that paradigm.
   */
  retainOnHit?: boolean;
  /**
   * Y of the timing gate, if this variant has one (anticipation): a moving
   * target should be tapped exactly as its center crosses this line. Presence
   * switches hit scoring and stats to timing error instead of reaction time.
   */
  gateY?(area: PlayArea): number;
  /** Veto spawning even when concurrency allows it (Trail Making waits for the wave to clear). */
  canSpawn?(): boolean;
  /**
   * Ordered-sequence variants: return true if this target may be popped now
   * (and advance the internal sequence), false to reject the tap as a
   * sequence error — the bubble stays and the session records the error.
   */
  acceptHit?(order: number | undefined): boolean;
  /** Called for every accepted tap — for variants that place targets relative to the pointer. */
  onTap?(x: number, y: number): void;
  /** Called after every recorded trial — for variants that adapt (stop-signal staircase). */
  onResolve?(trial: TrialRecord): void;
  /**
   * Called once per frame with the live bubbles and the current pointer
   * position — for variants that animate/phase (Corsi presentation) or track
   * continuously (pursuit). A returned number is added to the score.
   */
  onUpdate?(now: number, bubbles: Bubble[], pointer: PointerPoint | null): number | void;
  /** While true, discrete taps are discarded (Corsi presentation, pursuit tracking). */
  ignoreTaps?(): boolean;
  /** Variant-owned results that cannot be derived from the trial log (Corsi span, pursuit tracking). */
  report?(): VariantReport;
  /** Called when a new round starts, so module-level variant state never leaks between rounds. */
  reset?(): void;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export const RisingVariant: GameVariant = {
  id: 'rising',
  nextSpawn(area, radius, _seq) {
    const x = rand(area.marginPx + radius, area.w - area.marginPx - radius);
    const y = area.h + radius + rand(0, 40);
    return { x, y, vy: -1 }; // sign only; magnitude scaled by difficulty speed
  },
  isOutOfBounds(_x, y, radius, area) {
    return y + radius < area.topSafeMarginPx;
  },
};

export const RandomPopVariant: GameVariant = {
  id: 'random',
  nextSpawn(area, radius, _seq) {
    const x = rand(area.marginPx + radius, area.w - area.marginPx - radius);
    const y = rand(area.topSafeMarginPx + radius, area.h - area.marginPx - radius);
    return { x, y, vy: 0 };
  },
  isOutOfBounds() {
    return false;
  },
};

/** 3x3 zone anchors, cycled in shuffled passes so every screen zone gets even exposure — this is what makes the directional-bias stat meaningful. */
export const GridVariant: GameVariant = (() => {
  let order: number[] = [];
  let cursor = 0;
  const reshuffle = () => {
    order = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    cursor = 0;
  };
  reshuffle();

  return {
    id: 'grid',
    nextSpawn(area, _radius) {
      if (cursor >= order.length) reshuffle();
      const idx = order[cursor++];
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      const usableW = area.w - area.marginPx * 2;
      const usableH = area.h - area.topSafeMarginPx - area.marginPx;
      const x = area.marginPx + usableW * ((col + 0.5) / 3);
      const y = area.topSafeMarginPx + usableH * ((row + 0.5) / 3);
      return { x, y, vy: 0 };
    },
    isOutOfBounds() {
      return false;
    },
  };
})();

/** Single fixed colors so the go/no-go decision is purely color+marker based. */
export const GO_COLOR = '#5ee87a';
export const NOGO_COLOR = '#ff4d5e';

/**
 * Go/No-Go: spawns like Random pop, but 30% of targets are no-go distractors
 * that must NOT be tapped. Prevalence is enforced with a shuffled bag (3 of 10)
 * rather than raw randomness, so every round has the same inhibition load and
 * no player is punished by a fluke streak of reds.
 */
export const GoNoGoVariant: GameVariant = (() => {
  let bag: boolean[] = [];
  const refill = () => {
    bag = [true, true, true, false, false, false, false, false, false, false];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  };

  return {
    id: 'gonogo',
    nextSpawn(area, radius, _seq) {
      if (bag.length === 0) refill();
      const distractor = bag.pop()!;
      const x = rand(area.marginPx + radius, area.w - area.marginPx - radius);
      const y = rand(area.topSafeMarginPx + radius, area.h - area.marginPx - radius);
      return { x, y, vy: 0, distractor, color: distractor ? NOGO_COLOR : GO_COLOR };
    },
    isOutOfBounds() {
      return false;
    },
  };
})();

/**
 * Fitts' law tapping (ISO 9241-9 style, adapted to the bubble game): exactly
 * one target at a time, spawned immediately after the previous tap at an
 * exactly controlled distance A from the tap point, with one of three target
 * widths. The 3×3 (amplitude × width) conditions are cycled in shuffled bags
 * so every round samples the full index-of-difficulty range evenly. Stats are
 * derived afterwards from the trial log: ID = log2(A/W + 1), MT = inter-tap
 * time, throughput = ID/MT averaged per condition.
 */
export const FittsVariant: GameVariant = (() => {
  const AMPLITUDE_FRACTIONS = [0.3, 0.52, 0.78]; // × min(screen w, h)
  const WIDTH_FACTORS = [0.7, 1, 1.4]; // × user's target radius setting

  let bag: [number, number][] = [];
  const refill = () => {
    bag = AMPLITUDE_FRACTIONS.flatMap((a) => WIDTH_FACTORS.map((w) => [a, w] as [number, number]));
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  };

  let last: { x: number; y: number } | null = null;

  return {
    id: 'fitts',
    overrides: { maxConcurrent: 1, spawnIntervalMs: 0, lifetimeMultiplier: 2 },
    reset() {
      last = null;
      bag = [];
    },
    onTap(x, y) {
      last = { x, y };
    },
    nextSpawn(area, baseRadius, _seq) {
      if (bag.length === 0) refill();
      const [af, wf] = bag.pop()!;
      const radius = Math.max(8, baseRadius * wf);
      const minX = area.marginPx + radius;
      const maxX = area.w - area.marginPx - radius;
      const minY = area.topSafeMarginPx + radius;
      const maxY = area.h - area.marginPx - radius;

      const from = last ?? { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
      let amplitude = Math.min(area.w, area.h) * af;

      // Place the target at exactly `amplitude` from the previous tap point:
      // sample random directions, shrinking the amplitude only if no direction
      // keeps the target on screen (corner starts with the longest distance).
      for (let attempt = 0; attempt < 8; attempt++) {
        for (let i = 0; i < 24; i++) {
          const angle = Math.random() * Math.PI * 2;
          const x = from.x + Math.cos(angle) * amplitude;
          const y = from.y + Math.sin(angle) * amplitude;
          if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
            return { x, y, vy: 0, radius };
          }
        }
        amplitude *= 0.82;
      }
      // Degenerate screen: fall back to a random legal position.
      return { x: rand(minX, maxX), y: rand(minY, maxY), vy: 0, radius };
    },
    isOutOfBounds() {
      return false;
    },
  };
})();

/**
 * Finger tapping test (Halstead-Reitan style): a single large target in the
 * middle of the play area that never expires and never pops — tap it as many
 * times as possible. Raw motor speed (taps/s) and rhythm consistency (SD of
 * the inter-tap interval) are computed in StatsEngine from the trial log.
 */
export const TappingVariant: GameVariant = {
  id: 'tapping',
  retainOnHit: true,
  // One immortal target: effectively infinite lifetime, no respawn churn.
  overrides: { maxConcurrent: 1, spawnIntervalMs: 0, lifetimeMultiplier: 1e6 },
  nextSpawn(area, baseRadius, _seq) {
    const y = area.topSafeMarginPx + (area.h - area.topSafeMarginPx - area.marginPx) / 2;
    return { x: area.w / 2, y, vy: 0, radius: Math.max(48, baseRadius * 1.8) };
  },
  isOutOfBounds() {
    return false;
  },
};

/**
 * Coincidence anticipation (Bassin-timer style): bubbles rise like in the
 * rising variant, but each has a dashed gate ring on its path at a fixed
 * height. The task is to tap the bubble exactly as it crosses the ring; the
 * measure is the signed timing error, not spatial precision. Speed comes from
 * the user's difficulty setting, so faster approach = harder anticipation.
 */
export const AnticipationVariant: GameVariant = {
  id: 'anticipation',
  // Two runways at most — timing several simultaneous approaches stops being
  // an anticipation test and becomes divided attention.
  overrides: { maxConcurrent: 2 },
  gateY(area) {
    return area.topSafeMarginPx + (area.h - area.topSafeMarginPx - area.marginPx) * 0.32;
  },
  nextSpawn(area, radius, _seq) {
    const x = rand(area.marginPx + radius, area.w - area.marginPx - radius);
    const y = area.h + radius + rand(0, 40);
    return { x, y, vy: -1 };
  },
  isOutOfBounds(_x, y, radius, area) {
    return y + radius < area.topSafeMarginPx;
  },
};

/**
 * Stop-signal task: every target spawns green (go), but 3 of 10 turn red a
 * stop-signal delay (SSD) after onset and must then NOT be tapped. The SSD
 * follows the standard 50 ms staircase — up after a successful stop, down
 * after a failed one — converging on ~50% stop success, which is what makes
 * the race-model estimate SSRT ≈ mean go-RT − mean SSD valid. Taps landing
 * before the signal fires count as ordinary hits (the player could not know).
 */
export const StopSignalVariant: GameVariant = (() => {
  const SSD_START = 250;
  const SSD_STEP = 50;
  const SSD_MIN = 80;
  const SSD_MAX = 1200;

  let ssd = SSD_START;
  let bag: boolean[] = [];
  const refill = () => {
    bag = [true, true, true, false, false, false, false, false, false, false];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  };

  return {
    id: 'stopsignal',
    reset() {
      ssd = SSD_START;
      bag = [];
    },
    nextSpawn(area, radius, _seq) {
      if (bag.length === 0) refill();
      const stopTrial = bag.pop()!;
      const x = rand(area.marginPx + radius, area.w - area.marginPx - radius);
      const y = rand(area.topSafeMarginPx + radius, area.h - area.marginPx - radius);
      return { x, y, vy: 0, color: GO_COLOR, stopAfterMs: stopTrial ? ssd : undefined };
    },
    onResolve(trial) {
      // Only stop trials resolve as commission (failed stop) or rejection
      // (successful stop) in this variant.
      if (trial.result === 'rejection') ssd = Math.min(SSD_MAX, ssd + SSD_STEP);
      else if (trial.result === 'commission') ssd = Math.max(SSD_MIN, ssd - SSD_STEP);
    },
    isOutOfBounds() {
      return false;
    },
  };
})();

export const TRAILS_WAVE_SIZE = 6;

/**
 * Trail Making: waves of six labelled bubbles shown at once, tapped in order.
 * Waves alternate between TMT-A style (1-2-3-4-5-6, visual scanning) and
 * TMT-B style (1-A-2-B-3-C, set switching); the link-time difference B − A
 * isolates cognitive flexibility from raw motor/scanning speed. Out-of-order
 * taps are rejected as sequence errors and the wave continues.
 */
export const TrailsVariant: GameVariant = (() => {
  let pending: SpawnPoint[] = [];
  let aliveInWave = 0;
  let expected = 0;
  let waveIndex = 0;

  const labelsFor = (kind: 'A' | 'B'): string[] =>
    kind === 'A' ? ['1', '2', '3', '4', '5', '6'] : ['1', 'A', '2', 'B', '3', 'C'];

  const generateWave = (area: PlayArea, radius: number): void => {
    const kind: 'A' | 'B' = waveIndex % 2 === 0 ? 'A' : 'B';
    const labels = labelsFor(kind);
    const minX = area.marginPx + radius;
    const maxX = area.w - area.marginPx - radius;
    const minY = area.topSafeMarginPx + radius;
    const maxY = area.h - area.marginPx - radius;
    // Rejection-sample positions so bubbles never crowd each other.
    const placed: { x: number; y: number }[] = [];
    for (let i = 0; i < TRAILS_WAVE_SIZE; i++) {
      let x = 0;
      let y = 0;
      for (let tries = 0; tries < 200; tries++) {
        x = rand(minX, maxX);
        y = rand(minY, maxY);
        if (placed.every((p) => Math.hypot(p.x - x, p.y - y) > radius * 2.6)) break;
      }
      placed.push({ x, y });
    }
    pending = placed.map((p, i) => ({
      x: p.x,
      y: p.y,
      vy: 0,
      label: labels[i],
      order: i,
      wave: waveIndex,
      waveKind: kind,
    }));
    expected = 0;
    aliveInWave = 0;
    waveIndex++;
  };

  return {
    id: 'trails',
    // The whole wave lives on screen at once and never times out — order,
    // not speed-to-expiry, is the constraint (classic TMT is untimed per item).
    overrides: { maxConcurrent: TRAILS_WAVE_SIZE, spawnIntervalMs: 0, lifetimeMultiplier: 1e6 },
    reset() {
      pending = [];
      aliveInWave = 0;
      expected = 0;
      waveIndex = 0;
    },
    canSpawn() {
      return pending.length > 0 || aliveInWave === 0;
    },
    nextSpawn(area, radius, _seq) {
      if (pending.length === 0) generateWave(area, radius);
      aliveInWave++;
      return pending.shift()!;
    },
    acceptHit(order) {
      if (order !== expected) return false;
      expected++;
      aliveInWave--;
      return true;
    },
    isOutOfBounds() {
      return false;
    },
  };
})();

/**
 * Corsi block-tapping: nine permanent bubbles in a jittered 3×3 layout. A
 * sequence flashes one bubble at a time; the player then reproduces it in the
 * same order. Success lengthens the next sequence, an error shortens it
 * (floor 2) — the span (longest reproduced length) is the visuospatial
 * short-term memory measure. Taps are ignored while the sequence plays.
 */
export const CorsiVariant: GameVariant = (() => {
  const NEUTRAL = '#566080';
  const FLASH = '#3ee6d6';
  const ITEM_MS = 950; // per presented item: 700 ms lit + 250 ms dark
  const LIT_MS = 700;
  const GAP_MS = 900; // pause between sequences

  type Phase = 'init' | 'present' | 'reproduce' | 'gap';
  let phase: Phase = 'init';
  let seq: number[] = [];
  let len = 2;
  let step = 0;
  let phaseStart = 0;
  let emitted = 0;
  let positions: { x: number; y: number }[] = [];
  let span = 0;
  let completed = 0;
  let failed = 0;
  let nowRef = 0;

  const newSequence = (): void => {
    const pool = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    seq = pool.slice(0, len);
    step = 0;
    phaseStart = 0;
    phase = 'present';
  };

  return {
    id: 'corsi',
    retainOnHit: true,
    overrides: { maxConcurrent: 9, spawnIntervalMs: 0, lifetimeMultiplier: 1e6 },
    reset() {
      phase = 'init';
      seq = [];
      len = 2;
      step = 0;
      emitted = 0;
      positions = [];
      span = 0;
      completed = 0;
      failed = 0;
    },
    canSpawn() {
      return emitted < 9;
    },
    nextSpawn(area, radius, _seq) {
      if (positions.length === 0) {
        // Jittered 3×3 anchors — same idea as the grid variant, but fixed for
        // the whole round like Corsi's physical block board.
        const usableW = area.w - area.marginPx * 2;
        const usableH = area.h - area.topSafeMarginPx - area.marginPx;
        for (let i = 0; i < 9; i++) {
          const col = i % 3;
          const row = Math.floor(i / 3);
          positions.push({
            x: area.marginPx + usableW * ((col + 0.5) / 3) + rand(-radius, radius) * 0.6,
            y: area.topSafeMarginPx + usableH * ((row + 0.5) / 3) + rand(-radius, radius) * 0.6,
          });
        }
      }
      const p = positions[emitted];
      return { x: p.x, y: p.y, vy: 0, color: NEUTRAL, order: emitted++ };
    },
    onUpdate(now, bubbles) {
      nowRef = now;
      const blocks = bubbles.filter((b) => b.order !== undefined);
      if (phase === 'init') {
        if (blocks.length === 9) newSequence();
        return;
      }
      if (phase === 'gap') {
        if (now - phaseStart >= GAP_MS) newSequence();
        return;
      }
      if (phase === 'present') {
        if (phaseStart === 0) phaseStart = now;
        const idx = Math.floor((now - phaseStart) / ITEM_MS);
        const lit = idx < seq.length && (now - phaseStart) % ITEM_MS < LIT_MS;
        for (const b of blocks) {
          const active = lit && b.order === seq[idx];
          b.color = active ? FLASH : NEUTRAL;
          if (active) b.highlightUntil = now + 60;
        }
        if (idx >= seq.length) {
          phase = 'reproduce';
          step = 0;
        }
      }
    },
    ignoreTaps() {
      return phase !== 'reproduce';
    },
    acceptHit(order) {
      if (order !== seq[step]) {
        failed++;
        len = Math.max(2, len - 1);
        phase = 'gap';
        phaseStart = nowRef;
        return false;
      }
      step++;
      if (step === seq.length) {
        completed++;
        span = Math.max(span, seq.length);
        len = Math.min(9, len + 1);
        phase = 'gap';
        phaseStart = nowRef;
      }
      return true;
    },
    report() {
      return { kind: 'corsi' as const, span, sequencesCompleted: completed, sequencesFailed: failed };
    },
    isOutOfBounds() {
      return false;
    },
  };
})();

/**
 * Pursuit tracking (pursuit rotor analogue): one bubble orbits an elliptical
 * path at the user's difficulty speed; keep the finger/cursor on it. Measured
 * per frame: time on target (the classic rotor score) and mean/RMS distance.
 * Discrete taps are irrelevant and ignored; a mouse counts by hovering, a
 * finger by staying in contact. Scoring pays ~10 points per second on target.
 */
export const PursuitVariant: GameVariant = (() => {
  let area: PlayArea | null = null;
  let angle = 0;
  let speed = 0; // px/s, read once from the bubble's vy channel
  let lastNow = 0;
  let totalMs = 0;
  let onTargetMs = 0;
  let sumDist = 0;
  let sumSqDist = 0;
  let samples = 0;
  let scoreCarry = 0;

  return {
    id: 'pursuit',
    overrides: { maxConcurrent: 1, spawnIntervalMs: 0, lifetimeMultiplier: 1e6 },
    reset() {
      area = null;
      angle = Math.random() * Math.PI * 2;
      speed = 0;
      lastNow = 0;
      totalMs = 0;
      onTargetMs = 0;
      sumDist = 0;
      sumSqDist = 0;
      samples = 0;
      scoreCarry = 0;
    },
    ignoreTaps() {
      return true;
    },
    nextSpawn(a, radius, _seq, speedPxPerSec) {
      area = a;
      speed = speedPxPerSec;
      const r = Math.max(30, radius * 1.4);
      // vy stays 0: the bubble is "stationary" to the engine (no traversal
      // lifetime); onUpdate drives the orbital motion directly.
      return { x: a.w / 2, y: a.topSafeMarginPx + (a.h - a.topSafeMarginPx - a.marginPx) / 2, vy: 0, radius: r };
    },
    onUpdate(now, bubbles, pointer) {
      const b = bubbles.find((x) => x.state === 'alive' || x.state === 'growing');
      if (!b || !area) {
        lastNow = now;
        return;
      }
      const dt = lastNow === 0 ? 0 : Math.min(100, now - lastNow);
      lastNow = now;

      const cx = area.w / 2;
      const usableH = area.h - area.topSafeMarginPx - area.marginPx;
      const cy = area.topSafeMarginPx + usableH / 2;
      const rx = Math.max(40, (area.w / 2 - area.marginPx - b.radius) * 0.78);
      const ry = Math.max(40, (usableH / 2 - b.radius) * 0.78);
      angle += (speed / ((rx + ry) / 2)) * (dt / 1000);
      b.x = cx + Math.cos(angle) * rx;
      b.y = cy + Math.sin(angle) * ry;

      if (b.state !== 'alive' || dt === 0) return;
      totalMs += dt;
      if (!pointer) return;
      const dist = Math.hypot(pointer.x - b.x, pointer.y - b.y);
      samples++;
      sumDist += dist;
      sumSqDist += dist * dist;
      if (dist <= b.radius) {
        onTargetMs += dt;
        scoreCarry += dt;
        b.highlightUntil = now + 40; // glow while tracked: instant feedback
        const points = Math.floor(scoreCarry / 100); // 10 points per second on target
        scoreCarry -= points * 100;
        return points > 0 ? points : undefined;
      }
    },
    report() {
      return {
        kind: 'pursuit' as const,
        totalMs: Math.round(totalMs),
        onTargetMs: Math.round(onTargetMs),
        meanDistPx: samples > 0 ? sumDist / samples : null,
        rmsDistPx: samples > 0 ? Math.sqrt(sumSqDist / samples) : null,
      };
    },
    isOutOfBounds() {
      return false;
    },
  };
})();

/**
 * Visual search (Treisman & Gelade, 1980): each wave shows one odd bubble
 * among distractors. Feature waves: the target alone carries an inner ring —
 * it "pops out" and search time barely depends on set size. Conjunction
 * waves: the target combines ring AND dot while every distractor has exactly
 * one of them — binding two features forces a serial search, so time grows
 * with set size. The regression slope (ms/item) per condition is the classic
 * measure. Both features are form-based, so color vision is never required.
 */
export const SearchVariant: GameVariant = (() => {
  const SET_SIZES = [6, 12, 18];

  let bag: { kind: 'feature' | 'conjunction'; setSize: number }[] = [];
  const refill = () => {
    bag = (['feature', 'conjunction'] as const).flatMap((kind) => SET_SIZES.map((setSize) => ({ kind, setSize })));
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  };

  let pending: SpawnPoint[] = [];
  let aliveInWave = 0;
  let clearWave = false;
  let waveColor = 0;

  const generateWave = (area: PlayArea, radius: number): void => {
    if (bag.length === 0) refill();
    const { kind, setSize } = bag.pop()!;
    const r = Math.max(16, radius * 0.85);
    const minX = area.marginPx + r;
    const maxX = area.w - area.marginPx - r;
    const minY = area.topSafeMarginPx + r;
    const maxY = area.h - area.marginPx - r;
    const placed: { x: number; y: number }[] = [];
    for (let i = 0; i < setSize; i++) {
      let x = 0;
      let y = 0;
      for (let tries = 0; tries < 250; tries++) {
        x = rand(minX, maxX);
        y = rand(minY, maxY);
        if (placed.every((p) => Math.hypot(p.x - x, p.y - y) > r * 2.3)) break;
      }
      placed.push({ x, y });
    }
    const color = BUBBLE_PALETTE[waveColor++ % BUBBLE_PALETTE.length];
    const targetIndex = Math.floor(Math.random() * setSize);
    pending = placed.map((p, i) => {
      const isTarget = i === targetIndex;
      // Feature wave: only the target has the ring. Conjunction wave: the
      // target has ring+dot, distractors alternate ring-only / dot-only.
      const ring = kind === 'feature' ? isTarget : isTarget || i % 2 === 0;
      const dot = kind === 'feature' ? false : isTarget || i % 2 === 1;
      return {
        x: p.x,
        y: p.y,
        vy: 0,
        radius: r,
        color,
        order: isTarget ? 1 : 0,
        featureRing: ring,
        featureDot: dot,
        searchSetSize: setSize,
        searchKind: kind,
      };
    });
    aliveInWave = 0;
  };

  return {
    id: 'search',
    // Whole wave on screen at once, self-paced: no per-bubble timeout.
    overrides: { maxConcurrent: 18, spawnIntervalMs: 0, lifetimeMultiplier: 1e6 },
    reset() {
      bag = [];
      pending = [];
      aliveInWave = 0;
      clearWave = false;
      waveColor = 0;
    },
    canSpawn() {
      return pending.length > 0 || aliveInWave === 0;
    },
    nextSpawn(area, radius, _seq) {
      if (pending.length === 0) generateWave(area, radius);
      aliveInWave++;
      return pending.shift()!;
    },
    acceptHit(order) {
      if (order !== 1) return false; // distractor: search error, wave continues
      aliveInWave = 0;
      clearWave = true;
      return true;
    },
    onUpdate(now, bubbles) {
      if (!clearWave) return;
      clearWave = false;
      // Target found: fade the remaining distractors without recording misses.
      for (const b of bubbles) {
        if (b.state === 'alive' || b.state === 'growing') {
          b.state = 'expiring';
          b.stateStart = now;
        }
      }
    },
    isOutOfBounds() {
      return false;
    },
  };
})();

/** Only the variants that are actually playable; unbuilt ids from GameVariantId are absent (shadowed in the menu). */
export const VARIANTS: Partial<Record<GameVariantId, GameVariant>> = {
  rising: RisingVariant,
  random: RandomPopVariant,
  grid: GridVariant,
  gonogo: GoNoGoVariant,
  fitts: FittsVariant,
  tapping: TappingVariant,
  anticipation: AnticipationVariant,
  trails: TrailsVariant,
  stopsignal: StopSignalVariant,
  corsi: CorsiVariant,
  pursuit: PursuitVariant,
  search: SearchVariant,
};
