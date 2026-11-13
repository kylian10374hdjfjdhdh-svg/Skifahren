import assert from 'node:assert/strict';
import { SkierSim } from '../src/sim.js';
import { heightAt, obstaclesInRange, centerX, kickerForCell } from '../src/terrain.js';

const none = { steer: 0, tuck: false, brake: false, jump: false, jumpPressed: false, flipAxis: 0 };

// 1) Geradeaus fahren wird schneller und bleibt endlich
{
  const s = new SkierSim();
  for (let i = 0; i < 60 * 8; i++) s.update(1 / 60, { ...none, tuck: true });
  assert.ok(s.speed > 15, 'Speed nach 8s sollte > 15 sein, ist ' + s.speed);
  assert.ok(s.speed < 90, 'Speed muss begrenzt sein, ist ' + s.speed);
  assert.ok(Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.z));
}

// 2) Bremsen verlangsamt
{
  const a = new SkierSim();
  const b = new SkierSim();
  for (let i = 0; i < 60 * 4; i++) {
    a.update(1 / 60, none);
    b.update(1 / 60, { ...none, brake: true });
  }
  assert.ok(b.speed < a.speed, 'Bremsen muss langsamer sein');
}

// 3) Lenken verändert Richtung nach rechts
{
  const s = new SkierSim();
  for (let i = 0; i < 90; i++) s.update(1 / 60, { ...none, steer: 1 });
  assert.ok(s.x > 0.5, 'Rechtslenken -> x steigt, ist ' + s.x);
}

// 4) Terrain ist deterministisch & endlos stabil
for (const z of [0, -500, -5000, -50000]) {
  assert.equal(heightAt(3, z), heightAt(3, z));
  assert.ok(Number.isFinite(heightAt(centerX(z), z)));
}
assert.deepEqual(obstaclesInRange(-100, -400).map((o) => o.id), obstaclesInRange(-100, -400).map((o) => o.id));

// 5) Es gibt Schanzen und Hindernisse
let kickers = 0;
for (let k = 0; k < 50; k++) if (kickerForCell(k)) kickers++;
assert.ok(kickers > 10, 'Zu wenige Schanzen: ' + kickers);
assert.ok(obstaclesInRange(-100, -1500).length > 100, 'Zu wenige Hindernisse');

// 6) Ein langer Lauf mit Zufallseingaben erzeugt nie NaN
{
  const s = new SkierSim();
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let air = 0;
  for (let i = 0; i < 60 * 120; i++) {
    const inp = { steer: Math.sin(i / 40), tuck: rnd() > 0.5, brake: false, jump: rnd() > 0.99, jumpPressed: rnd() > 0.99, flipAxis: 0 };
    s.update(1 / 60, inp);
    if (!s.grounded) air++;
    if (s.crashed) s.reset();
    assert.ok(Number.isFinite(s.x + s.y + s.z + s.vx + s.vy + s.vz), 'NaN bei Schritt ' + i);
  }
  console.log('Luftframes im Zufallslauf:', air);
}

// 7) Tore: deterministisch, in Reichweite, Boost erhöht Tempo
{
  const { gateForCell, gatesInRange } = await import('../src/terrain.js');
  assert.deepEqual(gateForCell(5), gateForCell(5));
  assert.equal(gateForCell(0), null);
  const gs = gatesInRange(-100, -1500);
  assert.ok(gs.length >= 8, 'zu wenige Tore: ' + gs.length);
  const s = new SkierSim();
  for (let i = 0; i < 300; i++) s.update(1 / 60, none);
  const before = s.speed;
  s.boost(6);
  assert.ok(Math.abs(s.speed - Math.min(85, before + 6)) < 0.01, 'Boost +6');
  s.boost(500);
  assert.ok(s.speed <= 85.001, 'Boost gedeckelt');
  console.log('Tore ok:', gs.length);
}

console.log('Alle Tests bestanden.');
