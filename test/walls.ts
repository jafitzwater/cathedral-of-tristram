// Order 6: Cathedral L1 wall-facing pass (faces, corners, columns, doors, arches) and D1 wall transparency.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { T, setT, type LevelMap } from '../src/levels/types';
import { generateL1 } from '../src/levels/cathedral';
import { archCells, doorFacing, wallData, wallFade, wallPieces, FADE_ALPHA } from '../src/walls';
import { groupsMiB, wantedGroups, type ArtManifest } from '../src/art';

const man = JSON.parse(fs.readFileSync('public/art/manifest.json', 'utf8')) as ArtManifest;
const wallsAsset = man.assets.find((a) => a.key === 'tiles/walls-props')!;
const cellIds = new Set(wallsAsset.frames!.filter((f) => f.cell).map((f) => f.id));
const ids = (p: { id: string }[]) => p.map((q) => q.id);

function box(w: number, h: number): LevelMap {
  return { w, h, tiles: new Uint8Array(w * h).fill(T.WALL), up: null, down: null, start: { x: 0, y: 0 }, rooms: [], butcherRoom: null, objects: [], monsterSpots: [] };
}
// a 3x3 room at (3..5, 3..5)
const m = box(10, 10);
for (let y = 3; y <= 5; y++) for (let x = 3; x <= 5; x++) setT(m, x, y, T.FLOOR);
// faces on the edge that borders the room (Kenney _n = SW edge/y+1, _e = NW/x-1, _s = NE/y-1, _w = SE/x+1)
assert.deepEqual(ids(wallPieces(m, 4, 2)), ['stoneWall_n'], 'north wall faces the room (its SW edge)');
assert.deepEqual(ids(wallPieces(m, 4, 6)), ['stoneWall_s'], 'south wall: NE edge');
assert.deepEqual(ids(wallPieces(m, 2, 4)), ['stoneWall_w'], 'west wall: SE edge');
assert.deepEqual(ids(wallPieces(m, 6, 4)).map((s) => s.replace('Aged', '')), ['stoneWall_e'], 'east wall: NW edge');
// columns on the four outer corners of the ring (the room only touches their tips)
assert.deepEqual(wallPieces(m, 2, 2), [{ id: 'stoneWallColumn_n', dy: 0 }], 'NW ring corner: column on its bottom tip');
assert.deepEqual(wallPieces(m, 6, 6), [{ id: 'stoneWallColumn_n', dy: -32 }], 'SE ring corner: column on its top tip');
assert.deepEqual(wallPieces(m, 2, 6), [{ id: 'stoneWallColumn_n', dx: 32, dy: -16 }]);
assert.deepEqual(wallPieces(m, 6, 2), [{ id: 'stoneWallColumn_n', dx: -32, dy: -16 }]);
assert.deepEqual(wallPieces(m, 0, 0), [], 'buried wall: nothing drawn (D1 black)');
// inner corners: a wall tile with two adjacent open edges uses the joined corner piece
const L = box(6, 6); for (const [x, y] of [[1, 2], [2, 2], [2, 1]]) setT(L, x, y, T.FLOOR);
setT(L, 1, 1, T.WALL);
assert.deepEqual(ids(wallPieces(L, 1, 1)), ['stoneWallCorner_n'], 'open SW + SE edges: the V corner');
{
  const q = box(5, 5); setT(q, 2, 1, T.FLOOR); setT(q, 1, 2, T.FLOOR); assert.deepEqual(ids(wallPieces(q, 2, 2)), ['stoneWallCorner_s'], 'open NW + NE');
  const r = box(5, 5); setT(r, 1, 2, T.FLOOR); setT(r, 2, 3, T.FLOOR); assert.deepEqual(ids(wallPieces(r, 2, 2)), ['stoneWallCorner_e'], 'open NW + SW');
  const u = box(5, 5); setT(u, 2, 1, T.FLOOR); setT(u, 3, 2, T.FLOOR); assert.deepEqual(ids(wallPieces(u, 2, 2)), ['stoneWallCorner_w'], 'open NE + SE');
  const t = box(5, 5); setT(t, 2, 1, T.FLOOR); setT(t, 2, 3, T.FLOOR); assert.deepEqual(ids(wallPieces(t, 2, 2)).map((s) => s.replace('Aged', '')), ['stoneWall_s', 'stoneWall_n'], 'thin wall: both faces, far one first');
}
// doors sit in the plane of their wall line
{
  const d = box(7, 7); for (let y = 1; y <= 5; y++) { setT(d, 2, y, T.FLOOR); setT(d, 4, y, T.FLOOR); } setT(d, 3, 3, T.DOOR);
  assert.equal(doorFacing(d, 3, 3), 'w', 'wall line along y: SE-edge plane');
  const e = box(7, 7); for (let x = 1; x <= 5; x++) { setT(e, x, 2, T.FLOOR); setT(e, x, 4, T.FLOOR); } setT(e, 3, 3, T.DOOR_OPEN);
  assert.equal(doorFacing(e, 3, 3), 'n', 'wall line along x: SW-edge plane');
  assert.equal(wallData(e)[3 * 7 + 3]?.door, 'n');
}
// generated levels: every exposed wall gets a face, ids exist, doors/arches well-formed, map untouched
let arches = 0, doors = 0, cols = 0;
for (let seed = 1; seed <= 25; seed++) {
  const g = generateL1(seed * 977), before = g.tiles.slice(), wd = wallData(g);
  assert.deepEqual(g.tiles, before, 'render pass never edits the map (collision unchanged)');
  const ar = archCells(g);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const t: number = g.tiles[y * g.w + x], w = wd[y * g.w + x];
    const exposed = [[0, 1], [1, 0], [0, -1], [-1, 0]].some(([dx, dy]) => { const xx = x + dx, yy = y + dy; return xx >= 0 && yy >= 0 && xx < g.w && yy < g.h && g.tiles[yy * g.w + xx] !== T.WALL; });
    if (t === T.WALL && exposed) assert.ok(w && w.pieces.some((p) => !p.id.startsWith('stoneWallColumn')), `exposed wall ${x},${y} has a face`);
    for (const p of w?.pieces ?? []) { assert.ok(cellIds.has(p.id), `${p.id} in the atlas`); if (p.id.startsWith('stoneWallColumn')) cols++; }
    if (t === T.DOOR) { doors++; assert.ok(doorFacing(g, x, y), `door ${x},${y} sits in a wall line`); }
    if (ar.has(y * g.w + x)) { arches++; assert.equal(t, T.FLOOR, 'arches only over open floor'); }
  }
}
assert.ok(arches > 100 && doors >= 25 && cols > 100, `pieces placed: ${arches} arches, ${doors} doors, ${cols} columns`);
for (const f of ['n', 'w']) for (const k of ['stoneWallDoorClosed', 'stoneWallDoorOpen', 'stoneWallArchway']) assert.ok(cellIds.has(`${k}_${f}`));
assert.ok(cellIds.has('stoneColumn_n'));

// D1 wall transparency: walls 1-4 diagonals in front of the hero and within 3 tiles across fade; behind / far stay solid
const H = [10, 10] as const;
assert.equal(wallFade(11, 11, ...H), FADE_ALPHA, 'directly in front');
assert.equal(wallFade(12, 12, ...H), FADE_ALPHA);
assert.equal(wallFade(11, 10, ...H), FADE_ALPHA, 'adjacent SE wall');
assert.equal(wallFade(13, 10, ...H), FADE_ALPHA, '3 across');
assert.equal(wallFade(14, 9, ...H), 1, 'too far across');
assert.equal(wallFade(9, 9, ...H), 1, 'behind the hero');
assert.equal(wallFade(10, 9, ...H), 1, 'NE wall is behind');
assert.equal(wallFade(13, 13, ...H), 1, 'far in front (6 diagonals)');
assert.equal(wallFade(10.5, 10.5, 10.5, 10.5), 1, 'same diagonal');

// memory: the wall pieces load with the dungeon tiles (Order 7 split), and every zone set stays within 32 MiB
assert.ok(man.groups['dungeon-tiles'].includes('tiles/walls-props'));
for (const cls of ['warrior', 'rogue', 'sorcerer']) for (const z of ['town', 'cathedral', 'butcher'] as const) for (const e of [null, 'skeleton']) assert.ok(groupsMiB(man, wantedGroups(z, cls, e)) <= 32);
console.log(`walls: OK (${arches} arches, ${doors} doors, ${cols} columns over 25 levels)`);
