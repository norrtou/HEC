import type { GameVariantId } from '../types';

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
}

export interface PlayArea {
  w: number;
  h: number;
  marginPx: number;
  topSafeMarginPx: number; // keep clear of the discreet top pill
}

export interface GameVariant {
  id: GameVariantId;
  /** Pick where the next target should appear. */
  nextSpawn(area: PlayArea, radius: number, seq: number): SpawnPoint;
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
};
