// Cathedral level 1 generator. D1-style (drlg_l1.cpp inspired, not a port): rectangular rooms chained by corridors, doors where
// corridors enter rooms, pillar rows in big rooms, stairs up in the first room, stairs down in the farthest room, and the
// Butcher's chamber with a single door (D1: Butcher set piece on dlvl 2 - placed on L1 here, logged deviation).
// Order 9: like D1 v1.09 the layout is made on a 40x40 DUNGEON CELL grid and every cell becomes 2x2 game tiles (D1's
// dungeon[40][40] -> dPiece 80x80 playable), so rooms, corridors and the Butcher's room are D1-sized in tiles. Doors, stairs
// and pillars are single tiles inside their cell; objects and monsters are placed on the tile map.
import { Rng } from '../rng';
import { L1_POOL } from '../data/monsters';
import { T, at, setT, type LevelMap, type Obj, type Room } from './types';

export const CELLS = 40, SUB = 2;
export const L1_W = CELLS * SUB, L1_H = CELLS * SUB;
const SHRINES = ['Mysterious', 'Hidden', 'Gloomy', 'Weird', 'Magical', 'Stone', 'Religious', 'Enchanted', 'Thaumaturgic', 'Fascinating',
  'Cryptic', 'Eldritch', 'Eerie', 'Divine', 'Holy', 'Sacred', 'Spiritual', 'Abandoned', 'Creepy', 'Quiet', 'Secluded', 'Ornate', 'Glimmering'];
// (Spooky and Tainted are multiplayer-only, so excluded in SP: objects.cpp shrineavail.)

const overlaps = (a: Room, b: Room, pad: number) => a.x - pad < b.x + b.w && b.x - pad < a.x + a.w && a.y - pad < b.y + b.h && b.y - pad < a.y + a.h;
const centre = (r: Room) => ({ x: r.x + (r.w >> 1), y: r.y + (r.h >> 1) });
const scaleRoom = (r: Room): Room => ({ x: r.x * SUB, y: r.y * SUB, w: r.w * SUB, h: r.h * SUB });

export function generateL1(seed: number): LevelMap {
  for (let attempt = 0; attempt < 20; attempt++) {
    const m = tryGen(new Rng(seed + attempt * 7919));
    if (m) return m;
  }
  throw new Error('L1 generation failed');
}

/** Cell-grid door: the cell, and which side of it touches the room (the door tile sits in that row/column). */
interface CellDoor { x: number; y: number; dx: number; dy: number }

function tryGen(rng: Rng): LevelMap | null {
  const G = CELLS;
  const c: Uint8Array = new Uint8Array(G * G).fill(T.WALL); // cell grid
  const cat = (x: number, y: number) => c[y * G + x], cset = (x: number, y: number, t: number) => { if (x >= 0 && y >= 0 && x < G && y < G) c[y * G + x] = t; };
  const rooms: Room[] = [];
  // Butcher's chamber first, in a corner region (5x5 cells = 10x10 tiles inside).
  const BS = 5;
  const bx = rng.int(2) ? 2 : G - BS - 2, by = rng.int(2) ? 2 : G - BS - 2;
  const butcher: Room = { x: bx, y: by, w: BS, h: BS };
  // D1 L1: a few big chambers plus side rooms (sizes in cells; x2 in tiles)
  for (let i = 0; i < 600 && rooms.length < 12; i++) {
    const big = rooms.length < 2;
    const w = big ? 6 + rng.int(3) : 2 + rng.int(5), h = big ? 6 + rng.int(3) : 2 + rng.int(5);
    const r: Room = { x: 1 + rng.int(G - w - 2), y: 1 + rng.int(G - h - 2), w, h };
    if (overlaps(r, butcher, 2) || rooms.some((o) => overlaps(r, o, 2))) continue;
    rooms.push(r);
  }
  if (rooms.length < 7) return null;
  const carve = (r: Room) => { for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) cset(x, y, T.FLOOR); };
  rooms.forEach(carve); carve(butcher);
  // Connect rooms: minimum spanning tree on centres plus a couple of loops (L-shaped 1-cell = 2-tile corridors).
  const all = [...rooms];
  const conn: [number, number][] = [];
  const inTree = new Set([0]);
  while (inTree.size < all.length) {
    let best: [number, number] | null = null, bd = Infinity;
    for (const a of inTree) for (let b = 0; b < all.length; b++) if (!inTree.has(b)) {
      const ca = centre(all[a]), cb = centre(all[b]); const d = Math.abs(ca.x - cb.x) + Math.abs(ca.y - cb.y);
      if (d < bd) { bd = d; best = [a, b]; }
    }
    conn.push(best!); inTree.add(best![1]);
  }
  for (let i = 0; i < 2; i++) conn.push([rng.int(all.length), rng.int(all.length)]);
  const corridor = new Set<number>();
  const dig = (x: number, y: number) => { if (x > 0 && y > 0 && x < G - 1 && y < G - 1 && cat(x, y) === T.WALL) { cset(x, y, T.FLOOR); corridor.add(y * G + x); } };
  const inBR = (x: number, y: number) => x >= butcher.x - 1 && x <= butcher.x + butcher.w && y >= butcher.y - 1 && y <= butcher.y + butcher.h;
  for (const [a, b] of conn) {
    if (a === b) continue;
    const ca = centre(all[a]), cb = centre(all[b]);
    const horizFirst = rng.int(2) === 0;
    let x = ca.x, y = ca.y;
    const stepX = () => { while (x !== cb.x) { dig(x, y); x += Math.sign(cb.x - x); } };
    const stepY = () => { while (y !== cb.y) { dig(x, y); y += Math.sign(cb.y - y); } };
    if (horizFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
    dig(x, y);
  }
  // Butcher room: one corridor from its door to the nearest room.
  const bc = centre(butcher);
  const near = rooms.reduce((p, r) => (Math.abs(centre(r).x - bc.x) + Math.abs(centre(r).y - bc.y) < Math.abs(centre(p).x - bc.x) + Math.abs(centre(p).y - bc.y) ? r : p));
  const nc = centre(near);
  const horizDoor = Math.abs(nc.x - bc.x) > Math.abs(nc.y - bc.y);
  const bdoor: CellDoor = horizDoor
    ? { x: nc.x > bc.x ? butcher.x + butcher.w : butcher.x - 1, y: bc.y, dx: nc.x > bc.x ? -1 : 1, dy: 0 }
    : { x: bc.x, y: nc.y > bc.y ? butcher.y + butcher.h : butcher.y - 1, dx: 0, dy: nc.y > bc.y ? -1 : 1 };
  {
    let x = bdoor.x + (horizDoor ? Math.sign(nc.x - bc.x) : 0), y = bdoor.y + (horizDoor ? 0 : Math.sign(nc.y - bc.y));
    const one = (xx: number, yy: number) => { if (cat(xx, yy) === T.WALL && !inBR(xx, yy)) cset(xx, yy, T.FLOOR); };
    if (horizDoor) { while (x !== nc.x) { one(x, y); x += Math.sign(nc.x - x); } while (y !== nc.y) { one(x, y); y += Math.sign(nc.y - y); } }
    else { while (y !== nc.y) { one(x, y); y += Math.sign(nc.y - y); } while (x !== nc.x) { one(x, y); x += Math.sign(nc.x - x); } }
  }
  // Re-seal the butcher room walls (corridors may have clipped them); its door cell is opened below.
  for (let y = butcher.y - 1; y <= butcher.y + butcher.h; y++) for (let x = butcher.x - 1; x <= butcher.x + butcher.w; x++) {
    const edge = x === butcher.x - 1 || y === butcher.y - 1 || x === butcher.x + butcher.w || y === butcher.y + butcher.h;
    cset(x, y, edge ? T.WALL : T.FLOOR);
  }
  cset(bdoor.x, bdoor.y, T.FLOOR);
  // Doors where a corridor meets a room edge (D1 L1 doors/arches): sometimes, on a corridor cell next to the room.
  const doors: CellDoor[] = [bdoor];
  for (const r of rooms) {
    const sides: CellDoor[] = [];
    for (let x = r.x; x < r.x + r.w; x++) { sides.push({ x, y: r.y - 1, dx: 0, dy: 1 }, { x, y: r.y + r.h, dx: 0, dy: -1 }); }
    for (let y = r.y; y < r.y + r.h; y++) { sides.push({ x: r.x - 1, y, dx: 1, dy: 0 }, { x: r.x + r.w, y, dx: -1, dy: 0 }); }
    for (const s of sides) {
      if (!corridor.has(s.y * G + s.x) || rng.int(3) !== 0 || doors.some((d) => d.x === s.x && d.y === s.y)) continue;
      // a door needs walls on both sides along the room edge, and room floor on its inner side
      const along = s.dy !== 0;
      const a = along ? cat(s.x - 1, s.y) : cat(s.x, s.y - 1), b = along ? cat(s.x + 1, s.y) : cat(s.x, s.y + 1);
      if (a === T.WALL && b === T.WALL && cat(s.x + s.dx, s.y + s.dy) === T.FLOOR && cat(s.x - s.dx, s.y - s.dy) === T.FLOOR) doors.push(s);
    }
  }
  // ---- expand cells to 2x2 tiles ----
  const m: LevelMap = { w: L1_W, h: L1_H, tiles: new Uint8Array(L1_W * L1_H), up: null, down: null, start: { x: 0, y: 0 }, rooms: [], butcherRoom: null, objects: [], monsterSpots: [] };
  for (let y = 0; y < L1_H; y++) for (let x = 0; x < L1_W; x++) m.tiles[y * L1_W + x] = cat(x >> 1, y >> 1);
  // a door cell keeps the corridor's 2 tiles open on its outer half and narrows to one door tile + one wall tile on the half
  // touching the room, so the door stands in its wall line like D1's (walls on both sides)
  for (const d of doors) {
    const X = d.x * SUB, Y = d.y * SUB;
    if (d.dy !== 0) { const ty = d.dy > 0 ? Y + 1 : Y; setT(m, X, ty, T.DOOR); setT(m, X + 1, ty, T.WALL); }
    else { const tx = d.dx > 0 ? X + 1 : X; setT(m, tx, Y, T.DOOR); setT(m, tx, Y + 1, T.WALL); }
  }
  const trooms = rooms.map(scaleRoom), tb = scaleRoom(butcher);
  // Pillars in big rooms (D1 cathedral columns): a single tile per pillar cell.
  for (const r of trooms) if (r.w >= 12 && r.h >= 12) for (let y = r.y + 3; y < r.y + r.h - 3; y += 4) for (const x of [r.x + 3, r.x + r.w - 4]) setT(m, x, y, T.PILLAR);
  // Stairs: up on room 0's top edge (arrival from town), down in the farthest room (locked: only L1 in scope).
  const start = trooms[0];
  const sc = centre(start);
  m.up = { x: sc.x, y: start.y }; setT(m, m.up.x, m.up.y, T.UP);
  m.start = { x: sc.x, y: start.y + 2 };
  const dist = bfs(m, m.start);
  let far = trooms[1], fd = -1;
  for (const r of trooms.slice(1)) { const d = dist[centre(r).y * L1_W + centre(r).x]; if (d > fd) { fd = d; far = r; } }
  if (fd < 0) return null;
  m.down = centre(far); setT(m, m.down.x, m.down.y, T.DOWN);
  // Connectivity check: every floor tile reachable (doors count as passable).
  const d2 = bfs(m, m.start);
  for (let i = 0; i < m.tiles.length; i++) if ((m.tiles[i] === T.FLOOR || m.tiles[i] === T.DOOR) && d2[i] < 0) return null;
  m.rooms = trooms; m.butcherRoom = tb;
  placeObjects(m, rng, start, tb);
  placeMonsters(m, rng, start, tb);
  return m;
}

/** BFS distance over passable tiles (closed doors passable). */
export function bfs(m: LevelMap, from: { x: number; y: number }): Int32Array {
  const d = new Int32Array(m.w * m.h).fill(-1);
  const q = [from.y * m.w + from.x]; d[q[0]] = 0;
  const pass = (t: number) => t === T.FLOOR || t === T.DOOR || t === T.DOOR_OPEN || t === T.UP || t === T.DOWN;
  for (let i = 0; i < q.length; i++) {
    const c = q[i], x = c % m.w, y = (c - x) / m.w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = (y + dy) * m.w + x + dx;
      if (d[n] < 0 && pass(m.tiles[n])) { d[n] = d[c] + 1; q.push(n); }
    }
  }
  return d;
}

function freeSpot(m: LevelMap, rng: Rng, avoid: (x: number, y: number) => boolean, clear = 1): { x: number; y: number } | null {
  for (let i = 0; i < 300; i++) {
    const x = 2 + rng.int(m.w - 4), y = 2 + rng.int(m.h - 4);
    let ok = !avoid(x, y);
    for (let dy = -clear; dy <= clear && ok; dy++) for (let dx = -clear; dx <= clear && ok; dx++) if (at(m, x + dx, y + dy) !== T.FLOOR) ok = false;
    if (ok && !m.objects.some((o) => Math.abs(o.x - x) <= 1 && Math.abs(o.y - y) <= 1)) return { x, y };
  }
  return null;
}
const inRoom = (r: Room, x: number, y: number, pad = 0) => x >= r.x - pad && y >= r.y - pad && x < r.x + r.w + pad && y < r.y + r.h + pad;

function placeObjects(m: LevelMap, rng: Rng, start: Room, butcher: Room) {
  let id = 1;
  const avoid = (x: number, y: number) => inRoom(butcher, x, y, 1) || inRoom(start, x, y, 0);
  const add = (kind: Obj['kind'], p: { x: number; y: number } | null, v1 = 0, v2 = 0, shrine?: string) => { if (p) m.objects.push({ id: id++, kind, x: p.x, y: p.y, used: false, var1: v1, var2: v2, shrine, seed: rng.int(1 << 30) }); };
  // Order 9: the map is D1's 80x80 tiles now, so InitObjects' counts apply as-is: sarc 10-15, chest1 5-10, chest2 3-6, chest3 1-5, barrel groups 3-7.
  const n = (a: number, b: number) => a + rng.int(b - a + 1);
  for (let i = n(10, 15); i > 0; i--) add('sarc', freeSpot(m, rng, avoid, 1), rng.int(10));
  for (let i = n(5, 10); i > 0; i--) add('chest1', freeSpot(m, rng, avoid), rng.int(2), rng.int(8));
  for (let i = n(3, 6); i > 0; i--) add('chest2', freeSpot(m, rng, avoid), rng.int(3), rng.int(8));
  for (let i = n(1, 5); i > 0; i--) add('chest3', freeSpot(m, rng, avoid), rng.int(4), rng.int(8));
  for (let g = n(3, 7); g > 0; g--) {
    let p = freeSpot(m, rng, avoid, 0);
    if (!p) continue;
    add(rng.int(4) ? 'barrel' : 'barrel_ex', p, 0, rng.int(10));
    let c = 1, pp = 0;
    while (rng.int(pp) === 0 && p) {
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
      let found: { x: number; y: number } | null = null;
      for (let t = 0; t < 3 && !found; t++) { const d = dirs[rng.int(8)]; const q: { x: number; y: number } = { x: p.x + d[0], y: p.y + d[1] }; if (at(m, q.x, q.y) === T.FLOOR && !m.objects.some((o) => o.x === q.x && o.y === q.y) && !avoid(q.x, q.y)) found = q; }
      if (!found) break;
      add(rng.int(5) ? 'barrel' : 'barrel_ex', found, 0, rng.int(10)); p = found; c++; pp = c >> 1;
    }
  }
  // Shrines: D1 places them via theme rooms; 1-2 here [TEMP].
  for (let i = n(1, 2); i > 0; i--) add('shrine', freeSpot(m, rng, avoid, 1), 0, 0, SHRINES[rng.int(SHRINES.length)]);
  // Butcher's chamber decor: impaled bodies along the walls (AddTortures).
  for (const [dx, dy] of [[1, 1], [8, 1], [1, 8], [8, 8], [4, 1], [1, 4]]) add('body', { x: butcher.x + dx, y: butcher.y + dy });
}

function placeMonsters(m: LevelMap, rng: Rng, start: Room, butcher: Room) {
  let floor = 0;
  for (const t of m.tiles) if (t === T.FLOOR) floor++;
  // D1: about one monster per 30 floor tiles [TEMP]; none in the arrival room; Fallen Ones come in packs.
  let n = Math.floor(floor / 30);
  const taken = new Set<number>();
  const ok = (x: number, y: number) => at(m, x, y) === T.FLOOR && !inRoom(start, x, y, 2) && !inRoom(butcher, x, y, 1) && !taken.has(y * m.w + x) && !m.objects.some((o) => o.x === x && o.y === y);
  while (n > 0) {
    const id = L1_POOL[rng.int(L1_POOL.length)];
    let p: { x: number; y: number } | null = null;
    for (let i = 0; i < 200 && !p; i++) { const x = 1 + rng.int(m.w - 2), y = 1 + rng.int(m.h - 2); if (ok(x, y)) p = { x, y }; }
    if (!p) break;
    const pack = id.startsWith('fallen') ? 2 + rng.int(3) : 1;
    for (let k = 0; k < pack && n > 0; k++) {
      const q = k === 0 ? p : { x: p.x + rng.int(3) - 1, y: p.y + rng.int(3) - 1 };
      if (!ok(q.x, q.y)) continue;
      taken.add(q.y * m.w + q.x); m.monsterSpots.push({ id, x: q.x, y: q.y }); n--;
    }
  }
  m.monsterSpots.push({ id: 'butcher', x: butcher.x + (butcher.w >> 1), y: butcher.y + (butcher.h >> 1) });
}
