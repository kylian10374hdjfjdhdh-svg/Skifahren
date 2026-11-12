// Endlose Welt: Gelände wird in Chunks vor dem Skifahrer erzeugt und hinten entfernt.
import { heightAt, centerX, obstaclesInRange, kickerHeight, smoothstep, PISTE_HALF } from './terrain.js';

const THREE = window.THREE;

export const CS = 96; // Chunk-Länge
const STEP = 2;
const XMIN = -216;
const XMAX = 216;
const NX = (XMAX - XMIN) / STEP;
const NZ = CS / STEP;
const lin = (v) => Math.pow(v, 2.2);
const mix = (a, b, t) => a + (b - a) * t;

// ---------- geteilte Geometrien ----------
function mergeGeos(list) {
  let vc = 0;
  let ic = 0;
  for (const g of list) {
    vc += g.attributes.position.count;
    ic += g.index.count;
  }
  const pos = new Float32Array(vc * 3);
  const nor = new Float32Array(vc * 3);
  const colr = new Float32Array(vc * 3);
  const idx = new Uint16Array(ic);
  let vo = 0;
  let io = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    colr.set(g.attributes.color.array, vo * 3);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += g.attributes.position.count;
    io += gi.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

function paint(g, fn) {
  const p = g.attributes.position;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const [r, gg, b] = fn(p.getY(i), p.getX(i), p.getZ(i));
    c[i * 3] = lin(r);
    c[i * 3 + 1] = lin(gg);
    c[i * 3 + 2] = lin(b);
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

function cone(r, h, baseY) {
  const g = new THREE.ConeGeometry(r, h, 8);
  g.translate(0, baseY + h / 2, 0);
  return paint(g, (y) => {
    const t = (y - baseY) / h;
    const snow = smoothstep(0.35, 0.85, t) * 0.75;
    const dark = [0.07, 0.27, 0.19];
    const lite = [0.9, 0.95, 1.0];
    return [mix(dark[0], lite[0], snow), mix(dark[1], lite[1], snow), mix(dark[2], lite[2], snow)];
  });
}

function makeTreeGeo() {
  const trunk = new THREE.CylinderGeometry(0.22, 0.32, 1.3, 6);
  trunk.translate(0, 0.65, 0);
  paint(trunk, () => [0.33, 0.21, 0.12]);
  return mergeGeos([trunk, cone(2.1, 3.0, 1.0), cone(1.6, 2.6, 2.7), cone(1.1, 2.2, 4.3)]);
}

function makeRockGeo() {
  const g = new THREE.IcosahedronGeometry(1, 0);
  g.translate(0, 0.35, 0);
  // Icosahedron ist nicht indiziert → Indizes ergänzen
  const n = g.attributes.position.count;
  const idx = [];
  for (let i = 0; i < n; i++) idx.push(i);
  g.setIndex(idx);
  return paint(g, (y) => {
    const t = Math.min(1, Math.max(0, (y + 0.7) / 2));
    return [mix(0.36, 0.6, t), mix(0.38, 0.62, t), mix(0.43, 0.68, t)];
  });
}

function makePoleGeo() {
  const g = new THREE.CylinderGeometry(0.07, 0.07, 2.6, 5);
  g.translate(0, 1.3, 0);
  return paint(g, (y) => (y > 2.0 ? [0.1, 0.1, 0.12] : [1.0, 0.36, 0.1]));
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map();
    this.treeGeo = makeTreeGeo();
    this.rockGeo = makeRockGeo();
    this.poleGeo = makePoleGeo();
    this.vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    this.rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    this.dummy = new THREE.Object3D();
  }

  reset() {
    for (const c of this.chunks.values()) this.disposeChunk(c);
    this.chunks.clear();
  }

  // Sorgt dafür, dass um z herum Chunks existieren. Gibt true zurück, wenn gebaut wurde.
  update(z, budget = 1) {
    const c = Math.max(0, Math.floor(-z / CS));
    let built = 0;
    for (let k = c - 1; k <= c + 4; k++) {
      if (k < 0 || this.chunks.has(k)) continue;
      if (built >= budget) break;
      this.chunks.set(k, this.buildChunk(k));
      built++;
    }
    for (const [k, ch] of this.chunks) {
      if (k < c - 2) {
        this.disposeChunk(ch);
        this.chunks.delete(k);
      }
    }
    return built > 0;
  }

  disposeChunk(ch) {
    this.scene.remove(ch.group);
    ch.mesh.geometry.dispose();
  }

  obstaclesNear(z) {
    const c = Math.max(0, Math.floor(-z / CS));
    const out = [];
    for (let k = c - 1; k <= c + 1; k++) {
      const ch = this.chunks.get(k);
      if (ch) for (const o of ch.obstacles) out.push(o);
    }
    return out;
  }

  buildChunk(c) {
    const z0 = -c * CS;
    const nx1 = NX + 1;
    const nz1 = NZ + 1;
    const W = nx1 + 2;
    const H = nz1 + 2;
    const hs = new Float32Array(W * H);
    for (let j = 0; j < H; j++) {
      const z = z0 - (j - 1) * STEP;
      for (let i = 0; i < W; i++) hs[j * W + i] = heightAt(XMIN + (i - 1) * STEP, z);
    }
    const pos = new Float32Array(nx1 * nz1 * 3);
    const nor = new Float32Array(nx1 * nz1 * 3);
    const colr = new Float32Array(nx1 * nz1 * 3);
    for (let j = 0; j < nz1; j++) {
      const z = z0 - j * STEP;
      const cx = centerX(z);
      for (let i = 0; i < nx1; i++) {
        const x = XMIN + i * STEP;
        const k = j * nx1 + i;
        const h = hs[(j + 1) * W + i + 1];
        pos[k * 3] = x;
        pos[k * 3 + 1] = h;
        pos[k * 3 + 2] = z;
        const dx = (hs[(j + 1) * W + i + 2] - hs[(j + 1) * W + i]) / (2 * STEP);
        const dz = (hs[j * W + i + 1] - hs[(j + 2) * W + i + 1]) / (2 * STEP);
        const l = Math.hypot(dx, 1, dz);
        const ny = 1 / l;
        nor[k * 3] = -dx / l;
        nor[k * 3 + 1] = ny;
        nor[k * 3 + 2] = -dz / l;

        const d = Math.abs(x - cx);
        const piste = 1 - smoothstep(PISTE_HALF - 2, PISTE_HALF + 5, d);
        const groove = 0.025 * Math.sin(x * 0.9 + z * 0.04) + 0.015 * Math.sin(x * 2.3 - z * 0.3);
        let r = mix(0.84, 0.95, piste) + groove;
        let g = mix(0.89, 0.97, piste) + groove;
        let b = mix(0.97, 1.0, piste);
        const rock = smoothstep(0.82, 0.6, ny);
        r = mix(r, 0.4, rock);
        g = mix(g, 0.42, rock);
        b = mix(b, 0.48, rock);
        if (kickerHeight(x, z) > 0.03) {
          r = mix(r, 0.72, 0.6);
          g = mix(g, 0.86, 0.6);
          b = mix(b, 1.0, 0.6);
        }
        colr[k * 3] = lin(r);
        colr[k * 3 + 1] = lin(g);
        colr[k * 3 + 2] = lin(b);
      }
    }
    const idx = [];
    for (let j = 0; j < NZ; j++) {
      for (let i = 0; i < NX; i++) {
        const a = j * nx1 + i;
        const b = a + 1;
        const cc = a + nx1;
        const d = cc + 1;
        idx.push(a, cc, b, b, cc, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.vcMat);
    mesh.receiveShadow = true;

    const group = new THREE.Group();
    group.add(mesh);

    const obstacles = obstaclesInRange(z0, z0 - CS + 0.001);
    const trees = obstacles.filter((o) => o.type === 'tree');
    const rocks = obstacles.filter((o) => o.type === 'rock');
    const d = this.dummy;

    if (trees.length) {
      const im = new THREE.InstancedMesh(this.treeGeo, this.vcMat, trees.length);
      trees.forEach((o, i) => {
        d.position.set(o.x, o.y - 0.15, o.z);
        d.rotation.set(0, o.id * 0.7, 0);
        d.scale.set(o.s, o.s * (0.9 + (o.id % 7) * 0.04), o.s);
        d.updateMatrix();
        im.setMatrixAt(i, d.matrix);
      });
      im.castShadow = true;
      im.receiveShadow = true;
      im.frustumCulled = false;
      group.add(im);
    }
    if (rocks.length) {
      const im = new THREE.InstancedMesh(this.rockGeo, this.rockMat, rocks.length);
      rocks.forEach((o, i) => {
        d.position.set(o.x, o.y - 0.1, o.z);
        d.rotation.set(o.id * 0.31, o.id * 1.3, o.id * 0.17);
        d.scale.set(o.s * 1.3, o.s * 0.85, o.s);
        d.updateMatrix();
        im.setMatrixAt(i, d.matrix);
      });
      im.castShadow = true;
      im.receiveShadow = true;
      im.frustumCulled = false;
      group.add(im);
    }

    // Pistenmarkierung (Stangen links/rechts)
    const poles = [];
    for (let z = z0 - 9; z > z0 - CS; z -= 18) {
      const cx = centerX(z);
      poles.push([cx - (PISTE_HALF - 0.5), z], [cx + (PISTE_HALF - 0.5), z]);
    }
    const pm = new THREE.InstancedMesh(this.poleGeo, this.vcMat, poles.length);
    poles.forEach(([x, z], i) => {
      d.position.set(x, heightAt(x, z), z);
      d.rotation.set(0, 0, 0);
      d.scale.set(1, 1, 1);
      d.updateMatrix();
      pm.setMatrixAt(i, d.matrix);
    });
    pm.castShadow = true;
    pm.frustumCulled = false;
    group.add(pm);

    this.scene.add(group);
    return { group, mesh, obstacles };
  }
}
