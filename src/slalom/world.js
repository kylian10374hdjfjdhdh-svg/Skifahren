// 3D-Welt der Slalom-Strecke: Gelände, Fangzaun, Bäume, Tore, Start und Ziel.
import {
  GATES, KICKERS, FINISH_T, FENCE_U, COURSE_HALF, POLE_H, centerOfCourse,
  courseHeight, courseNormal, courseKickerHeight,
} from './course.js';

const THREE = window.THREE;

const SW_CHUNK = 100; // Länge eines Gelände-Streifens
const SW_STEP_Z = 2;
const SW_STEP_X = 3;
const SW_HALFW = 240;
const SW_Z_FROM = 80; // hinter dem Start
const SW_Z_TO = -(FINISH_T + 260);
const swLin = (v) => Math.pow(v, 2.2);
const swMix = (a, b, t) => a + (b - a) * t;
const swSmooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const swHash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const swColor = (hex) => new THREE.Color(hex).convertSRGBToLinear();

function swPaint(g, fn) {
  const p = g.attributes.position;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const [r, gg, b] = fn(p.getY(i), p.getX(i), p.getZ(i));
    c[i * 3] = swLin(r);
    c[i * 3 + 1] = swLin(gg);
    c[i * 3 + 2] = swLin(b);
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

function swMerge(list) {
  let vc = 0;
  let ic = 0;
  for (const g of list) {
    vc += g.attributes.position.count;
    ic += g.index.count;
  }
  const pos = new Float32Array(vc * 3);
  const nor = new Float32Array(vc * 3);
  const col = new Float32Array(vc * 3);
  const idx = new Uint16Array(ic);
  let vo = 0;
  let io = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    col.set(g.attributes.color.array, vo * 3);
    for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.array[i] + vo;
    vo += g.attributes.position.count;
    io += g.index.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

function swCone(r, h, baseY) {
  const g = new THREE.ConeGeometry(r, h, 7);
  g.translate(0, baseY + h / 2, 0);
  return swPaint(g, (y) => {
    const t = (y - baseY) / h;
    const snow = swSmooth(0.3, 0.9, t) * 0.8;
    const dark = [0.06, 0.25, 0.18];
    const lite = [0.92, 0.96, 1.0];
    return [swMix(dark[0], lite[0], snow), swMix(dark[1], lite[1], snow), swMix(dark[2], lite[2], snow)];
  });
}

function swTreeGeo() {
  const trunk = new THREE.CylinderGeometry(0.22, 0.32, 1.3, 6);
  trunk.translate(0, 0.65, 0);
  swPaint(trunk, () => [0.33, 0.21, 0.12]);
  return swMerge([trunk, swCone(2.1, 3.2, 1.0), swCone(1.55, 2.8, 2.9), swCone(1.0, 2.3, 4.6)]);
}

function swRockGeo() {
  const g = new THREE.IcosahedronGeometry(1, 0);
  g.translate(0, 0.35, 0);
  const idx = [];
  for (let i = 0; i < g.attributes.position.count; i++) idx.push(i);
  g.setIndex(idx);
  return swPaint(g, (y) => {
    const t = Math.min(1, Math.max(0, (y + 0.7) / 2));
    return [swMix(0.36, 0.62, t), swMix(0.38, 0.64, t), swMix(0.43, 0.7, t)];
  });
}

function swTextTexture(text, bg, fg, w = 512, h = 96, checker = false) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  if (checker) {
    const s = h / 4;
    for (let y = 0; y < 4; y++) for (let x = 0; x < w / s; x++) {
      if ((x + y) % 2 === 0) {
        g.fillStyle = '#0b1220';
        g.fillRect(x * s, y * s, s, s);
      }
    }
    g.fillStyle = bg;
    g.fillRect(w * 0.2, h * 0.12, w * 0.6, h * 0.76);
  }
  g.fillStyle = fg;
  g.font = `italic 900 ${Math.round(h * 0.62)}px "Segoe UI", Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 3);
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = 4;
  return tex;
}

const BANNER_TEXTS = [
  ['SKIFAHREN', '#ff5a1f', '#ffffff'],
  ['SLALOM CUP 2026', '#0b2a55', '#ffffff'],
  ['FULL SEND', '#ffd23f', '#1a1200'],
  ['KEEP CARVING', '#1d8fe0', '#ffffff'],
];

export class SlalomWorld {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.chunks = [];
    this.gateObjs = [];
    this.next = 0;
    this.vc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    this.rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    this.build();
  }

  build() {
    this.buildTerrain();
    this.buildTrees();
    this.buildFence();
    this.buildGates();
    this.buildKickerArches();
    this.buildStartFinish();
  }

  buildTerrain() {
    const nx = Math.round((SW_HALFW * 2) / SW_STEP_X);
    const total = SW_Z_FROM - SW_Z_TO;
    const nChunks = Math.ceil(total / SW_CHUNK);
    for (let c = 0; c < nChunks; c++) {
      const z0 = SW_Z_FROM - c * SW_CHUNK;
      const nz = SW_CHUNK / SW_STEP_Z;
      const zm = z0 - SW_CHUNK / 2;
      const xmin = Math.round((centerOfCourse(zm) - SW_HALFW) / SW_STEP_X) * SW_STEP_X;
      const nx1 = nx + 1;
      const nz1 = nz + 1;
      const pos = new Float32Array(nx1 * nz1 * 3);
      const nor = new Float32Array(nx1 * nz1 * 3);
      const col = new Float32Array(nx1 * nz1 * 3);
      const e = 0.5;
      for (let j = 0; j < nz1; j++) {
        const z = z0 - j * SW_STEP_Z;
        const cx = centerOfCourse(z);
        for (let i = 0; i < nx1; i++) {
          const x = xmin + i * SW_STEP_X;
          const k = j * nx1 + i;
          const h = courseHeight(x, z);
          pos[k * 3] = x;
          pos[k * 3 + 1] = h;
          pos[k * 3 + 2] = z;
          const gx = (courseHeight(x + e, z) - courseHeight(x - e, z)) / (2 * e);
          const gz = (courseHeight(x, z + e) - courseHeight(x, z - e)) / (2 * e);
          const l = Math.hypot(gx, 1, gz);
          nor[k * 3] = -gx / l;
          nor[k * 3 + 1] = 1 / l;
          nor[k * 3 + 2] = -gz / l;
          const ny = 1 / l;
          const d = Math.abs(x - cx);
          const piste = 1 - swSmooth(COURSE_HALF - 1, COURSE_HALF + 3, d);
          const cord = Math.sin(x * 1.7 + Math.sin(z * 0.02) * 2) * 0.03 + Math.sin(x * 0.5 + z * 0.08) * 0.02;
          const powder = 0.02 * Math.sin(x * 0.31 + z * 0.23) + 0.015 * Math.sin(x * 0.9 - z * 0.6);
          let r = swMix(0.82 + powder, 0.94 + cord, piste);
          let g = swMix(0.87 + powder, 0.96 + cord, piste);
          let b = swMix(0.97, 1.0, piste);
          const edge = 1 - swSmooth(0.0, 0.9, Math.abs(d - (COURSE_HALF - 0.2)));
          r = swMix(r, 0.25, edge * 0.7);
          g = swMix(g, 0.55, edge * 0.7);
          b = swMix(b, 0.95, edge * 0.7);
          const rock = swSmooth(0.8, 0.55, ny) * (d > FENCE_U ? 1 : 0);
          r = swMix(r, 0.4, rock);
          g = swMix(g, 0.42, rock);
          b = swMix(b, 0.48, rock);
          if (courseKickerHeight(x, z) > 0.03) {
            r = swMix(r, 0.12, 0.85);
            g = swMix(g, 0.58, 0.85);
            b = swMix(b, 1.0, 0.85);
          }
          col[k * 3] = swLin(r);
          col[k * 3 + 1] = swLin(g);
          col[k * 3 + 2] = swLin(b);
        }
      }
      const idx = new Uint32Array(nx * nz * 6);
      let q = 0;
      for (let j = 0; j < nz; j++) {
        for (let i = 0; i < nx; i++) {
          const a = j * nx1 + i;
          const b = a + 1;
          const cc = a + nx1;
          const dd = cc + 1;
          idx[q++] = a; idx[q++] = b; idx[q++] = cc;
          idx[q++] = b; idx[q++] = dd; idx[q++] = cc;
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, this.vc);
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.chunks.push({ z0, zm, mesh, extras: [] });
    }
  }

  chunkAt(z) {
    const c = Math.floor((SW_Z_FROM - z) / SW_CHUNK);
    return this.chunks[Math.min(this.chunks.length - 1, Math.max(0, c))];
  }

  buildTrees() {
    const treeGeo = swTreeGeo();
    const rockGeo = swRockGeo();
    const d = new THREE.Object3D();
    const perChunk = this.chunks.map(() => ({ trees: [], rocks: [] }));
    for (let t = -60; t < FINISH_T + 230; t += 6) {
      const z = -t;
      for (const side of [-1, 1]) {
        for (let n = 0; n < 6; n++) {
          const id = Math.round(t) * 31 + n * 7 + (side > 0 ? 1000003 : 0);
          const off = FENCE_U + 4 + swHash(id * 1.3) * 90 + (n > 3 ? 40 : 0);
          const x = centerOfCourse(z) + side * off;
          const zz = z + (swHash(id * 2.1) - 0.5) * 6;
          const y = courseHeight(x, zz);
          const ny = courseNormal(x, zz).y;
          const r = swHash(id * 3.7);
          if (ny > 0.72 && r < 0.78) {
            const alt = y - courseHeight(centerOfCourse(zz), zz);
            if (alt > 105 + swHash(id) * 25) continue; // Baumgrenze
            perChunk[this.chunks.indexOf(this.chunkAt(zz))].trees.push({ x, y, z: zz, s: 0.8 + swHash(id * 4.7) * 1.2, id });
          } else if (ny < 0.8 && r > 0.9) {
            perChunk[this.chunks.indexOf(this.chunkAt(zz))].rocks.push({ x, y, z: zz, s: 0.9 + swHash(id * 5.3) * 1.6, id });
          }
        }
      }
    }
    perChunk.forEach((pc, ci) => {
      const ch = this.chunks[ci];
      if (pc.trees.length) {
        const im = new THREE.InstancedMesh(treeGeo, this.vc, pc.trees.length);
        pc.trees.forEach((o, i) => {
          d.position.set(o.x, o.y - 0.2, o.z);
          d.rotation.set(0, o.id * 0.7, 0);
          d.scale.set(o.s, o.s * (0.9 + (o.id % 7) * 0.04), o.s);
          d.updateMatrix();
          im.setMatrixAt(i, d.matrix);
        });
        im.castShadow = false;
        im.frustumCulled = false;
        this.group.add(im);
        ch.extras.push(im);
      }
      if (pc.rocks.length) {
        const im = new THREE.InstancedMesh(rockGeo, this.rockMat, pc.rocks.length);
        pc.rocks.forEach((o, i) => {
          d.position.set(o.x, o.y - 0.1, o.z);
          d.rotation.set(o.id * 0.31, o.id * 1.3, o.id * 0.17);
          d.scale.set(o.s * 1.4, o.s * 0.9, o.s);
          d.updateMatrix();
          im.setMatrixAt(i, d.matrix);
        });
        im.frustumCulled = false;
        this.group.add(im);
        ch.extras.push(im);
      }
    });
  }

  buildFence() {
    const netMat = new THREE.MeshStandardMaterial({
      color: swColor(0xff6a1a), roughness: 0.8, side: THREE.DoubleSide, transparent: true, opacity: 0.92,
    });
    const postMat = new THREE.MeshStandardMaterial({ color: swColor(0x1a2233), roughness: 0.6 });
    const postGeo = new THREE.CylinderGeometry(0.09, 0.09, 2.2, 6);
    postGeo.translate(0, 0.9, 0);
    const zA = 70;
    const zB = -(FINISH_T + 90);
    const step = 3;
    const n = Math.round((zA - zB) / step);
    const textures = BANNER_TEXTS.map(([t, bg, fg]) => swTextTexture(t, bg, fg));
    const bannerMats = textures.map((tex) => new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, fog: true }));
    const dummy = new THREE.Object3D();
    for (const side of [-1, 1]) {
      const pos = new Float32Array((n + 1) * 2 * 3);
      const idx = [];
      const posts = [];
      for (let i = 0; i <= n; i++) {
        const z = zA - i * step;
        const x = centerOfCourse(z) + side * FENCE_U;
        const h = courseHeight(x, z);
        pos.set([x, h - 0.15, z, x, h + 1.25, z], i * 6);
        if (i % 3 === 0) posts.push([x, h, z]);
        if (i < n) {
          const a = i * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      this.group.add(new THREE.Mesh(g, netMat));
      const im = new THREE.InstancedMesh(postGeo, postMat, posts.length);
      posts.forEach(([x, y, z], i) => {
        dummy.position.set(x, y, z);
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
      });
      im.frustumCulled = false;
      this.group.add(im);

      // Werbebanden an der Pistenseite des Zauns
      for (let z = zA - 30, bi = 0; z > zB + 20; z -= 36, bi++) {
        const half = 5.5;
        const zs = [z + half, z - half];
        const corner = zs.map((zz) => {
          const x = centerOfCourse(zz) + side * (FENCE_U - 0.12);
          return [x, courseHeight(x, zz), zz];
        });
        const hgt = 1.05;
        const p = new Float32Array([
          corner[0][0], corner[0][1] + 0.05, corner[0][2],
          corner[1][0], corner[1][1] + 0.05, corner[1][2],
          corner[0][0], corner[0][1] + 0.05 + hgt, corner[0][2],
          corner[1][0], corner[1][1] + 0.05 + hgt, corner[1][2],
        ]);
        // Lesbar von der Piste aus: links läuft u Richtung -Z, rechts Richtung +Z
        const u0 = side < 0 ? 0 : 1;
        const u1 = 1 - u0;
        const uv = new Float32Array([u0, 0, u1, 0, u0, 1, u1, 1]);
        const bg = new THREE.BufferGeometry();
        bg.setAttribute('position', new THREE.BufferAttribute(p, 3));
        bg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        bg.setIndex([0, 1, 2, 1, 3, 2]);
        this.group.add(new THREE.Mesh(bg, bannerMats[(bi + (side > 0 ? 2 : 0)) % bannerMats.length]));
      }
    }
  }

  // Tore: zwei Stangen mit Fahne und ein Streifen auf dem Schnee
  buildGates() {
    const poleGeo = new THREE.CylinderGeometry(0.075, 0.075, POLE_H, 6);
    poleGeo.translate(0, POLE_H / 2, 0);
    const flagGeo = new THREE.BoxGeometry(0.95, 0.62, 0.05);
    const stripGeo = new THREE.PlaneGeometry(1, 1.4);
    stripGeo.rotateX(-Math.PI / 2);
    const red = new THREE.MeshStandardMaterial({ color: swColor(0xe42626), roughness: 0.5, emissive: swColor(0x4a0606) });
    const blue = new THREE.MeshStandardMaterial({ color: swColor(0x1b6ff0), roughness: 0.5, emissive: swColor(0x06224a) });
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    GATES.forEach((g, i) => {
      const grp = new THREE.Group();
      const mat = i % 2 === 0 ? red : blue;
      const half = g.w / 2;
      const poles = [];
      for (const s of [-1, 1]) {
        const x = g.x + s * half;
        const y = courseHeight(x, g.z);
        const pole = new THREE.Mesh(poleGeo, mat);
        pole.position.set(x, y, g.z);
        pole.castShadow = true;
        const flag = new THREE.Mesh(flagGeo, mat);
        flag.position.set(x - s * 0.5, y + POLE_H - 0.4, g.z);
        flag.castShadow = true;
        grp.add(pole, flag);
        poles.push({ pole, flag, x, y });
      }
      const sm = new THREE.MeshBasicMaterial({
        color: swColor(0xfff3c4), transparent: true, opacity: 0.32, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      });
      const strip = new THREE.Mesh(stripGeo, sm);
      strip.scale.set(g.w - 0.3, 1, 1);
      const cy = courseHeight(g.x, g.z);
      strip.position.set(g.x, cy + 0.07, g.z);
      const n = courseNormal(g.x, g.z);
      q.setFromUnitVectors(up, new THREE.Vector3(n.x, n.y, n.z));
      strip.quaternion.copy(q);
      grp.add(strip);
      this.group.add(grp);
      this.gateObjs.push({ grp, poles, strip, sm, state: 'open', hitT: 0 });
    });
  }

  gateState(i, state) {
    const o = this.gateObjs[i];
    o.state = state;
    o.hitT = 0.6;
    if (state === 'hit') {
      o.sm.color.copy(swColor(0x56e39a));
      o.sm.opacity = 0.55;
    } else if (state === 'miss') {
      o.sm.color.copy(swColor(0xff4040));
      o.sm.opacity = 0.5;
    }
  }

  // Pole wackelt nach Berührung
  poleHit(i, s) {
    const o = this.gateObjs[i];
    o.poles[s].wobble = 0.5;
  }

  resetGates() {
    this.gateObjs.forEach((o) => {
      o.state = 'open';
      o.sm.color.copy(swColor(0xfff3c4));
      o.sm.opacity = 0.32;
      o.poles.forEach((p) => {
        p.wobble = 0;
        p.pole.rotation.set(0, 0, 0);
      });
    });
    this.next = 0;
  }

  setNextGate(i) {
    this.next = i;
  }

  update(dt, z, time) {
    // weit entfernte Streifen ausblenden (Nebel verdeckt sie sowieso)
    for (const c of this.chunks) {
      const vis = Math.abs(c.zm - z) < 900;
      if (c.mesh.visible !== vis) {
        c.mesh.visible = vis;
        for (const m of c.extras) m.visible = vis;
      }
    }
    this.gateObjs.forEach((o, i) => {
      if (o.state === 'open') {
        const near = i === this.next;
        o.sm.opacity = near ? 0.45 + 0.25 * Math.sin(time * 7) : 0.28;
        o.sm.color.copy(near ? swColor(0xffe066) : swColor(0xfff3c4));
      }
      for (const p of o.poles) {
        if (p.wobble > 0) {
          p.wobble = Math.max(0, p.wobble - dt);
          p.pole.rotation.x = Math.sin(p.wobble * 40) * p.wobble * 0.5;
          p.flag.rotation.x = p.pole.rotation.x * 0.5;
        }
      }
    });
  }

  buildKickerArches() {
    const mat = new THREE.MeshBasicMaterial({ color: swColor(0xff5a14) });
    const mat2 = new THREE.MeshBasicMaterial({ color: swColor(0xfff6ea) });
    const poleGeo = new THREE.BoxGeometry(0.45, 1, 0.45);
    poleGeo.translate(0, 0.5, 0);
    const barGeo = new THREE.BoxGeometry(1, 0.6, 0.45);
    for (const k of KICKERS) {
      const lz = k.z0 - k.len;
      const H = 3.4 + ({ small: 0, medium: 1, large: 2 }[k.type]) * 1.4;
      const hw = k.w * 0.95;
      const base = Math.max(courseHeight(k.x0 - hw, lz), courseHeight(k.x0 + hw, lz));
      for (const s of [-1, 1]) {
        const y = courseHeight(k.x0 + s * hw, lz);
        const m = new THREE.Mesh(poleGeo, mat);
        m.position.set(k.x0 + s * hw, y - 0.2, lz);
        m.scale.set(1, base + H - y + 0.2, 1);
        m.castShadow = true;
        this.group.add(m);
      }
      const bar = new THREE.Mesh(barGeo, mat);
      bar.position.set(k.x0, base + H, lz);
      bar.scale.set(hw * 2 + 0.45, 1, 1);
      const stripe = new THREE.Mesh(barGeo, mat2);
      stripe.position.set(k.x0, base + H, lz + 0.05);
      stripe.scale.set(hw * 2 - 1.2, 0.4, 1.1);
      this.group.add(bar, stripe);
    }
  }

  buildStartFinish() {
    const postMat = new THREE.MeshStandardMaterial({ color: swColor(0x1a2233), roughness: 0.5 });
    const postGeo = new THREE.BoxGeometry(0.5, 1, 0.5);
    postGeo.translate(0, 0.5, 0);
    const arch = (z, label, bg, fg, checker, half) => {
      const c = centerOfCourse(z);
      const hL = courseHeight(c - half, z);
      const hR = courseHeight(c + half, z);
      const top = Math.max(hL, hR) + 6.2;
      for (const [s, h] of [[-1, hL], [1, hR]]) {
        const p = new THREE.Mesh(postGeo, postMat);
        p.position.set(c + s * half, h - 0.2, z);
        p.scale.set(1, top - h + 0.2, 1);
        p.castShadow = true;
        this.group.add(p);
      }
      const tex = swTextTexture(label, bg, fg, 1024, 160, checker);
      const banner = new THREE.Mesh(
        new THREE.PlaneGeometry(half * 2 + 0.5, 2.1),
        new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })
      );
      banner.position.set(c, top - 0.9, z);
      this.group.add(banner);
    };
    arch(-4, 'START', '#ff5a1f', '#ffffff', false, 8);
    arch(-FINISH_T, 'ZIEL', '#ffffff', '#0b1220', true, COURSE_HALF - 2);
    // Ziellinie (Schachbrett) auf dem Schnee
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 32;
    const g = cv.getContext('2d');
    for (let y = 0; y < 2; y++) for (let x = 0; x < 32; x++) {
      g.fillStyle = (x + y) % 2 ? '#0b1220' : '#ffffff';
      g.fillRect(x * 8, y * 16, 8, 16);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    const w = (COURSE_HALF - 0.5) * 2;
    const pg = new THREE.PlaneGeometry(w, 1.6);
    pg.rotateX(-Math.PI / 2);
    const line = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    const fz = -FINISH_T;
    const fx = centerOfCourse(fz);
    line.position.set(fx, courseHeight(fx, fz) + 0.08, fz);
    const n = courseNormal(fx, fz);
    line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(n.x, n.y, n.z));
    this.group.add(line);
  }
}
