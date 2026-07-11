// Shared types for HEC (Hand-Eye Coordination)

export type GameVariantId =
  | 'rising' | 'random' | 'grid'
  // Planned variants — listed (shadowed) in the menu before they are built:
  | 'gonogo' | 'fitts' | 'tapping' | 'anticipation'
  | 'trails' | 'stopsignal' | 'corsi' | 'pursuit';

export type PointerKind = 'mouse' | 'touch' | 'pen' | 'unknown';

export type ScreenZone =
  | 'top-left' | 'top-center' | 'top-right'
  | 'mid-left' | 'mid-center' | 'mid-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

export interface DifficultyParams {
  /** ms between target spawns */
  spawnIntervalMs: number;
  /** ms a target survives before it's counted as a miss */
  targetLifetimeMs: number;
  /** target radius in CSS px */
  targetRadiusPx: number;
  /** how many targets may be alive at once */
  maxConcurrent: number;
  /** rise speed in px/s (rising variant) or path speed (grid dwell etc.) */
  speedPxPerSec: number;
}

export interface AccessibilitySettings {
  invertColors: boolean;
  uiScale: number; // 0.8 - 1.6
  reduceMotion: boolean;
  highContrastTargets: boolean;
  fontScale: number; // 0.9 - 1.4
}

export interface MotorSettings {
  /** extra invisible hit radius added on top of visual target radius */
  hitboxPaddingPx: number;
  /** ignore additional pointer-down events within this radius of an already-registered tap */
  tremorFilterEnabled: boolean;
  tremorFilterRadiusPx: number;
  tremorFilterWindowMs: number;
}

export interface AudioHapticSettings {
  soundEnabled: boolean;
  soundVolume: number; // 0-1
  hapticsEnabled: boolean;
}

export interface CalibrationSettings {
  /** measured px per mm; null = use 96dpi CSS-px assumption */
  pxPerMm: number | null;
}

export interface Settings {
  accessibility: AccessibilitySettings;
  motor: MotorSettings;
  audio: AudioHapticSettings;
  calibration: CalibrationSettings;
  difficulty: DifficultyParams;
  variant: GameVariantId;
  /** seconds; a round ends automatically when this elapses */
  roundDurationSec: number;
  language: 'auto' | 'sv' | 'en';
}

/**
 * Go-targets resolve as hit/miss. No-go targets (Go/No-Go variant) resolve as
 * commission (tapped when they should have been left) or rejection (correctly
 * left alone until they expired).
 */
export type TrialResult = 'hit' | 'miss' | 'commission' | 'rejection';

export interface FalseAlarm {
  t: number;
  x: number;
  y: number;
  pointerType: PointerKind;
}

export interface TrialRecord {
  id: number;
  variant: GameVariantId;
  spawnTime: number; // performance.now()
  resolvedTime: number; // performance.now() when hit or expired
  targetX: number;
  targetY: number;
  targetRadiusPx: number;
  hitX: number | null;
  hitY: number | null;
  result: TrialResult;
  reactionTimeMs: number | null; // null for miss
  errorPx: number | null; // distance from target center to hit point
  pointerType: PointerKind;
  zone: ScreenZone;
  /** Anticipation variant: signed ms relative to the gate crossing (− early, + late). */
  timingErrorMs?: number | null;
  /** Trail Making variant: which wave/step this target was, and the wave type. */
  trailStep?: { wave: number; step: number; kind: 'A' | 'B' };
}

/** A raw, cheap-to-capture sample pushed onto the measurement queue immediately on pointerdown. */
export interface RawPointerSample {
  t: number; // performance.now(), captured synchronously in the event handler
  x: number;
  y: number;
  pointerType: PointerKind;
  coalesced: { x: number; y: number; t: number }[];
}

export interface SessionMeta {
  startedAt: string; // ISO date
  variant: GameVariantId;
  durationMs: number;
  userAgent: string;
  language: string;
  timeZone: string;
  screenW: number;
  screenH: number;
  devicePixelRatio: number;
  hardwareConcurrency: number | null;
  deviceMemoryGb: number | null;
  pointerTypesUsed: PointerKind[];
  pxPerMm: number;
  pxPerMmCalibrated: boolean;
}

export interface SessionStats {
  meta: SessionMeta;
  trials: TrialRecord[];
  falseAlarmCount: number;
  count: number;
  hitCount: number;
  missCount: number;
  hitRatePct: number;
  falseAlarmRatePct: number;
  meanReactionMs: number | null;
  medianReactionMs: number | null;
  sdReactionMs: number | null;
  bestReactionMs: number | null;
  meanErrorPx: number | null;
  meanErrorMm: number | null;
  rangeOfMotionMm: { w: number; h: number } | null;
  zoneStats: Record<ScreenZone, { count: number; hits: number; meanErrorPx: number | null; meanRtMs: number | null }>;
  directionalBias: {
    leftMissRatePct: number;
    rightMissRatePct: number;
    topMissRatePct: number;
    bottomMissRatePct: number;
  };
  /** Present only for the Trail Making variant. */
  trails?: {
    wavesCompleted: number;
    /** mean tap-to-tap time within numbers-only waves (TMT-A analogue) */
    meanLinkAMs: number | null;
    /** mean tap-to-tap time within alternating waves (TMT-B analogue) */
    meanLinkBMs: number | null;
    /** B − A: the set-switching cost, isolating cognitive flexibility */
    flexibilityCostMs: number | null;
    sequenceErrors: number;
  };
  /** Present only for the anticipation timing variant. Classic coincidence-anticipation measures. */
  anticipation?: {
    count: number;
    /** absolute error — overall timing accuracy */
    meanAbsErrMs: number | null;
    /** constant error — systematic bias (negative = early, positive = late) */
    constantErrMs: number | null;
    /** variable error (SD of signed error) — timing consistency */
    variableErrMs: number | null;
  };
  /** Present only for the finger tapping variant. */
  tapping?: {
    tapCount: number;
    tapsPerSec: number | null;
    meanItiMs: number | null;
    /** SD of the inter-tap interval — rhythm consistency */
    sdItiMs: number | null;
  };
  /** Present only for the Fitts tapping variant. */
  fitts?: {
    /** trials with a valid movement (previous tap → hit), i.e. consecutive hits */
    sequenceCount: number;
    /** ISO 9241-9-style throughput: mean over conditions of meanID / meanMT */
    throughputBps: number | null;
    meanMtMs: number | null;
    meanIdBits: number | null;
  };
  /** Present only for the Go/No-Go variant. */
  gonogo?: {
    goCount: number;
    noGoCount: number;
    commissionCount: number;
    /** commissions / no-go targets — the response-inhibition failure rate */
    commissionRatePct: number;
    /** mean RT of failed inhibitions; typically faster than go-RT */
    meanCommissionRtMs: number | null;
  };
  highScore: number;
}
