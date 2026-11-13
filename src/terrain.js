// Reine Mathematik für das Gelände (ohne Three.js, damit testbar).
// Koordinaten: Es geht in -Z bergab. +X ist rechts.

export const SLOPE = 0.3; // Höhenverlust pro Meter Strecke
export const PISTE_HALF = 22; // halbe Pistenbreite
export const CELL = 110; // Länge einer Sprungschanzen-Zelle
const KICKER_LEN = 9;
const KICKER_H = 2.1;

export function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function centerX(z) {
  return Math.sin(z * 0.008) * 38 + Math.sin(z * 0.019 + 1.3) * 16;
}

function noise(x, z) {
  return (
    Math.sin(x * 0.05 + z * 0.031) * 2.2 +
    Math.sin(x * 0.11 - z * 0.07) * 1.0 +
    Math.sin(x * 0.23 + z * 0.19) * 0.35
  );
}

// Schanzen-Typen: klein, mittel, groß
const KTYPES = [
  { type: 0, len: 8, h: 1.7, w: 6.5 },
  { type: 1, len: 11, h: 2.8, w: 8.5 },
  { type: 2, len: 15, h: 4.6, w: 11 },
];
const EMPTY = [];
const kCache = new Map();

export function kickersForCell(k) {
  if (k < 1) return EMPTY;
  const hit = kCache.get(k);
  if (hit) return hit;
  let out = EMPTY;
  const r = hash(k * 7.31);
  if (r <= 0.62) {
    const z0 = -(k * CELL + 30 + hash(k * 3.7) * 50);
    const x0 = centerX(z0) + (hash(k * 5.1) - 0.5) * 22;
    const diff = Math.min(1, k / 30);
    const t = hash(k * 9.9);
    const ti = t < 0.5 - 0.2 * diff ? 0 : t < 0.85 - 0.1 * diff ? 1 : 2;
    if (r < 0.07) {
      // Jump-Line: drei Schanzen hintereinander, jede etwas größer
      out = [0, 1, 2].map((i) => {
        const zz = z0 - i * 46;
        const kt = KTYPES[Math.min(2, i)];
        return { ...kt, z0: zz, x0: centerX(zz) + (hash(k * 2.3 + i) - 0.5) * 6 };
      });
    } else {
      out = [{ ...KTYPES[ti], z0, x0 }];
    }
  }
  kCache.set(k, out);
  return out;
}

export function kickerForCell(k) {
  const a = kickersForCell(k);
  return a.length ? a[0] : null;
}

export function kickerHeight(x, z) {
  const kc = Math.floor(-z / CELL);
  let h = 0;
  for (let k = kc - 2; k <= kc + 1; k++) {
    const list = kickersForCell(k);
    for (let n = 0; n < list.length; n++) {
      const kk = list[n];
      const u = kk.z0 - z;
      if (u < 0 || u > kk.len + 2.5) continue;
      const wx = smoothstep(kk.w, kk.w * 0.45, Math.abs(x - kk.x0));
      if (wx <= 0) continue;
      const shape =
        u <= kk.len ? kk.h * Math.pow(u / kk.len, 1.6) : kk.h * (1 - (u - kk.len) / 2.5);
      h += shape * wx;
    }
  }
  return h;
}

// Dreiecks-Indizes eines Gitters (nx+1) x (nz+1); Vorderseite zeigt nach oben (+Y),
// wenn Zeilen in -Z-Richtung und Spalten in +X-Richtung laufen.
export function gridIndices(nx, nz) {
  const nx1 = nx + 1;
  const idx = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * nx1 + i;
      const b = a + 1;
      const c = a + nx1;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  return idx;
}

export function heightAt(x, z) {
  const d = Math.abs(x - centerX(z));
  const off = smoothstep(PISTE_HALF, PISTE_HALF + 16, d);
  const bank = Math.max(0, d - PISTE_HALF);
  let h = SLOPE * z;
  h += noise(x, z) * (0.12 + off * 1.3);
  h += Math.min(110, bank * bank * 0.012 + bank * 0.1);
  h += kickerHeight(x, z);
  return h;
}

export function gradientAt(x, z, e = 0.4) {
  return {
    x: (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e),
    z: (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e),
  };
}

export function normalAt(x, z) {
  const g = gradientAt(x, z);
  const l = Math.hypot(g.x, 1, g.z);
  return { x: -g.x / l, y: 1 / l, z: -g.z / l };
}

// ---- Hindernisse (deterministisch pro Rasterzelle) ----
const OB = 8; // Rasterweite

export function obstaclesInRange(zA, zB) {
  // zA > zB (zA ist weiter oben am Berg)
  const out = [];
  const i0 = Math.floor(zB / OB);
  const i1 = Math.floor(zA / OB);
  for (let iz = i0; iz <= i1; iz++) {
    const zc = iz * OB;
    if (zc > -70) continue; // freie Startzone
    const cx = centerX(zc);
    const diff = Math.min(1, -zc / 3000); // wird schwerer
    for (let ix = -16; ix <= 16; ix++) {
      const id = iz * 1000 + ix;
      const r = hash(id * 1.37);
      const x = cx + ix * OB + (hash(id * 2.11) - 0.5) * (OB * 0.9);
      const z = zc + (hash(id * 3.17) - 0.5) * (OB * 0.9);
      const d = Math.abs(x - cx);
      let type = null;
      if (d > PISTE_HALF + 7) {
        const dens = 0.2 + 0.2 * Math.min(1, (d - PISTE_HALF) / 40);
        if (r < dens) type = 'tree';
        else if (r > 0.97) type = 'rock';
      } else if (d > 4) {
        const p = 0.012 + 0.03 * diff;
        if (r < p) type = 'rock';
        else if (r > 1 - p * 0.7) type = 'tree';
      }
      if (!type) continue;
      // nicht auf Schanzen
      if (kickerHeight(x, z) > 0.01) continue;
      const s = 0.8 + hash(id * 4.7) * (type === 'tree' ? 1.1 : 0.9);
      out.push({ id, type, x, z, y: heightAt(x, z), s, r: (type === 'tree' ? 0.75 : 0.95) * s });
    }
  }
  return out;
}

// ---- Boost-Tore (Ringe) ----
export const GATE_CELL = 140;
export const GATE_R = 3.4;

export function gateForCell(k) {
  if (k < 1) return null;
  const z = -(k * GATE_CELL + 50 + hash(k * 11.3) * 60);
  const x = centerX(z) + (hash(k * 6.7) - 0.5) * 26;
  return { id: k, x, z, y: heightAt(x, z) + 2.1, r: GATE_R };
}

export function gatesInRange(zA, zB) {
  const out = [];
  const k0 = Math.max(1, Math.floor(-zA / GATE_CELL) - 1);
  const k1 = Math.floor(-zB / GATE_CELL) + 1;
  for (let k = k0; k <= k1; k++) {
    const g = gateForCell(k);
    if (g && g.z <= zA && g.z > zB) out.push(g);
  }
  return out;
}
