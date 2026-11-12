import type { P } from '../iso';

export const T = { FLOOR: 0, WALL: 1, DOOR: 2, DOOR_OPEN: 3, UP: 4, DOWN: 5, WATER: 6, HOUSE: 7, TREE: 8, GRASS: 9, PATH: 10, BRIDGE: 11, PILLAR: 12 } as const;
export type Tile = (typeof T)[keyof typeof T];
export const WALKABLE = new Set<number>([T.FLOOR, T.DOOR_OPEN, T.UP, T.DOWN, T.GRASS, T.PATH, T.BRIDGE]);
export const TALL = new Set<number>([T.WALL, T.HOUSE, T.TREE, T.DOOR, T.PILLAR]);

export type ObjKind = 'barrel' | 'barrel_ex' | 'chest1' | 'chest2' | 'chest3' | 'sarc' | 'shrine' | 'body' | 'well' | 'cross' | 'portal' | 'sealed';
export interface Obj { id: number; kind: ObjKind; x: number; y: number; used: boolean; var1: number; var2: number; shrine?: string; seed: number }
export interface Room { x: number; y: number; w: number; h: number }

export interface LevelMap {
  w: number; h: number; tiles: Uint8Array;
  up: P | null; down: P | null; start: P;
  rooms: Room[]; butcherRoom: Room | null; objects: Obj[];
  monsterSpots: { id: string; x: number; y: number }[];
}
export const at = (m: { w: number; tiles: Uint8Array }, x: number, y: number) => m.tiles[y * m.w + x];
export const setT = (m: { w: number; tiles: Uint8Array }, x: number, y: number, t: number) => { m.tiles[y * m.w + x] = t; };
