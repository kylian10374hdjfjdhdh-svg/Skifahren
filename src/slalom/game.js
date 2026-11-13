import { SkierSim } from '../sim.js';
import { GameAudio } from '../audio.js';
import { Spray, Snowfall, Trail } from '../fx.js';
import { createSkier } from '../skier-model.js';
import {
  GATES, SPLIT_GATES, START, FINISH_T, MISS_PENALTY, CRASH_PENALTY, POLE_H,
  courseTerrain, courseHeight, courseGradient, centerOfCourse, gateCrossing, fenceCheck,
  medalFor, finalScore, formatTime,
} from './course.js';
import { SlalomWorld } from './world.js';

const THREE = window.THREE;
const $ = (id) => document.getElementById(id);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const clampN = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------- Renderer / Szene ----------
const isTouch = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance' });
const PR_MAX = Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 1.75);
let pr = PR_MAX;
renderer.setPixelRatio(pr);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(new THREE.Color(0xcfe2f3).convertSRGBToLinear(), 0.0024);

const THEMES = [
  { name: 'Tag', sky: ['#2f6fc0', '#7fb4e6', '#cfe2f3', '#e8f1fa'], fog: 0xcfe2f3, sun: 0xfff1d6, sunI: 1.7, hemi: [0xcfe3ff, 0xc2d0e6, 1.0], mt: 0xffffff, sunDir: [-70, 80, 60], exp: 0.85 },
  { name: 'Sonnenuntergang', sky: ['#4a4f9a', '#d9788f', '#ffae6e', '#ffe0a8'], fog: 0xf5bf94, sun: 0xff9a4d, sunI: 2.0, hemi: [0xffcfae, 0xe0b0b8, 0.8], mt: 0xffcdb4, sunDir: [-120, 40, -80], exp: 1.0 },
  { name: 'Blaue Stunde', sky: ['#1a2f66', '#3f64a8', '#8fb0dd', '#c9d8f0'], fog: 0xa4b9dc, sun: 0xcfe0ff, sunI: 1.5, hemi: [0xc2d4fa, 0xa8b8dc, 1.0], mt: 0xc4d2f4, sunDir: [80, 90, 70], exp: 1.05 },
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

const camera = new THREE.PerspectiveCamera(64, 1, 0.1, 2600);
const hemi = new THREE.HemisphereLight(0xcfe6ff, 0xdfe8f5, 0.75);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(isTouch ? 1024 : 1536, isTouch ? 1024 : 1536);
const sc = sun.shadow.camera;
sc.left = -48; sc.right = 48; sc.top = 48; sc.bottom = -48; sc.near = 10; sc.far = 320;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);

// Ferne Berge als Kulisse (weit hinter dem Hang, folgen der Kamera)
const mountains = new THREE.Group();
const mtMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false });
for (let i = 0; i < 26; i++) {
  const a = (i / 26) * Math.PI * 2 + Math.sin(i * 12.9) * 0.15;
  const h = 300 + ((Math.sin(i * 78.2) + 1) / 2) * 420;
  const r = 240 + ((Math.sin(i * 41.7) + 1) / 2) * 260;
  const geo = new THREE.ConeGeometry(r, h, 6 + (i % 3), 1);
  const p = geo.attributes.position;
  const cols = new Float32Array(p.count * 3);
  for (let v = 0; v < p.count; v++) {
    const t = (p.getY(v) + h / 2) / h;
    const snow = Math.min(1, Math.max(0, (t - 0.45) / 0.25));
    const rock = [0.36, 0.45, 0.62];
    const wht = [0.95, 0.97, 1.0];
    const low = Math.max(0, 1 - t / 0.3) * 0.85;
    const fogc = [0.81, 0.89, 0.95];
    for (let k = 0; k < 3; k++) cols[v * 3 + k] = Math.pow(lerp(lerp(rock[k], wht[k], snow), fogc[k], low), 2.2);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const m = new THREE.Mesh(geo, mtMat);
  const dist = 1500 + (i % 4) * 160;
  m.position.set(Math.sin(a) * dist, h / 2 - 150, Math.cos(a) * dist);
  mountains.add(m);
}
scene.add(mountains);

const world = new SlalomWorld(scene);
const spray = new Spray(scene);
const snowfall = new Snowfall(scene, isTouch ? 600 : 1400);
const trail = new Trail(scene);
const skier = createSkier();
scene.add(skier.root);
const audio = new GameAudio();
const sim = new SkierSim(courseTerrain);
sim.reset(START.x, START.z);

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
let boostEdge = false;
let startEdge = false;
let restartEdge = false;
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (!keys.has(e.code)) {
    if (e.code === 'Space') jumpEdge = true;
    if (e.code === 'KeyE') boostEdge = true;
    if (e.code === 'Space' || e.code === 'Enter') startEdge = true;
    if (e.code === 'KeyR') restartEdge = true;
    if (e.code === 'KeyM') {
      const m = audio.toggleMute();
      $('mute').textContent = (m ? 'Ton aus (M)' : 'Ton an (M)') + ' · Neustart (R)';
    }
  }
  keys.add(e.code);
  audio.init();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

const touch = { left: false, right: false, tuck: false, grab: false };
const touchRoles = new Map();
function roleFor(t) {
  const el = document.elementFromPoint(t.clientX, t.clientY);
  const b = el && el.closest ? el.closest('[data-btn]') : null;
  if (b) return b.dataset.btn;
  return t.clientX < window.innerWidth / 2 ? 'left' : 'right';
}
function syncTouch() {
  touch.left = touch.right = touch.tuck = touch.grab = false;
  for (const r of touchRoles.values()) {
    if (r === 'left') touch.left = true;
    else if (r === 'right') touch.right = true;
    else if (r === 'tuck') touch.tuck = true;
    else if (r === 'grab') touch.grab = true;
  }
  $('b-tuck').classList.toggle('on', touch.tuck);
  $('b-grab').classList.toggle('on', touch.grab);
}
window.addEventListener('touchstart', (e) => {
  audio.init();
  for (const t of e.changedTouches) {
    const role = roleFor(t);
    touchRoles.set(t.identifier, role);
    if (role === 'jump') jumpEdge = true;
    if (role === 'boost') boostEdge = true;
    if (state !== 'run' && state !== 'countdown' && !['jump', 'tuck', 'grab', 'boost'].includes(role)) startEdge = true;
  }
  syncTouch();
}, { passive: true });
const touchEnd = (e) => {
  for (const t of e.changedTouches) touchRoles.delete(t.identifier);
  syncTouch();
};
window.addEventListener('touchend', touchEnd, { passive: true });
window.addEventListener('touchcancel', touchEnd, { passive: true });
if (isTouch) document.body.classList.add('touch');
$('start').addEventListener('click', () => { audio.init(); startEdge = true; });
$('retry').addEventListener('click', () => { startEdge = true; });

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
    grab: keys.has('KeyG') || touch.grab,
  };
}

// ---------- Spielstand / Speicher ----------
const STORE = 'skifahren.slalom.v1';
let save = { bestTime: 0, bestScore: 0, splits: [], runs: 0 };
try {
  const s = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (s && typeof s === 'object') save = { ...save, ...s };
} catch (e) {}
function persist() {
  try {
    localStorage.setItem(STORE, JSON.stringify(save));
  } catch (e) {}
}

// ---------- Zustand ----------
let state = 'menu'; // menu | countdown | run | finish
let runTime = 0; // reine Fahrzeit
let penalty = 0;
let points = 0;
let streak = 0;
let comboT = 0;
let meter = 0;
let bestTrick = 0;
let topSpeed = 0;
let gatesHit = 0;
let gatesMissed = 0;
let nextGate = 0;
let splits = [];
let countT = 0;
let respawnT = 0;
let finishT = 0;
let shake = 0;
let time = 0;
let camYaw = 0;
let fov = 64;
let runCount = 0;
let lastCount = 4;
let result = null;
const camPos = new THREE.Vector3(0, 10, 12);
const mult = () => Math.min(8, 1 + 0.5 * streak);
const totalTime = () => runTime + penalty;

function popup(text, cls = '') {
  const el = document.createElement('div');
  el.className = 'pop ' + cls;
  el.textContent = text;
  $('popups').appendChild(el);
  setTimeout(() => el.remove(), 1600);
}
function award(p, label, cls) {
  const v = Math.round(p * mult());
  points += v;
  meter = Math.min(100, meter + Math.min(30, v / 25));
  bestTrick = Math.max(bestTrick, v);
  popup(`${label}  +${v}`, cls);
}
function addPenalty(sec, label) {
  penalty += sec;
  popup(`${label}  +${sec.toFixed(0)} s`, 'pen');
  const el = $('sl-pen');
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

// Fortschrittsleiste mit Torpunkten
function buildDots() {
  const box = $('sl-dots');
  box.innerHTML = '';
  GATES.forEach((g) => {
    const i = document.createElement('i');
    i.style.left = (g.t / FINISH_T) * 100 + '%';
    box.appendChild(i);
  });
  SPLIT_GATES.forEach((gi) => {
    const i = document.createElement('i');
    i.className = 'sec';
    i.style.left = ((GATES[gi].t + 18) / FINISH_T) * 100 + '%';
    box.appendChild(i);
  });
}
buildDots();
const dotEls = () => Array.from($('sl-dots').children).slice(0, GATES.length);

function startRun() {
  sim.reset(START.x, START.z);
  world.resetGates();
  runTime = 0;
  penalty = 0;
  points = 0;
  streak = 0;
  comboT = 0;
  meter = 0;
  bestTrick = 0;
  topSpeed = 0;
  gatesHit = 0;
  gatesMissed = 0;
  nextGate = 0;
  splits = [];
  respawnT = 0;
  trail.clear();
  applyTheme(runCount++);
  camYaw = 0;
  countT = 3.2;
  lastCount = 4;
  state = 'countdown';
  dotEls().forEach((d) => (d.className = ''));
  $('sl-pen').textContent = '';
  $('menu').classList.add('hidden');
  $('over').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('touchui').classList.toggle('hidden', !isTouch);
  $('sl-count').classList.remove('hidden');
  audio.start();
  camPos.set(sim.x + 5, sim.y + 4, sim.z + 12);
}

function showSplit(label, t) {
  const best = save.splits && save.splits.length ? save.splits : null;
  const idx = splits.length - 1;
  const el = $('sl-split');
  let delta = '';
  el.classList.remove('fast', 'slow');
  if (best && best[idx] != null) {
    const d = t - best[idx];
    delta = (d <= 0 ? '−' : '+') + Math.abs(d).toFixed(2);
    el.classList.add(d <= 0 ? 'fast' : 'slow');
  }
  el.innerHTML = `${formatTime(t)}<small>${label}${delta ? ' · ' + delta : ''}</small>`;
  el.classList.remove('hidden');
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
}

function finishRun() {
  state = 'finish';
  finishT = 0;
  const tot = totalTime();
  splits.push(tot);
  const score = finalScore(points, tot);
  const isBest = !save.bestTime || tot < save.bestTime;
  const newScore = score > save.bestScore;
  if (isBest) {
    save.bestTime = tot;
    save.splits = splits.slice();
  }
  if (newScore) save.bestScore = score;
  save.runs++;
  persist();
  result = { tot, score, isBest };
  audio.huge();
  setTimeout(showResult, 1800);
}

function showResult() {
  if (state !== 'finish' || !result) return;
  const medal = medalFor(result.tot);
  const m = $('o-medal');
  m.textContent = medal ? medal + '-Medaille' : 'Im Ziel';
  m.className = 'eyebrow ' + medal.toLowerCase();
  $('o-time').textContent = formatTime(result.tot);
  $('o-new').classList.toggle('hidden', !result.isBest);
  $('o-raw').textContent = formatTime(runTime);
  $('o-pen').textContent = '+' + penalty.toFixed(2);
  $('o-gates').textContent = `${gatesHit} / ${GATES.length}`;
  $('o-points').textContent = Math.round(points).toLocaleString('de-CH');
  $('o-bonus').textContent = '+' + Math.round(result.score - points).toLocaleString('de-CH');
  $('o-score').textContent = result.score.toLocaleString('de-CH');
  $('o-btime').textContent = formatTime(save.bestTime);
  $('o-bscore').textContent = save.bestScore.toLocaleString('de-CH');
  $('o-speed').textContent = Math.round(topSpeed * 3.6) + ' km/h';
  $('o-trick').textContent = bestTrick.toLocaleString('de-CH');
  $('touchui').classList.add('hidden');
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
      if (big && e.clean && state === 'run') {
        let pts = e.airTime * 60 + e.spins * 150 + e.flips * 350;
        const parts = [];
        if (e.grab > 0.35) {
          parts.push('GRAB');
          pts += e.grab * 90;
        }
        if (e.flips) parts.push(e.flips > 1 ? `${e.flips}x FLIP` : 'FLIP');
        if (e.spins) parts.push(`${e.spins * 180}°`);
        if (e.airTime > 1.3) {
          parts.unshift(e.airTime > 2 ? 'MEGA AIR' : 'HUGE AIR');
          pts += e.airTime * 120;
          audio.huge();
        }
        if (!parts.length) parts.push(`AIR ${e.airTime.toFixed(1)}s`);
        streak++;
        comboT = 5;
        award(pts, parts.join(' + '), 'trick');
        audio.trick(Math.min(6, e.spins + e.flips * 2));
      } else if (big && !e.clean) {
        popup('WACKELIG', 'bad');
      }
    } else if (e.type === 'crash') {
      if (state === 'run') {
        addPenalty(CRASH_PENALTY, 'STURZ');
        streak = 0;
        comboT = 0;
        respawnT = 1.5;
      }
      audio.crash();
      shake = 1;
      spray.emit(sim.x, sim.y + 0.5, sim.z, sim.vx * 0.3, 5, sim.vz * 0.3, 10, 120);
    }
  }
}

function respawn() {
  const c = centerOfCourse(sim.z);
  const x = c + clampN(sim.x - c, -10, 10);
  const z = sim.z;
  const top = topSpeed;
  sim.reset(x, z);
  topSpeed = top;
  sim.vz = -10;
  respawnT = 0;
  trail.clear();
}

// ---------- Tore, Stangen, Zaun ----------
function checkCourse(px, pz) {
  // Zaun
  const f = fenceCheck(sim.x, sim.z);
  if (f) {
    sim.x = f.x;
    const out = sim.vx * f.side;
    if (out > 0) sim.vx -= out * 1.4;
    sim.vz *= 0.97;
    shake = Math.max(shake, 0.12);
    if (!checkCourse.fenceCd || time - checkCourse.fenceCd > 0.8) {
      checkCourse.fenceCd = time;
      audio.land(8);
    }
  }
  if (state !== 'run' || sim.crashed) return;

  // Tore
  while (nextGate < GATES.length && GATES[nextGate].z > sim.z) {
    const g = GATES[nextGate];
    const c = gateCrossing(px, pz, sim.x, sim.z, g);
    if (c) {
      if (c.hit) {
        gatesHit++;
        streak++;
        comboT = 5;
        world.gateState(nextGate, 'hit');
        dotEls()[nextGate].className = 'hit';
        const kmh = sim.speed * 3.6;
        let p = 60 + kmh * 0.8;
        let label = `TOR ${gatesHit}`;
        if (c.perfect) {
          p += 70;
          label = 'PERFEKT';
          meter = Math.min(100, meter + 10);
        }
        meter = Math.min(100, meter + 10);
        award(p, label, 'gate');
        audio.gate(Math.min(8, streak));
      } else {
        gatesMissed++;
        streak = 0;
        comboT = 0;
        world.gateState(nextGate, 'miss');
        dotEls()[nextGate].className = 'miss';
        addPenalty(MISS_PENALTY, 'TOR VERPASST');
        audio.close();
      }
      const si = SPLIT_GATES.indexOf(nextGate);
      if (si >= 0) {
        splits.push(totalTime());
        showSplit('Zwischenzeit ' + (si + 1), totalTime());
      }
    }
    nextGate++;
  }
  world.setNextGate(nextGate);

  // Stangen (Berührung bremst und wackelt)
  for (let i = Math.max(0, nextGate - 1); i < Math.min(GATES.length, nextGate + 2); i++) {
    const g = GATES[i];
    if (Math.abs(sim.z - g.z) > 1.5) continue;
    for (let s = 0; s < 2; s++) {
      const px2 = g.x + (s ? 1 : -1) * (g.w / 2);
      if (Math.abs(sim.x - px2) < 0.55 && sim.y - courseHeight(px2, g.z) < POLE_H) {
        const o = world.gateObjs[i].poles[s];
        if (!o.wobble) {
          world.poleHit(i, s);
          const keep = 0.9;
          sim.vx *= keep;
          sim.vz *= keep;
          shake = Math.max(shake, 0.18);
          audio.land(7);
        }
      }
    }
  }

  // Ziel
  if (sim.z <= -FINISH_T) {
    // genauer: Bruchteil des Schritts zurückrechnen
    finishRun();
  }
}

// ---------- Skifahrer-Pose ----------
function poseSkier(dt, inp) {
  const m = skier;
  m.root.position.set(sim.x, sim.y, sim.z);
  const fx = Math.sin(sim.heading);
  const fz = -Math.cos(sim.heading);
  const g = courseGradient(sim.x, sim.z);
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
    if (sim.grounded) rig.rotation.set(slope, -sim.heading, lean);
    else rig.rotation.set(-sim.flip + slope * 0.4, -sim.heading - sim.spin, lean * 0.5);
  }
  const grabK = sim.grabbing && !sim.grounded ? 1 : 0;
  m.grab = damp(m.grab || 0, grabK, 14, dt);
  const wantTuck = (inp.tuck && sim.grounded ? 1 : 0) + (!sim.grounded ? 0.5 : 0) + grabK * 0.7;
  m.tuck = damp(m.tuck, wantTuck, 10, dt);
  m.torsoPivot.rotation.x = -0.15 - m.tuck * 0.85;
  m.torsoPivot.position.y = 0.62 - m.tuck * 0.18 - m.grab * 0.12;
  m.head.rotation.x = m.tuck * 0.5;
  for (let i = 0; i < 2; i++) {
    m.arms[i].rotation.x = -0.4 - m.tuck * 0.9 - (i === 0 ? m.grab * 1.1 : 0);
    m.arms[i].rotation.z = (i === 0 ? 1 : -1) * (0.25 + (sim.grounded ? 0 : 0.5));
  }
}

// ---------- Kamera ----------
const tmp = new THREE.Vector3();
function updateCamera(dt) {
  const sp = sim.speed;
  if (state === 'menu') {
    const a = time * 0.3;
    const tx = sim.x + Math.sin(a) * 7;
    const tz = sim.z + Math.cos(a) * 7;
    camPos.set(tx, courseHeight(tx, tz) + 2.6, tz);
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
    const by = Math.max(sim.y + up * 0.8, courseHeight(bx, bz) + 1.4) + up * 0.3;
    tmp.set(bx, by, bz);
    const k = state === 'finish' ? 1.5 : 7;
    camPos.x = damp(camPos.x, tmp.x, k, dt);
    camPos.y = damp(camPos.y, tmp.y, k, dt);
    camPos.z = damp(camPos.z, tmp.z, k, dt);
    camPos.y = Math.max(camPos.y, courseHeight(camPos.x, camPos.z) + 1.0);
    camera.position.copy(camPos);
    if (shake > 0) {
      camera.position.x += (Math.random() - 0.5) * shake * 0.5;
      camera.position.y += (Math.random() - 0.5) * shake * 0.5;
      shake = Math.max(0, shake - dt * 2.2);
    }
    camera.lookAt(sim.x + Math.sin(camYaw) * 6, sim.y + 1.2, sim.z - Math.cos(camYaw) * 6);
    const wantFov = 62 + clampN(sp, 0, 70) * 0.5 + (sim.grounded ? 0 : 4) + (sim.boostT > 0 ? 9 : 0);
    fov = damp(fov, wantFov, 3, dt);
  }
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
  $('score').textContent = Math.round(points).toLocaleString('de-CH');
  $('best').textContent = save.bestTime ? 'Bestzeit ' + formatTime(save.bestTime) : '';
  $('sl-time').textContent = formatTime(totalTime());
  $('sl-pen').textContent = penalty > 0 ? `inkl. +${penalty.toFixed(0)} s Strafe` : '';
  $('dist').textContent = `Tor ${Math.min(nextGate, GATES.length)} / ${GATES.length}`;
  $('sl-fill').style.width = clampN((-sim.z / FINISH_T) * 100, 0, 100) + '%';
  $('boostbar').style.width = meter + '%';
  $('boostwrap').classList.toggle('ready', meter >= 20);
  $('boostwrap').classList.toggle('active', sim.boostT > 0);
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
  $('vignette').style.opacity = (clampN((sim.speed - 25) / 45, 0, 1) * 0.9).toFixed(2);
}

// ---------- Resize / adaptive Auflösung ----------
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

let ema = 16;
let adaptT = 0;
const NO_ADAPT = /[?&]noadapt/.test(location.search || '');
const PR_MIN = Math.min(PR_MAX, 1);
function adapt(dt) {
  if (NO_ADAPT) return;
  ema = ema * 0.95 + dt * 1000 * 0.05;
  adaptT += dt;
  if (adaptT < 1.5) return;
  adaptT = 0;
  if (ema > 26 && sun.castShadow) {
    sun.castShadow = false;
  } else if (ema > 34 && pr > PR_MIN) {
    pr = Math.max(PR_MIN, pr * 0.9);
    renderer.setPixelRatio(pr);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  }
}

// ---------- Hauptschleife ----------
let last = performance.now();
const FIXED = 1 / 120;
let acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;

  if (restartEdge && (state === 'run' || state === 'countdown' || state === 'finish')) startRun();
  restartEdge = false;
  if (startEdge) {
    startEdge = false;
    if (state === 'menu' || (state === 'finish' && finishT > 1.2)) startRun();
  }

  const inp = readInput();
  adapt(dt);

  if (state === 'countdown') {
    countT -= dt;
    const n = Math.ceil(countT);
    const el = $('sl-count');
    if (n !== lastCount) {
      lastCount = n;
      if (n > 0) {
        el.textContent = n;
        el.classList.remove('go');
        audio.tone(520, 0.14, 0.12, 'square');
      } else {
        el.textContent = 'LOS!';
        el.classList.add('go');
        audio.tone(880, 0.35, 0.14, 'square');
      }
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = '';
    }
    if (countT <= 0) {
      state = 'run';
      setTimeout(() => $('sl-count').classList.add('hidden'), 600);
    }
  }

  if (state === 'run') {
    acc += dt;
    let first = true;
    while (acc >= FIXED) {
      acc -= FIXED;
      if (respawnT > 0 && sim.crashed) {
        respawnT -= FIXED;
        sim.update(FIXED, inp);
        runTime += FIXED;
        if (respawnT <= 0) respawn();
        continue;
      }
      const px = sim.x;
      const pz = sim.z;
      sim.update(FIXED, { ...inp, jumpPressed: first && inp.jumpPressed });
      first = false;
      runTime += FIXED;
      topSpeed = Math.max(topSpeed, sim.speed);
      if (!sim.crashed) checkCourse(px, pz);
      if (state !== 'run') break;
    }
    handleEvents();
    if (comboT > 0) {
      comboT -= dt;
      if (comboT <= 0) streak = 0;
    }
  } else if (state === 'finish') {
    finishT += dt;
    // Auslaufen: bremsen und zur Mitte lenken
    const c = centerOfCourse(sim.z);
    const steer = clampN((c - sim.x) * 0.05, -0.6, 0.6);
    acc += dt;
    while (acc >= FIXED) {
      acc -= FIXED;
      sim.update(FIXED, { steer, tuck: false, brake: true, jump: false, jumpPressed: false, flipAxis: 0 });
      const f = fenceCheck(sim.x, sim.z);
      if (f) {
        sim.x = f.x;
        sim.vx *= 0.5;
      }
    }
    handleEvents();
  } else if (state === 'countdown') {
    sim.vx = sim.vz = 0;
  }

  if (boostEdge && state === 'run' && !sim.crashed && meter >= 20 && sim.boostT <= 0) {
    sim.boostT = 0.7 + (meter / 100) * 2.6;
    meter = 0;
    shake = Math.max(shake, 0.35);
    audio.boost();
    popup('BOOST', 'gate');
  }
  boostEdge = false;
  jumpEdge = false;

  world.update(dt, sim.z, time);

  if (state === 'run' && sim.grounded && sim.carve > 0.15 && sim.speed > 6) {
    const side = Math.cos(sim.heading);
    const n = Math.ceil(sim.carve * sim.speed * 0.09);
    spray.emit(sim.x, sim.y + 0.1, sim.z, -sim.vx * 0.12 + side * (Math.random() - 0.5) * 4, 1.5 + sim.carve * 2.5, -sim.vz * 0.12, 2.5, n);
  }
  spray.update(dt);
  if (state === 'run') trail.add(sim.x, sim.y, sim.z, sim.heading, sim.grounded && !sim.crashed && sim.speed > 3);
  if (sim.boostT > 0 && state === 'run') spray.emit(sim.x, sim.y + 0.8, sim.z, -sim.vx * 0.08, 0.5, -sim.vz * 0.08, 3, 3);

  poseSkier(dt, inp);
  updateCamera(dt);
  snowfall.update(dt, camera.position, time);
  mountains.position.set(camera.position.x, sim.y, camera.position.z);

  const sd = THEMES[themeIdx].sunDir;
  sun.position.set(sim.x + sd[0], sim.y + sd[1], sim.z + sd[2]);
  sun.target.position.set(sim.x, sim.y, sim.z);
  sun.target.updateMatrixWorld();

  audio.update(sim.speed, sim.carve, sim.grounded, state === 'run');

  hudT += dt;
  if (hudT > 0.05) {
    hudT = 0;
    if (state === 'run' || state === 'countdown') updateHud();
  }

  renderer.render(scene, camera);
}

$('m-best').textContent = save.bestTime
  ? `Bestzeit ${formatTime(save.bestTime)} · Bestpunkte ${save.bestScore.toLocaleString('de-CH')}`
  : 'Noch keine Zeit – fahr die erste!';
applyTheme(0);
world.update(0, sim.z, 0);
window.__dbg = {
  sim, world, camera, startRun, courseHeight, GATES, FINISH_T,
  get state() { return state; },
  get nextGate() { return nextGate; },
  get stats() { return { runTime, penalty, points, gatesHit, gatesMissed }; },
};
requestAnimationFrame(frame);
