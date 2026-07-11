export type TickFn = (dtMs: number, now: number) => void;

/**
 * Minimal fixed-callback rAF loop. Rendering and measurement never share a call
 * stack frame with pointerdown handling: the loop only drains queues that were
 * filled asynchronously by input listeners.
 */
export class GameLoop {
  private rafId: number | null = null;
  private last = 0;
  private onTick: TickFn;
  private running = false;

  constructor(onTick: TickFn) {
    this.onTick = onTick;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const step = (now: number) => {
      if (!this.running) return;
      const dt = now - this.last;
      this.last = now;
      this.onTick(dt, now);
      this.rafId = requestAnimationFrame(step);
    };
    this.rafId = requestAnimationFrame(step);
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  get isRunning(): boolean {
    return this.running;
  }
}
