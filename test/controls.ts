import assert from 'node:assert/strict';
import { joystickVector, knob, rankDirs, stickDir, stepFor, pickTarget, assignSlot, defaultSlots, interactFor, JOY_RADIUS, JOY_DEADZONE } from '../src/controls';
import { DIRS } from '../src/iso';
import { Game } from '../src/game';
import { actionLayout } from '../src/hud';
import { T, at } from '../src/levels/types';
import { getItemAttrs, goldItem } from '../src/itemgen';
import { IDI } from '../src/data/items';

const near = (a: number, b: number, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} ~ ${b}`);
// ---- joystick math ----
assert.deepEqual(joystickVector(100, 100, 100, 100), { x: 0, y: 0, mag: 0 }, 'centred');
assert.equal(joystickVector(100, 100, 100 + JOY_RADIUS * JOY_DEADZONE * 0.9, 100).mag, 0, 'inside the dead zone');
const full = joystickVector(100, 100, 100 + 3 * JOY_RADIUS, 100);
near(full.x, 1); near(full.y, 0); near(full.mag, 1);
const half = joystickVector(0, 0, 0, JOY_RADIUS * (JOY_DEADZONE + (1 - JOY_DEADZONE) / 2));
near(half.mag, 0.5); near(half.y, 1);
const diag = joystickVector(0, 0, 30, 30); near(Math.hypot(diag.x, diag.y), 1);
assert.deepEqual(knob(0, 0, 3 * JOY_RADIUS, 0), { x: JOY_RADIUS, y: 0 }, 'knob clamps to the ring');
assert.deepEqual(knob(0, 0, 10, 5), { x: 10, y: 5 });
// 8 directions in screen space (y down): down = D1 south (+1,+1), right = east (+1,-1), up = north, left = west
const dirAt = (x: number, y: number) => DIRS[stickDir({ x, y, mag: 1 })];
assert.deepEqual(dirAt(0, 1), { x: 1, y: 1 }); assert.deepEqual(dirAt(1, 0), { x: 1, y: -1 });
assert.deepEqual(dirAt(0, -1), { x: -1, y: -1 }); assert.deepEqual(dirAt(-1, 0), { x: -1, y: 1 });
const iso = (dx: number, dy: number) => { const l = Math.hypot(dx, dy); return { x: dx / l, y: dy / l, mag: 1 }; };
assert.deepEqual(DIRS[stickDir(iso(2, 1))], { x: 1, y: 0 }, 'screen down-right = SE (+x)');
assert.deepEqual(DIRS[stickDir(iso(-2, 1))], { x: 0, y: 1 }, 'screen down-left = SW (+y)');
assert.equal(stickDir({ x: 0, y: 0, mag: 0 }), -1);
assert.equal(new Set([0, 45, 90, 135, 180, 225, 270, 315].map((a) => stickDir({ x: Math.cos(a * Math.PI / 180), y: Math.sin(a * Math.PI / 180), mag: 1 }))).size, 8, 'all 8 directions reachable');
assert.ok(rankDirs(1, 0)[0].dot > 0.99);
// wall slide: pushing east into a wall slides along it; a dead end stops
const open = () => true;
assert.equal(stepFor(iso(1, 0), { x: 5, y: 5 }, open), 6);
const slide = stepFor({ x: 1, y: 0, mag: 1 }, { x: 5, y: 5 }, (x, y) => !(x === 6 && y === 4));
assert.ok(slide >= 0 && slide !== 6, `slides (${slide})`);
assert.equal(stepFor({ x: 1, y: 0, mag: 1 }, { x: 5, y: 5 }, () => false), -1);
assert.equal(stepFor({ x: 0, y: 0, mag: 0 }, { x: 5, y: 5 }, open), -1);
// hysteresis keeps the previous direction on a boundary
const ea = Math.atan2(16, 32) / 2 + 0.005, edge = { x: Math.cos(ea), y: Math.sin(ea), mag: 1 }; // just past the E/SE boundary
const a0 = stepFor(edge, { x: 5, y: 5 }, open), other = rankDirs(edge.x, edge.y)[1].dir;
assert.equal(stepFor(edge, { x: 5, y: 5 }, open, other), other); assert.equal(stepFor(edge, { x: 5, y: 5 }, open, a0), a0);

// ---- target selection (soft lock) ----
const vis = () => true;
const cands = [{ id: 1, x: 13, y: 10 }, { id: 2, x: 10, y: 12 }, { id: 3, x: 20, y: 20 }];
assert.equal(pickTarget(10, 10, null, cands, null, 4, 6, vis)!.id, 2, 'nearest (Chebyshev) wins');
assert.equal(pickTarget(10, 10, { x: 1, y: 0 }, cands, null, 4, 6, vis)!.id, 1, 'facing bias');
assert.equal(pickTarget(10, 10, null, cands, 1, 4, 6, vis)!.id, 1, 'soft lock is kept while in lock range');
assert.equal(pickTarget(10, 10, null, [{ id: 1, x: 17, y: 10 }, { id: 2, x: 10, y: 12 }], 1, 4, 6, vis)!.id, 2, 'lock breaks beyond lock range');
assert.equal(pickTarget(10, 10, null, cands, null, 4, 6, (c) => c.id !== 2)!.id, 1, 'needs line of sight');
assert.equal(pickTarget(10, 10, null, [cands[2]], null, 4, 6, vis), null, 'out of range');
assert.equal(pickTarget(10, 10, null, [], 5, 4, 6, vis), null);

// ---- slot assignment ----
assert.deepEqual(assignSlot([null, null, null, null], 2, 'firebolt'), [null, null, 'firebolt', null]);
assert.deepEqual(assignSlot(['firebolt', 'staff:charged_bolt', null, null], 1, 'firebolt'), ['staff:charged_bolt', 'firebolt', null, null], 'swap when already slotted');
assert.deepEqual(assignSlot(['firebolt', null, null, null], 0, null), [null, null, null, null], 'clear');
assert.deepEqual(assignSlot(['a'], 3, 'b'), ['a', null, null, 'b'], 'pads to 4');
assert.deepEqual(assignSlot([null, null, null, null], 7, 'x'), [null, null, null, null], 'bad index ignored');
assert.deepEqual(defaultSlots('sorcerer', { firebolt: 2 }, 'charged_bolt'), ['firebolt', 'staff:charged_bolt', null, null]);
assert.deepEqual(new Game('S', 'sorcerer', 3).hero.slots, ['firebolt', 'staff:charged_bolt', null, null], 'Sorcerer: Firebolt + staff Charged Bolt by default');
assert.deepEqual(new Game('W', 'warrior', 3).hero.slots, [null, null, null, null]);

// ---- HUD layout fits both target screens, nothing overlaps ----
for (const [W, H] of [[844, 390], [932, 430]]) {
  const L = actionLayout(W, H, { l: 0, r: 0, t: 0, b: 0 });
  const circles = [L.atk, L.skill, ...L.slots, L.hpPot, L.mpPot];
  for (const c of circles) assert.ok(c.x - c.r >= 0 && c.x + c.r <= W && c.y - c.r >= 0 && c.y + c.r <= H, `on screen ${W}x${H}`);
  for (let i = 0; i < circles.length; i++) for (let j = i + 1; j < circles.length; j++) assert.ok(Math.hypot(circles[i].x - circles[j].x, circles[i].y - circles[j].y) >= circles[i].r + circles[j].r, `no overlap ${i}/${j}`);
  assert.ok(L.atk.r * 2 >= 88 && L.slots.every((s) => s.r * 2 >= 44), 'finger-sized (>= 44 px)');
  const sa = actionLayout(W, H, { l: 44, r: 44, t: 0, b: 21 });
  assert.ok(sa.atk.x + sa.atk.r <= W - 44 && sa.atk.y + sa.atk.r <= H - 21, 'respects safe-area insets');
}

// ---- game integration ----
const step = (g: Game, s: number) => { for (let i = 0; i < s * 20; i++) g.update(0.05); };
const g = new Game('J', 'warrior', 11);
const start = { x: g.p.tx, y: g.p.ty };
g.tap({ kind: 'tile', x: start.x + 3, y: start.y }); step(g, 2);
assert.deepEqual({ x: g.p.tx, y: g.p.ty }, start, 'tap-to-move is gone');
g.move = { x: 0, y: 1, mag: 1 }; step(g, 1.2); g.move = null; step(g, 0.5);
assert.ok(g.p.tx > start.x && g.p.ty > start.y, `joystick walks continuously south (${g.p.tx},${g.p.ty})`);
assert.ok(g.p.tx - start.x >= 2, '8 ticks per tile: about 3 tiles in 1.2 s');
// interact: walk next to Griswold and talk
const gris = g.npcs().find((n) => n.id === 'griswold')!;
g.p = { ...g.p, x: gris.x + 2, y: gris.y, tx: gris.x + 2, ty: gris.y, path: [], prog: 0 };
const it = interactFor(g)!; assert.equal(it.target.kind, 'npc'); assert.match(it.label, /Griswold/);
g.interact(); step(g, 1.5); assert.equal(g.dialog?.npc.id, 'griswold', 'INTERACT talks to the NPC');
g.dialog = null;
// gold auto-pickup, items need the button
const gold0 = g.hero.gold; const gi = goldItem(25); g.level.items.push({ item: gi, x: g.p.tx + 1, y: g.p.ty });
step(g, 0.2); assert.equal(g.hero.gold, gold0 + 25, 'gold is picked up automatically');
const sword = getItemAttrs(g.rng, IDI.WARRIOR, 1); g.level.items.push({ item: sword, x: g.p.tx, y: g.p.ty + 1 });
step(g, 0.5); assert.ok(g.level.items.some((x) => x.item === sword), 'items are not auto-picked');
assert.equal(interactFor(g)!.target.kind, 'item'); g.interact(); step(g, 1);
assert.ok(g.hero.inv.some((e) => e.item === sword), 'INTERACT picks the item up');
// dungeon: ATTACK auto-targets and kills; chest via INTERACT; spell slot casts and spends mana
const d = new Game('D', 'warrior', 5); d.travel('l1', null); d.finishTravel();
const mon = d.level.monsters.find((m) => m.def.id === 'zombie' || m.def.id.startsWith('fallen'))!;
const spot = [[1, 0], [0, 1], [-1, 0], [0, -1]].map(([x, y]) => ({ x: mon.tx + x, y: mon.ty + y })).find((q) => d.free(q.x, q.y))!;
d.p = { ...d.p, x: spot.x, y: spot.y, tx: spot.x, ty: spot.y, path: [], prog: 0 };
for (const m of d.level.monsters) if (m !== mon && Math.hypot(m.tx - spot.x, m.ty - spot.y) < 8) m.alive = false;
d.hero.hp = 9999; d.attackHeld = true;
for (let i = 0; i < 600 && mon.alive; i++) { d.update(0.05); d.hero.hp = Math.max(d.hero.hp, 50); }
d.attackHeld = false;
assert.equal(mon.alive, false, 'holding ATTACK soft-locks and kills the adjacent monster');
const chest = d.level.map.objects.find((o) => o.kind.startsWith('chest'))!;
const cs = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1]].map(([x, y]) => ({ x: chest.x + x, y: chest.y + y })).find((q) => d.free(q.x, q.y))!;
d.p = { ...d.p, x: cs.x, y: cs.y, tx: cs.x, ty: cs.y, path: [], prog: 0 };
const ci = interactFor(d)!; assert.equal(ci.target.kind, 'obj'); assert.match(ci.label, /chest/);
d.interact(); step(d, 1); assert.equal(chest.used, true, 'INTERACT opens the chest');
const s = new Game('S', 'sorcerer', 9); s.travel('l1', null); s.finishTravel();
const m0 = s.hero.mana; s.castSlot(0); step(s, 0.05);
assert.ok(s.hero.mana < m0, 'slot 1 (Firebolt) spends mana'); assert.ok(s.missiles.some((m) => m.kind === 'firebolt'));
step(s, 1); const ch0 = s.hero.body.handL!.charges; s.castSlot(1); assert.equal(s.hero.body.handL!.charges, ch0 - 1, 'slot 2 uses staff charges');
s.hero.mana = 0; step(s, 1); const nm = s.missiles.length; s.castSlot(0); assert.equal(s.missiles.length, nm, 'no mana, no cast'); assert.match(s.msg, /mana/);
// stairs via INTERACT
const st = new Game('T', 'rogue', 2); const down = st.level.map.down!;
st.p = { ...st.p, x: down.x - 1, y: down.y, tx: down.x - 1, ty: down.y, path: [], prog: 0 };
assert.equal(at(st.level.map, down.x, down.y), T.DOWN);
const si = interactFor(st)!; assert.equal(si.target.kind, 'stairs'); st.interact(); step(st, 1); assert.equal(st.pendingLevel?.to, 'l1');
console.log('controls ok');
