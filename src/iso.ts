// D1-style isometric math: 2:1 diamond tiles, 64x32 px, 640x480 logical view.
export const TILE_W = 64;
export const TILE_H = 32;
export const VIEW_W = 640;
export const VIEW_H = 480;
export const PANEL_H = 128; // D1 control panel height
export const PLAY_H = VIEW_H - PANEL_H;
/** Live world viewport in world px (Order 4: full-screen, set by main.ts on resize). zoom = css px per world px. */
export const view = { w: 640, h: PLAY_H, zoom: 1 };
/** Order 10 U3: the zoom out from Order 9's D1-area zoom (sqrt(W*H / 640x352), min 1). */
export const ZOOM_OUT = 1.35;
export function worldZoom(W: number, H: number) { return Math.max(1, Math.sqrt((W * H) / (640 * 352))) / ZOOM_OUT; }

export interface P { x: number; y: number }

/** Tile (or fractional tile) coords -> screen px of the tile's top-center, relative to the world origin. */
export function tileToScreen(tx: number, ty: number): P {
  return { x: (tx - ty) * (TILE_W / 2), y: (tx + ty) * (TILE_H / 2) };
}
/** Screen px (relative to world origin) -> fractional tile coords. Inverse of tileToScreen. */
export function screenToTile(sx: number, sy: number): P {
  const a = sx / (TILE_W / 2), b = sy / (TILE_H / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}
/** Screen px -> the integer tile whose diamond contains the point. */
export function pickTile(sx: number, sy: number): P {
  const t = screenToTile(sx, sy - TILE_H / 2);
  return { x: Math.round(t.x) + 0, y: Math.round(t.y) + 0 };
}

/** 8 directions in tile space, index 0 = south (screen down), going clockwise like D1's DIR_S..DIR_SE. */
export const DIRS: readonly P[] = [
  { x: 1, y: 1 },   // 0 S
  { x: 0, y: 1 },   // 1 SW
  { x: -1, y: 1 },  // 2 W
  { x: -1, y: 0 },  // 3 NW
  { x: -1, y: -1 }, // 4 N
  { x: 0, y: -1 },  // 5 NE
  { x: 1, y: -1 },  // 6 E
  { x: 1, y: 0 },   // 7 SE
];
/** Direction index for a tile-space step. */
export function dirOf(dx: number, dy: number): number {
  const sx = Math.sign(dx), sy = Math.sign(dy);
  return DIRS.findIndex((d) => d.x === sx && d.y === sy);
}
