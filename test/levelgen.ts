import assert from 'node:assert/strict';
import { generateL1, bfs, L1_W, L1_H } from '../src/levels/cathedral';
import { makeTown, NPCS, TOWN_START, TOWN_FROM_CATHEDRAL } from '../src/levels/town';
import { T, at, WALKABLE } from '../src/levels/types';
import { L1_POOL } from '../src/data/monsters';
import { findPath } from '../src/path';
import { Game } from '../src/game';

for (let seed = 1; seed <= 40; seed++) {
  const m = generateL1(seed);
  assert.equal(m.tiles.length, L1_W * L1_H);
  assert.equal(at(m, m.up!.x, m.up!.y), T.UP); assert.equal(at(m, m.down!.x, m.down!.y), T.DOWN);
  const d = bfs(m, m.start);
  for (let i = 0; i < m.tiles.length; i++) if (m.tiles[i] === T.FLOOR || m.tiles[i] === T.DOOR) assert.ok(d[i] >= 0, `seed ${seed}: all floor connected`);
  for (let x = 0; x < m.w; x++) { assert.equal(at(m, x, 0), T.WALL); assert.equal(at(m, x, m.h - 1), T.WALL); }
  const br = m.butcherRoom!;
  assert.ok(m.monsterSpots.some((s) => s.id === 'butcher' && s.x >= br.x && s.x < br.x + br.w && s.y >= br.y && s.y < br.y + br.h), 'Butcher in his room');
  assert.equal(m.monsterSpots.filter((s) => s.id === 'butcher').length, 1);
  let doors = 0;
  for (let y = br.y - 1; y <= br.y + br.h; y++) for (let x = br.x - 1; x <= br.x + br.w; x++) if (x === br.x - 1 || y === br.y - 1 || x === br.x + br.w || y === br.y + br.h) { const t = at(m, x, y); if (t === T.DOOR) doors++; else assert.equal(t, T.WALL, 'Butcher room sealed except its door'); }
  assert.equal(doors, 1);
  assert.ok(m.monsterSpots.every((s) => s.id === 'butcher' || L1_POOL.includes(s.id)));
  assert.ok(m.monsterSpots.length > 20, `seed ${seed}: ${m.monsterSpots.length} monsters`);
  for (const k of ['sarc', 'chest1', 'shrine']) assert.ok(m.objects.some((o) => o.kind === k), `seed ${seed}: has ${k}`);
  assert.ok(m.objects.every((o) => at(m, o.x, o.y) === T.FLOOR), 'objects on floor');
  assert.ok(!m.monsterSpots.some((s) => Math.abs(s.x - m.start.x) <= 2 && Math.abs(s.y - m.start.y) <= 2), 'arrival is clear');
}
assert.deepEqual(generateL1(9).tiles, generateL1(9).tiles, 'deterministic per seed');
assert.notDeepEqual(generateL1(9).tiles, generateL1(10).tiles);
// town: every NPC, the cathedral stairs and the spawn points are reachable
const t = makeTown();
const walk = (x: number, y: number) => WALKABLE.has(at(t, x, y)) && !t.objects.some((o) => o.x === x && o.y === y);
assert.equal(at(t, t.down!.x, t.down!.y), T.DOWN);
for (const goal of [t.down!, TOWN_FROM_CATHEDRAL, ...NPCS.map((n) => ({ x: n.x + 1, y: n.y }))]) {
  const ok = [goal, { x: goal.x - 1, y: goal.y }, { x: goal.x, y: goal.y + 1 }, { x: goal.x, y: goal.y - 1 }].some((g) => walk(g.x, g.y) && findPath(t.w, t.h, walk, TOWN_START, g, 20000));
  assert.ok(ok, `town reach ${goal.x},${goal.y}`);
}
// a hero can walk from town into the cathedral and back
const g = new Game('T', 'rogue', 5);
g.tap({ kind: 'tile', x: t.down!.x, y: t.down!.y });
for (let i = 0; i < 2000 && !g.pendingLevel; i++) g.update(0.05);
assert.ok(g.pendingLevel); g.finishTravel(); assert.equal(g.cur, 'l1'); assert.equal(g.hero.maxDlvl, 1);
console.log('levelgen ok');
