// Order 6: Cathedral L1 wall-facing pass with the CC0 Kenney Isometric Miniature Dungeon pieces (render-only; the map, collision
// and generator are unchanged). Each WALL tile shows a stone face on every edge that borders an open tile, corner pieces where
// two faces meet, columns on outer corners, doors (open/closed) and arches in the plane of their wall line.
// Kenney facings, measured from the pieces' base lines (see test/walls.ts):
//   _n = SW edge (faces tile y+1), _e = NW edge (faces x-1), _s = NE edge (faces y-1), _w = SE edge (faces x+1).
import { T, at, type LevelMap } from './levels/types';

export interface Piece { id: string; dx?: number; dy?: number }
export interface WallTile { pieces: Piece[]; door?: 'n' | 'w'; arch?: 'n' | 'w' }
const OPEN = new Set<number>([T.FLOOR, T.DOOR, T.DOOR_OPEN, T.UP, T.DOWN, T.PILLAR]);
const hash = (x: number, y: number) => ((x * 73856093) ^ (y * 19349663)) >>> 0;

export function isOpen(m: LevelMap, x: number, y: number) {
  return x >= 0 && y >= 0 && x < m.w && y < m.h && OPEN.has(at(m, x, y));
}
const isWall = (m: LevelMap, x: number, y: number) => x < 0 || y < 0 || x >= m.w || y >= m.h || at(m, x, y) === T.WALL;

/** Door/arch plane: in line with the walls on either side (walls at x±1 -> the SW-edge plane `_n`, walls at y±1 -> SE `_w`). */
export function doorFacing(m: LevelMap, x: number, y: number): 'n' | 'w' | null {
  if (isWall(m, x - 1, y) && isWall(m, x + 1, y)) return 'n';
  if (isWall(m, x, y - 1) && isWall(m, x, y + 1)) return 'w';
  return null;
}

/** Faces, corners and outer-corner columns for one WALL tile. */
export function wallPieces(m: LevelMap, x: number, y: number): Piece[] {
  const sw = isOpen(m, x, y + 1), nw = isOpen(m, x - 1, y), ne = isOpen(m, x, y - 1), se = isOpen(m, x + 1, y);
  const p: Piece[] = [];
  const stem = hash(x, y) % 7 === 0 ? 'stoneWallAged' : 'stoneWall';
  const n = +sw + +nw + +ne + +se;
  if (n === 2 && sw && se) p.push({ id: 'stoneWallCorner_n' });
  else if (n === 2 && nw && ne) p.push({ id: 'stoneWallCorner_s' });
  else if (n === 2 && sw && nw) p.push({ id: 'stoneWallCorner_e' });
  else if (n === 2 && ne && se) p.push({ id: 'stoneWallCorner_w' });
  else {
    // back faces first (NW, NE), then the front ones (SW, SE), so the nearer face overdraws the farther one
    if (nw) p.push({ id: `${stem}_e` });
    if (ne) p.push({ id: `${stem}_s` });
    if (sw) p.push({ id: `${stem}_n` });
    if (se) p.push({ id: `${stem}_w` });
  }
  // columns where two wall runs meet at an outer corner (the open tile touches only the corner)
  const col = 'stoneWallColumn_n'; // stands on the cell's bottom tip; shifted to the other three tips
  if (!nw && !ne && isOpen(m, x - 1, y - 1)) p.unshift({ id: col, dy: -32 });
  if (!sw && !nw && isOpen(m, x - 1, y + 1)) p.push({ id: col, dx: -32, dy: -16 });
  if (!ne && !se && isOpen(m, x + 1, y - 1)) p.push({ id: col, dx: 32, dy: -16 });
  if (!sw && !se && isOpen(m, x + 1, y + 1)) p.push({ id: col, dy: 0 });
  return p;
}

/**
 * Arches: D1 L1 corridors enter rooms through arches where no door was placed. An opening cell is a floor cell on a room's
 * outer ring, in line with wall on at least one side along the room edge, at most 2 cells wide (the corridors are 2 wide).
 */
export function archCells(m: LevelMap): Map<number, 'n' | 'w'> {
  const out = new Map<number, 'n' | 'w'>();
  const rooms = [...m.rooms, ...(m.butcherRoom ? [m.butcherRoom] : [])];
  const floor = (x: number, y: number) => at(m, x, y) === T.FLOOR;
  for (const r of rooms) {
    const runs: { cells: [number, number][]; f: 'n' | 'w' }[] = [];
    const scan = (cells: [number, number][], f: 'n' | 'w') => {
      for (let i = 0; i < cells.length; i++) {
        if (!floor(...cells[i])) continue;
        let j = i; while (j + 1 < cells.length && floor(...cells[j + 1])) j++;
        const bounded = i > 0 && j < cells.length - 1 && isWall(m, ...cells[i - 1]) && isWall(m, ...cells[j + 1]);
        if (bounded && j - i + 1 <= 2) runs.push({ cells: cells.slice(i, j + 1), f });
        i = j;
      }
    };
    const top: [number, number][] = [], bot: [number, number][] = [], lef: [number, number][] = [], rig: [number, number][] = [];
    for (let x = r.x - 1; x <= r.x + r.w; x++) { top.push([x, r.y - 1]); bot.push([x, r.y + r.h]); }
    for (let y = r.y - 1; y <= r.y + r.h; y++) { lef.push([r.x - 1, y]); rig.push([r.x + r.w, y]); }
    scan(top, 'n'); scan(bot, 'n'); scan(lef, 'w'); scan(rig, 'w');
    for (const run of runs) for (const [x, y] of run.cells) out.set(y * m.w + x, run.f);
  }
  return out;
}

const cache = new WeakMap<LevelMap, { tiles: Uint8Array; data: (WallTile | null)[] }>();
/** Per-tile wall data for a level (rebuilt only if the tile array changed shape, e.g. a new level). Doors read their state live. */
export function wallData(m: LevelMap): (WallTile | null)[] {
  const c = cache.get(m);
  if (c && c.tiles === m.tiles) return c.data;
  const arches = archCells(m);
  const data: (WallTile | null)[] = new Array(m.w * m.h).fill(null);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const t = at(m, x, y), i = y * m.w + x;
    if (t === T.WALL) { const pieces = wallPieces(m, x, y); if (pieces.length) data[i] = { pieces }; }
    else if (t === T.DOOR || t === T.DOOR_OPEN) data[i] = { pieces: [], door: doorFacing(m, x, y) ?? 'n' };
    else if (arches.has(i)) data[i] = { pieces: [], arch: arches.get(i)! };
  }
  cache.set(m, { tiles: m.tiles, data });
  return data;
}

export const FADE_ALPHA = 0.3;
/**
 * D1 wall transparency: a wall piece on a tile in front of the hero (one to four diagonals nearer the viewer) and within three
 * tiles of him across the screen fades so he is never hidden. Returns the alpha for that tile's pieces.
 */
export function wallFade(wx: number, wy: number, hx: number, hy: number): number {
  const ds = wx + wy - (hx + hy), across = Math.abs((wx - wy) - (hx - hy));
  return ds > 0 && ds <= 4 && across <= 3 ? FADE_ALPHA : 1;
}
