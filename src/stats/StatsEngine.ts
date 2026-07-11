import type {
  FalseAlarm,
  GameVariantId,
  PointerKind,
  ScreenZone,
  SessionMeta,
  SessionStats,
  TrialRecord,
} from '../types';

export const ALL_ZONES: ScreenZone[] = [
  'top-left', 'top-center', 'top-right',
  'mid-left', 'mid-center', 'mid-right',
  'bottom-left', 'bottom-center', 'bottom-right',
];

/**
 * CSS px per mm at the nominal 96 dpi that CSS assumes. Real physical size
 * varies per panel, which is why Settings offers a credit-card calibration —
 * the report marks mm values as "nominal" until the user calibrates.
 */
export const NOMINAL_PX_PER_MM = 96 / 25.4;

function mean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function stddev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs)!;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

function pct(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10;
}

export interface BuildStatsInput {
  trials: TrialRecord[];
  falseAlarms: FalseAlarm[];
  variant: GameVariantId;
  startedAtIso: string;
  durationMs: number;
  pointerTypesUsed: PointerKind[];
  pxPerMm: number | null; // calibrated value or null
  highScore: number;
}

export function buildSessionStats(input: BuildStatsInput): SessionStats {
  const { trials, falseAlarms } = input;
  const hits = trials.filter((t) => t.result === 'hit');
  const misses = trials.filter((t) => t.result === 'miss');
  // No-go trials (Go/No-Go variant); empty for every other variant.
  const commissions = trials.filter((t) => t.result === 'commission');
  const rejections = trials.filter((t) => t.result === 'rejection');
  // RT and precision describe go-responses only — commission RTs measure a
  // different thing (failed inhibition) and are reported separately.
  const rts = hits.map((t) => t.reactionTimeMs!).filter((v) => v != null);
  const errs = hits.map((t) => t.errorPx!).filter((v) => v != null);

  const pxPerMm = input.pxPerMm ?? NOMINAL_PX_PER_MM;
  const meanErrPx = mean(errs);

  // Range of motion: bounding box of all registered hit points, in mm.
  const hxs = hits.map((t) => t.hitX!).concat(commissions.map((t) => t.hitX!), falseAlarms.map((f) => f.x));
  const hys = hits.map((t) => t.hitY!).concat(commissions.map((t) => t.hitY!), falseAlarms.map((f) => f.y));
  const rom =
    hxs.length >= 2
      ? {
          w: Math.round(((Math.max(...hxs) - Math.min(...hxs)) / pxPerMm) * 10) / 10,
          h: Math.round(((Math.max(...hys) - Math.min(...hys)) / pxPerMm) * 10) / 10,
        }
      : null;

  // Zone accuracy is a go-target measure: leaving a no-go alone in a zone
  // says nothing about aiming there, so those trials are excluded.
  const goTrials = trials.filter((t) => t.result === 'hit' || t.result === 'miss');
  const zoneStats = {} as SessionStats['zoneStats'];
  for (const z of ALL_ZONES) {
    const zTrials = goTrials.filter((t) => t.zone === z);
    const zHits = zTrials.filter((t) => t.result === 'hit');
    zoneStats[z] = {
      count: zTrials.length,
      hits: zHits.length,
      meanErrorPx: mean(zHits.map((t) => t.errorPx!)),
      meanRtMs: mean(zHits.map((t) => t.reactionTimeMs!)),
    };
  }

  const missRateFor = (zs: ScreenZone[]): number => {
    const total = zs.reduce((a, z) => a + zoneStats[z].count, 0);
    const hit = zs.reduce((a, z) => a + zoneStats[z].hits, 0);
    return pct(total - hit, total);
  };

  const meta: SessionMeta = {
    startedAt: input.startedAtIso,
    variant: input.variant,
    durationMs: Math.round(input.durationMs),
    userAgent: navigator.userAgent,
    language: navigator.language,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screenW: window.screen.width,
    screenH: window.screen.height,
    devicePixelRatio: window.devicePixelRatio,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    deviceMemoryGb: (navigator as { deviceMemory?: number }).deviceMemory ?? null,
    pointerTypesUsed: input.pointerTypesUsed,
    pxPerMm: Math.round(pxPerMm * 100) / 100,
    pxPerMmCalibrated: input.pxPerMm !== null,
  };

  // Anticipation timing: classic coincidence-anticipation measures over the
  // signed gate-crossing errors — AE (accuracy), CE (bias), VE (consistency).
  let anticipation: SessionStats['anticipation'];
  if (input.variant === 'anticipation') {
    const tErrs = hits.map((t) => t.timingErrorMs).filter((v): v is number => v != null);
    const ce = mean(tErrs);
    const ae = mean(tErrs.map(Math.abs));
    const ve = stddev(tErrs);
    anticipation = {
      count: tErrs.length,
      meanAbsErrMs: ae !== null ? Math.round(ae) : null,
      constantErrMs: ce !== null ? Math.round(ce) : null,
      variableErrMs: ve !== null ? Math.round(ve) : null,
    };
  }

  // Finger tapping: tempo and rhythm from consecutive tap timestamps.
  let tapping: SessionStats['tapping'];
  if (input.variant === 'tapping') {
    const times = hits.map((t) => t.resolvedTime).sort((a, b) => a - b);
    const itis: number[] = [];
    for (let i = 1; i < times.length; i++) itis.push(times[i] - times[i - 1]);
    const durationS = input.durationMs / 1000;
    tapping = {
      tapCount: hits.length,
      tapsPerSec: durationS > 0 ? Math.round((hits.length / durationS) * 100) / 100 : null,
      meanItiMs: mean(itis) !== null ? Math.round(mean(itis)!) : null,
      sdItiMs: stddev(itis) !== null ? Math.round(stddev(itis)!) : null,
    };
  }

  const noGoCount = commissions.length + rejections.length;
  const commissionRts = commissions.map((t) => t.reactionTimeMs!).filter((v) => v != null);
  const meanCommissionRt = mean(commissionRts);

  // Fitts throughput, derived from consecutive hits: the variant spawns each
  // target at an exact distance A from the previous tap point, so A can be
  // recovered as dist(previous hit → target center) and MT as the inter-tap
  // interval. Trials after a miss (or the first of a round) have no defined
  // start point and are excluded, per ISO 9241-9 practice.
  let fitts: SessionStats['fitts'];
  if (input.variant === 'fitts') {
    const byCondition = new Map<string, { ids: number[]; mts: number[] }>();
    const allIds: number[] = [];
    const allMts: number[] = [];
    for (let i = 1; i < trials.length; i++) {
      const prev = trials[i - 1];
      const cur = trials[i];
      if (prev.result !== 'hit' || cur.result !== 'hit' || prev.hitX === null || prev.hitY === null) continue;
      const a = Math.hypot(cur.targetX - prev.hitX, cur.targetY - prev.hitY);
      const w = cur.targetRadiusPx * 2;
      const mt = cur.resolvedTime - prev.resolvedTime;
      if (mt <= 0 || w <= 0) continue;
      const id = Math.log2(a / w + 1);
      const key = `${Math.round(a)}:${Math.round(w)}`;
      const cond = byCondition.get(key) ?? { ids: [], mts: [] };
      cond.ids.push(id);
      cond.mts.push(mt);
      byCondition.set(key, cond);
      allIds.push(id);
      allMts.push(mt);
    }
    const conditionTps = [...byCondition.values()].map((c) => mean(c.ids)! / (mean(c.mts)! / 1000));
    const tp = mean(conditionTps);
    fitts = {
      sequenceCount: allMts.length,
      throughputBps: tp !== null ? Math.round(tp * 100) / 100 : null,
      meanMtMs: mean(allMts) !== null ? Math.round(mean(allMts)!) : null,
      meanIdBits: mean(allIds) !== null ? Math.round(mean(allIds)! * 100) / 100 : null,
    };
  }

  return {
    meta,
    trials,
    falseAlarmCount: falseAlarms.length,
    count: goTrials.length,
    hitCount: hits.length,
    missCount: misses.length,
    hitRatePct: pct(hits.length, goTrials.length),
    falseAlarmRatePct: pct(falseAlarms.length, hits.length + falseAlarms.length),
    meanReactionMs: mean(rts) !== null ? Math.round(mean(rts)!) : null,
    medianReactionMs: median(rts) !== null ? Math.round(median(rts)!) : null,
    sdReactionMs: stddev(rts) !== null ? Math.round(stddev(rts)!) : null,
    bestReactionMs: rts.length ? Math.round(Math.min(...rts)) : null,
    meanErrorPx: meanErrPx !== null ? Math.round(meanErrPx * 10) / 10 : null,
    meanErrorMm: meanErrPx !== null ? Math.round((meanErrPx / pxPerMm) * 100) / 100 : null,
    rangeOfMotionMm: rom,
    zoneStats,
    directionalBias: {
      leftMissRatePct: missRateFor(['top-left', 'mid-left', 'bottom-left']),
      rightMissRatePct: missRateFor(['top-right', 'mid-right', 'bottom-right']),
      topMissRatePct: missRateFor(['top-left', 'top-center', 'top-right']),
      bottomMissRatePct: missRateFor(['bottom-left', 'bottom-center', 'bottom-right']),
    },
    anticipation,
    tapping,
    fitts,
    gonogo:
      input.variant === 'gonogo'
        ? {
            goCount: goTrials.length,
            noGoCount,
            commissionCount: commissions.length,
            commissionRatePct: pct(commissions.length, noGoCount),
            meanCommissionRtMs: meanCommissionRt !== null ? Math.round(meanCommissionRt) : null,
          }
        : undefined,
    highScore: input.highScore,
  };
}
