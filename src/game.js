import { SkierSim } from './sim.js';
import { heightAt, gradientAt, centerX } from './terrain.js';
import { GameAudio } from './audio.js';
import { Spray, Snowfall } from './fx.js';
import { createSkier } from './skier-model.js';
import { World } from './world.js';

const THREE = window.THREE;
const $ = (id) => document.getElementById(id);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const clampN = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------- Renderer / Szene ----------
const isTouch = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const HORIZON = new THREE.Color(0xcfe2f3).convertSRGBToLinear();
scene.fog = new THREE.FogExp2(HORIZON, 0.0032);

// Tageszeiten: wechseln pro Lauf
const THEMES = [
  { name: 'Tag', sky: ['#2f6fc0', '#7fb4e6', '#cfe2f3', '#e8f1fa'], fog: 0xcfe2f3, sun: 0xfff1d6, sunI: 2.2, hemi: [0xcfe6ff, 0xdfe8f5, 0.75], mt: 0xffffff, sunDir: [-70, 110, 60], exp: 0.95 },
  { name: 'Sonnenuntergang', sky: ['#35457f', '#c8718a', '#f4a56a', '#ffd9a0'], fog: 0xf0b88a, sun: 0xffa45c, sunI: 2.0, hemi: [0xffc9a0, 0xe9c4c4, 0.65], mt: 0xffc9b0, sunDir: [-120, 45, -80], exp: 1.0 },
  { name: 'Blaue Stunde', sky: ['#0d1b3d', '#2c4a86', '#6f8fc4', '#aebfe0'], fog: 0x8fa5cf, sun: 0xaecbff, sunI: 1.3, hemi: [0x9fb6e8, 0xb9c6e4, 0.7], mt: 0xb4c4ee, sunDir: [80, 90, 70], exp: 1.05 },
];
let themeIdx = 0;
function makeSky(stops) {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, stops[0]);
  grad.addColorStop(0.45, stops[1]);
  grad.addColorStop(0.8, stops[2]);
  grad.addColorStop(1, stops[3]);
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}
scene.background = makeSky(THEMES[0].sky);

const camera = new THREE.PerspectiveCamera(64, 1, 0.1, 3500);

const hemi = new THREE.HemisphereLight(0xcfe6ff, 0xdfe8f5, 0.75);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
const sc = sun.shadow.camera;
sc.left = -60;
sc.right = 60;
sc.top = 60;
sc.bottom = -60;
sc.near = 10;
sc.far = 320;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);

// Berge am Horizont (folgen der Kamera)
const mountains = new THREE.Group();
const mtMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
{
  const mat = mtMat;
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + Math.sin(i * 12.9) * 0.15;
    const h = 260 + ((Math.sin(i * 78.2) + 1) / 2) * 420;
    const r = 220 + ((Math.sin(i * 41.7) + 1) / 2) * 260;
    const geo = new THREE.ConeGeometry(r, h, 6 + (i % 3), 1);
    const p = geo.attributes.position;
    const cols = new Float32Array(p.count * 3);
    for (let v = 0; v < p.count; v++) {
      const t = (p.getY(v) + h / 2) / h;
      const snow = Math.min(1, Math.max(0, (t - 0.45) / 0.25));
      const rock = [0.36, 0.45, 0.62];
      const wht = [0.95, 0.97, 1.0];
      for (let k = 0; k < 3; k++) cols[v * 3 + k] = Math.pow(lerp(rock[k], wht[k], snow), 2.2);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const m = new THREE.Mesh(geo, mat);
    const dist = 1500 + (i % 4) * 160;
    m.position.set(Math.sin(a) * dist, h / 2 - 260, Math.cos(a) * dist);
    mountains.add(m);
  }
  scene.add(mountains);
}

const world = new World(scene);
const spray = new Spray(scene);
const snowfall = new Snowfall(scene, isTouch ? 600 : 1400);
const skier = createSkier();
scene.add(skier.root);
const audio = new GameAudio();
const sim = new SkierSim();

function applyTheme(i) {
  const t = THEMES[i % THEMES.length];
  themeIdx = i % THEMES.length;
  if (scene.background && scene.background.dispose) scene.background.dispose();
  scene.background = makeSky(t.sky);
  scene.fog.color.set(t.fog).convertSRGBToLinear();
  sun.color.set(t.sun);
  sun.intensity = t.sunI;
  hemi.color.set(t.hemi[0]);
  hemi.groundColor.set(t.hemi[1]);
  hemi.intensity = t.hemi[2];
  mtMat.color.set(t.mt);
  renderer.toneMappingExposure = t.exp;
}

// ---------- Eingabe ----------
const keys = new Set();
let jumpEdge = false;
let startEdge = false;
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (!keys.has(e.code)) {
    if (e.code === 'Space') jumpEdge = true;
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyR') startEdge = true;
    if (e.code === 'KeyM') {
      const m = audio.toggleMute();
      $('mute').textContent = m ? 'Ton aus (M)' : 'Ton an (M)';
    }
  }
  keys.add(e.code);
  audio.init();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

// Touch: linke/rechte Bildschirmhälfte lenkt, Buttons unten Mitte: Ducken/Salto und Sprung
const touch = { left: false, right: false, tuck: false };
const touchRoles = new Map(); // Finger-ID -> left | right | tuck | jump
function roleFor(t) {
  const el = document.elementFromPoint(t.clientX, t.clientY);
  const b = el && el.closest ? el.closest('[data-btn]') : null;
  if (b) return b.dataset.btn;
  return t.clientX < window.innerWidth / 2 ? 'left' : 'right';
}
function syncTouch() {
  touch.left = touch.right = touch.tuck = false;
  for (const r of touchRoles.values()) {
    if (r === 'left') touch.left = true;
    else if (r === 'right') touch.right = true;
    else if (r === 'tuck') touch.tuck = true;
  }
  $('b-tuck').classList.toggle('on', touch.tuck);
}
window.addEventListener('touchstart', (e) => {
  audio.init();
  for (const t of e.changedTouches) {
    const role = roleFor(t);
    touchRoles.set(t.identifier, role);
    if (role === 'jump') jumpEdge = true;
    if (state !== 'playing' && role !== 'jump' && role !== 'tuck') startEdge = true;
  }
  syncTouch();
}, { passive: true });
const touchEnd = (e) => {
  for (const t of e.changedTouches) touchRoles.delete(t.identifier);
  syncTouch();
  audio.init();
};
window.addEventListener('touchend', touchEnd, { passive: true });
window.addEventListener('touchcancel', touchEnd, { passive: true });
if (isTouch) document.body.classList.add('touch');
$('start').addEventListener('click', () => {
  audio.init();
  startEdge = true;
});
$('retry').addEventListener('click', () => {
  startEdge = true;
});

function readInput() {
  const left = keys.has('ArrowLeft') || keys.has('KeyA') || touch.left;
  const right = keys.has('ArrowRight') || keys.has('KeyD') || touch.right;
  const up = keys.has('ArrowUp') || keys.has('KeyW');
  const down = keys.has('ArrowDown') || keys.has('KeyS') || touch.tuck;
  return {
    steer: (right ? 1 : 0) - (left ? 1 : 0),
    tuck: down,
    brake: keys.has('ShiftLeft') || keys.has('ShiftRight'),
    jump: keys.has('Space'),
    jumpPressed: jumpEdge,
    flipAxis: (up ? 1 : 0) - (down ? 1 : 0),
  };
}

// ---------- Spielzustand ----------
let state = 'menu'; // menu | playing | over
let score = 0;
let trickScore = 0;
let streak = 0;
let comboT = 0;
let best = 0;
try {
  best = parseInt(localStorage.getItem('skifahren.best') || '0', 10) || 0;
} catch (e) {
  best = 0;
}
let overTimer = 0;
let shake = 0;
let time = 0;
let camYaw = 0;
let camPos = new THREE.Vector3(0, 10, 12);
let fov = 64;
let bestTrick = 0;
let closeCalls = 0;
let gatesHit = 0;
let bestSpins = 0;
let bestAir = 0;
let runCount = 0;

const GOALS = [
  { id: 'd500', text: '500 m weit fahren', test: (r) => r.dist >= 500 },
  { id: 'g3', text: '3 Boost-Tore in einem Lauf', test: (r) => r.gates >= 3 },
  { id: 's180', text: 'Eine 180° sauber landen', test: (r) => r.spins >= 1 },
  { id: 'c5', text: '5x knapp ausweichen', test: (r) => r.close >= 5 },
  { id: 'v100', text: '100 km/h erreichen', test: (r) => r.speed >= 100 },
  { id: 'd1500', text: '1500 m weit fahren', test: (r) => r.dist >= 1500 },
  { id: 's360', text: 'Eine 360° sauber landen', test: (r) => r.spins >= 2 },
  { id: 'a2', text: '2 Sekunden Flugzeit', test: (r) => r.air >= 2 },
  { id: 'g8', text: '8 Boost-Tore in einem Lauf', test: (r) => r.gates >= 8 },
  { id: 'p5000', text: '5000 Punkte in einem Lauf', test: (r) => r.score >= 5000 },
  { id: 'v140', text: '140 km/h erreichen', test: (r) => r.speed >= 140 },
  { id: 's720', text: 'Eine 720° sauber landen', test: (r) => r.spins >= 4 },
];
let goalsDone = [];
try {
  goalsDone = JSON.parse(localStorage.getItem('skifahren.goals') || '[]');
  if (!Array.isArray(goalsDone)) goalsDone = [];
} catch (e) {
  goalsDone = [];
}
const openGoals = () => GOALS.filter((g) => !goalsDone.includes(g.id)).slice(0, 3);
function renderGoals(el, list, doneIds = []) {
  el.innerHTML = '';
  for (const g of list) {
    const li = document.createElement('li');
    li.textContent = g.text;
    if (doneIds.includes(g.id)) li.className = 'done';
    el.appendChild(li);
  }
}

const mult = () => Math.min(8, 1 + 0.5 * streak);

function popup(text, cls = '') {
  const el = document.createElement('div');
  el.className = 'pop ' + cls;
  el.textContent = text;
  $('popups').appendChild(el);
  setTimeout(() => el.remove(), 1600);
}

function award(points, label, cls) {
  const p = Math.round(points * mult());
  trickScore += p;
  bestTrick = Math.max(bestTrick, p);
  popup(`${label}  +${p}`, cls);
}

function startRun() {
  sim.reset();
  world.reset();
  world.update(0, 99);
  score = 0;
  trickScore = 0;
  streak = 0;
  comboT = 0;
  bestTrick = 0;
  closeCalls = 0;
  gatesHit = 0;
  bestSpins = 0;
  bestAir = 0;
  overTimer = 0;
  applyTheme(runCount++);
  camYaw = 0;
  state = 'playing';
  $('menu').classList.add('hidden');
  $('over').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('touchui').classList.toggle('hidden', !isTouch);
  audio.start();
}

function endRun() {
  state = 'over';
  const total = Math.round(score);
  const isBest = total > best;
  if (isBest) {
    best = total;
    try {
      localStorage.setItem('skifahren.best', String(best));
    } catch (e) {}
  }
  $('o-reason').textContent = sim.reason || 'Gestürzt';
  $('o-score').textContent = total.toLocaleString('de-CH');
  $('o-new').classList.toggle('hidden', !isBest);
  $('o-best').textContent = best.toLocaleString('de-CH');
  $('o-dist').textContent = Math.round(-sim.z) + ' m';
  $('o-speed').textContent = Math.round(sim.maxSpeed * 3.6) + ' km/h';
  $('o-trick').textContent = bestTrick.toLocaleString('de-CH');
  const run = { dist: -sim.z, gates: gatesHit, spins: bestSpins, close: closeCalls, speed: sim.maxSpeed * 3.6, air: bestAir, score: total };
  const before = openGoals();
  const newly = before.filter((g) => g.test(run));
  if (newly.length) {
    goalsDone = goalsDone.concat(newly.map((g) => g.id));
    try {
      localStorage.setItem('skifahren.goals', JSON.stringify(goalsDone));
    } catch (e) {}
  }
  $('o-goalwrap').classList.toggle('hidden', before.length === 0);
  renderGoals($('o-goals'), before, newly.map((g) => g.id));
  $('o-gates').textContent = gatesHit;
  $('over').classList.remove('hidden');
}

// ---------- Events der Physik ----------
function handleEvents() {
  for (const e of sim.drainEvents()) {
    if (e.type === 'takeoff') {
      if (e.ollie) audio.jump();
    } else if (e.type === 'land') {
      const big = e.airTime > 0.45 || e.spins > 0 || e.flips > 0;
      if (e.impact > 6) audio.land(e.impact);
      spray.emit(sim.x, sim.y + 0.2, sim.z, 0, 3, 0, 7, Math.min(60, 8 + e.impact * 3));
      shake = Math.max(shake, Math.min(0.5, e.impact * 0.02));
      if (e.clean) {
        bestSpins = Math.max(bestSpins, e.spins);
        bestAir = Math.max(bestAir, e.airTime);
      }
      if (big && e.clean) {
        const pts = e.airTime * 60 + e.spins * 150 + e.flips * 350;
        const parts = [];
        if (e.flips) parts.push(e.flips > 1 ? `${e.flips}x FLIP` : 'FLIP');
        if (e.spins) parts.push(`${e.spins * 180}°`);
        if (!parts.length) parts.push(`AIR ${e.airTime.toFixed(1)}s`);
        streak++;
        comboT = 5;
        award(pts, parts.join(' + '), e.spins + e.flips > 0 ? 'trick' : 'air');
        audio.trick(Math.min(6, e.spins + e.flips * 2));
      } else if (big && !e.clean) {
        popup('WACKELIG', 'bad');
      }
    } else if (e.type === 'crash') {
      streak = 0;
      comboT = 0;
      audio.crash();
      shake = 1;
      spray.emit(sim.x, sim.y + 0.5, sim.z, sim.vx * 0.3, 5, sim.vz * 0.3, 10, 120);
    }
  }
}

// ---------- Hindernisse ----------
function checkObstacles() {
  const list = world.obstaclesNear(sim.z);
  for (const o of list) {
    const dx = sim.x - o.x;
    const dz = sim.z - o.z;
    if (Math.abs(dx) > 5 || Math.abs(dz) > 5) continue;
    const dist = Math.hypot(dx, dz);
    const top = o.type === 'tree' ? 7 * o.s : 1.1 * o.s;
    const above = sim.y - o.y;
    if (dist < o.r + 0.4 && above < top) {
      sim.crash(o.type === 'tree' ? 'Baum erwischt' : 'Felsen erwischt');
      return;
    }
    if (!o.counted && dist < o.r + 1.8 && above < top && sim.speed > 14) {
      o.counted = true;
      closeCalls++;
      streak++;
      comboT = 5;
      award(40 + sim.speed, 'KNAPP', 'close');
      audio.close();
    }
  }
}

// ---------- Boost-Tore ----------
function checkGates(prevZ) {
  for (const g of world.gatesNear(sim.z)) {
    if (g.passed) continue;
    if (prevZ > g.z && sim.z <= g.z) {
      const d = Math.hypot(sim.x - g.x, sim.y + 0.9 - g.y);
      if (d < g.r) {
        world.markGate(g);
        gatesHit++;
        streak++;
        comboT = 5;
        sim.boost(5);
        shake = Math.max(shake, 0.2);
        award(100 + gatesHit * 10, `TOR ${gatesHit}`, 'gate');
        audio.gate(gatesHit);
      } else if (d < g.r + 2.5) {
        g.passed = true;
        popup('KNAPP DANEBEN', 'bad');
      }
    }
  }
}

// ---------- Skifahrer-Pose ----------
function poseSkier(dt, inp) {
  const m = skier;
  m.root.position.set(sim.x, sim.y, sim.z);
  const fx = Math.sin(sim.heading);
  const fz = -Math.cos(sim.heading);
  const g = gradientAt(sim.x, sim.z);
  const slope = Math.atan(g.x * fx + g.z * fz);
  const lean = damp(sim.lean, -inp.steer * clampN(sim.speed / 30, 0.2, 1) * 0.5, 9, dt);
  sim.lean = lean;
  const rig = m.rig;
  rig.rotation.order = 'YXZ';
  if (sim.crashed) {
    const a = Math.min(sim.crashTime * 9, Math.PI * 2 + 1.4);
    rig.rotation.set(-a, -sim.heading, Math.sin(sim.crashTime * 7) * 0.4 * Math.exp(-sim.crashTime));
    rig.position.y = 0.25 * Math.min(1, sim.crashTime * 3);
  } else {
    rig.position.y = 0;
    if (sim.grounded) {
      rig.rotation.set(slope, -sim.heading, lean);
    } else {
      rig.rotation.set(-sim.flip * 1 + slope * 0.4, -sim.heading - sim.spin, lean * 0.5);
    }
  }
  const wantTuck = (inp.tuck && sim.grounded ? 1 : 0) + (!sim.grounded ? 0.5 : 0);
  m.tuck = damp(m.tuck, wantTuck, 10, dt);
  m.torsoPivot.rotation.x = -0.15 - m.tuck * 0.85;
  m.torsoPivot.position.y = 0.62 - m.tuck * 0.18;
  m.head.rotation.x = m.tuck * 0.5;
  for (let i = 0; i < 2; i++) {
    m.arms[i].rotation.x = -0.4 - m.tuck * 0.9;
    m.arms[i].rotation.z = (i === 0 ? 1 : -1) * (0.25 + (sim.grounded ? 0 : 0.5));
  }
}

// ---------- Kamera ----------
const tmp = new THREE.Vector3();
function updateCamera(dt) {
  const sp = sim.speed;
  if (state === 'menu') {
    const a = time * 0.35;
    const tx = sim.x + Math.sin(a) * 6.5;
    const tz = sim.z + Math.cos(a) * 6.5;
    camPos.set(tx, heightAt(tx, tz) + 2.4, tz);
    camera.position.copy(camPos);
    camera.lookAt(sim.x, sim.y + 1.0, sim.z);
    fov = damp(fov, 55, 4, dt);
  } else {
    const mv = sp > 2 ? Math.atan2(sim.vx, -sim.vz) : sim.heading;
    let diff = mv - camYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    camYaw += diff * (1 - Math.exp(-3.2 * dt));
    const dist = 8.2 + sp * 0.035;
    const up = 3.3 + sp * 0.012;
    const bx = sim.x - Math.sin(camYaw) * dist;
    const bz = sim.z + Math.cos(camYaw) * dist;
    const by = Math.max(sim.y + up * 0.8, heightAt(bx, bz) + 1.4) + up * 0.3;
    tmp.set(bx, by, bz);
    const k = state === 'over' ? 1.5 : 7;
    camPos.x = damp(camPos.x, tmp.x, k, dt);
    camPos.y = damp(camPos.y, tmp.y, k, dt);
    camPos.z = damp(camPos.z, tmp.z, k, dt);
    camPos.y = Math.max(camPos.y, heightAt(camPos.x, camPos.z) + 1.0);
    camera.position.copy(camPos);
    if (shake > 0) {
      camera.position.x += (Math.random() - 0.5) * shake * 0.5;
      camera.position.y += (Math.random() - 0.5) * shake * 0.5;
      shake = Math.max(0, shake - dt * 2.2);
    }
    camera.lookAt(sim.x + Math.sin(camYaw) * 6, sim.y + 1.2, sim.z - Math.cos(camYaw) * 6);
    const wantFov = 62 + clampN(sp, 0, 70) * 0.5 + (sim.grounded ? 0 : 4);
    fov = damp(fov, wantFov, 3, dt);
  }
  // Hochformat (Handy): größeres vertikales Sichtfeld, damit die Piste breit genug wirkt
  const f = Math.min(105, fov * (camera.aspect < 1 ? 1.3 : 1));
  if (Math.abs(camera.fov - f) > 0.01) {
    camera.fov = f;
    camera.updateProjectionMatrix();
  }
}

// ---------- HUD ----------
let hudT = 0;
function updateHud() {
  $('speed').textContent = Math.round(sim.speed * 3.6);
  $('score').textContent = Math.round(score).toLocaleString('de-CH');
  $('best').textContent = 'Bestwert ' + best.toLocaleString('de-CH');
  $('dist').textContent = Math.round(-sim.z) + ' m';
  const cb = $('combo');
  if (streak > 0 && comboT > 0) {
    cb.classList.remove('hidden');
    cb.textContent = 'x' + mult().toFixed(1);
    $('combobar').style.width = (comboT / 5) * 100 + '%';
    $('combowrap').classList.remove('hidden');
  } else {
    cb.classList.add('hidden');
    $('combowrap').classList.add('hidden');
  }
  // Tempo-Vignette
  const v = clampN((sim.speed - 25) / 45, 0, 1);
  $('vignette').style.opacity = (v * 0.9).toFixed(2);
}

// ---------- Resize ----------
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- Hauptschleife ----------
let last = performance.now();
const FIXED = 1 / 120;
let acc = 0;

function frame(now) {
  renderGoals($('m-goals'), openGoals());
applyTheme(0);
requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;

  if (startEdge) {
    startEdge = false;
    if (state === 'menu' || (state === 'over' && overTimer > 0.7)) startRun();
  }

  const inp = readInput();

  if (state === 'playing') {
    acc += dt;
    let first = true;
    while (acc >= FIXED) {
      acc -= FIXED;
      const pz = sim.z;
      sim.update(FIXED, { ...inp, jumpPressed: first && inp.jumpPressed });
      first = false;
      if (!sim.crashed) {
        checkObstacles();
        checkGates(pz);
      }
      if (sim.crashed) break;
    }
    handleEvents();
    // Punkte: Distanz + Tricks
    score = -sim.z * 0.5 + trickScore;
    if (comboT > 0) {
      comboT -= dt;
      if (comboT <= 0) streak = 0;
    }
    if (sim.crashed) {
      state = 'over';
      overTimer = 0;
      score = -sim.z * 0.5 + trickScore;
      setTimeout(endRun, 900);
    }
  } else if (state === 'over') {
    overTimer += dt;
    sim.update(dt, inp);
  }
  jumpEdge = false;

  world.update(sim.z, state === 'playing' || state === 'over' ? 1 : 0);

  // Spray an den Skiern
  if (state === 'playing' && sim.grounded && sim.carve > 0.15 && sim.speed > 6) {
    const side = Math.cos(sim.heading);
    const n = Math.ceil(sim.carve * sim.speed * 0.18);
    spray.emit(
      sim.x, sim.y + 0.1, sim.z,
      -sim.vx * 0.12 + side * (Math.random() - 0.5) * 4, 1.5 + sim.carve * 2.5, -sim.vz * 0.12,
      2.5, n
    );
  }
  spray.update(dt);

  poseSkier(dt, inp);
  updateCamera(dt);
  snowfall.update(dt, camera.position, time);
  mountains.position.set(camera.position.x, sim.y, camera.position.z);

  const sd = THEMES[themeIdx].sunDir;
  sun.position.set(sim.x + sd[0], sim.y + sd[1], sim.z + sd[2]);
  sun.target.position.set(sim.x, sim.y, sim.z);
  sun.target.updateMatrixWorld();

  audio.update(sim.speed, sim.carve, sim.grounded, state === 'playing');

  hudT += dt;
  if (hudT > 0.05) {
    hudT = 0;
    if (state === 'playing') updateHud();
  }

  renderer.render(scene, camera);
}

// Start: Welt vorbauen, Menü zeigen
world.update(0, 99);
$('best').textContent = 'Bestwert ' + best.toLocaleString('de-CH');
$('m-best').textContent = best ? 'Dein Bestwert: ' + best.toLocaleString('de-CH') : 'Noch kein Rekord – hol dir den ersten!';
renderGoals($('m-goals'), openGoals());
applyTheme(0);
requestAnimationFrame(frame);
