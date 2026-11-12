// Order 9: the joystick's screen angle is the hero's on-screen walking direction and facing, for all 8 directions.
import assert from 'node:assert/strict';
import { DIRS, tileToScreen } from '../src/iso';
import { SECTOR_DIR, STICK_HYSTERESIS_DEG, angleDiff, dirScreenAngle, stepFor, stickAngle, stickDir } from '../src/controls';
import { DIR_NAME, artScreenAngle } from '../src/art';
import { Game, actorAt } from '../src/game';
import { T, setT } from '../src/levels/types';

const J = (deg: number) => ({ x: Math.cos(deg * Math.PI / 180), y: Math.sin(deg * Math.PI / 180), mag: 1 });
// sectors: 45-degree screen sectors -> the world step that moves that way on screen (engine axes from tileToScreen)
const want: Record<number, [number, number]> = { 0: [1, -1], 45: [1, 0], 90: [1, 1], 135: [0, 1], 180: [-1, 1], 225: [-1, 0], 270: [-1, -1], 315: [0, -1] };
for (const [deg, [x, y]] of Object.entries(want)) assert.deepEqual(DIRS[stickDir(J(+deg))], { x, y }, `stick ${deg}`);
assert.equal(new Set(SECTOR_DIR).size, 8);
// equal sectors: the boundaries sit at 22.5 + k*45 degrees
for (let k = 0; k < 8; k++) {
  assert.equal(stickDir(J(k * 45 + 22.4)), SECTOR_DIR[k], `sector ${k} upper edge`);
  assert.equal(stickDir(J(k * 45 + 22.6)), SECTOR_DIR[(k + 1) % 8], `sector ${k + 1} lower edge`);
}
// hysteresis: ~8 degrees, and a clear move switches immediately
const prev = stickDir(J(10));
assert.equal(stickDir(J(22.5 + STICK_HYSTERESIS_DEG - 0.5), prev), prev, 'keeps the old sector inside the hysteresis band');
assert.notEqual(stickDir(J(22.5 + STICK_HYSTERESIS_DEG + 0.5), prev), prev, 'switches just past the band');
assert.equal(stickDir(J(90), prev), 0, 'a clear move is never locked to a stale direction');

// Walk the real game for each stick angle and measure the on-screen displacement of the hero.
function walk(deg: number) {
  const g = new Game('J', 'warrior', 9);
  const m = g.level.map; // town: clear a 20x20 open patch to walk on
  const cx = 24, cy = 24;
  for (let y = cy - 10; y <= cy + 10; y++) for (let x = cx - 10; x <= cx + 10; x++) setT(m, x, y, T.GRASS);
  m.objects = [];
  g.townDead = new Set(['griswold', 'pepin', 'adria', 'cain', 'ogden', 'gillian', 'farnham', 'wirt', 'wounded']);
  g.p = actorAt(cx, cy);
  const s0 = tileToScreen(g.p.x, g.p.y);
  g.move = J(deg);
  const facings = new Set<number>();
  for (let i = 0; i < 80; i++) { g.update(1 / 30); if (g.p.state === 'walk') facings.add(g.p.dir); }
  const s1 = tileToScreen(g.p.x, g.p.y);
  return { ang: stickAngle(s1.x - s0.x, s1.y - s0.y), dist: Math.hypot(s1.x - s0.x, s1.y - s0.y), facings: [...facings] };
}
// in-between angles: a tile step can only go 8 ways, so inside a diagonal sector (whose step sits at 26.57 degrees) the error grows toward
// its steep edge (max ~41 at 67.5); the angles below cover both edges of the cardinal sectors and the shallow half of the diagonals
const angles = [0, 45, 90, 135, 180, 225, 270, 315, 10, 30, 80, 100, 150, 170, 200, 215, 260, 280, 325, 350];
const rows: string[] = [];
for (const a of angles) {
  const r = walk(a);
  assert.ok(r.dist > 64, `stick ${a}: hero moved (${r.dist.toFixed(0)} px)`);
  assert.ok(angleDiff(r.ang, a) <= 22.5, `stick ${a}: screen displacement ${r.ang.toFixed(1)} within 22.5 degrees`);
  assert.equal(r.facings.length, 1, `stick ${a}: one facing while walking straight (no zig-zag): ${r.facings}`);
  // the facing art drawn for that direction points the same way on screen as the walk
  assert.ok(angleDiff(artScreenAngle(DIR_NAME[r.facings[0]]), r.ang) <= 1, `stick ${a}: art '${DIR_NAME[r.facings[0]]}' faces ${artScreenAngle(DIR_NAME[r.facings[0]]).toFixed(1)}, walk ${r.ang.toFixed(1)}`);
  rows.push(`${a}->${r.ang.toFixed(1)}(${DIR_NAME[r.facings[0]]})`);
}
// every direction's art faces its own screen direction
for (let d = 0; d < 8; d++) assert.ok(angleDiff(artScreenAngle(DIR_NAME[d]), dirScreenAngle(d)) < 0.5, `dir ${d} art ${DIR_NAME[d]}`);
// wall slide only when blocked; a blocked straight step slides to the nearer neighbour
const open = () => true;
assert.equal(stepFor(J(0), { x: 5, y: 5 }, open), 6, 'straight when open');
assert.equal(stepFor(J(10), { x: 5, y: 5 }, (x, y) => !(x === 6 && y === 4)), 7, 'blocked E, stick a bit down: slides SE');
assert.equal(stepFor(J(-10), { x: 5, y: 5 }, (x, y) => !(x === 6 && y === 4)), 5, 'blocked E, stick a bit up: slides NE');
console.log(`joystick: OK (${rows.join(' ')})`);
