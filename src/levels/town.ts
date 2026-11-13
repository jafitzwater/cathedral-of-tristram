// Tristram (Order 12): D1-sized town (96x96 tiles, core ~60x60) laid out from Joseph's annotated map (a look reference kept
// outside the repo). Compass = the map's: north is the diamond's top corner = engine tile (0,0), so north is -x-y (screen up),
// south +x+y, east +x-y (screen right), west -x+y (screen left). A point on the map image maps linearly onto the 96x96 grid
// (its diamond corners are the grid corners); every position below was measured that way and rounded to a tile.
// The buildings are the Order 2c CC0 pieces, scaled (houses x1.35, cathedral x1.6) to D1's footprint proportions; collision uses
// each piece's scaled ground footprint, trees and brush block their tile, the streams block except at the bridges.
import { T, setT, type LevelMap, type Obj } from './types';

export interface NpcDef { id: string; name: string; x: number; y: number; color: string; face?: { x: number; y: number } }
export const TOWN_W = 96, TOWN_H = 96;

/**
 * Ground footprints in engine tiles [along x, along y] at scale 1 (Order 7: the art's footprint_m read as tiles, axes swapped).
 * A piece's footprint is this times its scale; `flip` mirrors the sprite, which swaps the iso axes.
 */
export const BUILDING_FP: Record<string, [number, number]> = {
  smithy: [3.283, 4.63], pepin_house: [3.933, 2.553], tavern: [5.088, 4.633], adria_hut: [3.1, 3.1], cathedral: [5.284, 4.543],
  well: [1.706, 1.133], fence: [0.08, 0.76], bridge: [3.0, 1.5], tree_a: [2.4, 2.283], tree_b: [2.1, 1.997],
  // Order 14: the Order 11b set pieces (same convention: footprint_m read as tiles, axes swapped)
  gillian_house: [1.923, 1.576], farnham_house: [2.562, 2.698], north_house: [2.352, 2.002], nw_house: [2.492, 2.072], se_house: [2.772, 2.769],
  catacombs_hut: [2.142, 2.002], cave_mouth: [2.31, 3.293], hell_rift: [2.8, 3.043],
  smithy_eave: [3.61, 1.65], smithy_anvil: [0.582, 0.715], smithy_forge: [0.73, 0.9],
  stone_wall: [0.45, 1.835], headstone_a: [0.28, 0.5], headstone_b: [0.295, 0.552], headstone_cross: [0.294, 0.577],
  dead_tree_a: [1.703, 2.133], dead_tree_b: [1.449, 1.918], brush_a: [0.902, 1.057], brush_b: [0.902, 1.057],
  ditch: [1.12, 1.6], crate: [0.641, 0.641], crate_stack: [0.702, 0.742], cart: [2.04, 1.016], slain_townsman: [2.007, 1.4],
};
/** Pieces that never block (collision comes from their tiles or is not wanted): the walk-under eave, the wall run over T.WALL. */
const NON_SOLID = new Set(['bridge', 'smithy_eave', 'stone_wall', 'slain_townsman']);
export type Solid = 'footprint' | 'trunk' | 'none';
/** A placed piece. `id` is the art piece, `role` what it is in this town (several houses reuse one sprite). */
export interface Building { id: string; role: string; art: string; x: number; y: number; ex: number; ey: number; flip: boolean; solid: Solid; s: number }
export const HOUSE_SCALE = 1.35, CATHEDRAL_SCALE = 1.6;
const piece = (id: string, role: string, x: number, y: number, flip = false, s = HOUSE_SCALE): Building => {
  const [fx, fy] = BUILDING_FP[id];
  const [ex, ey] = flip ? [fy * s, fx * s] : [fx * s, fy * s];
  return { id, role, art: `${id}_full`, x, y, ex, ey, flip, s, solid: id.startsWith('tree') || id.startsWith('dead_tree') ? 'trunk' : NON_SOLID.has(id) ? 'none' : 'footprint' };
};

/** The 14 points of Joseph's map legend, in engine tiles (where the NPC stands / the entrance is). */
export const POINTS: { n: number; id: string; label: string; x: number; y: number }[] = [
  { n: 1, id: 'wirt', label: 'Wirt', x: 13, y: 52 },
  { n: 2, id: 'caves', label: 'Entry: Caves', x: 15, y: 68 },
  { n: 3, id: 'hell', label: 'Entry: Hell', x: 41, y: 80 },
  { n: 4, id: 'pepin', label: 'Pepin', x: 53, y: 77 },
  { n: 5, id: 'cain', label: 'Cain', x: 58, y: 70 },
  { n: 6, id: 'griswold', label: 'Griswold', x: 68, y: 69 }, // Order 13: under the smithy eave, facing the square
  { n: 7, id: 'gillian', label: 'Gillian', x: 40, y: 65 },
  { n: 8, id: 'ogden', label: 'Ogden', x: 53, y: 62 },
  { n: 9, id: 'farnham', label: 'Farnham', x: 72, y: 86 }, // Order 13: by his house, moved off the square
  { n: 10, id: 'portal', label: 'Town Portal', x: 58, y: 42 },
  { n: 11, id: 'adria', label: 'Adria', x: 78, y: 22 },
  { n: 12, id: 'catacombs', label: 'Entry: Catacombs', x: 46, y: 22 },
  { n: 13, id: 'wounded', label: 'Slain townsman', x: 24, y: 34 },
  { n: 14, id: 'church', label: 'Entry: Church', x: 22, y: 29 },
];
const P = (id: string) => POINTS.find((p) => p.id === id)!;

// streams (centre lines, measured off the map), north to south
export const WEST_STREAM: [number, number][] = [[0.5, 6.3], [6.4, 16.2], [8.5, 24.5], [11.1, 37.7], [17.1, 49], [21.5, 58.7], [26.6, 70.9], [29.8, 80.2], [32.4, 88.1], [33.2, 95.3]];
export const EAST_STREAM: [number, number][] = [[62.6, 0.3], [67.7, 10.8], [68.3, 17.2], [70.8, 26.8], [69, 33.8], [72.5, 46.1], [78.2, 58], [80.4, 66.3], [83, 74.2], [83.3, 77.2], [95.2, 93.1]];
export const EAST_BRANCH: [number, number][] = [[83.4, 1.2], [85, 12.6], [85, 19.8], [84.9, 30.3], [86.2, 39.5], [84, 48.7], [82.2, 55.8], [79.1, 60.6]];
/** x of a north-south polyline at row y. */
export function streamX(poly: [number, number][], y: number): number {
  for (let i = 1; i < poly.length; i++) if (y <= poly[i][1]) { const [x0, y0] = poly[i - 1], [x1, y1] = poly[i]; return x0 + (x1 - x0) * Math.max(0, Math.min(1, (y - y0) / (y1 - y0))); }
  return poly[poly.length - 1][0];
}

export const BUILDINGS: Building[] = [
  piece('cathedral', 'cathedral', 22, 24, true, CATHEDRAL_SCALE), // flipped: the door (the sprite's gable face) opens south-west
  piece('tavern', 'tavern', 48, 57),                       // 8 Ogden's Rising Sun, north of the square
  // Order 13: the smithy moved south-east to the square's SE edge (where the map draws it). Mirrored, its anvil is on the +x side
  // face (the side, away from the door) and its +y face, the visible one toward the square, carries the eave slot below
  piece('smithy', 'smithy', 69, 65.5, true),
  // Order 14: the 11b eave is authored along the art's X (engine x) for a +y face, so unmirrored it sits on the mirrored smithy's
  // +y face, the one toward the square: 4.87 x 2.23 tiles at x1.35 (the 2.2 x 4.81 of the order), Griswold under it
  piece('smithy_eave', 'smithy_eave', 69, 68.8),
  piece('smithy_anvil', 'smithy_anvil', 66, 68, false, 1), // at the building's side corner, not in front of the door
  piece('smithy_forge', 'smithy_forge', 71, 68, false, 1), // under the eave's far end, beside Griswold
  piece('pepin_house', 'pepin', 48.6, 75.2),               // 4 west edge of the square
  piece('gillian_house', 'gillian_house', 36.6, 63.1),     // 7 north-west of the tavern (Order 14: own 11b house, door on the +x face)
  piece('farnham_house', 'farnham_house', 68.5, 87),       // 9 the southern house (Order 13: moved S/SE, then nudged SW, off the square)
  piece('north_house', 'north_house', 47.5, 43.3),         // the house north of the tavern
  piece('nw_house', 'nw_house', 25.6, 49.4),
  piece('se_house', 'ne_house', 62.4, 57.5),               // the house NE of the square (11b se_house art)
  piece('adria_hut', 'adria', 75, 18.4),                   // 11 across the east stream
  piece('catacombs_hut', 'catacombs', 46.4, 19.7),         // 12 the catacombs hut (closed)
  piece('cave_mouth', 'caves', 15, 65.6),                  // 2 its opening faces the sealed tile in front
  piece('hell_rift', 'hell', 41, 77.4),                    // 3
  piece('slain_townsman', 'slain', 24, 34, false, 1),      // 13 (the Wounded Townsman NPC lies on this tile)
  // crates and a cart by the square and the tavern
  piece('crate', 'crate', 44, 61, false, 1), piece('crate_stack', 'crate', 45, 61, false, 1), piece('crate', 'crate', 52, 71, false, 1),
  piece('cart', 'cart', 66, 74, false, 1), piece('crate_stack', 'crate', 52, 52, false, 1),
  // ditches along the roads and the south-west edge
  piece('ditch', 'ditch', 61, 82, false, 1), piece('ditch', 'ditch', 61, 88, false, 1), piece('ditch', 'ditch', 78, 74, true, 1),
  piece('ditch', 'ditch', 88, 74, true, 1), piece('ditch', 'ditch', 36, 84, false, 1),
  piece('well', 'well', 60, 68),                           // Order 13: in the middle of the open square, by Cain
  piece('bridge', 'bridge_west', 18, 50),                  // to Wirt
  piece('bridge', 'bridge_east', 71, 25),                  // to Adria
  piece('bridge', 'bridge_road', 82, 70.5),                // the south-east road
  // Order 14: the map's trees are bare: the 11b dead trees replace the leafy 2c ones
  piece('dead_tree_a', 'tree', 33, 44, false, 1), piece('dead_tree_b', 'tree', 66, 48, false, 1), piece('dead_tree_a', 'tree', 40, 72, false, 1),
  piece('dead_tree_b', 'tree', 30, 10, false, 1), piece('dead_tree_a', 'tree', 74, 81, false, 1),
];
/** The fenced graveyard east of the cathedral, gate toward the church. */
export const GRAVEYARD = { x0: 30, y0: 21, x1: 40, y1: 31, gate: [25, 26] };
{
  const g = GRAVEYARD;
  for (let y = g.y0; y <= g.y1; y++) { if (!g.gate.includes(y)) BUILDINGS.push(piece('fence', 'fence', g.x0, y, false, 1)); BUILDINGS.push(piece('fence', 'fence', g.x1, y, false, 1)); }
  for (let x = g.x0 + 1; x < g.x1; x++) { BUILDINGS.push(piece('fence', 'fence', x, g.y0, true, 1)); BUILDINGS.push(piece('fence', 'fence', x, g.y1, true, 1)); }
}

/** Tiles a piece blocks: every tile whose centre lies inside its ground rectangle (trees: the trunk tile; fences: their tile). */
export function footprintTiles(b: Building): { x: number; y: number }[] {
  if (b.solid === 'none') return [];
  if (b.solid === 'trunk' || b.id === 'fence') return [{ x: Math.round(b.x), y: Math.round(b.y) }];
  const out: { x: number; y: number }[] = [];
  for (let y = Math.ceil(b.y - b.ey / 2); y <= Math.floor(b.y + b.ey / 2); y++) for (let x = Math.ceil(b.x - b.ex / 2); x <= Math.floor(b.x + b.ex / 2); x++) out.push({ x, y });
  return out;
}

export const NPCS: NpcDef[] = [
  { id: 'griswold', name: 'Griswold the Blacksmith', x: P('griswold').x, y: P('griswold').y, color: '#a0603a', face: { x: -1, y: 1 } }, // toward the square
  { id: 'pepin', name: 'Pepin the Healer', x: P('pepin').x, y: P('pepin').y, color: '#e0e0c0' },
  { id: 'adria', name: 'Adria the Witch', x: P('adria').x, y: P('adria').y, color: '#7a3aa0' },
  { id: 'cain', name: 'Deckard Cain', x: P('cain').x, y: P('cain').y, color: '#8080c0' },
  { id: 'ogden', name: 'Ogden the Tavern Owner', x: P('ogden').x, y: P('ogden').y, color: '#a08040' },
  { id: 'gillian', name: 'Gillian the Barmaid', x: P('gillian').x, y: P('gillian').y, color: '#c07090' },
  { id: 'farnham', name: 'Farnham the Drunk', x: P('farnham').x, y: P('farnham').y, color: '#708050' },
  { id: 'wirt', name: 'Wirt the Peg-legged Boy', x: P('wirt').x, y: P('wirt').y, color: '#b0a060' },
  { id: 'wounded', name: 'Wounded Townsman', x: P('wounded').x, y: P('wounded').y, color: '#a03030' },
];
export const CATHEDRAL_DOOR = { x: P('church').x, y: P('church').y }; // down stairs at the cathedral's arched door
export const TOWN_START = { x: 72, y: 71 };              // Order 13: new characters start just south of the smithy, on the cobbles
export const TOWN_FROM_CATHEDRAL = { x: 22, y: 31 };     // arriving back up the cathedral stairs
export const TOWN_PORTAL_SPOT = { x: P('portal').x, y: P('portal').y }; // point 10: where a dungeon-cast Town Portal opens in town
export const TAVERN_LIGHT = { x: 52, y: 61 };            // Ogden's lit entrance
/** Order 13: the open square (packed dirt) between the tavern (8), Pepin (4) and the smithy (6). */
export const SQUARE = { x0: 53, y0: 63, x1: 64, y1: 75 };
/**
 * Order 13: three D1 cows just east of the catacombs hut (12). They block their tiles now; they are drawn (and tappable, "Cow")
 * only once the Sprite Director's cow art is in the manifest: anims.cow (action `idle`, 8 facings), frames `cow:idle:<dir>:<i>`,
 * asset in group `town-cow` (loaded with the town) or any town group. Until then nothing is drawn, no stand-in.
 */
export const COWS: { x: number; y: number; dir: number; phase: number }[] = [{ x: 51, y: 19, dir: 1, phase: 0 }, { x: 53, y: 21, dir: 6, phase: 270 }, { x: 52, y: 16, dir: 3, phase: 530 }];
export const cowArt = { ready: false }; // set each frame by the renderer when the cow frames are resident
/** The closed entrances (decorative; later dungeons): obj var1 = their map number. */
export const SEALED: Record<number, string> = { 2: 'the Caves', 3: 'Hell', 12: 'the Catacombs' };

/** Dirt paths (2 wide) linking everything, and the two roads leaving south-east and south-west. */
export const PATHS: [number, number][][] = [
  [[53, 63], [56, 66]],                                  // tavern door - square
  [[54, 74], [52, 78]],                                  // square - Pepin
  [[64, 69], [67, 69]],                                  // square - Griswold under the eave
  [[62, 75], [66, 79], [71, 85]],                        // square - Farnham
  [[53, 62], [41, 63], [40, 66]],                        // tavern - Gillian
  [[53, 62], [53, 50], [42, 46], [27, 40], [25, 36], [22, 31]], // square - slain townsman - cathedral door
  [[50, 47], [49, 46]],                                  // north house
  [[53, 51], [58, 43]],                                  // core - portal spot
  [[58, 42], [66, 31], [69, 25]], [[72, 25], [77, 23]],  // portal spot - east bridge - Adria
  [[58, 42], [52, 30], [47, 23]],                        // to the catacombs hut
  [[41, 63], [39, 58], [30, 55], [21, 50]], [[16, 50], [14, 52]], // Gillian - west bridge - Wirt
  [[15, 52], [17, 60], [18, 66], [17, 69]],              // Wirt - the caves (round the east side of the cave mound)
  [[52, 78], [47, 80], [43, 80]],                        // Pepin - hell
  [[63, 71], [95, 71]],                                  // road south-east (crosses the east stream on a bridge)
  [[58, 75], [58, 95]],                                  // road south-west
  [[29, 25], [26, 26]],                                  // graveyard gate - church
];
/** Stone walls (procedural prisms until the Sprite Director's town wall lands). */
export const WALLS: [number, number][][] = [
  [[15.5, 38.6], [25, 39.6]], [[34.5, 15.9], [40, 16.7]],
  [[26.2, 12.1], [43.2, 12.4], [65.3, 10.7], [84.2, 11.8]],
];

const lcg = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
function line(pts: [number, number][], f: (x: number, y: number) => void, wide = false) {
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 4) + 1;
    for (let k = 0; k <= n; k++) {
      const x = x0 + (x1 - x0) * k / n, y = y0 + (y1 - y0) * k / n;
      if (wide) { f(Math.floor(x), Math.floor(y)); f(Math.floor(x) + 1, Math.floor(y)); f(Math.floor(x), Math.floor(y) + 1); f(Math.floor(x) + 1, Math.floor(y) + 1); }
      else f(Math.round(x), Math.round(y));
    }
  }
}
/** Brush region: dense woods in the far west (west of the west stream) and along the south-west edge. */
export function inBrush(x: number, y: number): boolean {
  if (x < streamX(WEST_STREAM, y) - 2.5 && y > 8) return true;
  if (x < 60 && y > 87 + 2 * Math.sin(x * 0.37)) return true;
  return false;
}
const CLEARINGS: [number, number, number][] = [[13, 52, 4.5], [15, 68, 3.5], [41, 80, 3]];

/** Non-blocking ground dressing (grass tufts/weeds from tiles/plants), by tile index. */
export type Dress = Map<number, string>;
export function makeTown(): LevelMap & { dress: Dress } {
  const W = TOWN_W, H = TOWN_H;
  const m: LevelMap & { dress: Dress } = { w: W, h: H, tiles: new Uint8Array(W * H).fill(T.GRASS), up: null, down: { ...CATHEDRAL_DOOR }, start: TOWN_START, rooms: [], butcherRoom: null, objects: [], monsterSpots: [], dress: new Map() };
  const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  const set = (x: number, y: number, t: number) => { if (inb(x, y)) setT(m, x, y, t); };
  const get = (x: number, y: number) => m.tiles[y * W + x];
  // the ring of woods and darkness at the map's edge, and the brush
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x < 2 || y < 2 || x > W - 3 || y > H - 3 || inBrush(x, y)) set(x, y, T.TREE);
  }
  for (const [cx, cy, r] of CLEARINGS) for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if (Math.hypot(x - cx, y - cy) <= r) set(x, y, T.GRASS);
  for (const w of WALLS) line(w, (x, y) => set(x, y, T.WALL));
  // the caves' rock face behind its mouth
  for (const s of [WEST_STREAM, EAST_STREAM, EAST_BRANCH]) line(s, (x, y) => { set(x, y, T.WATER); set(x + 1, y, T.WATER); });
  // the square (packed dirt) in the south-centre
  for (let y = SQUARE.y0; y <= SQUARE.y1; y++) for (let x = SQUARE.x0; x <= SQUARE.x1; x++) set(x, y, T.FLOOR);
  for (const p of PATHS) line(p, (x, y) => { if (inb(x, y) && get(x, y) !== T.WATER && get(x, y) !== T.FLOOR) set(x, y, T.PATH); }, true);
  for (const b of BUILDINGS) if (b.id === 'bridge') {
    for (let y = Math.ceil(b.y - b.ey / 2); y <= Math.floor(b.y + b.ey / 2); y++) for (let x = Math.ceil(b.x - b.ex / 2); x <= Math.floor(b.x + b.ex / 2); x++) set(x, y, get(x, y) === T.WATER ? T.BRIDGE : get(x, y) === T.TREE || get(x, y) === T.WALL ? T.PATH : get(x, y));
  }
  for (const b of BUILDINGS) for (const q of footprintTiles(b)) set(q.x, q.y, T.HOUSE);
  set(CATHEDRAL_DOOR.x, CATHEDRAL_DOOR.y, T.DOWN);
  let id = 1;
  const obj = (kind: Obj['kind'], x: number, y: number, var1 = 0): Obj => ({ id: id++, kind, x, y, used: false, var1, var2: 0, seed: 0 });
  // headstones in the graveyard
  const G = GRAVEYARD;
  for (let y = G.y0 + 2; y < G.y1; y += 2) for (let x = G.x0 + 2; x < G.x1; x += 2) if ((x * 5 + y * 3) % 7 !== 0) m.objects.push(obj('cross', x, y));
  for (const c of COWS) { set(c.x, c.y, T.GRASS); m.objects.push({ ...obj('cow', c.x, c.y, c.dir), var2: c.phase }); }
  // the closed entrances
  for (const n of [2, 3, 12]) { const p = POINTS.find((q) => q.n === n)!; set(p.x, p.y, T.GRASS); m.objects.push(obj('sealed', p.x, p.y, n)); }
  // scattered dead trees on open ground, clear of paths, buildings, people and water
  const rnd = lcg(1996);
  const keep = [...NPCS, ...POINTS, ...COWS, TOWN_START, TOWN_FROM_CATHEDRAL, TAVERN_LIGHT];
  const near = (x: number, y: number, r: number, f: (t: number) => boolean) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (inb(x + dx, y + dy) && f(get(x + dx, y + dy))) return true; return false; };
  for (let i = 0; i < 400; i++) {
    const x = 3 + Math.floor(rnd() * (W - 6)), y = 3 + Math.floor(rnd() * (H - 6));
    if (get(x, y) !== T.GRASS || near(x, y, 2, (t) => t !== T.GRASS && t !== T.TREE)) continue;
    if (keep.some((k) => Math.abs(k.x - x) <= 3 && Math.abs(k.y - y) <= 3)) continue;
    if (x >= G.x0 - 1 && x <= G.x1 + 1 && y >= G.y0 - 1 && y <= G.y1 + 1) continue;
    if (rnd() < 0.3) set(x, y, T.TREE);
  }
  // grass tufts and weeds (walkable)
  const tufts = ['grasses01', 'grasses02', 'grasses03', 'grasses04', 'grasses05', 'weed01', 'weed02', 'weed03', 'weed04', 'weed05', 'weed06'];
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) if (get(x, y) === T.GRASS && rnd() < 0.07 && !m.objects.some((o) => o.x === x && o.y === y)) m.dress.set(y * W + x, tufts[Math.floor(rnd() * tufts.length)]);
  return m;
}

/** Tiles reachable on foot from the spawn (4-way over walkable, unblocked tiles): used to relocate old/invalid town positions. */
export function townReach(m: LevelMap, walk: (x: number, y: number) => boolean): Uint8Array {
  const r = new Uint8Array(m.w * m.h), q = [TOWN_START.y * m.w + TOWN_START.x];
  r[q[0]] = 1;
  while (q.length) {
    const i = q.pop()!, x = i % m.w, y = (i / m.w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, j = ny * m.w + nx; if (nx >= 0 && ny >= 0 && nx < m.w && ny < m.h && !r[j] && walk(nx, ny)) { r[j] = 1; q.push(j); } }
  }
  return r;
}
/** The nearest tile to (x, y) that is open and reachable from the spawn. */
export function nearestOpen(m: LevelMap, walk: (x: number, y: number) => boolean, x: number, y: number): { x: number; y: number } {
  const r = townReach(m, walk);
  let best = { ...TOWN_START }, bd = Infinity;
  for (let ty = 0; ty < m.h; ty++) for (let tx = 0; tx < m.w; tx++) if (r[ty * m.w + tx]) { const d = (tx - x) ** 2 + (ty - y) ** 2; if (d < bd) { bd = d; best = { x: tx, y: ty }; } }
  return best;
}

/** Order 14: the 11b stone_wall run (about 2 tiles per piece, scale 1) laid over the T.WALL tiles, which keep the collision. */
export function wallPieces(m: LevelMap): Building[] {
  const out: Building[] = [], done = new Set<number>(), W = (x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h && m.tiles[y * m.w + x] === T.WALL;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    if (!W(x, y) || done.has(y * m.w + x)) continue;
    done.add(y * m.w + x);
    if (W(x + 1, y)) { done.add(y * m.w + x + 1); out.push(piece('stone_wall', 'wall', x + 0.5, y, true, 1)); }
    else out.push(piece('stone_wall', 'wall', x, y, true, 1));
  }
  return out;
}
BUILDINGS.push(...wallPieces(makeTown()));
