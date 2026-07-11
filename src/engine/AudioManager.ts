/**
 * All sound is synthesized on the fly with the Web Audio API — no network
 * asset to fetch, decode or license, and effectively zero latency once the
 * AudioContext is warmed up on the first user gesture.
 *
 * The pop is built from two layers: a short band-passed noise burst (the
 * "click" transient that makes it read as a physical pop) plus a triangle
 * pluck whose pitch drops fast (the tonal body).
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private enabled = true;
  private volume = 0.6;

  setEnabled(v: boolean): void {
    this.enabled = v;
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
    }
  }

  /** Call from a user gesture (e.g. the splash screen's Start button). */
  warmUp(): void {
    // iOS mutes Web Audio (unlike media elements) while the ring/silent
    // switch is on. Opting the page into the "playback" audio session
    // category (iOS 17+) makes the game audible regardless of the switch,
    // like a video app.
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'playback';

    if (this.ctx) {
      this.ensureRunning();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);

    // 60 ms of white noise, reused for every click transient.
    const len = Math.floor(this.ctx.sampleRate * 0.06);
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.ensureRunning();
  }

  /** Browsers may (re)suspend the context outside our control — resume whenever we're about to play. WebKit can also leave it in a non-standard 'interrupted' state (phone call, backgrounding), so check for anything other than 'running'. */
  ensureRunning(): void {
    if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume();
  }

  private get ready(): boolean {
    if (!this.enabled || !this.ctx || !this.master) return false;
    this.ensureRunning();
    return true;
  }

  /** Satisfying bubble pop: click transient + pitch-dropping pluck. */
  playPop(pitchVariance = 0): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const master = this.master!;
    const now = ctx.currentTime;

    // Layer 1: click transient — band-passed noise burst, very short.
    if (this.noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2400 + pitchVariance * 8;
      bp.Q.value = 1.1;
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.9, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      noise.connect(bp).connect(nGain).connect(master);
      noise.start(now);
      noise.stop(now + 0.06);
    }

    // Layer 2: tonal body — triangle pluck with fast pitch drop.
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const base = 620 + pitchVariance;
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(80, base * 0.32), now + 0.1);
    gain.gain.setValueAtTime(0.85, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(gain).connect(master);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  /** Low dull thud for misses / false alarms. */
  playMiss(): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.15);
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain).connect(this.master!);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  /** Bright ascending chime for a new high score. */
  playFanfare(): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((f, i) => {
      const now = ctx.currentTime + i * 0.09;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now);
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain).connect(this.master!);
      osc.start(now);
      osc.stop(now + 0.26);
    });
  }
}
