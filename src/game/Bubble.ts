import type { ScreenZone } from '../types';

export type BubbleState = 'growing' | 'alive' | 'popping' | 'expiring' | 'dead';

let nextId = 1;

export class Bubble {
  readonly id: number;
  x: number;
  y: number;
  readonly radius: number;
  readonly color: string;
  readonly spawnTime: number;
  readonly lifetimeMs: number;
  vy = 0; // used by rising variant, px/s
  /** no-go target (Go/No-Go variant): tapping it counts as a commission error */
  distractor = false;

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
