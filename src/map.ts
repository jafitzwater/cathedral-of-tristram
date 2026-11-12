// Placeholder Cathedral-like test level: walled rooms and pillars. Real dungeon gen comes in a later order.
export const MAP_W = 40, MAP_H = 40;
export const FLOOR = 0, WALL = 1;

export function makeTestLevel(): Uint8Array {
  const m = new Uint8Array(MAP_W * MAP_H);
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    const edge = x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1;
    const midWall = (x === 20 && y !== 10 && y !== 30) || (y === 20 && x !== 8 && x !== 32);
    const pillar = x % 6 === 3 && y % 6 === 3 && x !== 20 && y !== 20;
    m[y * MAP_W + x] = edge || midWall || pillar ? WALL : FLOOR;
  }
  return m;
}
