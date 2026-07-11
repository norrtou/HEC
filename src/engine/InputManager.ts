import type { PointerKind, RawPointerSample } from '../types';

type Listener = (sample: RawPointerSample) => void;

function kindOf(e: PointerEvent): PointerKind {
  if (e.pointerType === 'mouse' || e.pointerType === 'touch' || e.pointerType === 'pen') return e.pointerType;
  return 'unknown';
}

/**
 * Captures pointerdown as a raw, timestamped sample with zero processing.
 * The handler does the absolute minimum: read performance.now() and coordinates,
 * push to an internal queue, return. Nothing that could cost more than a
 * fraction of a millisecond runs here — hit-testing, animation and stats all
 * happen later when the queue is drained from the game loop.
 */
export class InputManager {
  private queue: RawPointerSample[] = [];
  private listeners: Listener[] = [];
  private el: HTMLElement;
  private active = false;

  constructor(el: HTMLElement) {
    this.el = el;
    this.handleDown = this.handleDown.bind(this);
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.el.addEventListener('pointerdown', this.handleDown, { passive: true });
  }

  stop(): void {
    this.active = false;
    this.el.removeEventListener('pointerdown', this.handleDown);
  }

  onSample(fn: Listener): void {
    this.listeners.push(fn);
  }

  private handleDown(e: PointerEvent): void {
    const t = performance.now(); // captured first, before anything else
    const rect = this.el.getBoundingClientRect();
    const coalesced =
      typeof e.getCoalescedEvents === 'function'
        ? e.getCoalescedEvents().map((c) => ({ x: c.clientX - rect.left, y: c.clientY - rect.top, t: c.timeStamp }))
        : [];
    this.queue.push({
      t,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pointerType: kindOf(e),
      coalesced,
    });
  }

  /** Drain everything captured since the last drain. Called once per frame from the game loop. */
  drain(): RawPointerSample[] {
    if (this.queue.length === 0) return [];
    const batch = this.queue;
    this.queue = [];
    for (const l of this.listeners) for (const s of batch) l(s);
    return batch;
  }
}
