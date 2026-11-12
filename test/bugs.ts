// Order 10 bugs from Joseph's phone playtest: B1 corridors + walking round monsters, B2 attacks on all 8 neighbours, B3 doors.
import assert from 'node:assert/strict';
import { Game, actorAt } from '../src/game';
import { MONSTERS } from '../src/data/monsters';
import { DIRS, tileToScreen } from '../src/iso';
import { DIR_NAME, artScreenAngle } from '../src/art';
import { HERO_RADIUS, angleDiff, stickAngle } from '../src/controls';
import { T, at, setT } from '../src/levels/types';
import { generateL1 } from '../src/levels/cathedral';

const stick = (wx: number, wy: number) => { const s = tileToScreen(wx, wy), l = Math.hypot(s.x, s.y); return { x: s.x / l, y: s.y / l, mag: 1 }; };
const run = (g: Game, s: number) => { for (let i = 0; i < Math.round(s * 60); i++) g.update(1 / 60); };
function l1(seed = 5) { const g = new Game('B', 'warrior', seed); g.travel('l1', null); g.finishTravel(); g.level.monsters = []; return g; }

// ---- B1: corridors are a full D1 cell wide (2 tiles): every corridor floor tile sits in a 2x2 open block ----
assert.ok(HERO_RADIUS <= 0.3, 'hero collider <= 0.3 tile');
let checked = 0;
for (let seed = 1; seed <= 25; seed++) {
  const m = generateL1(seed * 7919); if (!m) continue;
  const inRoom = (x: number, y: number) => [...m.rooms, ...(m.butcherRoom ? [m.butcherRoom] : [])].some((r) => x >= r.x - 1 && y >= r.y - 1 && x <= r.x + r.w && y <= r.y + r.h);
  const open = (x: number, y: number) => { const t = at(m, x, y); return t === T.FLOOR || t === T.DOOR || t === T.UP || t === T.DOWN; };
  for (let y = 1; y < m.h - 1; y++) for (let x = 1; x < m.w - 1; x++) {
    if (at(m, x, y) !== T.FLOOR || inRoom(x, y)) continue;
    const block = [[0, 0], [-1, 0], [0, -1], [-1, -1]].some(([ox, oy]) => open(x + ox, y + oy) && open(x + ox + 1, y + oy) && open(x + ox, y + oy + 1) && open(x + ox + 1, y + oy + 1));
    assert.ok(block, `seed ${seed}: corridor tile (${x},${y}) is in a 2-wide hall`); checked++;
  }
}
assert.ok(checked > 500, `checked ${checked} corridor tiles`);
// a monster standing in a 2-tile corridor can be walked round on both sides (the hero slides round its circle)
for (const lane of [0, 1]) for (const heroLane of [0, 0.5, 1]) {
  const g = l1(); const m = g.level.map;
  for (let y = 30; y <= 45; y++) for (let x = 20; x <= 60; x++) setT(m, x, y, T.WALL);
  for (let x = 22; x <= 58; x++) { setT(m, x, 37, T.FLOOR); setT(m, x, 38, T.FLOOR); } // corridor along world x, lanes y=37/38
  m.objects = [];
  const z = g.spawnMon(MONSTERS.zombie, 40, 37 + lane); g.level.monsters.push(z); g.updateMon = () => {}; // it just stands there
  g.p = actorAt(25, 37); g.p.y = 37 + heroLane;
  g.move = stick(1, 0);
  let minGap = Infinity;
  for (let i = 0; i < 60 * 12 && g.p.x < 50; i++) { g.update(1 / 60); minGap = Math.min(minGap, Math.hypot(g.p.x - z.x, g.p.y - z.y)); assert.ok(!(g.p.tx === z.tx && g.p.ty === z.ty), 'never on the monster tile'); }
  assert.ok(g.p.x >= 50, `monster in lane ${lane}, hero from ${37 + heroLane}: walked round it (x ${g.p.x.toFixed(2)})`);
  assert.ok(minGap > 0.7, 'kept clear of the monster');
  assert.equal(g.p.ty, 37 + (1 - lane), 'passed on the free side');
}

// ---- B2: one monster in each of the 8 neighbour tiles: the attack faces it (art points at it) and damage lands ----
for (let d = 0; d < 8; d++) for (const off of [[0, 0], [0.25, -0.2], [-0.2, 0.25]]) {
  const g = l1(11 + d); const m = g.level.map;
  for (let y = 34; y <= 46; y++) for (let x = 34; x <= 46; x++) setT(m, x, y, T.FLOOR);
  m.objects = [];
  g.p = actorAt(40, 40); g.p.x += off[0]; g.p.y += off[1];
  const z = g.spawnMon(MONSTERS.zombie, 40 + DIRS[d].x, 40 + DIRS[d].y); z.hp = z.maxHp = 9999; g.level.monsters.push(z);
  // a decoy ahead of the hero (he faces away from the real attacker, the decoy is soft-locked)
  const f = g.spawnMon(MONSTERS.zombie, 40 + DIRS[(d + 4) % 8].x * 3, 40 + DIRS[(d + 4) % 8].y * 3); f.hp = f.maxHp = 9999; g.level.monsters.push(f);
  g.p.dir = (d + 4) % 8; g.lockId = f.uid; g.attackHeld = true;
  const faced: number[] = [];
  for (let i = 0; i < 60 * 4; i++) { g.hero.hp = g.d.maxHp; g.update(1 / 60); if (g.p.state === 'attack') faced.push(g.p.dir); }
  assert.ok(9999 - z.hp > 0, `neighbour ${d} (${DIRS[d].x},${DIRS[d].y}) off ${off}: damage lands`);
  assert.equal(f.hp, 9999, 'the decoy is not attacked');
  const s = tileToScreen(z.x - g.p.x, z.y - g.p.y), want = stickAngle(s.x, s.y);
  for (const fd of faced) assert.ok(angleDiff(artScreenAngle(DIR_NAME[fd]), want) <= 31.8, `neighbour ${d}: art '${DIR_NAME[fd]}' ${artScreenAngle(DIR_NAME[fd]).toFixed(0)} points at the target ${want.toFixed(0)}`);
}

// ---- B3: doors: open, pass, come back, pass again, close, blocked; won't close with the hero in it ----
for (let seed = 1; seed <= 4; seed++) {
  const g = l1(seed); const m = g.level.map;
  const doors: [number, number][] = [];
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (at(m, x, y) === T.DOOR) doors.push([x, y]);
  assert.ok(doors.length > 0);
  for (const [dx, dy] of doors) {
    const alongY = at(m, dx - 1, dy) === T.WALL || at(m, dx + 1, dy) === T.WALL; // wall line along x: pass along y
    const ax = alongY ? { x: 0, y: 1 } : { x: 1, y: 0 };
    const side = (s: number, lat: number) => ({ x: dx + ax.x * 2 * s + (alongY ? lat : 0), y: dy + ax.y * 2 * s + (alongY ? 0 : lat) });
    const go = (s: number, lat: number, wantPass: boolean) => {
      const a = side(-s, lat); g.p = actorAt(Math.round(a.x), Math.round(a.y)); g.p.x = a.x; g.p.y = a.y;
      g.move = stick(ax.x * s, ax.y * s); run(g, 2.2); g.move = null; run(g, 0.1);
      const prog = (g.p.x - dx) * ax.x * s + (g.p.y - dy) * ax.y * s;
      if (wantPass) assert.ok(prog > 1, `door (${dx},${dy}) pass ${s > 0 ? 'out' : 'back'} from lateral ${lat}: ${prog.toFixed(2)}`);
      else assert.ok(prog < -0.5 - HERO_RADIUS + 0.01, `door (${dx},${dy}) closed blocks: ${prog.toFixed(2)}`);
    };
    if (!g.tileWalk(side(-1, 0).x, side(-1, 0).y) || !g.tileWalk(side(1, 0).x, side(1, 0).y)) continue;
    go(1, 0, false); // closed: blocked
    g.toggleDoor(dx, dy); assert.equal(at(m, dx, dy), T.DOOR_OPEN);
    go(1, 0.3, true); go(-1, -0.3, true); go(1, -0.35, true); go(-1, 0.35, true); // both ways, off-centre approaches
    g.p = actorAt(dx, dy); g.toggleDoor(dx, dy); assert.equal(at(m, dx, dy), T.DOOR_OPEN, "won't close on the hero");
    g.p = actorAt(dx - ax.x * 2, dy - ax.y * 2); g.toggleDoor(dx, dy); assert.equal(at(m, dx, dy), T.DOOR, 'closes');
    go(1, 0, false); go(-1, 0, false);
  }
}
console.log('bugs: OK (B1 2-wide halls + walk round a monster both sides, B2 8 neighbours face + hit, B3 doors both ways)');
