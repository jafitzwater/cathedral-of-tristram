// Tristram, hand-built approximation of D1's town layout (D1's exact town tile map lives in MPQ data we do not ship: deviation).
// North: river with Adria's hut across the bridge. Centre: town square and well (Cain, Farnham). East: Rising Sun tavern (Ogden, Gillian).
// West: Griswold's smithy. South: Pepin's house. South-west outskirts: Wirt. East edge: graveyard and the cathedral entrance.
import { T, setT, type LevelMap, type Obj } from './types';

export interface NpcDef { id: string; name: string; x: number; y: number; color: string }
export const TOWN_W = 48, TOWN_H = 48;
export const NPCS: NpcDef[] = [
  { id: 'griswold', name: 'Griswold the Blacksmith', x: 15, y: 25, color: '#a0603a' },
  { id: 'pepin', name: 'Pepin the Healer', x: 24, y: 36, color: '#e0e0c0' },
  { id: 'adria', name: 'Adria the Witch', x: 20, y: 6, color: '#7a3aa0' },
  { id: 'cain', name: 'Deckard Cain', x: 18, y: 22, color: '#8080c0' },
  { id: 'ogden', name: 'Ogden the Tavern Owner', x: 29, y: 19, color: '#a08040' },
  { id: 'gillian', name: 'Gillian the Barmaid', x: 25, y: 18, color: '#c07090' },
  { id: 'farnham', name: 'Farnham the Drunk', x: 23, y: 25, color: '#708050' },
  { id: 'wirt', name: 'Wirt the Peg-legged Boy', x: 6, y: 40, color: '#b0a060' },
  { id: 'wounded', name: 'Wounded Townsman', x: 36, y: 33, color: '#a03030' },
];
export const TOWN_START = { x: 21, y: 24 };          // new game spawn in the square
export const TOWN_FROM_CATHEDRAL = { x: 37, y: 35 };  // arriving back up the cathedral stairs
export const TOWN_PORTAL_SPOT = { x: 20, y: 27 };     // where a Town Portal opens in town [TEMP]

export function makeTown(): LevelMap {
  const m: LevelMap = { w: TOWN_W, h: TOWN_H, tiles: new Uint8Array(TOWN_W * TOWN_H).fill(T.GRASS), up: null, down: { x: 39, y: 35 }, start: TOWN_START, rooms: [], butcherRoom: null, objects: [], monsterSpots: [] };
  const rect = (x0: number, y0: number, x1: number, y1: number, t: number) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) setT(m, x, y, t); };
  // border woods
  rect(0, 0, TOWN_W - 1, 1, T.TREE); rect(0, TOWN_H - 2, TOWN_W - 1, TOWN_H - 1, T.TREE); rect(0, 0, 1, TOWN_H - 1, T.TREE); rect(TOWN_W - 2, 0, TOWN_W - 1, TOWN_H - 1, T.TREE);
  // river + bridge
  rect(2, 8, TOWN_W - 3, 9, T.WATER); rect(20, 8, 21, 9, T.BRIDGE);
  // buildings (solid house blocks)
  rect(16, 2, 23, 4, T.HOUSE);   // Adria's hut
  rect(26, 12, 33, 17, T.HOUSE); // Rising Sun tavern
  rect(8, 22, 14, 28, T.HOUSE);  // Griswold's smithy
  rect(22, 30, 27, 34, T.HOUSE); // Pepin's house
  rect(4, 30, 9, 34, T.HOUSE);   // abandoned house
  rect(32, 22, 36, 26, T.HOUSE); // cottage
  rect(39, 28, 45, 42, T.HOUSE); // cathedral
  // paths
  const path = (x0: number, y0: number, x1: number, y1: number) => rect(Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1), T.PATH);
  path(20, 10, 21, 24); path(15, 23, 38, 24); path(21, 24, 21, 35); path(29, 18, 29, 23); path(15, 24, 15, 26);
  path(34, 24, 38, 35); path(6, 35, 21, 36); path(6, 36, 6, 40); path(20, 5, 21, 7);
  // cathedral entrance stairs on its west face
  setT(m, 39, 35, T.DOWN); setT(m, 38, 35, T.PATH);
  let id = 1;
  const obj = (kind: Obj['kind'], x: number, y: number): Obj => ({ id: id++, kind, x, y, used: false, var1: 0, var2: 0, seed: 0 });
  m.objects.push(obj('well', 20, 20));
  for (const [x, y] of [[41, 24], [43, 24], [41, 26], [43, 26], [45, 25]]) m.objects.push(obj('cross', x, y));
  return m;
}
