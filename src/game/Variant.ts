import type { GameVariantId } from '../types';

export interface SpawnPoint {
  x: number;
  y: number;
  vy: number; // px/s, signed (negative = upward)
  /** no-go target: tapping it is an inhibition failure (Go/No-Go variant) */
  distractor?: boolean;
  /** fixed color override; default is the cycling palette */
  color?: string;
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

/** Only the variants that are actually playable; unbuilt ids from GameVariantId are absent (shadowed in the menu). */
export const VARIANTS: Partial<Record<GameVariantId, GameVariant>> = {
  rising: RisingVariant,
  random: RandomPopVariant,
  grid: GridVariant,
  gonogo: GoNoGoVariant,
};
