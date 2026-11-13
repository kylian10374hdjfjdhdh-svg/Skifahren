// Physik des Skifahrers – komplett ohne Rendering, damit sie testbar bleibt.
import { heightAt, gradientAt, normalAt } from './terrain.js';

const G = 24;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const TWO_PI = Math.PI * 2;

export class SkierSim {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = 0;
    this.z = 0;
    this.y = heightAt(0, 0);
    this.vx = 0;
    this.vz = -6;
    this.vy = 0;
    this.heading = 0;
    this.grounded = true;
    this.crashed = false;
    this.crashTime = 0;
    this.airTime = 0;
    this.spin = 0; // gesamte Drehung in Luft (rad)
    this.flip = 0;
    this.carve = 0; // 0..1 Stärke des Carvings (für Partikel/Sound)
    this.lean = 0; // geglättete Neigung für die Optik
    this.events = []; // werden pro Frame vom Spiel abgeholt
    this.maxSpeed = 0;
    this.boostT = 0; // Restzeit des Boosts in s
    this.grabTime = 0;
    this.grabbing = false;
  }

  get speed() {
    return Math.hypot(this.vx, this.vz);
  }

  update(dt, inp) {
    if (this.crashed) {
      this.crashTime += dt;
      this.vx *= Math.exp(-2.2 * dt);
      this.vz *= Math.exp(-2.2 * dt);
      this.x += this.vx * dt;
      this.z += this.vz * dt;
      this.y = Math.max(this.y - 0, heightAt(this.x, this.z));
      return;
    }
    if (this.boostT > 0) {
      this.boostT -= dt;
      this.boost(30 * dt, 95);
    }
    if (this.grounded) this.stepGround(dt, inp);
    else this.stepAir(dt, inp);
    this.maxSpeed = Math.max(this.maxSpeed, this.speed);
  }

  stepGround(dt, inp) {
    const sp = this.speed;
    const turnRate = 2.6 - 1.5 * clamp(sp / 50, 0, 1);
    this.heading = clamp(this.heading + inp.steer * turnRate * dt, -1.4, 1.4);

    const g = gradientAt(this.x, this.z);
    const k = G / (1 + g.x * g.x + g.z * g.z);
    this.vx += -g.x * k * dt;
    this.vz += -g.z * k * dt;

    const fx = Math.sin(this.heading);
    const fz = -Math.cos(this.heading);
    const lx = Math.cos(this.heading);
    const lz = Math.sin(this.heading);
    let vLat = this.vx * lx + this.vz * lz;
    let vFwd = this.vx * fx + this.vz * fz;

    const grip = inp.brake ? 3.2 : 5.5;
    const lost = vLat * (1 - Math.exp(-grip * dt));
    vLat -= lost;
    // Carven kostet etwas Tempo
    vFwd -= Math.abs(lost) * 0.18;

    const drag = inp.tuck ? 0.0028 : 0.0072;
    vFwd -= (drag * vFwd * Math.abs(vFwd) + 0.03 * vFwd) * dt;
    if (inp.brake && vFwd > 0) vFwd -= 14 * dt;
    if (vFwd < 0) vFwd = Math.max(vFwd, -2);

    this.vx = fx * vFwd + lx * vLat;
    this.vz = fz * vFwd + lz * vLat;
    this.carve = clamp(Math.abs(lost) / (Math.abs(lost) + 4) * 2.2 + (inp.brake ? 0.3 : 0), 0, 1) * clamp(sp / 8, 0, 1);

    const nx = this.x + this.vx * dt;
    const nz = this.z + this.vz * dt;
    const gNew = heightAt(nx, nz);
    const vyBall = this.vy - G * dt;
    const yBall = this.y + vyBall * dt;
    if (inp.jump && inp.jumpPressed) {
      this.vy = Math.max(this.vy, 0) + 9;
      this.takeOff(nx, nz, true);
      return;
    }
    if (gNew < yBall - 0.03) {
      this.vy = vyBall;
      this.takeOff(nx, nz, false);
      return;
    }
    this.vy = (gNew - this.y) / dt;
    this.x = nx;
    this.z = nz;
    this.y = gNew;
  }

  takeOff(nx, nz, ollie) {
    this.grounded = false;
    this.airTime = 0;
    this.spin = 0;
    this.flip = 0;
    this.grabTime = 0;
    this.grabbing = false;
    this.x = nx;
    this.z = nz;
    this.y += this.vy * (1 / 60);
    this.events.push({ type: 'takeoff', ollie });
  }

  stepAir(dt, inp) {
    this.airTime += dt;
    this.spin += inp.steer * 7.0 * dt;
    this.flip += (inp.flipAxis || 0) * 6.0 * dt;
    this.grabbing = !!inp.grab;
    if (this.grabbing) this.grabTime += dt;
    this.vx *= 1 - 0.01 * dt;
    this.vz *= 1 - 0.01 * dt;
    this.vy -= G * dt;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.y += this.vy * dt;
    const gy = heightAt(this.x, this.z);
    if (this.y <= gy) this.land(gy);
  }

  land(gy) {
    const n = normalAt(this.x, this.z);
    const impact = -(this.vx * n.x + this.vy * n.y + this.vz * n.z);
    const a = Math.abs(this.spin) % Math.PI;
    const spinErr = Math.min(a, Math.PI - a);
    const f = Math.abs(this.flip) % TWO_PI;
    const flipErr = Math.min(f, TWO_PI - f);
    this.y = gy;
    const spins = Math.round(Math.abs(this.spin) / Math.PI); // 180°-Schritte
    const flips = Math.round(Math.abs(this.flip) / TWO_PI);
    const bad = spinErr > 0.85 || flipErr > 0.85 || impact > 30;
    if (bad && this.airTime > 0.15) {
      this.events.push({ type: 'bail', airTime: this.airTime });
      this.crash('Bruchlandung');
      return;
    }
    this.grounded = true;
    // Geschwindigkeit an Hang anpassen, Heading neu ausrichten
    const sp = this.speed;
    this.heading = clamp(Math.atan2(this.vx, -this.vz), -1.4, 1.4);
    this.vy = 0;
    this.vx *= 0.97;
    this.vz *= 0.97;
    if (sp < 1) this.heading = 0;
    this.events.push({
      type: 'land',
      airTime: this.airTime,
      spins,
      flips,
      clean: spinErr < 0.45 && flipErr < 0.45,
      grab: this.grabTime,
      impact,
    });
    this.spin = 0;
    this.flip = 0;
    this.grabbing = false;
  }

  crash(reason) {
    if (this.crashed) return;
    this.crashed = true;
    this.crashTime = 0;
    this.reason = reason;
    this.events.push({ type: 'crash', reason });
  }

  // Tempo-Schub entlang der aktuellen Fahrtrichtung (Boost-Tore)
  boost(dv, cap = 85) {
    const sp = this.speed;
    if (sp < 0.5) return;
    const target = Math.min(cap, sp + dv);
    const f = target / sp;
    this.vx *= f;
    this.vz *= f;
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}
