interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; // 0..1 remaining
  maxLifeMs: number;
  age: number;
  color: string;
  size: number;
}

/** Small pooled particle burst for the "satisfying pop" feedback. */
export class ParticleSystem {
  private particles: Particle[] = [];
  private pool: Particle[] = [];
  private reduceMotion = false;

  setReduceMotion(v: boolean): void {
    this.reduceMotion = v;
  }

  burst(x: number, y: number, color: string, count = 14): void {
    if (this.reduceMotion) count = Math.min(count, 4);
    for (let i = 0; i < count; i++) {
      const p = this.pool.pop() ?? ({} as Particle);
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const speed = 90 + Math.random() * 140;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.age = 0;
      p.maxLifeMs = 350 + Math.random() * 200;
      p.life = 1;
      p.color = color;
      p.size = 2 + Math.random() * 3;
      this.particles.push(p);
    }
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dtMs;
      p.life = 1 - p.age / p.maxLifeMs;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        this.pool.push(p);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 260 * dt; // gentle gravity
      p.vx *= 0.98;
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  get count(): number {
    return this.particles.length;
  }
}
