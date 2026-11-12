import assert from 'node:assert/strict';
import { findPath } from '../src/path';
import { generateL1 } from '../src/levels/cathedral';
import { WALKABLE } from '../src/levels/types';

const open = () => true;
const p = findPath(10, 10, open, { x: 0, y: 0 }, { x: 5, y: 5 })!;
assert.equal(p.length, 5, 'pure diagonal');
assert.deepEqual(p[4], { x: 5, y: 5 });
assert.deepEqual(findPath(10, 10, open, { x: 2, y: 2 }, { x: 2, y: 2 }), []);
const q = findPath(10, 10, open, { x: 0, y: 0 }, { x: 7, y: 2 })!;
assert.equal(q.length, 7, 'octile: 2 diag + 5 straight');
const wall = (x: number, y: number) => !(x === 5 && y !== 8);
const r = findPath(10, 10, wall, { x: 1, y: 1 }, { x: 9, y: 1 })!;
assert.ok(r.some((s) => s.x === 5 && s.y === 8));
for (let i = 1; i < r.length; i++) assert.ok(Math.max(Math.abs(r[i].x - r[i - 1].x), Math.abs(r[i].y - r[i - 1].y)) === 1, 'steps are adjacent');
const blocked = (x: number, y: number) => !((x === 1 && y === 0) || (x === 0 && y === 1));
assert.equal(findPath(3, 3, blocked, { x: 0, y: 0 }, { x: 1, y: 1 }), null, 'no corner cutting');
assert.equal(findPath(10, 10, (x) => x !== 5, { x: 0, y: 0 }, { x: 9, y: 0 }), null);
// pathing on a generated cathedral: stairs up -> stairs down (doors opened)
const m = generateL1(42);
const walk = (x: number, y: number) => { const t = m.tiles[y * m.w + x]; return WALKABLE.has(t) || t === 2; };
assert.ok(findPath(m.w, m.h, walk, m.start, m.down!, 20000), 'start reaches the down stairs');
console.log('path ok');
