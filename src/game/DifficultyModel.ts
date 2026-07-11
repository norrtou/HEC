import type { DifficultyParams } from '../types';

/** Starting points for the sliders — never a hard cap. Every field stays freely adjustable in Settings. */
export const DIFFICULTY_PRESETS: Record<'calm' | 'standard' | 'fast', DifficultyParams> = {
  calm: {
    spawnIntervalMs: 1100,
    targetLifetimeMs: 2200,
    targetRadiusPx: 54,
    maxConcurrent: 2,
    speedPxPerSec: 90,
  },
  standard: {
    spawnIntervalMs: 800,
    targetLifetimeMs: 1500,
    targetRadiusPx: 42,
    maxConcurrent: 3,
    speedPxPerSec: 140,
  },
  fast: {
    spawnIntervalMs: 520,
    targetLifetimeMs: 1000,
    targetRadiusPx: 32,
    maxConcurrent: 4,
    speedPxPerSec: 210,
  },
};

export const DIFFICULTY_LIMITS: Record<keyof DifficultyParams, { min: number; max: number; step: number }> = {
  spawnIntervalMs: { min: 200, max: 2500, step: 20 },
  targetLifetimeMs: { min: 500, max: 4000, step: 50 },
  targetRadiusPx: { min: 18, max: 90, step: 1 },
  maxConcurrent: { min: 1, max: 8, step: 1 },
  speedPxPerSec: { min: 40, max: 400, step: 5 },
};

export function clampDifficulty(d: DifficultyParams): DifficultyParams {
  const out = { ...d };
  for (const key of Object.keys(DIFFICULTY_LIMITS) as (keyof DifficultyParams)[]) {
    const { min, max } = DIFFICULTY_LIMITS[key];
    out[key] = Math.min(max, Math.max(min, out[key]));
  }
  return out;
}
