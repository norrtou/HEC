import type { ScreenZone } from '../types';

export type BubbleState = 'growing' | 'alive' | 'popping' | 'expiring' | 'dead';

let nextId = 1;

export class Bubble {
  readonly id: number;
  x: number;
  y: number;
  readonly radius: number;
  /** mutable: the stop-signal variant recolors the bubble when the signal fires */
  color: string;
  readonly spawnTime: number;
  readonly lifetimeMs: number;
  vy = 0; // used by rising variant, px/s
  /** no-go target (Go/No-Go variant): tapping it counts as a commission error */
  distractor = false;
  /** text drawn on the bubble (Trail Making) */
  label?: string;
  /** position in an ordered sequence (Trail Making) */
  order?: number;
  /** wave metadata for per-wave stats (Trail Making) */
  wave?: number;
  waveKind?: 'A' | 'B';
  /** stop-signal variant: absolute time when this target turns no-go, and the delay used */
  stopAtMs?: number;
  ssdMs?: number;
  /** glow boost until this timestamp (Corsi presentation flash) */
  highlightUntil = 0;

  state: BubbleState = 'growing';
  stateStart: number;
  scale = 0;

  constructor(x: number, y: number, radius: number, color: string, spawnTime: number, lifetimeMs: number) {
    this.id = nextId++;
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.color = color;
    this.spawnTime = spawnTime;
    this.lifetimeMs = lifetimeMs;
    this.stateStart = spawnTime;
  }

  hitTest(px: number, py: number, extraPadding: number): boolean {
    if (this.state !== 'alive' && this.state !== 'growing') return false;
    const dx = px - this.x;
    const dy = py - this.y;
    return Math.sqrt(dx * dx + dy * dy) <= this.radius + extraPadding;
  }

  zoneOf(w: number, h: number): ScreenZone {
    const col = this.x < w / 3 ? 'left' : this.x < (2 * w) / 3 ? 'center' : 'right';
    const row = this.y < h / 3 ? 'top' : this.y < (2 * h) / 3 ? 'mid' : 'bottom';
    return `${row}-${col}` as ScreenZone;
  }
}
