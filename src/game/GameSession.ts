import type { DifficultyParams, FalseAlarm, MotorSettings, PointerKind, RawPointerSample, TrialRecord } from '../types';
import { Bubble } from './Bubble';
import type { GameVariant, PlayArea } from './Variant';
import { pickColor } from '../engine/Renderer';
import { ParticleSystem } from '../engine/ParticleSystem';
import { AudioManager } from '../engine/AudioManager';
import { Haptics } from '../engine/Haptics';

const GROW_MS = 80;
const POP_MS = 150;
const EXPIRE_FADE_MS = 160;

export interface GameSessionCallbacks {
  onScoreChange?(score: number, delta: number): void;
  onHighScore?(score: number): void;
  onTrial?(trial: TrialRecord): void;
}

export class GameSession {
  bubbles: Bubble[] = [];
  trials: TrialRecord[] = [];
  falseAlarms: FalseAlarm[] = [];
  pointerTypesUsed = new Set<PointerKind>();
  score = 0;
  highScore = 0;
  startedAt = performance.now();

  private lastSpawnTime = 0;
  private seq = 0;
  private colorSeq = 0;
  private acceptedTaps: { x: number; y: number; t: number }[] = [];
  private areaW = 1;
  private areaH = 1;

  private variant: GameVariant;
  private difficulty: DifficultyParams;
  private motor: MotorSettings;
  private particles: ParticleSystem;
  private audio: AudioManager;
  private haptics: Haptics;
  private callbacks: GameSessionCallbacks;

  constructor(
    variant: GameVariant,
    difficulty: DifficultyParams,
    motor: MotorSettings,
    particles: ParticleSystem,
    audio: AudioManager,
    haptics: Haptics,
    callbacks: GameSessionCallbacks = {},
    highScore = 0,
  ) {
    this.variant = variant;
    this.difficulty = difficulty;
    this.motor = motor;
    this.particles = particles;
    this.audio = audio;
    this.haptics = haptics;
    this.callbacks = callbacks;
    this.highScore = highScore;
  }

  setDifficulty(d: DifficultyParams): void {
    this.difficulty = d;
  }

  setMotor(m: MotorSettings): void {
    this.motor = m;
  }

  private playArea(w: number, h: number): PlayArea {
    return { w, h, marginPx: this.difficulty.targetRadiusPx + 8, topSafeMarginPx: 72 };
  }

  private trySpawn(now: number, w: number, h: number): void {
    if (this.bubbles.length >= this.difficulty.maxConcurrent) return;
    if (now - this.lastSpawnTime < this.difficulty.spawnIntervalMs) return;
    this.lastSpawnTime = now;
    const area = this.playArea(w, h);
    const point = this.variant.nextSpawn(area, this.difficulty.targetRadiusPx, this.seq++);
    // Moving bubbles live until they traverse the screen (out-of-bounds counts
    // as the miss); only stationary ones use the fixed lifetime timer.
    const r = this.difficulty.targetRadiusPx;
    const lifetimeMs =
      point.vy !== 0
        ? ((point.y - area.topSafeMarginPx + r * 2) / this.difficulty.speedPxPerSec) * 1000 + 500
        : this.difficulty.targetLifetimeMs;
    const b = new Bubble(point.x, point.y, r, pickColor(this.colorSeq++), now, lifetimeMs);
    b.vy = point.vy * this.difficulty.speedPxPerSec;
    this.bubbles.push(b);
  }

  /** Advance animation states + spawn/expire logic. Called every frame. */
  update(dtMs: number, now: number, w: number, h: number): void {
    this.areaW = w;
    this.areaH = h;
    this.trySpawn(now, w, h);
    const area = this.playArea(w, h);

    for (const b of this.bubbles) {
      const age = now - b.stateStart;
      switch (b.state) {
        case 'growing':
          b.scale = Math.min(1, age / GROW_MS);
          if (age >= GROW_MS) {
            b.state = 'alive';
            b.stateStart = now;
          }
          break;
        case 'alive': {
          b.y += b.vy * (dtMs / 1000);
          b.scale = 1 + Math.sin(now / 260 + b.id) * 0.02;
          const expiredByTime = now - b.spawnTime >= b.lifetimeMs;
          const expiredByBounds = this.variant.isOutOfBounds(b.x, b.y, b.radius, area);
          if (expiredByTime || expiredByBounds) {
            this.resolveMiss(b, now);
          }
          break;
        }
        case 'popping':
          b.scale = 1 + 0.3 * (1 - age / POP_MS);
          if (age >= POP_MS) b.state = 'dead';
          break;
        case 'expiring':
          b.scale = Math.max(0, 1 - age / EXPIRE_FADE_MS);
          if (age >= EXPIRE_FADE_MS) b.state = 'dead';
          break;
      }
    }

    this.bubbles = this.bubbles.filter((b) => b.state !== 'dead');
    this.particles.update(dtMs);
  }

  /** Process pointerdown samples captured earlier by the InputManager. Hit-testing (the "expensive" step) happens here, decoupled from the raw event. */
  processSamples(samples: RawPointerSample[]): void {
    for (const s of samples) {
      this.pointerTypesUsed.add(s.pointerType);

      if (this.motor.tremorFilterEnabled && this.isFilteredAsTremor(s)) continue;

      const candidate = this.findHitCandidate(s.x, s.y);
      if (candidate) {
        this.acceptTap(s.x, s.y, s.t);
        this.resolveHit(candidate, s);
      } else {
        this.acceptTap(s.x, s.y, s.t);
        this.falseAlarms.push({ t: s.t, x: s.x, y: s.y, pointerType: s.pointerType });
      }
    }
  }

  private isFilteredAsTremor(s: RawPointerSample): boolean {
    const win = this.motor.tremorFilterWindowMs;
    const rad = this.motor.tremorFilterRadiusPx;
    for (let i = this.acceptedTaps.length - 1; i >= 0; i--) {
      const t = this.acceptedTaps[i];
      if (s.t - t.t > win) break;
      const dx = s.x - t.x;
      const dy = s.y - t.y;
      if (Math.sqrt(dx * dx + dy * dy) <= rad) return true;
    }
    return false;
  }

  private acceptTap(x: number, y: number, t: number): void {
    this.acceptedTaps.push({ x, y, t });
    if (this.acceptedTaps.length > 20) this.acceptedTaps.shift();
  }

  private findHitCandidate(x: number, y: number): Bubble | null {
    let best: Bubble | null = null;
    let bestDist = Infinity;
    for (const b of this.bubbles) {
      if (!b.hitTest(x, y, this.motor.hitboxPaddingPx)) continue;
      const dx = x - b.x;
      const dy = y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDist) {
        bestDist = dist;
        best = b;
      }
    }
    return best;
  }

  private resolveHit(b: Bubble, s: RawPointerSample): void {
    b.state = 'popping';
    b.stateStart = s.t;
    const reactionTimeMs = s.t - b.spawnTime;
    const errorPx = Math.sqrt((s.x - b.x) ** 2 + (s.y - b.y) ** 2);

    this.particles.burst(b.x, b.y, b.color);
    this.audio.playPop((Math.random() - 0.5) * 80);
    this.haptics.pop();

    const speedBonus = Math.max(0, Math.round(50 * (1 - reactionTimeMs / b.lifetimeMs)));
    const delta = 100 + speedBonus;
    this.score += delta;
    this.callbacks.onScoreChange?.(this.score, delta);
    if (this.score > this.highScore) {
      this.highScore = this.score;
      this.callbacks.onHighScore?.(this.score);
    }

    const trial: TrialRecord = {
      id: this.trials.length + 1,
      variant: this.variant.id,
      spawnTime: b.spawnTime,
      resolvedTime: s.t,
      targetX: b.x,
      targetY: b.y,
      targetRadiusPx: b.radius,
      hitX: s.x,
      hitY: s.y,
      result: 'hit',
      reactionTimeMs,
      errorPx,
      pointerType: s.pointerType,
      zone: b.zoneOf(this.areaW, this.areaH),
    };
    this.trials.push(trial);
    this.callbacks.onTrial?.(trial);
  }

  private resolveMiss(b: Bubble, now: number): void {
    b.state = 'expiring';
    b.stateStart = now;
    this.audio.playMiss();
    this.haptics.miss();

    const trial: TrialRecord = {
      id: this.trials.length + 1,
      variant: this.variant.id,
      spawnTime: b.spawnTime,
      resolvedTime: now,
      targetX: b.x,
      targetY: b.y,
      targetRadiusPx: b.radius,
      hitX: null,
      hitY: null,
      result: 'miss',
      reactionTimeMs: null,
      errorPx: null,
      pointerType: 'unknown',
      zone: b.zoneOf(this.areaW, this.areaH),
    };
    this.trials.push(trial);
    this.callbacks.onTrial?.(trial);
  }

  elapsedMs(now: number): number {
    return now - this.startedAt;
  }
}
