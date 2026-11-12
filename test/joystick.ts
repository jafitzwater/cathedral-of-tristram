// Order 9b: analog joystick movement in the stick's exact screen direction (inverse 2:1 iso), nearest-art facing with hysteresis,
// a 0.35-tile circle collider with wall sliding, doors, corridors, and tile-based D1 rules (monsters still reach and hit the hero).
import assert from 'node:assert/strict';
import { tileToScreen } from '../src/iso';
import { HERO_RADIUS, SECTOR_DIR, STICK_HYSTERESIS_DEG, angleDiff, dirScreenAngle, screenToWorldDir, stickAngle, stickDir } from '../src/controls';
import { DIR_NAME, artScreenAngle } from '../src/art';
import { Game, actorAt, WALK_SPEED, WALK_TICKS, TICK } from '../src/game';
import { MONSTERS } from '../src/data/monsters';
import { T, setT, at } from '../src/levels/types';

const J = (deg: number) => ({ x: Math.cos(deg * Math.PI / 180), y: Math.sin(deg * Math.PI / 180), mag: 1 });
const FACE_TOL = 22.5 + STICK_HYSTERESIS_DEG;
// the projection inverse is exact for every angle
for (let a = 0; a < 360; a += 0.5) {
  const w = screenToWorldDir(Math.cos(a * Math.PI / 180), Math.sin(a * Math.PI / 180)), s = tileToScreen(w.x, w.y);
  assert.ok(angleDiff(stickAngle(s.x, s.y), a) < 1e-6, `inverse iso at ${a}`);
  assert.ok(Math.abs(Math.hypot(w.x, w.y) - 1) < 1e-9);
}
// every direction's art faces its own screen direction, and the facing sectors cover all 8 sprites
for (let d = 0; d < 8; d++) assert.ok(angleDiff(artScreenAngle(DIR_NAME[d]), dirScreenAngle(d)) < 0.5, `dir ${d} art ${DIR_NAME[d]}`);
assert.equal(new Set(Array.from({ length: 360 }, (_, a) => stickDir(J(a)))).size, 8);
for (let k = 0; k < 8; k++) assert.equal(stickDir(J(dirScreenAngle(SECTOR_DIR[k]))), SECTOR_DIR[k], 'stick on an art direction picks that sprite');
// hysteresis ~8 degrees past the boundary (S/SE boundary halfway between 26.57 and 90 = 58.28)
assert.equal(stickDir(J(57)), 7); assert.equal(stickDir(J(60)), 0);
assert.equal(stickDir(J(58.28 + STICK_HYSTERESIS_DEG - 0.5), 7), 7, 'keeps SE inside the band');
assert.equal(stickDir(J(58.28 + STICK_HYSTERESIS_DEG + 0.5), 7), 0, 'switches just past the band');
assert.equal(stickDir(J(180), 7), 2, 'a clear move switches at once');

/** Town with a cleared 21x21 grass patch around (24, 24) and no NPCs. */
function arena(seed = 9) {
  const g = new Game('J', 'warrior', seed);
  const m = g.level.map;
  for (let y = 14; y <= 34; y++) for (let x = 14; x <= 34; x++) setT(m, x, y, T.GRASS);
  for (let y = 13; y <= 35; y++) for (let x = 13; x <= 35; x++) if (x === 13 || y === 13 || x === 35 || y === 35) setT(m, x, y, T.WALL);
  m.objects = [];
  g.townDead = new Set(['griswold', 'pepin', 'adria', 'cain', 'ogden', 'gillian', 'farnham', 'wirt', 'wounded']);
  g.p = actorAt(24, 24);
  return g;
}
const run = (g: Game, s: number, dt = 1 / 60) => { for (let i = 0; i < Math.round(s / dt); i++) g.update(dt); };
/** Minimum distance from the hero's centre to any blocked tile square (must stay >= the collider radius). */
function clearance(g: Game) {
  let best = Infinity; const p = g.p;
  for (let y = Math.round(p.y) - 2; y <= Math.round(p.y) + 2; y++) for (let x = Math.round(p.x) - 2; x <= Math.round(p.x) + 2; x++) {
    if (g.tileWalk(x, y)) continue;
    const cx = Math.max(x - 0.5, Math.min(x + 0.5, p.x)), cy = Math.max(y - 0.5, Math.min(y + 0.5, p.y));
    best = Math.min(best, Math.hypot(p.x - cx, p.y - cy));
  }
  return best;
}

// ---- 72-angle sweep (every 5 degrees) in the open: screen motion within 3 degrees, facing art within 22.5+8, D1 walk speed ----
assert.ok(Math.abs(WALK_SPEED - 1 / (WALK_TICKS * TICK)) < 1e-12);
let worst = 0, worstFace = 0;
for (let a = 0; a < 360; a += 5) {
  const g = arena();
  const s0 = tileToScreen(g.p.x, g.p.y), w0 = { x: g.p.x, y: g.p.y };
  g.move = J(a);
  const dirs = new Set<number>(); let prev = { ...s0 }, maxStep = 0;
  for (let i = 0; i < 60; i++) { // 1 s
    g.update(1 / 60);
    const s = tileToScreen(g.p.x, g.p.y);
    if (Math.hypot(s.x - prev.x, s.y - prev.y) > 0.01) maxStep = Math.max(maxStep, angleDiff(stickAngle(s.x - prev.x, s.y - prev.y), a));
    prev = s; dirs.add(g.p.dir);
  }
  const s1 = tileToScreen(g.p.x, g.p.y), ang = stickAngle(s1.x - s0.x, s1.y - s0.y);
  const err = angleDiff(ang, a); worst = Math.max(worst, err, maxStep);
  assert.ok(err <= 3 && maxStep <= 3, `stick ${a}: screen motion ${ang.toFixed(2)} (frame max err ${maxStep.toFixed(2)})`);
  const wd = Math.hypot(g.p.x - w0.x, g.p.y - w0.y);
  assert.ok(Math.abs(wd - WALK_SPEED) < 0.02, `stick ${a}: ${wd.toFixed(3)} tiles in 1 s at D1 walk speed ${WALK_SPEED}`);
  assert.equal(dirs.size, 1, `stick ${a}: one facing while walking straight`);
  const fe = angleDiff(artScreenAngle(DIR_NAME[g.p.dir]), a); worstFace = Math.max(worstFace, fe);
  assert.ok(fe <= FACE_TOL, `stick ${a}: art '${DIR_NAME[g.p.dir]}' ${artScreenAngle(DIR_NAME[g.p.dir]).toFixed(1)} vs stick (${fe.toFixed(1)})`);
  assert.equal(g.p.state, 'walk');
  // D1 rules: the hero's tile is the tile containing its position
  assert.deepEqual([g.p.tx, g.p.ty], [Math.round(g.p.x), Math.round(g.p.y)]);
  // release: stops in place, nothing snaps
  const held = { x: g.p.x, y: g.p.y };
  g.move = null; run(g, 0.5);
  assert.deepEqual({ x: g.p.x, y: g.p.y }, held, `stick ${a}: stops in place on release`);
  assert.equal(g.p.state, 'idle');
}

// ---- wall slide: pushing diagonally into a wall slides along it and never enters the collider radius ----
{
  const g = arena();
  for (let y = 14; y <= 34; y++) setT(g.level.map, 27, y, T.WALL); // a wall line at x = 27
  g.move = J(0); // screen right = world (+x, -y): into the wall at an angle
  let minC = Infinity;
  for (let i = 0; i < 240; i++) { g.update(1 / 60); minC = Math.min(minC, clearance(g)); }
  assert.ok(minC >= HERO_RADIUS - 1e-6, `keeps ${HERO_RADIUS} clearance (${minC.toFixed(3)})`);
  assert.ok(Math.abs(g.p.x - (26.5 - HERO_RADIUS)) < 0.03, `pressed against the wall (${g.p.x.toFixed(3)})`);
  assert.ok(g.p.y < 24 - 4, `slid along the wall (${g.p.y.toFixed(2)})`);
  assert.equal(g.p.state, 'walk');
  // straight into the wall face: stops, no jitter through
  const h = arena();
  for (let y = 14; y <= 34; y++) setT(h.level.map, 27, y, T.WALL);
  const w = tileToScreen(1, 0); h.move = { x: w.x / Math.hypot(w.x, w.y), y: w.y / Math.hypot(w.x, w.y), mag: 1 };
  run(h, 3); assert.ok(Math.abs(h.p.x - (26.5 - HERO_RADIUS)) < 0.03 && Math.abs(h.p.y - 24) < 1e-6 && clearance(h) >= HERO_RADIUS - 1e-6, 'head-on stop');
}
// ---- no corner cutting: two walls touching diagonally leave no gap ----
{
  const g = arena(); const m = g.level.map;
  // a diagonal wall from (20,30) to (30,20): tiles (x, 50 - x)
  for (let x = 18; x <= 32; x++) setT(m, x, 50 - x, T.WALL);
  g.p = actorAt(24, 24);
  const s = tileToScreen(1, 1); g.move = { x: s.x / Math.hypot(s.x, s.y), y: s.y / Math.hypot(s.x, s.y), mag: 1 }; // screen down = world (+1,+1)
  run(g, 4);
  assert.ok(g.p.x + g.p.y < 50, `blocked by the diagonal wall (${g.p.x.toFixed(2)},${g.p.y.toFixed(2)})`);
  for (let x = 18; x <= 32; x++) assert.ok(at(m, x, 50 - x) === T.WALL);
  assert.ok(clearance(g) >= HERO_RADIUS - 1e-6);
}
// ---- door: a closed door blocks, an open one lets the hero through ----
{
  const g = arena(); const m = g.level.map;
  for (let y = 14; y <= 34; y++) setT(m, 27, y, T.WALL);
  setT(m, 27, 24, T.DOOR);
  const w = tileToScreen(1, 0); const right = { x: w.x / Math.hypot(w.x, w.y), y: w.y / Math.hypot(w.x, w.y), mag: 1 }; // world +x
  g.move = right; run(g, 2);
  assert.ok(g.p.x < 26.5 - HERO_RADIUS + 0.01, `closed door blocks (${g.p.x.toFixed(2)})`);
  g.move = null; g.toggleDoor(27, 24); assert.equal(at(m, 27, 24), T.DOOR_OPEN);
  g.move = right; run(g, 2);
  assert.ok(g.p.x > 28, `walks through the open door (${g.p.x.toFixed(2)})`);
  assert.ok(Math.abs(g.p.y - 24) < 1e-6);
}
// ---- corridor: a 2-tile corridor along world x, stick a little off its screen direction: the hero slides along to the end ----
{
  const g = arena(); const m = g.level.map;
  for (let y = 14; y <= 34; y++) for (let x = 14; x <= 34; x++) setT(m, x, y, T.WALL);
  for (let x = 16; x <= 33; x++) { setT(m, x, 23, T.GRASS); setT(m, x, 24, T.GRASS); } // 2 tiles wide
  g.p = actorAt(16, 24);
  for (const off of [-12, 12]) {
    g.p = actorAt(16, off < 0 ? 24 : 23);
    g.move = J(dirScreenAngle(7) + off); // corridor direction on screen = SE (26.57), stick 12 degrees off
    let minC = Infinity;
    for (let i = 0; i < 60 * 10; i++) { g.update(1 / 60); minC = Math.min(minC, clearance(g)); }
    assert.ok(g.p.x > 32.5, `corridor (stick off by ${off}): reached the end (${g.p.x.toFixed(2)})`);
    assert.ok(minC >= HERO_RADIUS - 1e-6, 'never clips the corridor walls');
    g.move = null; run(g, 0.2);
  }
}
// ---- monsters still reach and hit the hero, using the hero's tile ----
{
  const g = arena(4);
  g.p.x = 24.3; g.p.y = 23.8; g.p.tx = 24; g.p.ty = 24; // a fractional resting position
  const z = g.spawnMon(MONSTERS.zombie, 30, 30); z.active = true;
  g.level.monsters.push(z);
  const hp0 = g.hero.hp;
  let reached = false;
  for (let i = 0; i < 60 * 30 && g.hero.hp === hp0; i++) { g.update(1 / 60); if (Math.max(Math.abs(z.tx - g.p.tx), Math.abs(z.ty - g.p.ty)) === 1) reached = true; }
  assert.ok(reached, 'the monster walked up to the hero');
  assert.ok(g.hero.hp < hp0, `the monster hits the hero (${hp0} -> ${g.hero.hp})`);
  assert.ok(!(z.tx === g.p.tx && z.ty === g.p.ty), 'never on the hero tile');
  // the hero attacks facing the target and hits it (tile-based range)
  g.hero.hp = hp0; g.move = null; g.attackHeld = true;
  const mhp = z.hp; run(g, 4); g.attackHeld = false;
  assert.ok(z.hp < mhp || !z.alive, 'the hero hits back');
  const zs = tileToScreen(z.x - g.p.x, z.y - g.p.y);
  assert.ok(angleDiff(artScreenAngle(DIR_NAME[g.p.dir]), stickAngle(zs.x, zs.y)) <= 32, 'attack faces the target');
  // the actor's tile blocks the hero's circle
  if (z.alive) { const q = { x: g.p.x, y: g.p.y }; const s = tileToScreen(z.tx - g.p.x, z.ty - g.p.y); g.move = { x: s.x, y: s.y, mag: 1 }; const l = Math.hypot(s.x, s.y); g.move.x /= l; g.move.y /= l; run(g, 0.5);
    const cx = Math.max(z.tx - 0.5, Math.min(z.tx + 0.5, g.p.x)), cy = Math.max(z.ty - 0.5, Math.min(z.ty + 0.5, g.p.y));
    assert.ok(Math.hypot(g.p.x - cx, g.p.y - cy) >= Math.min(HERO_RADIUS, Math.hypot(q.x - Math.max(z.tx - 0.5, Math.min(z.tx + 0.5, q.x)), q.y - Math.max(z.ty - 0.5, Math.min(z.ty + 0.5, q.y)))) - 1e-6, 'cannot walk into a monster'); }
}
console.log(`joystick: OK (72 angles: screen motion worst ${worst.toFixed(3)} deg, facing art worst ${worstFace.toFixed(1)} deg; slide, corner, door, corridor, monsters)`);
