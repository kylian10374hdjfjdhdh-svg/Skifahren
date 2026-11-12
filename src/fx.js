// Partikel: Schneespray und Schneefall.
const THREE = window.THREE;

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
      size: 0.45,
      transparent: true,
      opacity: 0.9,
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
      size: 0.16,
      transparent: true,
      opacity: 0.8,
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
