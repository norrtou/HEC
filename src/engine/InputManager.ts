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
  /** latest pointer position in raw client coords — mapped to element space lazily in position() */
  private lastClient: { x: number; y: number; t: number } | null = null;

  constructor(el: HTMLElement) {
    this.el = el;
    this.handleDown = this.handleDown.bind(this);
    this.handleMove = this.handleMove.bind(this);
    this.handleEnd = this.handleEnd.bind(this);
    this.handleLeave = this.handleLeave.bind(this);
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.el.addEventListener('pointerdown', this.handleDown, { passive: true });
    this.el.addEventListener('pointermove', this.handleMove, { passive: true });
    this.el.addEventListener('pointerup', this.handleEnd, { passive: true });
    this.el.addEventListener('pointercancel', this.handleEnd, { passive: true });
    this.el.addEventListener('pointerleave', this.handleLeave, { passive: true });
  }

  stop(): void {
    this.active = false;
    this.el.removeEventListener('pointerdown', this.handleDown);
    this.el.removeEventListener('pointermove', this.handleMove);
    this.el.removeEventListener('pointerup', this.handleEnd);
    this.el.removeEventListener('pointercancel', this.handleEnd);
    this.el.removeEventListener('pointerleave', this.handleLeave);
    this.lastClient = null;
  }

  onSample(fn: Listener): void {
    this.listeners.push(fn);
  }

  private handleDown(e: PointerEvent): void {
    const t = performance.now(); // captured first, before anything else
    this.lastClient = { x: e.clientX, y: e.clientY, t };
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

  // The move/end handlers stay as cheap as the down handler: store raw client
  // coords only; the element-space mapping happens once per frame in position().
  private handleMove(e: PointerEvent): void {
    this.lastClient = { x: e.clientX, y: e.clientY, t: performance.now() };
  }

  private handleEnd(e: PointerEvent): void {
    // A lifted finger/pen has no position; a mouse cursor stays where it is.
    if (e.pointerType !== 'mouse') this.lastClient = null;
  }

  private handleLeave(): void {
    this.lastClient = null;
  }

  /** Latest pointer position in element coordinates (null when no finger is down / cursor left). Sampled per frame by tracking variants. */
  position(): { x: number; y: number; t: number } | null {
    if (!this.lastClient) return null;
    const rect = this.el.getBoundingClientRect();
    return { x: this.lastClient.x - rect.left, y: this.lastClient.y - rect.top, t: this.lastClient.t };
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
