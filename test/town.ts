// Order 12: the D1-sized Tristram laid out from Joseph's map — layout per legend point, footprints, collision, reachability by
// joystick, roof fade, depth, the Town Portal round trip, old-save relocation and the town memory budget.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { COWS, SQUARE, cowArt, BUILDINGS, BUILDING_FP, CATHEDRAL_DOOR, CATHEDRAL_SCALE, EAST_BRANCH, EAST_STREAM, GRAVEYARD, HOUSE_SCALE, NPCS, POINTS, TOWN_FROM_CATHEDRAL, TOWN_H, TOWN_PORTAL_SPOT, TOWN_START, TOWN_W, WEST_STREAM, footprintTiles, makeTown, streamX } from '../src/levels/town';
import { T, WALKABLE, at } from '../src/levels/types';
import { tileToScreen } from '../src/iso';
import { findPath } from '../src/path';
import { ROOFED, BASE_FADE, ROOF_FADE, behind, buildingFade, frontS, sortKey, spriteRect, type SpriteBox } from '../src/townArt';
import { BANK_DEPTH, waterFrame, waterMask } from '../src/render';
import { groupsMiB, wantedGroups, BUDGET_MIB, type ArtManifest } from '../src/art';
import { Game } from '../src/game';
import { loadGame, saveGame } from '../src/save';

const man: ArtManifest = JSON.parse(fs.readFileSync('public/art/manifest.json', 'utf8'));
const atlas = man.assets.find((a) => a.key === 'town/buildings')!;
assert.ok(atlas && atlas.license === 'CC0 1.0' && atlas.group === 'town-buildings', 'buildings atlas imported as CC0');
const F = (b: { id: string; s: number }): SpriteBox => { const f = atlas.frames!.find((q) => q.id === `${b.id}_full`)!; return { ax: f.ax * b.s, ay: f.ay * b.s, w: f.w * b.s, h: f.h * b.s, eaves: f.eaves === undefined ? undefined : f.eaves * b.s }; };
const pt = (id: string) => POINTS.find((p) => p.id === id)!;
const B = (role: string) => BUILDINGS.find((b) => b.role === role)!;
const t = makeTown();
// map compass: north = -x-y, east = +x-y, south = +x+y, west = -x+y
const north = (a: { x: number; y: number }, b: { x: number; y: number }) => a.x + a.y < b.x + b.y - 2;
const east = (a: { x: number; y: number }, b: { x: number; y: number }) => a.x - a.y > b.x - b.y + 2;

// ---- size and the 14 legend points ----
assert.equal(TOWN_W, 96); assert.equal(TOWN_H, 96); assert.equal(t.tiles.length, 96 * 96);
assert.equal(POINTS.length, 14); assert.deepEqual(POINTS.map((p) => p.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
const sq = { x: 58.5, y: 70 }; // the square's centre
for (const p of POINTS) assert.ok(p.x > 2 && p.y > 2 && p.x < 93 && p.y < 93, `${p.id} inside the woods ring`);
for (const id of ['pepin', 'cain', 'griswold', 'ogden', 'farnham', 'gillian', 'wirt', 'adria', 'wounded']) assert.deepEqual({ x: NPCS.find((n) => n.id === id)!.x, y: NPCS.find((n) => n.id === id)!.y }, { x: pt(id).x, y: pt(id).y }, `${id} at its point`);
assert.equal(at(t, pt('cain').x, pt('cain').y), T.FLOOR, '5 Cain on the square');
// Order 13: new characters start just south of the smithy, on the cobbled path, in front of it
{ const sm0 = B('smithy'), sx = TOWN_START.x - sm0.x, sy = TOWN_START.y - sm0.y;
  assert.equal(at(t, TOWN_START.x, TOWN_START.y), T.PATH, 'spawn on the cobbles');
  assert.ok(sx + sy > (sm0.ex + sm0.ey) / 2 && sx + sy < (sm0.ex + sm0.ey) / 2 + 6 && Math.abs(sx - sy) <= 4, `spawn just south of the smithy (${sx},${sy})`);
  assert.ok(TOWN_START.x + TOWN_START.y > frontS(sm0), 'spawn in front of the smithy, not hidden by it'); }
assert.ok(east(sq, B('pepin')) && Math.abs((B('pepin').x + B('pepin').y) - (sq.x + sq.y)) < 6, '4 Pepin on the west edge of the square');
assert.ok(east(B('smithy'), sq), '6 smithy on the east edge of the square');
assert.ok(north(B('tavern'), sq), '8 tavern north of the square');
assert.ok(north(B('gillian_house'), B('tavern')) || east(B('tavern'), B('gillian_house')), '7 Gillian by the house north-west of the tavern');
assert.ok(north(B('north_house'), B('tavern')), 'another house north of the tavern');
assert.ok(north(sq, B('farnham_house')), '9 Farnham by the southern house');
assert.ok(east(TOWN_PORTAL_SPOT, B('tavern')) && north(TOWN_PORTAL_SPOT, sq), '10 portal spot east of the core');
const cat = B('cathedral');
assert.ok(north(cat, B('tavern')) && north(cat, sq), '14 cathedral to the north');
assert.ok(east(B('catacombs'), sq) && north(B('catacombs'), B('tavern')), '12 catacombs hut north-east');
assert.ok(cat.flip && CATHEDRAL_DOOR.y > cat.y + cat.ey / 2 && Math.abs(CATHEDRAL_DOOR.x - cat.x) < 0.5, '14 door on the south-west (+y) face');
assert.equal(at(t, CATHEDRAL_DOOR.x, CATHEDRAL_DOOR.y), T.DOWN); assert.deepEqual(t.down, CATHEDRAL_DOOR);
const wd = pt('wounded');
assert.ok(wd.y > CATHEDRAL_DOOR.y && Math.abs(wd.x - CATHEDRAL_DOOR.x) <= 3 && wd.y - CATHEDRAL_DOOR.y <= 6, '13 slain townsman on the path south-west of the door');
assert.ok([[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1]].some(([dx, dy]) => at(t, wd.x + dx, wd.y + dy) === T.PATH), '13 on the path');
const G = GRAVEYARD;
assert.ok(G.x0 > cat.x + cat.ex / 2 && east({ x: (G.x0 + G.x1) / 2, y: (G.y0 + G.y1) / 2 }, cat), 'graveyard east of the cathedral');
assert.ok(t.objects.filter((o) => o.kind === 'cross' && o.x > G.x0 && o.x < G.x1 && o.y > G.y0 && o.y < G.y1).length >= 10, 'headstones inside');
assert.ok(BUILDINGS.filter((b) => b.id === 'fence').length >= 38, 'graveyard fenced');
// streams: the west one separates Wirt and the caves from the core, the east one Adria
const wx = (y: number) => streamX(WEST_STREAM, y), ex = (y: number) => streamX(EAST_STREAM, y);
assert.ok(pt('wirt').x < wx(pt('wirt').y) - 1 && pt('caves').x < wx(pt('caves').y) - 1, '1 Wirt and 2 caves across the west stream');
assert.ok(pt('hell').x > wx(pt('hell').y) + 1 && pt('hell').x < wx(pt('hell').y) + 14, '3 hell near the west stream bank');
assert.ok(pt('adria').x > ex(pt('adria').y) + 1 && pt('adria').x < streamX(EAST_BRANCH, pt('adria').y) - 1, '11 Adria across the east stream');
for (const y of [10, 30, 60, 80, 90]) { assert.equal(at(t, Math.round(wx(y)), y), T.WATER, `west stream at ${y}`); assert.equal(at(t, Math.round(ex(y)), y), T.WATER, `east stream at ${y}`); }
for (const s of ['caves', 'hell', 'catacombs']) { const o = t.objects.find((q) => q.kind === 'sealed' && q.x === pt(s).x && q.y === pt(s).y); assert.ok(o, `${s} entrance placed (closed)`); }
// scale
for (const b of BUILDINGS) if (['smithy', 'tavern', 'pepin_house'].includes(b.id)) assert.equal(b.s, HOUSE_SCALE);
assert.equal(cat.s, CATHEDRAL_SCALE);

// ---- footprints ----
for (const [id, fp] of Object.entries(BUILDING_FP)) {
  const f = atlas.frames!.find((q) => q.id === `${id}_full`)!;
  assert.ok(f, `${id}_full in the atlas`);
  assert.deepEqual(fp, [f.fp_m![1], f.fp_m![0]], `${id} footprint = footprint_m`);
  assert.ok((fp[0] + fp[1]) * 32 <= f.w * 1.1, `${id}: ground fits sprite`);
}
for (const b of BUILDINGS) {
  const [fx, fy] = BUILDING_FP[b.id];
  assert.deepEqual([b.ex, b.ey], b.flip ? [fy * b.s, fx * b.s] : [fx * b.s, fy * b.s], `${b.role} scaled footprint`);
  for (const q of footprintTiles(b)) assert.equal(at(t, q.x, q.y), T.HOUSE, `${b.role} ${q.x},${q.y} solid`);
}

// ---- collision: buildings, water, brush, walls, headstones and the closed entrances block; bridges carry the paths ----
const g = new Game('T', 'warrior', 3);
for (const b of BUILDINGS) for (const q of footprintTiles(b)) assert.ok(!g.tileWalk(q.x, q.y), `${b.role} blocks the hero`);
for (const o of t.objects) assert.ok(!g.tileWalk(o.x, o.y), `${o.kind} ${o.x},${o.y} blocks`);
let water = 0, bridges = 0;
for (let i = 0; i < t.tiles.length; i++) { const x = i % 96, y = (i / 96) | 0; if (t.tiles[i] === T.WATER) { water++; assert.ok(!g.tileWalk(x, y)); } if (t.tiles[i] === T.BRIDGE) { bridges++; assert.ok(g.tileWalk(x, y)); } if (t.tiles[i] === T.TREE || t.tiles[i] === T.WALL) assert.ok(!g.tileWalk(x, y)); }
assert.ok(water > 300 && bridges >= 12, `streams ${water}, bridge deck ${bridges}`);
for (const n of NPCS) assert.ok(WALKABLE.has(at(t, n.x, n.y)), `${n.id} stands on open ground`);

// ---- reachability: every NPC, stairs, spawn points and entrances; Wirt and Adria only over their bridges ----
const walk = (x: number, y: number) => WALKABLE.has(at(t, x, y)) && !t.objects.some((o) => o.x === x && o.y === y) && !NPCS.some((n) => n.x === x && n.y === y);
const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
const reach = (q: { x: number; y: number }, w = walk) => (w(q.x, q.y) && findPath(t.w, t.h, w, TOWN_START, q, 60000)) || N8.map(([dx, dy]) => ({ x: q.x + dx, y: q.y + dy })).find((r) => w(r.x, r.y) && findPath(t.w, t.h, w, TOWN_START, r, 60000));
for (const goal of [CATHEDRAL_DOOR, TOWN_FROM_CATHEDRAL, TOWN_PORTAL_SPOT, ...POINTS]) assert.ok(reach(goal), `reach ${goal.x},${goal.y}`);
const noBridge = (x: number, y: number) => walk(x, y) && at(t, x, y) !== T.BRIDGE;
for (const id of ['wirt', 'adria', 'caves']) assert.ok(!reach(pt(id), noBridge), `${id} cut off without the bridge`);

// ---- joystick: walk the hero by stick from the spawn to within talking range of every NPC (at the game's move speed) ----
const stickTo = (gm: Game, goal: { x: number; y: number }) => {
  const path = findPath(t.w, t.h, (x, y) => gm.tileWalk(x, y) && !NPCS.some((n) => n.x === x && n.y === y), { x: gm.p.tx, y: gm.p.ty }, goal, 60000);
  assert.ok(path, `stick path to ${goal.x},${goal.y}`);
  for (const wp of path!) {
    for (let k = 0; k < 200 && Math.hypot(gm.p.x - wp.x, gm.p.y - wp.y) > 0.2; k++) {
      const dx = wp.x - gm.p.x, dy = wp.y - gm.p.y, sx = (dx - dy) * 32, sy = (dx + dy) * 16, l = Math.hypot(sx, sy);
      gm.move = { x: sx / l, y: sy / l, mag: 1 }; gm.update(1 / 60);
    }
  }
  gm.move = null; gm.update(1 / 60);
};
const jg = new Game('J', 'rogue', 4);
assert.equal(jg.cur, 'town'); assert.deepEqual({ x: jg.p.tx, y: jg.p.ty }, TOWN_START);
const order = ['cain', 'griswold', 'ogden', 'gillian', 'pepin', 'farnham', 'wounded', 'wirt', 'adria'];
const stickLog: string[] = [];
for (const id of order) {
  const n = NPCS.find((q) => q.id === id)!, adj = reach(n)!;
  const goal = Array.isArray(adj) ? adj[adj.length - 1] : adj;
  stickTo(jg, goal);
  const it = jg.interaction();
  assert.ok(it && it.target.kind === 'npc' && it.target.npc.id === id, `joystick reaches ${id} (INTERACT offers ${it?.label})`);
  stickLog.push(id);
}

// ---- Town Portal: cast in the dungeon, take it to point 10, it stays, step back in to the exact cast spot, then it closes ----
const pg = new Game('P', 'sorcerer', 7);
assert.equal(pg.portal, null);
pg.openPortal(); assert.equal(pg.portal, null, 'cannot open one in town');
pg.tap({ kind: 'stairs', x: CATHEDRAL_DOOR.x, y: CATHEDRAL_DOOR.y });
for (let i = 0; i < 4000 && !pg.pendingLevel; i++) pg.update(0.05);
pg.finishTravel(); assert.equal(pg.cur, 'l1');
// walk a little off the stairs, to a fractional position
const st = { x: pg.p.x, y: pg.p.y };
for (let i = 0; i < 40; i++) { pg.move = { x: 0.6, y: 0.8, mag: 1 }; pg.update(1 / 60); }
pg.move = null; pg.update(1 / 60);
const cast = { x: pg.p.x, y: pg.p.y, tx: pg.p.tx, ty: pg.p.ty };
assert.ok(Math.hypot(cast.x - st.x, cast.y - st.y) > 0.3, 'moved off the stairs');
pg.openPortal(); assert.deepEqual({ x: pg.portal!.x, y: pg.portal!.y }, { x: cast.tx, y: cast.ty });
const ip = pg.interaction(); assert.ok(ip && ip.label === 'Town portal', `INTERACT offers the portal (${ip?.label})`);
pg.interact(); for (let i = 0; i < 400 && !pg.pendingLevel; i++) pg.update(0.05);
assert.ok(pg.pendingLevel && pg.pendingLevel.to === 'town'); pg.finishTravel();
assert.equal(pg.cur, 'town'); assert.ok(Math.max(Math.abs(pg.p.tx - TOWN_PORTAL_SPOT.x), Math.abs(pg.p.ty - TOWN_PORTAL_SPOT.y)) <= 1, 'arrive at point 10');
assert.ok(pg.portal, 'the portal stays open in town');
for (let i = 0; i < 30; i++) pg.update(0.05);
assert.equal(pg.cur, 'town'); assert.ok(!pg.pendingLevel, 'arriving does not bounce back');
const it2 = pg.interaction(); assert.ok(it2 && it2.label === 'Town portal');
pg.interact(); for (let i = 0; i < 400 && !pg.pendingLevel; i++) pg.update(0.05);
assert.ok(pg.pendingLevel && (pg.pendingLevel as { to: string }).to === 'l1'); pg.finishTravel();
assert.equal(pg.cur, 'l1');
assert.ok(Math.abs(pg.p.x - cast.x) < 1e-9 && Math.abs(pg.p.y - cast.y) < 1e-9, `back at the exact cast spot (${pg.p.x},${pg.p.y} vs ${cast.x},${cast.y})`);
assert.equal(pg.portal, null, 'then it closes');
for (let i = 0; i < 30; i++) pg.update(0.05);
assert.equal(pg.cur, 'l1', 'no re-trigger'); assert.notEqual(pg.interaction()?.label, 'Town portal');
// with no portal, point 10 is empty ground
const tg = new Game('E', 'warrior', 8);
tg.p.x = tg.p.tx = TOWN_PORTAL_SPOT.x; tg.p.y = tg.p.ty = TOWN_PORTAL_SPOT.y + 1;
assert.notEqual(tg.interaction()?.label, 'Town portal'); assert.ok(tg.tileWalk(TOWN_PORTAL_SPOT.x, TOWN_PORTAL_SPOT.y));

// ---- saves: an old (Order 7, 48x48) town position inside a house / the woods loads at the nearest open reachable tile ----
const mem: Record<string, string> = {};
const store = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } } as unknown as Storage;
const sg = new Game('S', 'warrior', 9);
const hb = B('tavern');
sg.p.x = sg.p.tx = Math.round(hb.x); sg.p.y = sg.p.ty = Math.round(hb.y); // inside the tavern
saveGame(store, sg);
const lg = loadGame(store, 'S')!;
assert.ok(lg.tileWalk(lg.p.tx, lg.p.ty), 'relocated to open ground');
assert.ok(Math.hypot(lg.p.tx - hb.x, lg.p.ty - hb.y) < 6, 'nearest open tile');
assert.ok(findPath(t.w, t.h, walk, TOWN_START, { x: lg.p.tx, y: lg.p.ty }, 60000) || NPCS.some((n) => n.x === lg.p.tx && n.y === lg.p.ty), 'reachable');
const sg2 = new Game('S2', 'warrior', 9); sg2.p.x = sg2.p.tx = 4; sg2.p.y = sg2.p.ty = 60; // deep in the west brush
saveGame(store, sg2); const lg2 = loadGame(store, 'S2')!;
assert.ok(lg2.tileWalk(lg2.p.tx, lg2.p.ty) && findPath(t.w, t.h, walk, TOWN_START, { x: lg2.p.tx, y: lg2.p.ty }, 60000), 'out of the brush onto reachable ground');
const ok3 = new Game('S3', 'warrior', 9); ok3.p.x = ok3.p.tx = 57; ok3.p.y = ok3.p.ty = 67;
saveGame(store, ok3); const lg3 = loadGame(store, 'S3')!; assert.deepEqual({ x: lg3.p.tx, y: lg3.p.ty }, { x: 57, y: 67 }, 'a valid position is kept');

// ---- roof fade and depth on the scaled pieces ----
const sm = B('smithy'), fs_ = F(sm);
assert.deepEqual(buildingFade(sm, fs_, sm.x + sm.ex / 2 + 1, sm.y), { roof: 1, base: 1 }, 'in front (+x side)');
assert.deepEqual(buildingFade(sm, fs_, sm.x, sm.y + sm.ey / 2 + 1), { roof: 1, base: 1 }, 'in front (+y side)');
assert.equal(buildingFade(sm, fs_, sm.x - sm.ex / 2 - 1, sm.y - sm.ey / 2 - 1).roof, ROOF_FADE, 'right behind: roof fades');
assert.equal(buildingFade(sm, fs_, sm.x - sm.ex / 2 - 0.6, sm.y).base, BASE_FADE, 'feet below the eaves: walls fade too');
assert.ok(behind(cat, cat.x, cat.y - cat.ey / 2 - 1) && !behind(cat, CATHEDRAL_DOOR.x, CATHEDRAL_DOOR.y), 'stairs in front of the cathedral');
assert.equal(buildingFade(cat, F(cat), CATHEDRAL_DOOR.x, CATHEDRAL_DOOR.y).roof, 1, 'no fade at the door');
for (const b of BUILDINGS.filter((q) => ROOFED.includes(q.id) && q.id !== 'smithy_eave')) {
  const x = Math.ceil(b.x - b.ex / 2) - 1, y = Math.round(b.y);
  assert.equal(buildingFade(b, F(b), x, y).roof, ROOF_FADE, `${b.role} roof fades with the hero at ${x},${y}`);
  const r = spriteRect(b, F(b)); assert.ok(r.eavesY > r.y0 && r.eavesY < r.y1, `${b.role} eaves inside sprite`);
}
const pcs = BUILDINGS.map((b) => ({ b, f: F(b) }));
const gr = pt('griswold');
assert.ok(sortKey(gr.x + gr.y, gr.x, gr.y, pcs) >= gr.x + gr.y && (gr.x + gr.y < frontS(sm) ? sortKey(gr.x + gr.y, gr.x, gr.y, pcs) > frontS(sm) : true), 'Griswold drawn over the smithy');
assert.ok(sortKey(sm.x - 4 + sm.y, sm.x - 4, sm.y, pcs) < frontS(sm), 'behind stays behind');

// ---- Order 13: the open square — packed dirt, no footprint on it, no building sprite standing in front of its middle ----
for (let y = SQUARE.y0; y <= SQUARE.y1; y++) for (let x = SQUARE.x0; x <= SQUARE.x1; x++) assert.ok(([T.FLOOR, T.HOUSE] as number[]).includes(at(t, x, y)) && (at(t, x, y) === T.FLOOR || footprintTiles(B('well')).some((q) => q.x === x && q.y === y)), `square ${x},${y} open`);
const mid = { x: (SQUARE.x0 + SQUARE.x1) / 2, y: (SQUARE.y0 + SQUARE.y1) / 2 };
assert.ok(Math.hypot(pt('cain').x - mid.x, pt('cain').y - mid.y) <= 2.5 && Math.hypot(B('well').x - mid.x, B('well').y - mid.y) <= 2.5, 'Cain and the well in the middle');
for (let y = Math.ceil(mid.y - 3); y <= mid.y + 3; y++) for (let x = Math.ceil(mid.x - 3); x <= mid.x + 3; x++) for (const pc of pcs) {
  if (pc.b.id === 'well' || pc.b.id === 'fence' || x + y >= frontS(pc.b)) continue; // only pieces drawn over (in front of) the tile matter
  const r = spriteRect(pc.b, pc.f), q = tileToScreen(x, y), fx = q.x, fy = q.y + 16;
  assert.ok(!(fx > r.x0 + 8 && fx < r.x1 - 8 && fy - 40 > r.y0 && fy - 40 < r.y1), `${pc.b.role} sprite covers the square at ${x},${y}`);
}
for (const id of ['tavern', 'pepin', 'smithy']) { const b = B(id), d = Math.hypot(b.x - mid.x, b.y - mid.y); assert.ok(d > 5 && d < 17, `${id} borders the square (${d.toFixed(1)})`); }
assert.ok(east(B('smithy'), mid) && B('smithy').x + B('smithy').y > mid.x + mid.y - 4, 'smithy off the square\'s SE edge');
assert.ok(B('farnham_house').x + B('farnham_house').y > mid.x + mid.y + 15, 'Farnham\'s house south, off the square');
// ---- Order 13: Griswold under the eave facing the square; smithy collision; the eave is an art slot ----
const smi = B('smithy'), eave = B('smithy_eave'), gw = NPCS.find((n) => n.id === 'griswold')!;
assert.ok(eave && eave.solid === 'none' && eave.art === 'smithy_eave_full', 'eave layout slot');
assert.ok(Math.abs(gw.x - eave.x) <= eave.ex / 2 && Math.abs(gw.y - eave.y) <= eave.ey / 2 + 0.6, 'Griswold under / in front of the eave');
assert.ok(gw.y > smi.y + smi.ey / 2 && gw.x >= smi.x - smi.ex / 2 && gw.face && gw.face.x < 0, 'Griswold in front of the smithy\'s visible face, facing the square');
for (const q of footprintTiles(smi)) assert.ok(!g.tileWalk(q.x, q.y), 'smithy blocks');
assert.ok(g.tileWalk(gw.x - 1, gw.y), 'Griswold approachable from the square');
// ---- Order 13: three cows east of the catacombs (12): collision now, drawn / tappable only once the cow art lands ----
const cat12 = pt('catacombs'), cows = t.objects.filter((o) => o.kind === 'cow');
assert.equal(cows.length, 3); assert.deepEqual(cows.map((o) => ({ x: o.x, y: o.y })), COWS.map((c) => ({ x: c.x, y: c.y })));
for (const o of cows) { assert.ok(east(o, cat12) && Math.hypot(o.x - cat12.x, o.y - cat12.y) < 9, 'cow just east of 12'); assert.ok(!g.tileWalk(o.x, o.y), 'cow blocks'); assert.ok(reach(o), 'cow reachable'); }
assert.ok(wantedGroups('town', 'warrior').includes('town-cow'), 'the town loads the cow group');
const cowA = man.anims.cow;
assert.ok(cowA && cowA.actions.idle.n >= 2, 'Order 11b cow idle loop imported');
const cowAsset = man.assets.find((a) => a.key === cowA.actions.idle.asset)!;
assert.ok(['town-npcs', 'town-cow'].includes(cowAsset.group) && wantedGroups('town', 'warrior').includes(cowAsset.group) && cowAsset.license.startsWith('CC0'), 'cow atlas loads with the town, CC0');
for (const d of ['s', 'se', 'e', 'ne', 'n', 'nw', 'w', 'sw']) assert.ok(cowAsset.frames!.some((f) => f.id === `cow:idle:${d}:0`), `cow facing ${d}`);
// out of sync: distinct phases and rates (render: time * (0.9 + 0.1 * (id % 3)) + var2)
const loop = cowA.actions.idle.n * cowA.actions.idle.ms, frameAt = (o: { id: number; var2: number }, tms: number) => Math.floor(((tms * (0.9 + 0.1 * (o.id % 3)) + o.var2) % loop) / cowA.actions.idle.ms);
let same = 0; for (let tms = 0; tms < 20000; tms += 50) { const f = cows.map((o) => frameAt(o, tms)); if (f[0] === f[1] && f[1] === f[2]) same++; }
assert.ok(same < 400 * 0.2, `cows rarely in step (${same}/400)`);
assert.ok(new Set(cows.map((o) => o.id % 3)).size === 3 && new Set(cows.map((o) => o.var2)).size === 3, 'three phases and rates');
const cg = new Game('C', 'warrior', 5);
Object.assign(cg.p, { x: cows[0].x - 1, y: cows[0].y + 1, tx: cows[0].x - 1, ty: cows[0].y + 1 });
cowArt.ready = false; assert.notEqual(cg.interaction()?.label, 'Cow', 'no cow interaction while the art is missing');
cowArt.ready = true; const ci = cg.interaction(); assert.equal(ci?.label, 'Cow', 'tap line "Cow" once drawn');
cg.interact(); for (let i = 0; i < 10; i++) cg.update(0.05); assert.equal(cg.msg, 'Cow');
cowArt.ready = false;

// ---- Order 14: the 11b set pieces replace every Order 12 stand-in ----
const roleArt = (role: string) => BUILDINGS.filter((b) => b.role === role).map((b) => b.id);
assert.deepEqual([B('gillian_house').id, B('farnham_house').id, B('north_house').id, B('nw_house').id, B('ne_house').id], ['gillian_house', 'farnham_house', 'north_house', 'nw_house', 'se_house'], 'own 11b houses');
assert.deepEqual([B('catacombs').id, B('caves').id, B('hell').id], ['catacombs_hut', 'cave_mouth', 'hell_rift']);
for (const id of ['caves', 'hell', 'catacombs']) { const b = B(id), p = pt(id); assert.ok(!footprintTiles(b).some((q) => q.x === p.x && q.y === p.y) && Math.hypot(p.x - b.x, p.y - b.y) < 4, `${id}: sealed tile right in front of its piece`); }
const wallTiles: string[] = []; for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) if (at(t, x, y) === T.WALL) wallTiles.push(`${x},${y}`);
const walls = BUILDINGS.filter((b) => b.id === 'stone_wall');
assert.ok(wallTiles.length > 40 && wallTiles.every((k) => { const [x, y] = k.split(',').map(Number); return walls.some((w) => Math.abs(w.x - x) <= 0.5 && w.y === y); }), 'every wall tile under a stone_wall piece');
assert.ok(BUILDINGS.filter((b) => b.id === 'ditch').length >= 4 && BUILDINGS.filter((b) => b.id === 'crate' || b.id === 'crate_stack').length >= 3 && roleArt('cart').length >= 1, 'ditches, crates and a cart');
for (const b of BUILDINGS.filter((q) => ['ditch', 'crate', 'crate_stack', 'cart', 'smithy_anvil', 'smithy_forge'].includes(q.id))) assert.ok(footprintTiles(b).length >= 1 && footprintTiles(b).every((q) => !g.tileWalk(q.x, q.y)), `${b.id} blocks`);
assert.ok(BUILDINGS.filter((b) => b.role === 'tree').every((b) => b.id.startsWith('dead_tree')), 'bare trees');
const sl = B('slain'); assert.ok(sl.id === 'slain_townsman' && sl.x === wd.x && sl.y === wd.y, 'slain_townsman on point 13');
const anv = B('smithy_anvil'), frg = B('smithy_forge');
assert.ok(anv.y > smi.y + smi.ey / 2 && Math.abs(anv.x - (smi.x - smi.ex / 2)) < 1.5, 'anvil at the smithy\'s side corner');
assert.ok(Math.abs(frg.x - eave.x) <= eave.ex / 2 && Math.abs(frg.y - eave.y) <= eave.ey / 2, 'forge under the eave');
assert.ok(Math.abs(eave.ex - 4.87) < 0.05 && Math.abs(eave.ey - 2.23) < 0.05 && !eave.flip, `eave footprint ${eave.ex.toFixed(2)} x ${eave.ey.toFixed(2)} (2.2 x 4.81 spec)`);
assert.ok(Math.abs(eave.y - eave.ey / 2 - (smi.y + smi.ey / 2)) < 0.15, 'eave against the smithy\'s +y face');

// ---- memory ----
const town: Record<string, number> = {};
for (const cls of ['warrior', 'rogue', 'sorcerer']) {
  town[cls] = groupsMiB(man, wantedGroups('town', cls));
  assert.ok(town[cls] <= BUDGET_MIB, `${cls} town ${town[cls]}`);
}
// ---- Order 11c: the fixed stream water / bank frames and the banks on both streams ----
{
  const fl = man.assets.find((a) => a.key === 'tiles/town-floors')!;
  const png = fs.readFileSync(`public/art/${fl.file}`), ph = png.readUInt32BE(20);
  assert.equal(ph, fl.h, 'manifest height = PNG height');
  for (const id of ['town_water_00', 'town_water_01', 'town_water_02', 'town_water_03', 'town_water_bank_n', 'town_water_bank_e', 'town_water_bank_s', 'town_water_bank_w']) {
    const f = fl.frames!.find((q) => q.id === id); assert.ok(f, `${id} in the atlas`);
    assert.ok(f.w === 64 && f.h === 32 && f.y + f.h <= ph && f.x + f.w <= fl.w, `${id} is a whole 64x32 diamond inside the atlas`);
  }
  const wm = makeTown(); let open = 0;
  for (const [name, st] of [['west', WEST_STREAM], ['east', EAST_STREAM]] as const) {
    let nw = 0, se = 0;
    for (let y = 4; y < wm.h - 4; y++) {
      const x0 = Math.floor(streamX(st, y)); if (x0 < 1 || x0 > wm.w - 3) continue;
      for (let x = x0 - 1; x <= x0 + 2; x++) if (at(wm, x, y) === T.WATER) { const k = waterMask(wm, x, y); if (k & 1) nw++; if (k & 4) se++; if (!k) open++; assert.notEqual(k, 15, 'no water tile walled in on all sides'); }
    }
    assert.ok(nw > 20 && se > 20, `${name} stream has banks on both sides (${nw}/${se})`);
  }
  assert.ok(open > 0, 'some open water between the banks');
  const fr = new Set([0, 0.22, 0.44, 0.66].map((t) => waterFrame(10, 10, t))); assert.equal(fr.size, 4, 'water loops through 4 frames');
  assert.ok(BANK_DEPTH > 0.2 && BANK_DEPTH < 0.5, 'banks leave open water in the 2-wide streams');
}
console.log(`town: OK (96x96, ${BUILDINGS.length} pieces, ${water} water, ${bridges} bridge tiles; joystick reached ${stickLog.join(', ')}; portal round trip exact; town MiB ${Object.entries(town).map(([k, v]) => `${k} ${v.toFixed(3)}`).join(', ')})`);
