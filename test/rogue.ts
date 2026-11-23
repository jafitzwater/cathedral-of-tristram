// Order 24: the Rogue's bow shot leaves the string on attack frame 8 (20 fps = tick 8) of the unchanged 12-tick attack, flies
// along the facing in all 8 directions (also with nothing targeted), and other classes keep the 60% resolve point.
import assert from 'node:assert/strict';
import { Game, actorAt, TICK } from '../src/game';
import { MONSTERS } from '../src/data/monsters';
import { DIRS } from '../src/iso';
import { T, setT } from '../src/levels/types';

function arena(cls: 'rogue' | 'warrior' | 'sorcerer') {
  const g = new Game('R', cls, 11); g.travel('l1', null); g.finishTravel(); g.level.monsters = []; g.level.map.objects = [];
  for (let y = 25; y <= 55; y++) for (let x = 25; x <= 55; x++) setT(g.level.map, x, y, T.FLOOR);
  g.p = actorAt(40, 40); return g;
}
const g0 = arena('rogue');
assert.ok(g0.d.bow, 'the Rogue starts with a bow');
assert.equal(g0.releaseAt(), 8 * TICK);
for (let i = 0; i < 8; i++) {
  const g = arena('rogue'); g.p.dir = i; g.startAttack(null);
  const total = g.p.t; assert.ok(Math.abs(total - 12 * TICK) < 1e-9, 'attack stays 12 ticks');
  let t = 0; while (!g.missiles.length && t < 2) { g.update(1 / 120); t += 1 / 120; }
  assert.ok(g.missiles.length === 1, `dir ${i}: an arrow`);
  assert.ok(Math.abs(t - 0.4) <= 1 / 120 + 1e-9, `dir ${i}: released at ${t.toFixed(3)} s (frame 8 = 0.400 s)`);
  const ms = g.missiles[0], d = DIRS[i], l = Math.hypot(d.x, d.y);
  assert.equal(ms.kind, 'arrow'); assert.equal(ms.face, i); assert.equal(ms.toHit, -1, 'to-hit rolled on impact');
  assert.ok(Math.abs(ms.vx - d.x / l * 16) < 1e-9 && Math.abs(ms.vy - d.y / l * 16) < 1e-9, `dir ${i}: flies along the facing`);
  while (g.p.state === 'attack') { g.update(1 / 120); t += 1 / 120; }
  assert.ok(Math.abs(t - 0.6) <= 1 / 120 + 1e-9, `dir ${i}: attack ends at ${t.toFixed(3)} s`);
}
// a targeted shot: arrow toward the monster, damage only when it arrives (after the release frame)
{
  const g = arena('rogue'); const z = g.spawnMon(MONSTERS.zombie, 46, 40); g.level.monsters.push(z); g.updateMon = () => {};
  g.startAttack(z); assert.equal(g.p.dir, 7, 'faces the monster (+x = SE)');
  let t = 0; while (!g.missiles.length) { g.update(1 / 120); t += 1 / 120; }
  assert.ok(Math.abs(t - 0.4) <= 1 / 120 + 1e-9); assert.ok(g.missiles[0].vx > 15.9 && Math.abs(g.missiles[0].vy) < 1e-9);
  assert.equal(z.hp, z.maxHp, 'no damage at release');
}
// unchanged: other classes resolve 60% into their attack
for (const c of ['warrior', 'sorcerer'] as const) { const g = arena(c); assert.ok(Math.abs(g.releaseAt() - (g.d.bow ? { warrior: 16, sorcerer: 20 }[c] : { warrior: 16, sorcerer: 16 }[c]) * TICK * 0.6) < 1e-9, c); }
console.log('rogue: OK (release 0.400 s of 0.600 s in 8 directions, targetless + targeted arrows, other classes at 60%)');
