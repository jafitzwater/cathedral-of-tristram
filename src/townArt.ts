// Order 7: Tristram's buildings and set dressing as depth-sorted sprites, with D1-style roof fade when the hero walks behind one.
import { TILE_H, tileToScreen } from './iso';
import type { Building } from './levels/town';

export const ROOF_FADE = 0.3, BASE_FADE = 0.55, DRESS_FADE = 0.45;
export interface SpriteBox { ax: number; ay: number; w: number; h: number; eaves?: number }
/** Hero sprite box relative to the feet point (screen px): the 96 px packed hero is ~40 px wide, ~80 px tall. */
const HERO = { w: 40, h: 80 };

/** Draw key: a piece is drawn right after the tiles of the diagonal through its front ground corner. */
export const frontS = (b: Building) => b.x + b.y + (b.ex + b.ey) / 2;
/** Screen rect of a piece's sprite (world px, relative to tileToScreen origin; flip mirrors about the anchor). */
export function spriteRect(b: Building, f: SpriteBox) {
  const p = tileToScreen(b.x, b.y), fx = p.x, fy = p.y + TILE_H / 2;
  const left = b.flip ? fx - (f.w - f.ax) : fx - f.ax;
  return { x0: left, x1: left + f.w, y0: fy - f.ay, y1: fy - f.ay + f.h, eavesY: fy - f.ay + (f.eaves ?? 0), fx, fy };
}
/** Is a ground point behind the piece (screen-occluded side)? Separating-axis test on its footprint box. */
export function behind(b: Building, px: number, py: number): boolean {
  if (px >= b.x + b.ex / 2 || py >= b.y + b.ey / 2) return false;
  return px < b.x - b.ex / 2 || py < b.y - b.ey / 2 || px + py < frontS(b);
}
function overlaps(b: Building, f: SpriteBox, px: number, py: number) {
  const r = spriteRect(b, f), p = tileToScreen(px, py), x = p.x, y = p.y + TILE_H / 2;
  return x + HERO.w / 2 > r.x0 && x - HERO.w / 2 < r.x1 && y > r.y0 && y - HERO.h < r.y1;
}
/**
 * Roof fade: when the hero stands behind a piece and its sprite covers him, the roof (above the eaves row) drops to ROOF_FADE;
 * if his feet are below the eaves line the walls hide him too, so the base drops to BASE_FADE. Trees/fence/well fade whole.
 */
export function buildingFade(b: Building, f: SpriteBox, px: number, py: number): { roof: number; base: number } {
  if (!behind(b, px, py) || !overlaps(b, f, px, py)) return { roof: 1, base: 1 };
  if (f.eaves === undefined || !['smithy', 'pepin_house', 'tavern', 'adria_hut', 'cathedral'].includes(b.id)) return { roof: DRESS_FADE, base: DRESS_FADE };
  const r = spriteRect(b, f), feetY = tileToScreen(px, py).y + TILE_H / 2;
  return { roof: ROOF_FADE, base: feetY > r.eavesY ? BASE_FADE : 1 };
}
/** Depth key for an actor/object near pieces: one standing in front of a piece's footprint is drawn after it. */
export function sortKey(s: number, px: number, py: number, pieces: { b: Building; f: SpriteBox }[]): number {
  let k = s;
  for (const { b, f } of pieces) if (s < frontS(b) && (px >= b.x + b.ex / 2 || py >= b.y + b.ey / 2) && overlaps(b, f, px, py)) k = Math.max(k, frontS(b) + 0.01);
  return k;
}
