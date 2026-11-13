// Partikel: Schneespray und Schneefall.
const THREE = window.THREE;

// Weicher runder Punkt, damit Schnee als Flocken statt als Quadrate erscheint
function makeSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.85)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const SPRITE = makeSprite();

export class Spray {
  constructor(scene, max = 900) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.next = 0;
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -9999;
    const geo = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.attr);
    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.85,
      map: SPRITE,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, spread, n) {
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      const p = i * 3;
      this.pos[p] = x + (Math.random() - 0.5) * 0.4;
      this.pos[p + 1] = y + Math.random() * 0.2;
      this.pos[p + 2] = z + (Math.random() - 0.5) * 0.4;
      this.vel[p] = vx + (Math.random() - 0.5) * spread;
      this.vel[p + 1] = vy + Math.random() * spread * 0.8;
      this.vel[p + 2] = vz + (Math.random() - 0.5) * spread;
      this.life[i] = 0.5 + Math.random() * 0.6;
    }
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const p = i * 3;
      if (this.life[i] <= 0) {
        this.pos[p + 1] = -9999;
        continue;
      }
      this.vel[p + 1] -= 10 * dt;
      const drag = Math.exp(-1.5 * dt);
      this.vel[p] *= drag;
      this.vel[p + 2] *= drag;
      this.pos[p] += this.vel[p] * dt;
      this.pos[p + 1] += this.vel[p + 1] * dt;
      this.pos[p + 2] += this.vel[p + 2] * dt;
    }
    this.attr.needsUpdate = true;
  }
}

export class Snowfall {
  constructor(scene, n = 1400) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      this.pos[i * 3] = (Math.random() - 0.5) * 80;
      this.pos[i * 3 + 1] = (Math.random() - 0.5) * 40;
      this.pos[i * 3 + 2] = (Math.random() - 0.5) * 80;
    }
    this.rel = new Float32Array(this.pos);
    const geo = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.attr);
    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.34,
      map: SPRITE,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  update(dt, cam, time) {
    const r = this.rel;
    for (let i = 0; i < this.n; i++) {
      const p = i * 3;
      r[p + 1] -= (2.2 + (i % 5) * 0.4) * dt;
      r[p] += Math.sin(time * 0.7 + i) * 0.4 * dt;
      if (r[p + 1] < -20) r[p + 1] += 40;
      this.pos[p] = cam.x + r[p];
      this.pos[p + 1] = cam.y + r[p + 1];
      this.pos[p + 2] = cam.z + r[p + 2];
    }
    this.attr.needsUpdate = true;
  }
}

// Skispuren im Schnee: zwei Bänder hinter dem Skifahrer
export class Trail {
  constructor(scene, n = 240) {
    this.n = n;
    this.pts = []; // {x,y,z,lx,lz,gap}
    this.pos = new Float32Array(n * 4 * 3);
    this.idxArr = new Uint16Array(n * 12);
    const geo = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.attr);
    this.index = new THREE.BufferAttribute(this.idxArr, 1);
    this.index.setUsage(THREE.DynamicDrawUsage);
    geo.setIndex(this.index);
    geo.setDrawRange(0, 0);
    this.geo = geo;
    const mat = new THREE.MeshBasicMaterial({
      color: 0x9fb4cf,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      side: THREE.DoubleSide,
      fog: true,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.pendingGap = true;
  }

  clear() {
    this.pts.length = 0;
    this.pendingGap = true;
    this.geo.setDrawRange(0, 0);
  }

  // Aufruf pro Frame; grounded steuert, ob eine Spur gelegt wird
  add(x, y, z, heading, grounded) {
    if (!grounded) {
      this.pendingGap = true;
      return;
    }
    const last = this.pts[this.pts.length - 1];
    if (last && !this.pendingGap) {
      const dx = x - last.x;
      const dz = z - last.z;
      if (dx * dx + dz * dz < 0.5) return;
    }
    this.pts.push({ x, y, z, lx: Math.cos(heading), lz: Math.sin(heading), gap: this.pendingGap });
    this.pendingGap = false;
    if (this.pts.length > this.n) this.pts.shift();
    this.rebuild();
  }

  rebuild() {
    const P = this.pts;
    const pos = this.pos;
    const W = 0.06;
    const OFF = 0.2;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      const y = p.y + 0.09;
      let o = i * 12;
      const sides = [-OFF - W, -OFF + W, OFF - W, OFF + W];
      for (let k = 0; k < 4; k++) {
        pos[o++] = p.x + p.lx * sides[k];
        pos[o++] = y;
        pos[o++] = p.z + p.lz * sides[k];
      }
    }
    const idx = this.idxArr;
    let c = 0;
    for (let i = 1; i < P.length; i++) {
      if (P[i].gap) continue;
      for (const r of [0, 2]) {
        const a = (i - 1) * 4 + r;
        const b = i * 4 + r;
        idx[c++] = a; idx[c++] = a + 1; idx[c++] = b;
        idx[c++] = a + 1; idx[c++] = b + 1; idx[c++] = b;
      }
    }
    this.geo.setDrawRange(0, c);
    this.attr.needsUpdate = true;
    this.index.needsUpdate = true;
  }
}
