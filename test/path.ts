import assert from 'node:assert/strict';
import { findPath } from '../src/path';
import { MAP_H, MAP_W, FLOOR, makeTestLevel } from '../src/map';

const open = () => true;
const p = findPath(10, 10, open, { x: 0, y: 0 }, { x: 5, y: 5 })!;
assert.equal(p.length, 5, 'pure diagonal');
assert.deepEqual(p[4], { x: 5, y: 5 });
assert.deepEqual(findPath(10, 10, open, { x: 2, y: 2 }, { x: 2, y: 2 }), []);
const q = findPath(10, 10, open, { x: 0, y: 0 }, { x: 7, y: 2 })!;
assert.equal(q.length, 7, 'octile: 2 diag + 5 straight');

// wall with a gap: must route through it
const wall = (x: number, y: number) => !(x === 5 && y !== 8);
const r = findPath(10, 10, wall, { x: 1, y: 1 }, { x: 9, y: 1 })!;
assert.ok(r.some((s) => s.x === 5 && s.y === 8));
for (let i = 1; i < r.length; i++) assert.ok(Math.max(Math.abs(r[i].x - r[i - 1].x), Math.abs(r[i].y - r[i - 1].y)) === 1, 'steps are adjacent');

// no corner cutting between two diagonal walls
const blocked = (x: number, y: number) => !((x === 1 && y === 0) || (x === 0 && y === 1));
assert.equal(findPath(3, 3, blocked, { x: 0, y: 0 }, { x: 1, y: 1 }), null);
// unreachable / blocked target
assert.equal(findPath(10, 10, (x) => x !== 5, { x: 0, y: 0 }, { x: 9, y: 0 }), null);
assert.equal(findPath(10, 10, (x, y) => !(x === 9 && y === 9), { x: 0, y: 0 }, { x: 9, y: 9 }), null);

// test level: corners of all four rooms connect
const m = makeTestLevel();
const walk = (x: number, y: number) => m[y * MAP_W + x] === FLOOR;
for (const t of [{ x: 34, y: 5 }, { x: 5, y: 34 }, { x: 34, y: 34 }]) assert.ok(findPath(MAP_W, MAP_H, walk, { x: 5, y: 5 }, t), `reach ${t.x},${t.y}`);
console.log('path ok');
