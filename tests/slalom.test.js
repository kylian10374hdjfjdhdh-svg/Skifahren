import assert from 'node:assert/strict';
import { SkierSim } from '../src/sim.js';
import {
  GATES, KICKERS, START, FINISH_T, FENCE_U, COURSE_HALF, courseTerrain, courseHeight, centerOfCourse,
  gateCrossing, fenceCheck, formatTime,
} from '../src/slalom/course.js';

const DT = 1 / 60;

// 1) Strecke ist stimmig: Tore liegen auf der Piste, Schanzen kollidieren nicht mit Toren
for (const g of GATES) {
  assert.ok(Math.abs(g.x - centerOfCourse(g.z)) + g.w / 2 <= COURSE_HALF - 1, 'Tor ' + g.id + ' ragt über die Piste');
  assert.ok(g.t < FINISH_T - 20, 'Tor ' + g.id + ' zu nah am Ziel');
}
for (let i = 1; i < GATES.length; i++) assert.ok(GATES[i].t > GATES[i - 1].t, 'Tore müssen aufsteigend sortiert sein');
for (const k of KICKERS) {
  for (const g of GATES) {
    const from = k.t;
    const to = k.t + k.len + 20;
    assert.ok(!(g.t > from - 4 && g.t < to), `Tor ${g.id} liegt auf Schanze bei ${k.t}`);
  }
}

// 2) Gelände: durchgehend endlich, Berghang steigt hinter dem Zaun an (kein Loch / kein Durchblick)
for (let t = -100; t < FINISH_T + 250; t += 10) {
  const z = -t;
  const c = centerOfCourse(z);
  const pisteH = courseHeight(c, z);
  assert.ok(Number.isFinite(pisteH));
  for (const side of [-1, 1]) {
    const wall = courseHeight(c + side * (FENCE_U + 40), z);
    assert.ok(wall > pisteH + 10, `Hang fehlt bei t=${t}: ${wall - pisteH}`);
    const far = courseHeight(c + side * 250, z);
    assert.ok(far > wall - 1, `Hang fällt wieder ab bei t=${t}`);
  }
}

// 3) Torquerung
{
  const g = GATES[0];
  assert.ok(gateCrossing(g.x, g.z + 1, g.x, g.z - 1, g).hit);
  assert.ok(!gateCrossing(g.x + g.w, g.z + 1, g.x + g.w, g.z - 1, g).hit);
  assert.equal(gateCrossing(g.x, g.z - 2, g.x, g.z - 4, g), null);
  assert.ok(gateCrossing(g.x + g.w / 2 - 0.5, g.z + 1, g.x + g.w / 2 - 0.5, g.z - 1, g).perfect);
}
assert.equal(fenceCheck(centerOfCourse(-100), -100), null);
assert.ok(fenceCheck(centerOfCourse(-100) + 30, -100));
assert.equal(formatTime(65.5), '1:05.50');

// 4) Bot fährt die Strecke ab: schafft er sie, in sinnvoller Zeit, mit den meisten Toren?
function runBot(look = 22) {
  const s = new SkierSim(courseTerrain);
  s.reset(START.x, START.z);
  let t = 0;
  let passed = 0;
  let missed = 0;
  let fenceHits = 0;
  let next = 0;
  let airMax = 0;
  const jumps = [];
  while (t < 200 && s.z > -FINISH_T) {
    // Zielpunkt: Tor-Mitte, leicht zur Innenseite der nächsten Kurve
    while (next < GATES.length && GATES[next].z > s.z + 1) next++;
    const g = GATES[Math.min(next, GATES.length - 1)];
    const nx = GATES[Math.min(next + 1, GATES.length - 1)];
    const aimX = g.x + (nx.x - g.x) * 0.15;
    const dz = Math.max(6, s.z - g.z);
    const want = Math.atan2(aimX - s.x, dz + (g.z === nx.z ? 0 : 0));
    const steer = Math.max(-1, Math.min(1, (want - s.heading) * 4));
    const prev = { x: s.x, z: s.z };
    s.update(DT, { steer: s.grounded ? steer : 0, tuck: s.grounded && Math.abs(want - s.heading) < 0.15, brake: false, jump: false, jumpPressed: false, flipAxis: 0 });
    const fc = fenceCheck(s.x, s.z);
    if (fc) {
      fenceHits++;
      s.x = fc.x;
      s.vx *= -0.3;
      s.vz *= 0.85;
    }
    for (const gg of GATES) {
      const c = gateCrossing(prev.x, prev.z, s.x, s.z, gg);
      if (c) c.hit ? passed++ : missed++;
    }
    for (const e of s.drainEvents()) if (e.type === 'land') airMax = Math.max(airMax, e.airTime);
    if (s.crashed) return { crashed: true, t, z: s.z, passed, missed };
    t += DT;
  }
  return { crashed: false, t, z: s.z, passed, missed, fenceHits, airMax, speed: s.maxSpeed };
}
const r = runBot();
console.log('Bot:', JSON.stringify({ ...r, t: +r.t.toFixed(1), z: Math.round(r.z), airMax: r.airMax && +r.airMax.toFixed(2), speed: r.speed && Math.round(r.speed * 3.6) }));
assert.ok(!r.crashed, 'Bot stürzt bei z=' + r.z);
assert.ok(r.z <= -FINISH_T, 'Bot erreicht das Ziel nicht (z=' + r.z + ')');
assert.ok(r.t > 40 && r.t < 120, 'Zeit unplausibel: ' + r.t);
assert.ok(r.passed >= GATES.length * 0.7, `Bot trifft nur ${r.passed}/${GATES.length} Tore`);

console.log('Slalom-Tests bestanden.');
