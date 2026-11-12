import assert from 'node:assert/strict';
import { DIRS, TILE_H, TILE_W, dirOf, pickTile, screenToTile, tileToScreen } from '../src/iso';

assert.equal(TILE_W, 2 * TILE_H, '2:1 diamonds');
assert.deepEqual(tileToScreen(0, 0), { x: 0, y: 0 });
assert.deepEqual(tileToScreen(1, 0), { x: 32, y: 16 });
assert.deepEqual(tileToScreen(0, 1), { x: -32, y: 16 });
for (const [x, y] of [[0, 0], [3, 7], [12, 2], [39, 39]]) {
  const s = tileToScreen(x, y);
  const t = screenToTile(s.x, s.y);
  assert.ok(Math.abs(t.x - x) < 1e-9 && Math.abs(t.y - y) < 1e-9, 'round trip');
  // centre of the diamond picks the tile; points just inside each corner too
  assert.deepEqual(pickTile(s.x, s.y + TILE_H / 2), { x, y });
  for (const [dx, dy] of [[0, 2], [0, TILE_H - 2], [-TILE_W / 2 + 4, TILE_H / 2], [TILE_W / 2 - 4, TILE_H / 2]]) {
    assert.deepEqual(pickTile(s.x + dx, s.y + dy), { x, y }, `pick inside ${x},${y} +${dx},${dy}`);
  }
}
assert.equal(DIRS.length, 8);
assert.equal(new Set(DIRS.map((d) => `${d.x},${d.y}`)).size, 8);
DIRS.forEach((d, i) => assert.equal(dirOf(d.x * 3, d.y * 5), i));
// S points straight down the screen, E straight right
assert.equal(tileToScreen(DIRS[0].x, DIRS[0].y).x, 0);
assert.equal(tileToScreen(DIRS[6].x, DIRS[6].y).y, 0);
console.log('iso ok');
