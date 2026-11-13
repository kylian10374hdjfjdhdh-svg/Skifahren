// Slalom-Strecke: reine Mathematik ohne Three.js (damit testbar).
// Koordinaten: bergab geht es in -Z, +X ist rechts. Die Strecke ist endlich:
// Start bei z = 0, Ziellinie bei z = -FINISH_T. Links und rechts der Piste steht ein
// Fangzaun, dahinter steigt ein durchgehender Berghang an (kein Blick durch Berge).

export const COURSE_LEN = 1500; // Länge des gebauten Geländes
export const FINISH_T = 1470; // Ziellinie (Strecke in Metern ab Start)
export const COURSE_HALF = 20; // halbe Pistenbreite
export const FENCE_U = 22.5; // Abstand des Fangzauns von der Pistenmitte
export const POLE_H = 2.7;
export const MISS_PENALTY = 2; // Strafsekunden pro verpasstem Tor
export const CRASH_PENALTY = 3; // Strafsekunden pro Sturz
export const PAR_TIME = 80; // darunter gibt es Zeitbonus-Punkte

const cSstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function centerOfCourse(z) {
  const t = -z;
  const amp = cSstep(0, 120, t) * (1 - cSstep(FINISH_T - 220, FINISH_T - 60, t));
  return (Math.sin(z * 0.0062) * 24 + Math.sin(z * 0.0151 + 1.1) * 8) * amp;
}

// ---------- Tore & Schanzen (feste, handgebaute Strecke) ----------
const COURSE_KTYPES = {
  small: { len: 8, h: 1.7, w: 6.5 },
  medium: { len: 11, h: 2.8, w: 8.5 },
  large: { len: 15, h: 4.6, w: 11 },
};

function buildCourse() {
  const gates = [];
  const kickers = [];
  const gate = (t, off, w, sec) => {
    const z = -t;
    gates.push({ id: gates.length, t, z, x: centerOfCourse(z) + off, w, sec });
  };
  const kicker = (t, off, type) => {
    const z0 = -t;
    kickers.push({ ...COURSE_KTYPES[type], type, t, z0, x0: centerOfCourse(z0) + off });
  };

  // A: klassischer Slalom (12 Tore)
  for (let i = 0; i < 12; i++) gate(70 + i * 40, (i % 2 ? 1 : -1) * 8.5, 8.2, 'A');
  // B: Parkour-Abschnitt – Tore mit Schanzen dazwischen
  gate(560, 0, 14, 'B');
  kicker(603, -2.5, 'medium');
  gate(650, -5, 13, 'B');
  kicker(693, -1, 'small');
  gate(740, 3, 13, 'B');
  kicker(783, 1.5, 'large');
  gate(840, 0, 14, 'B');
  // C: schneller Riesenslalom (8 Tore, weit)
  for (let i = 0; i < 8; i++) gate(910 + i * 50, (i % 2 ? 1 : -1) * 9.5, 11.5, 'C');
  // D: enger Finale-Slalom (6 Tore) + Zielsprung
  for (let i = 0; i < 6; i++) gate(1290 + i * 25, (i % 2 ? 1 : -1) * 6, 7, 'D');
  kicker(1432, 0, 'large');
  return { gates, kickers };
}

const built = buildCourse();
export const GATES = built.gates;
export const KICKERS = built.kickers;
export const START = { x: 0, z: -6 };

// Zwischenzeiten nach diesen Toren (Index)
export const SPLIT_GATES = [11, 15, 23];

// ---------- Gelände ----------
function cNoise(x, z) {
  return (
    Math.sin(x * 0.05 + z * 0.031) * 2.2 +
    Math.sin(x * 0.11 - z * 0.07) * 1.0 +
    Math.sin(x * 0.23 + z * 0.19) * 0.35
  );
}

function cRidged(x, z) {
  return (
    (1 - Math.abs(Math.sin(x * 0.011 + z * 0.007))) * 34 +
    (1 - Math.abs(Math.sin(x * 0.027 - z * 0.013 + 2))) * 14
  );
}

export function courseKickerHeight(x, z) {
  let h = 0;
  for (let n = 0; n < KICKERS.length; n++) {
    const k = KICKERS[n];
    const u = k.z0 - z;
    if (u < 0 || u > k.len + 2.5) continue;
    const dx = Math.abs(x - k.x0);
    if (dx > k.w) continue;
    const wx = cSstep(k.w, k.w * 0.45, dx);
    const shape = u <= k.len ? k.h * Math.pow(u / k.len, 1.6) : k.h * (1 - (u - k.len) / 2.5);
    h += shape * wx;
  }
  return h;
}

export function courseHeight(x, z) {
  const t = -z;
  const d = Math.abs(x - centerOfCourse(z));
  const e = Math.max(0, d - (FENCE_U + 0.8));
  let h = 0.3 * z + 16 * Math.sin(z * 0.0042);
  const outside = cSstep(COURSE_HALF, COURSE_HALF + 14, d);
  h += cNoise(x, z) * (0.05 + outside * 0.9);
  // durchgehender Berghang hinter dem Zaun
  h += e < 10 ? 0.06 * e * e : 6 + 150 * Math.tanh((1.2 * (e - 10)) / 150);
  h += cSstep(40, 220, e) * cRidged(x, z);
  // Mauer hinter Start und hinter dem Ziel
  h += cSstep(30, 170, z) * 70 + cSstep(FINISH_T + 40, FINISH_T + 220, t) * 140;
  h += courseKickerHeight(x, z);
  return h;
}

export function courseGradient(x, z, e = 0.4) {
  return {
    x: (courseHeight(x + e, z) - courseHeight(x - e, z)) / (2 * e),
    z: (courseHeight(x, z + e) - courseHeight(x, z - e)) / (2 * e),
  };
}

export function courseNormal(x, z) {
  const g = courseGradient(x, z);
  const l = Math.hypot(g.x, 1, g.z);
  return { x: -g.x / l, y: 1 / l, z: -g.z / l };
}

export const courseTerrain = { heightAt: courseHeight, gradientAt: courseGradient, normalAt: courseNormal };

// ---------- Tore ----------
// Prüft, ob die Bewegung (prev -> cur) die Torlinie quert, und wie.
export function gateCrossing(px, pz, cx, cz, g) {
  if (!(pz > g.z && cz <= g.z)) return null;
  const f = (pz - g.z) / (pz - cz || 1);
  const xc = px + (cx - px) * f;
  const half = g.w / 2;
  const margin = half - Math.abs(xc - g.x);
  return { x: xc, hit: margin >= 0, margin, perfect: margin >= 0 && margin < 1.6 };
}

// Seitenwand (Fangzaun): liefert die Korrektur, falls der Fahrer zu weit außen ist.
export function fenceCheck(x, z) {
  const u = x - centerOfCourse(z);
  const lim = FENCE_U - 0.3;
  if (Math.abs(u) <= lim) return null;
  const side = Math.sign(u);
  return { side, x: centerOfCourse(z) + side * lim };
}

export function medalFor(time) {
  if (time <= 66) return 'Gold';
  if (time <= 74) return 'Silber';
  if (time <= 84) return 'Bronze';
  return '';
}

export function finalScore(points, time) {
  return Math.round(points + Math.max(0, PAR_TIME - time) * 120);
}

export function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return (m > 0 ? m + ':' : '') + (m > 0 && s < 10 ? '0' : '') + s.toFixed(2);
}
