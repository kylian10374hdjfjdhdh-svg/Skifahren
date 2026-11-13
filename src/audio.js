// Prozeduraler Sound (Web Audio) – keine Dateien nötig.
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (this.ctx) return this.resume();
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    } catch (e) {
      return;
    }
    const ctx = this.ctx;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(ctx.destination);

    const loop = (type, freq, q) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f);
      f.connect(g);
      g.connect(this.master);
      src.start();
      return { f, g };
    };
    this.wind = loop('bandpass', 500, 0.6);
    this.carve = loop('bandpass', 2600, 1.1);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.8;
    return this.muted;
  }

  update(speed, carve, grounded, active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = Math.min(1, speed / 60);
    this.wind.g.gain.setTargetAtTime(active ? 0.05 + s * 0.4 : 0, t, 0.12);
    this.wind.f.frequency.setTargetAtTime(350 + s * 1700, t, 0.12);
    this.carve.g.gain.setTargetAtTime(active && grounded ? carve * s * 0.35 : 0, t, 0.06);
    this.carve.f.frequency.setTargetAtTime(2000 + s * 2500, t, 0.1);
  }

  burst(freq, dur, gain, type = 'lowpass') {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(0, Math.random());
    src.stop(ctx.currentTime + dur + 0.05);
  }

  tone(freq, dur, gain, type = 'sine', slide = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g);
    g.connect(this.master);
    o.start();
    o.stop(ctx.currentTime + dur + 0.05);
  }

  land(power) {
    this.burst(500 + power * 40, 0.25, Math.min(0.9, 0.2 + power * 0.04));
  }
  jump() {
    this.burst(1800, 0.12, 0.15, 'highpass');
  }
  crash() {
    this.burst(260, 0.7, 0.9);
    this.tone(120, 0.5, 0.35, 'sawtooth', 0.4);
  }
  trick(level) {
    const base = 520 + level * 90;
    this.tone(base, 0.18, 0.18, 'triangle');
    setTimeout(() => this.tone(base * 1.5, 0.28, 0.18, 'triangle'), 90);
  }
  close() {
    this.tone(900, 0.12, 0.12, 'square', 1.6);
  }
  gate(level) {
    const b = 600 + Math.min(6, level) * 70;
    this.tone(b, 0.12, 0.2, 'sawtooth', 1.5);
    setTimeout(() => this.tone(b * 2, 0.3, 0.16, 'triangle'), 70);
    this.burst(2400, 0.25, 0.12, 'highpass');
  }
  start() {
    this.tone(330, 0.15, 0.2, 'triangle');
    setTimeout(() => this.tone(660, 0.25, 0.2, 'triangle'), 110);
  }
}
