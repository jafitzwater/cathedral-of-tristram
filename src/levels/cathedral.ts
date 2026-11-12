// Cathedral level 1 generator. D1-style (drlg_l1.cpp inspired, not a port): rectangular rooms chained by 2-wide corridors,
// doors where corridors enter rooms, pillar rows in big rooms, stairs up in the first room, stairs down in the farthest room,
// and the Butcher's 9x9 chamber with a single door (D1: Butcher set piece on dlvl 2 - placed on L1 here, logged deviation).
// Map is 56x56 tiles vs D1's 80x80 playable area (mobile budget; object counts scaled by area).
import { Rng } from '../rng';
import { L1_POOL } from '../data/monsters';
import { T, at, setT, type LevelMap, type Obj, type Room } from './types';

export const L1_W = 56, L1_H = 56;
const SHRINES = ['Mysterious', 'Hidden', 'Gloomy', 'Weird', 'Magical', 'Stone', 'Religious', 'Enchanted', 'Thaumaturgic', 'Fascinating',
  'Cryptic', 'Eldritch', 'Eerie', 'Divine', 'Holy', 'Sacred', 'Spiritual', 'Abandoned', 'Creepy', 'Quiet', 'Secluded', 'Ornate', 'Glimmering'];
// (Spooky and Tainted are multiplayer-only, so excluded in SP: objects.cpp shrineavail.)

const overlaps = (a: Room, b: Room, pad: number) => a.x - pad < b.x + b.w && b.x - pad < a.x + a.w && a.y - pad < b.y + b.h && b.y - pad < a.y + a.h;
const centre = (r: Room) => ({ x: r.x + (r.w >> 1), y: r.y + (r.h >> 1) });

export function generateL1(seed: number): LevelMap {
  for (let attempt = 0; attempt < 20; attempt++) {
    const m = tryGen(new Rng(seed + attempt * 7919));
    if (m) return m;
  }
  throw new Error('L1 generation failed');
}

function tryGen(rng: Rng): LevelMap | null {
  const m: LevelMap = { w: L1_W, h: L1_H, tiles: new Uint8Array(L1_W * L1_H).fill(T.WALL), up: null, down: null, start: { x: 0, y: 0 }, rooms: [], butcherRoom: null, objects: [], monsterSpots: [] };
  const rooms: Room[] = [];
  // Butcher's chamber first, in a corner region.
  const bx = rng.int(2) ? 3 : L1_W - 13, by = rng.int(2) ? 3 : L1_H - 13;
  const butcher: Room = { x: bx, y: by, w: 9, h: 9 };
  for (let i = 0; i < 400 && rooms.length < 14; i++) {
    const w = 4 + rng.int(7), h = 4 + rng.int(7);
    const r: Room = { x: 2 + rng.int(L1_W - w - 4), y: 2 + rng.int(L1_H - h - 4), w, h };
    if (overlaps(r, butcher, 3) || rooms.some((o) => overlaps(r, o, 3))) continue;
    rooms.push(r);
  }
  if (rooms.length < 8) return null;
  const carve = (r: Room) => { for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) setT(m, x, y, T.FLOOR); };
  rooms.forEach(carve); carve(butcher);
  // Connect rooms: minimum spanning tree on centres plus a couple of loops (L-shaped 2-wide corridors).
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
  const corridorCells = new Set<number>();
  const dig = (x: number, y: number) => { for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const xx = x + dx, yy = y + dy; if (xx > 0 && yy > 0 && xx < L1_W - 1 && yy < L1_H - 1 && at(m, xx, yy) === T.WALL) { setT(m, xx, yy, T.FLOOR); corridorCells.add(yy * L1_W + xx); } } };
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
  const door = horizDoor ? { x: nc.x > bc.x ? butcher.x + butcher.w : butcher.x - 1, y: bc.y } : { x: bc.x, y: nc.y > bc.y ? butcher.y + butcher.h : butcher.y - 1 };
  {
    let x = door.x + (horizDoor ? Math.sign(nc.x - bc.x) : 0), y = door.y + (horizDoor ? 0 : Math.sign(nc.y - bc.y));
    const one = (xx: number, yy: number) => { if (at(m, xx, yy) === T.WALL && !(xx >= butcher.x - 1 && xx <= butcher.x + butcher.w && yy >= butcher.y - 1 && yy <= butcher.y + butcher.h)) setT(m, xx, yy, T.FLOOR); };
    if (horizDoor) { while (x !== nc.x) { one(x, y); x += Math.sign(nc.x - x); } while (y !== nc.y) { one(x, y); y += Math.sign(nc.y - y); } }
    else { while (y !== nc.y) { one(x, y); y += Math.sign(nc.y - y); } while (x !== nc.x) { one(x, y); x += Math.sign(nc.x - x); } }
  }
  // Re-seal the butcher room walls (corridors may have clipped them) then add its door.
  for (let y = butcher.y - 1; y <= butcher.y + butcher.h; y++) for (let x = butcher.x - 1; x <= butcher.x + butcher.w; x++) {
    const edge = x === butcher.x - 1 || y === butcher.y - 1 || x === butcher.x + butcher.w || y === butcher.y + butcher.h;
    setT(m, x, y, edge ? T.WALL : T.FLOOR);
  }
  setT(m, door.x, door.y, T.DOOR);
  // Doors where a 2-wide corridor meets a room edge (D1 L1 doors/arches): put a door on a corridor cell adjacent to a room, sometimes.
  for (const r of rooms) {
    const sides: { x: number; y: number }[] = [];
    for (let x = r.x; x < r.x + r.w; x++) { sides.push({ x, y: r.y - 1 }, { x, y: r.y + r.h }); }
    for (let y = r.y; y < r.y + r.h; y++) { sides.push({ x: r.x - 1, y }, { x: r.x + r.w, y }); }
    for (const s of sides) {
      if (!corridorCells.has(s.y * L1_W + s.x) || rng.int(3) !== 0) continue;
      // a door needs walls on both sides along the room edge
      const horiz = s.y === r.y - 1 || s.y === r.y + r.h;
      const a = horiz ? at(m, s.x - 1, s.y) : at(m, s.x, s.y - 1), b = horiz ? at(m, s.x + 1, s.y) : at(m, s.x, s.y + 1);
      if (a === T.WALL && b === T.WALL) setT(m, s.x, s.y, T.DOOR);
    }
  }
  // Pillars in big rooms (D1 cathedral columns).
  for (const r of rooms) if (r.w >= 8 && r.h >= 8) for (let y = r.y + 2; y < r.y + r.h - 2; y += 3) for (const x of [r.x + 2, r.x + r.w - 3]) setT(m, x, y, T.PILLAR);
  // Stairs: up in room 0 (arrival from town), down in the farthest room (locked: only L1 in scope).
  const start = rooms[0];
  const sc = centre(start);
  m.up = { x: sc.x, y: start.y }; setT(m, m.up.x, m.up.y, T.UP);
  m.start = { x: sc.x, y: start.y + 1 };
  const dist = bfs(m, m.start);
  let far = rooms[1], fd = -1;
  for (const r of rooms.slice(1)) { const d = dist[centre(r).y * L1_W + centre(r).x]; if (d > fd) { fd = d; far = r; } }
  if (fd < 0) return null;
  m.down = centre(far); setT(m, m.down.x, m.down.y, T.DOWN);
  // Connectivity check: every floor tile reachable (doors count as passable).
  const d2 = bfs(m, m.start);
  for (let i = 0; i < m.tiles.length; i++) if ((m.tiles[i] === T.FLOOR || m.tiles[i] === T.DOOR) && d2[i] < 0) return null;
  m.rooms = rooms; m.butcherRoom = butcher;
  placeObjects(m, rng, start, butcher);
  placeMonsters(m, rng, start, butcher);
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
  // Counts scaled from InitObjects by ~0.5 area: sarc 10-15 -> 5-7, chest1 5-10 -> 2-5, chest2 3-6 -> 1-3, chest3 1-5 -> 1-2, barrel groups 3-7 -> 2-4.
  const n = (a: number, b: number) => a + rng.int(b - a + 1);
  for (let i = n(5, 7); i > 0; i--) add('sarc', freeSpot(m, rng, avoid, 1), rng.int(10));
  for (let i = n(2, 5); i > 0; i--) add('chest1', freeSpot(m, rng, avoid), rng.int(2), rng.int(8));
  for (let i = n(1, 3); i > 0; i--) add('chest2', freeSpot(m, rng, avoid), rng.int(3), rng.int(8));
  for (let i = n(1, 2); i > 0; i--) add('chest3', freeSpot(m, rng, avoid), rng.int(4), rng.int(8));
  for (let g = n(2, 4); g > 0; g--) {
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
  for (const [dx, dy] of [[1, 1], [7, 1], [1, 7], [7, 7], [4, 1], [1, 4]]) add('body', { x: butcher.x + dx, y: butcher.y + dy });
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
  m.monsterSpots.push({ id: 'butcher', x: butcher.x + 4, y: butcher.y + 4 });
}
