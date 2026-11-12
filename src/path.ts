// A* over a tile grid, 8 directions, no diagonal corner cutting (D1 rule), octile heuristic.
import type { P } from './iso';

export type Walkable = (x: number, y: number) => boolean;
const SQ2 = Math.SQRT2;

export function findPath(w: number, h: number, walk: Walkable, from: P, to: P, maxNodes = 4000): P[] | null {
  if (!walk(to.x, to.y)) return null;
  if (from.x === to.x && from.y === to.y) return [];
  const key = (x: number, y: number) => y * w + x;
  const g = new Map<number, number>();
  const parent = new Map<number, number>();
  const closed = new Set<number>();
  const open: { k: number; f: number }[] = [];
  const hfn = (x: number, y: number) => {
    const dx = Math.abs(x - to.x), dy = Math.abs(y - to.y);
    return Math.max(dx, dy) + (SQ2 - 1) * Math.min(dx, dy);
  };
  const s = key(from.x, from.y);
  g.set(s, 0);
  open.push({ k: s, f: hfn(from.x, from.y) });
  let n = 0;
  while (open.length && n++ < maxNodes) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const { k } = open[bi];
    open[bi] = open[open.length - 1]; open.pop();
    if (closed.has(k)) continue;
    closed.add(k);
    const cx = k % w, cy = (k - cx) / w;
    if (cx === to.x && cy === to.y) {
      const out: P[] = [];
      let c = k;
      while (c !== s) { out.push({ x: c % w, y: Math.floor(c / w) }); c = parent.get(c)!; }
      return out.reverse();
    }
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || !walk(nx, ny)) continue;
      if (dx && dy && (!walk(cx + dx, cy) || !walk(cx, cy + dy))) continue;
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      const ng = g.get(k)! + (dx && dy ? SQ2 : 1);
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng); parent.set(nk, k);
        open.push({ k: nk, f: ng + hfn(nx, ny) });
      }
    }
  }
  return null;
}
