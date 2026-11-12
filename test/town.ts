// Order 7: Tristram buildings — layout, footprints, collision, reachability, roof fade, depth and the town memory budget.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BUILDINGS, BUILDING_FP, CATHEDRAL_DOOR, FENCE_GATE, LAYOUT, NPCS, STREAM_Y, TOWN_FROM_CATHEDRAL, TOWN_PORTAL_SPOT, TOWN_START, footprintTiles, makeTown, toEngine } from '../src/levels/town';
import { T, WALKABLE, at } from '../src/levels/types';
import { findPath } from '../src/path';
import { BASE_FADE, ROOF_FADE, behind, buildingFade, frontS, sortKey, spriteRect, type SpriteBox } from '../src/townArt';
import { groupsMiB, wantedGroups, BUDGET_MIB, type ArtManifest } from '../src/art';
import { Game } from '../src/game';

const man: ArtManifest = JSON.parse(fs.readFileSync('public/art/manifest.json', 'utf8'));
const atlas = man.assets.find((a) => a.key === 'town/buildings')!;
assert.ok(atlas && atlas.license === 'CC0 1.0' && atlas.group === 'town-buildings', 'buildings atlas imported as CC0');
const F = (id: string): SpriteBox => { const f = atlas.frames!.find((q) => q.id === `${id}_full`)!; return { ax: f.ax, ay: f.ay, w: f.w, h: f.h, eaves: f.eaves }; };

// ---- layout: every placement of the art's layout.json is used, at the rotated D1 position ----
const lay = JSON.parse(fs.readFileSync('public/art/town-layout.json', 'utf8'));
for (const pl of lay.placements) {
  const n = pl.repeat?.count ?? 1, d = pl.repeat?.along ?? [0, 0], st = pl.repeat?.step_tiles ?? 1;
  for (let i = 0; i < n; i++) {
    const X = pl.tile_xy[0] + d[0] * st * i, Y = pl.tile_xy[1] + d[1] * st * i;
    assert.ok(LAYOUT.some((l) => l.id === pl.id && l.X === X && l.Y === Y), `layout ${pl.id} ${X},${Y}`);
  }
}
assert.equal(LAYOUT.length, lay.placements.reduce((s: number, p: any) => s + (p.repeat?.count ?? 1), 0), 'no extra pieces');
assert.deepEqual(toEngine(20, 34), { x: 13, y: 27 }, 'cathedral: north (+Y) maps to screen-up-left');

// ---- footprints: the art's footprint_m (axes swapped into engine x/y) and each fits inside its own sprite ----
for (const [id, fp] of Object.entries(BUILDING_FP)) {
  const f = atlas.frames!.find((q) => q.id === `${id}_full`)!;
  assert.deepEqual(fp, [f.fp_m![1], f.fp_m![0]], `${id} footprint = footprint_m`);
  const ground = (fp[0] + fp[1]) * 32; // screen width of the footprint diamond
  assert.ok(ground <= f.w * 1.1, `${id}: ground ${ground} fits sprite ${f.w}`);
  if (['smithy', 'tavern', 'cathedral'].includes(id)) assert.ok((f.fp_tiles![0] + f.fp_tiles![1]) * 32 > f.w, `${id}: footprint_tiles would overhang`);
}
for (const b of BUILDINGS) {
  const tiles = footprintTiles(b);
  for (const q of tiles) assert.ok(Math.abs(q.x - b.x) <= b.ex / 2 + 0.5 && Math.abs(q.y - b.y) <= b.ey / 2 + 0.5, `${b.id} tile inside rect`);
  if (b.solid === 'footprint' && b.id !== 'fence') {
    const want = (Math.floor(b.x + b.ex / 2) - Math.ceil(b.x - b.ex / 2) + 1) * (Math.floor(b.y + b.ey / 2) - Math.ceil(b.y - b.ey / 2) + 1);
    assert.equal(tiles.length, want, `${b.id} covers every tile centre in its footprint`);
  }
}
assert.equal(BUILDINGS.filter((b) => b.id === 'fence').length, 12 - FENCE_GATE.length, 'fence gate left open');

// ---- collision: footprint tiles block, stairs at the cathedral door, bridge deck over the stream ----
const t = makeTown();
for (const b of BUILDINGS) for (const q of footprintTiles(b)) assert.equal(at(t, q.x, q.y), T.HOUSE, `${b.id} ${q.x},${q.y} solid`);
const cat = BUILDINGS.find((b) => b.id === 'cathedral')!;
assert.equal(at(t, CATHEDRAL_DOOR.x, CATHEDRAL_DOOR.y), T.DOWN);
assert.deepEqual(t.down, CATHEDRAL_DOOR);
assert.equal(CATHEDRAL_DOOR.x, Math.floor(cat.x + cat.ex / 2) + 1, 'stairs right outside the door face');
assert.ok(Math.abs(CATHEDRAL_DOOR.y - cat.y) < 0.5, 'stairs centred on the door');
const br = BUILDINGS.find((b) => b.id === 'bridge')!;
for (const y of STREAM_Y) { assert.equal(at(t, br.x, y), T.BRIDGE); assert.equal(at(t, br.x - 1, y), T.WATER); assert.equal(at(t, br.x + 2, y), T.WATER); }
const g = new Game('T', 'warrior', 3);
for (const b of BUILDINGS) for (const q of footprintTiles(b)) assert.ok(!g.tileWalk(q.x, q.y), `${b.id} blocks the hero`);
for (const n of NPCS) assert.ok(WALKABLE.has(at(t, n.x, n.y)), `${n.id} stands on open ground`);

// ---- reachability: every NPC, the cathedral stairs, the spawns and Adria's side across the bridge ----
const walk = (x: number, y: number) => WALKABLE.has(at(t, x, y)) && !t.objects.some((o) => o.x === x && o.y === y) && !NPCS.some((n) => n.x === x && n.y === y);
for (const goal of [CATHEDRAL_DOOR, TOWN_FROM_CATHEDRAL, TOWN_PORTAL_SPOT, { x: TOWN_PORTAL_SPOT.x, y: TOWN_PORTAL_SPOT.y + 1 }]) assert.ok(findPath(t.w, t.h, walk, TOWN_START, goal, 20000), `reach ${goal.x},${goal.y}`);
for (const n of NPCS) {
  const ok = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dx, dy]) => walk(n.x + dx, n.y + dy) && findPath(t.w, t.h, walk, TOWN_START, { x: n.x + dx, y: n.y + dy }, 20000));
  assert.ok(ok, `reach ${n.id}`);
}
const adria = NPCS.find((n) => n.id === 'adria')!;
assert.ok(adria.y < STREAM_Y[0], 'Adria is across the stream');
// the only way to Adria is the bridge: with it removed she is cut off
const noBridge = (x: number, y: number) => walk(x, y) && at(t, x, y) !== T.BRIDGE;
assert.ok(!findPath(t.w, t.h, noBridge, TOWN_START, { x: adria.x, y: adria.y + 1 }, 20000), 'stream blocks without the bridge');

// ---- roof fade: behind a house the roof fades (and the walls once they cover the feet); in front nothing fades ----
const sm = BUILDINGS.find((b) => b.id === 'smithy')!, fs_ = F('smithy');
assert.deepEqual(buildingFade(sm, fs_, sm.x + sm.ex / 2 + 1, sm.y), { roof: 1, base: 1 }, 'in front (+x side)');
assert.deepEqual(buildingFade(sm, fs_, sm.x, sm.y + sm.ey / 2 + 1), { roof: 1, base: 1 }, 'in front (+y side)');
assert.deepEqual(buildingFade(sm, fs_, sm.x - 12, sm.y), { roof: 1, base: 1 }, 'far behind, not covered');
const back = buildingFade(sm, fs_, sm.x - sm.ex / 2 - 1, sm.y - sm.ey / 2 - 1);
assert.equal(back.roof, ROOF_FADE, 'right behind: roof fades');
const deep = buildingFade(sm, fs_, sm.x - sm.ex / 2 - 0.6, sm.y);
assert.equal(deep.roof, ROOF_FADE); assert.equal(deep.base, BASE_FADE, 'feet below the eaves: walls fade too');
assert.ok(behind(cat, cat.x - cat.ex / 2 - 1, cat.y) && !behind(cat, CATHEDRAL_DOOR.x, CATHEDRAL_DOOR.y), 'stairs are in front of the cathedral');
assert.equal(buildingFade(cat, F('cathedral'), CATHEDRAL_DOOR.x, CATHEDRAL_DOOR.y).roof, 1, 'no fade at the door');
// a fade that covers the hero for every tile directly behind each house
for (const b of BUILDINGS.filter((q) => ['smithy', 'pepin_house', 'tavern', 'adria_hut', 'cathedral'].includes(q.id))) {
  const x = Math.ceil(b.x - b.ex / 2) - 1, y = Math.round(b.y);
  assert.equal(buildingFade(b, F(b.id), x, y).roof, ROOF_FADE, `${b.id} roof fades with the hero at ${x},${y}`);
  const r = spriteRect(b, F(b.id)); assert.ok(r.eavesY > r.y0 && r.eavesY < r.y1, `${b.id} eaves inside sprite`);
}

// ---- depth: an actor in front of a house is drawn after it, one behind before it ----
const pcs = BUILDINGS.map((b) => ({ b, f: F(b.id) }));
const gx = 31, gy = 37; // Griswold, at the smithy's +x face: lower diagonal than the smithy's front corner
assert.ok(gx + gy < frontS(sm) && sortKey(gx + gy, gx, gy, pcs) > frontS(sm), 'Griswold drawn over the smithy');
assert.ok(sortKey(sm.x - 3 + sm.y, sm.x - 3, sm.y, pcs) < frontS(sm), 'behind stays behind');

// ---- memory: the town set (with the buildings) and every zone stay within 32 MiB ----
const town: Record<string, number> = {};
for (const cls of ['warrior', 'rogue', 'sorcerer']) {
  town[cls] = groupsMiB(man, wantedGroups('town', cls));
  assert.ok(town[cls] <= BUDGET_MIB, `${cls} town ${town[cls]}`);
  for (const z of ['cathedral', 'butcher'] as const) for (const e of [null, 'fallen', 'skeleton', 'zombie', 'scavenger']) assert.ok(groupsMiB(man, wantedGroups(z, cls, e)) <= BUDGET_MIB);
}
console.log(`town: OK (${BUILDINGS.length} pieces; town MiB ${Object.entries(town).map(([k, v]) => `${k} ${v.toFixed(3)}`).join(', ')})`);
