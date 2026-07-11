// Shared types for HEC (Hand-Eye Coordination)

export type GameVariantId = 'rising' | 'random' | 'grid';

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
}

export type TrialResult = 'hit' | 'miss';

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
  highScore: number;
}
