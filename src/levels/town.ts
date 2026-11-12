// Tristram (Order 7): the Order 2c CC0 buildings and set dressing at the D1 Tristram positions of the art's town/layout.json.
// layout.json is in D1 compass terms (+Y north to the cathedral and graveyard, +X east across the stream to Adria). The engine's
// screen-up is -x-y, so north maps to -x (up-left) and east to -y (up-right): engine (x, y) = (47 - Y, 47 - X), a pure rotation.
// With it the cathedral's door (its +x gable face) opens toward the square, as in D1.
// Collision uses each piece's ground footprint (footprint_m read as engine tiles; see BUILDING_FP for why), trees block their
// trunk tile, fence segments block their tile, the bridge deck is walkable over the stream.
import { T, setT, type LevelMap, type Obj } from './types';

export interface NpcDef { id: string; name: string; x: number; y: number; color: string }
export const TOWN_W = 48, TOWN_H = 48;
export const toEngine = (X: number, Y: number) => ({ x: 47 - Y, y: 47 - X });

/**
 * Ground footprints in engine tiles [along x, along y]. buildings.json gives footprint_tiles = footprint_m / 0.75, but the
 * sprites' measured ground outlines (bottom-contour corners vs the feet anchor) match footprint_m read directly as tiles, and
 * footprint_tiles would make every house wider than its own sprite. Axis: footprint_m[0] is the art's X (engine y), [1] is Y (engine x).
 */
export const BUILDING_FP: Record<string, [number, number]> = {
  smithy: [3.283, 4.63], pepin_house: [3.933, 2.553], tavern: [5.088, 4.633], adria_hut: [3.1, 3.1], cathedral: [5.284, 4.543],
  well: [1.706, 1.133], fence: [0.08, 0.76], bridge: [3.0, 1.5], tree_a: [2.4, 2.283], tree_b: [2.1, 1.997],
};
export type Solid = 'footprint' | 'trunk' | 'none';
export interface Building { id: string; art: string; x: number; y: number; ex: number; ey: number; flip: boolean; solid: Solid }
/** layout.json placements (tile_xy in layout space), in file order; fence repeated 12x along +X with a 3-tile gate at the entrance. */
export const LAYOUT: { id: string; X: number; Y: number }[] = [
  { id: 'well', X: 20, Y: 20 }, { id: 'smithy', X: 10.5, Y: 18 }, { id: 'tavern', X: 28, Y: 14 }, { id: 'pepin_house', X: 22, Y: 9 },
  { id: 'cathedral', X: 20, Y: 34 }, { id: 'adria_hut', X: 42, Y: 22 }, { id: 'bridge', X: 36, Y: 22 },
  { id: 'tree_a', X: 16, Y: 38 }, { id: 'tree_b', X: 25, Y: 38 }, { id: 'tree_a', X: 38, Y: 26 }, { id: 'tree_b', X: 38, Y: 18 },
  ...Array.from({ length: 12 }, (_, i) => ({ id: 'fence', X: 14 + i, Y: 30 })),
];
export const FENCE_GATE = [26, 27, 28]; // engine y rows left open in front of the cathedral door
export const BUILDINGS: Building[] = LAYOUT.map(({ id, X, Y }) => {
  const e = toEngine(X, Y);
  // The bridge sprite spans the art's Y; the stream here runs N-S, so it is mirrored (swaps the iso axes, like a 90 degree yaw).
  const flip = id === 'bridge';
  const [fx, fy] = BUILDING_FP[id];
  const [ex, ey] = flip ? [fy, fx] : [fx, fy];
  return { id, art: `${id}_full`, x: e.x, y: e.y, ex, ey, flip, solid: (id.startsWith('tree') ? 'trunk' : id === 'bridge' ? 'none' : 'footprint') as Solid };
}).filter((b) => !(b.id === 'fence' && FENCE_GATE.includes(b.y)));

/** Tiles a piece blocks: every tile whose centre lies inside its ground rectangle (trees: the trunk tile; fences: their tile). */
export function footprintTiles(b: Building): { x: number; y: number }[] {
  if (b.solid === 'none') return [];
  if (b.solid === 'trunk' || b.id === 'fence') return [{ x: Math.round(b.x), y: Math.round(b.y) }];
  const out: { x: number; y: number }[] = [];
  for (let y = Math.ceil(b.y - b.ey / 2); y <= Math.floor(b.y + b.ey / 2); y++) for (let x = Math.ceil(b.x - b.ex / 2); x <= Math.floor(b.x + b.ex / 2); x++) out.push({ x, y });
  return out;
}

// NPCs stand at their buildings' fronts (D1 towners.cpp relations: Griswold at the forge, Pepin by his door, Ogden outside the
// Rising Sun with Gillian, Cain by the well, Farnham on the square, Adria by her hut across the bridge, Wirt west past the smithy,
// the wounded townsman near the cathedral entrance).
export const NPCS: NpcDef[] = [
  { id: 'griswold', name: 'Griswold the Blacksmith', x: 31, y: 37, color: '#a0603a' },
  { id: 'pepin', name: 'Pepin the Healer', x: 35, y: 25, color: '#e0e0c0' },
  { id: 'adria', name: 'Adria the Witch', x: 27, y: 8, color: '#7a3aa0' },
  { id: 'cain', name: 'Deckard Cain', x: 25, y: 26, color: '#8080c0' },
  { id: 'ogden', name: 'Ogden the Tavern Owner', x: 33, y: 23, color: '#a08040' },
  { id: 'gillian', name: 'Gillian the Barmaid', x: 30, y: 23, color: '#c07090' },
  { id: 'farnham', name: 'Farnham the Drunk', x: 29, y: 31, color: '#708050' },
  { id: 'wirt', name: 'Wirt the Peg-legged Boy', x: 30, y: 43, color: '#b0a060' },
  { id: 'wounded', name: 'Wounded Townsman', x: 19, y: 25, color: '#a03030' },
];
export const CATHEDRAL_DOOR = { x: 16, y: 27 };        // down stairs at the cathedral's arched door
export const TOWN_START = { x: 27, y: 30 };             // new game spawn on the square
export const TOWN_FROM_CATHEDRAL = { x: 18, y: 27 };    // arriving back up the cathedral stairs (through the fence gate)
export const TOWN_PORTAL_SPOT = { x: 24, y: 30 };       // where a Town Portal opens in town [TEMP]
export const STREAM_Y = [10, 11];

export function makeTown(): LevelMap {
  const m: LevelMap = { w: TOWN_W, h: TOWN_H, tiles: new Uint8Array(TOWN_W * TOWN_H).fill(T.GRASS), up: null, down: { ...CATHEDRAL_DOOR }, start: TOWN_START, rooms: [], butcherRoom: null, objects: [], monsterSpots: [] };
  const rect = (x0: number, y0: number, x1: number, y1: number, t: number) => { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) setT(m, x, y, t); };
  // border woods
  rect(0, 0, TOWN_W - 1, 1, T.TREE); rect(0, TOWN_H - 2, TOWN_W - 1, TOWN_H - 1, T.TREE); rect(0, 0, 1, TOWN_H - 1, T.TREE); rect(TOWN_W - 2, 0, TOWN_W - 1, TOWN_H - 1, T.TREE);
  // the stream between the square and Adria's side (runs N-S in D1 terms = along engine x)
  rect(2, STREAM_Y[0], TOWN_W - 3, STREAM_Y[1], T.WATER);
  // paths: square, to the cathedral door, to the bridge and Adria, to the smithy and Wirt, to Pepin, to the tavern
  rect(22, 23, 31, 32, T.PATH); rect(17, 27, 22, 28, T.PATH); rect(25, 12, 26, 22, T.PATH); rect(24, 7, 27, 9, T.PATH);
  rect(29, 33, 32, 40, T.PATH); rect(30, 41, 31, 44, T.PATH); rect(32, 24, 35, 26, T.PATH); rect(30, 22, 34, 23, T.PATH);
  for (const b of BUILDINGS) if (b.id === 'bridge') { for (let y = Math.ceil(b.y - b.ey / 2); y <= Math.floor(b.y + b.ey / 2); y++) setT(m, Math.round(b.x), y, T.BRIDGE); }
  for (const b of BUILDINGS) for (const q of footprintTiles(b)) setT(m, q.x, q.y, T.HOUSE);
  setT(m, CATHEDRAL_DOOR.x, CATHEDRAL_DOOR.y, T.DOWN);
  let id = 1;
  const obj = (kind: Obj['kind'], x: number, y: number): Obj => ({ id: id++, kind, x, y, used: false, var1: 0, var2: 0, seed: 0 });
  // graveyard behind (north of) the cathedral
  for (const [x, y] of [[5, 23], [5, 26], [5, 29], [3, 24], [3, 28], [7, 31], [7, 22]]) m.objects.push(obj('cross', x, y));
  return m;
}
