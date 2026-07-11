export const BUBBLE_PALETTE = [
  '#3ee6d6', // cyan
  '#ff5da2', // pink/magenta
  '#ffb545', // amber
  '#9c6bff', // violet
  '#5ee87a', // emerald
  '#ff7a5c', // coral
] as const;

export function pickColor(seed: number): string {
  return BUBBLE_PALETTE[seed % BUBBLE_PALETTE.length];
}

/** Draws the subtle deco/future background: a faint horizon grid + vignette. Cheap: static-ish, drawn every frame but all primitive fills. */
export function drawBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, invert: boolean): void {
  ctx.fillStyle = invert ? '#f5f3ee' : '#07070b';
  ctx.fillRect(0, 0, w, h);

  const lineColor = invert ? 'rgba(20,20,30,0.06)' : 'rgba(120,200,255,0.055)';
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1;

  const horizon = h * 0.62;
  const spacing = 46;
  const drift = (t / 4000) % spacing;
  ctx.beginPath();
  for (let x = -spacing; x <= w + spacing; x += spacing) {
    const xx = x + drift;
    ctx.moveTo(xx, horizon);
    ctx.lineTo(w / 2 + (xx - w / 2) * 2.6, h);
  }
  for (let i = 0; i < 7; i++) {
    const y = horizon + (h - horizon) * (i / 7) ** 1.6;
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();

  const grad = ctx.createRadialGradient(w / 2, h * 0.35, h * 0.1, w / 2, h * 0.35, h * 0.9);
  grad.addColorStop(0, invert ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,0)');
  grad.addColorStop(1, invert ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.55)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

export interface BubbleVisual {
  x: number;
  y: number;
  radius: number;
  color: string;
  scale: number; // 0..1 growth or pop scale
  glow: number; // 0..1 glow intensity
  ringProgress?: number; // 0..1 lifetime countdown ring
  highContrast: boolean;
}

export function drawBubble(ctx: CanvasRenderingContext2D, b: BubbleVisual): void {
  const r = b.radius * b.scale;
  if (r <= 0.5) return;

  ctx.save();
  ctx.translate(b.x, b.y);

  if (b.glow > 0) {
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 22 * b.glow;
  }

  const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.18, b.color);
  grad.addColorStop(1, shade(b.color, -0.25));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  if (b.highContrast) {
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  if (b.ringProgress !== undefined) {
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, r + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * b.ringProgress);
    ctx.stroke();
  }

  ctx.restore();
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 0xff;
  let g = (n >> 8) & 0xff;
  let bl = n & 0xff;
  r = Math.max(0, Math.min(255, Math.round(r + 255 * amt)));
  g = Math.max(0, Math.min(255, Math.round(g + 255 * amt)));
  bl = Math.max(0, Math.min(255, Math.round(bl + 255 * amt)));
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}
