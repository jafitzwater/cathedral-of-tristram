// Diablo Immortal-style control math (pure, unit-tested): floating joystick, 8-direction stepping with wall slide,
// soft-lock auto-targeting, skill-slot assignment and the contextual interact pick.
import { DIRS, tileToScreen, type P } from './iso';
import { T, at } from './levels/types';
import type { Game, Target } from './game';
import { TOWN_PORTAL_SPOT } from './levels/town';

export const JOY_RADIUS = 56;     // css px: knob travel
export const JOY_DEADZONE = 0.22; // fraction of radius
export const SLOT_COUNT = 4;

export interface Joy { x: number; y: number; mag: number }
/** Floating stick: origin = where the thumb landed. Returns a unit direction (screen space, y down) and 0..1 magnitude. */
export function joystickVector(ox: number, oy: number, tx: number, ty: number, radius = JOY_RADIUS, dead = JOY_DEADZONE): Joy {
  const dx = tx - ox, dy = ty - oy, d = Math.hypot(dx, dy);
  const mag = Math.min(1, d / radius);
  if (mag < dead || d === 0) return { x: 0, y: 0, mag: 0 };
  return { x: dx / d, y: dy / d, mag: (mag - dead) / (1 - dead) };
}
/** Knob position clamped to the ring. */
export function knob(ox: number, oy: number, tx: number, ty: number, radius = JOY_RADIUS): P {
  const dx = tx - ox, dy = ty - oy, d = Math.hypot(dx, dy);
  if (d <= radius) return { x: tx, y: ty };
  return { x: ox + dx / d * radius, y: oy + dy / d * radius };
}
const SCREEN_DIRS = DIRS.map((d) => { const s = tileToScreen(d.x, d.y), l = Math.hypot(s.x, s.y); return { x: s.x / l, y: s.y / l }; });
/** The 8 D1 directions ordered by how well they match a screen-space stick vector (best first), with their alignment (dot). */
export function rankDirs(jx: number, jy: number): { dir: number; dot: number }[] {
  return SCREEN_DIRS.map((s, dir) => ({ dir, dot: s.x * jx + s.y * jy })).sort((a, b) => b.dot - a.dot);
}
/** 8-way quantisation of the stick (index into DIRS), or -1 when centred. */
export function stickDir(j: Joy): number { return j.mag > 0 ? rankDirs(j.x, j.y)[0].dir : -1; }
/** Next tile for continuous walking: the best-matching direction, else slide along a wall with a neighbour direction within 60°. */
export function stepFor(j: Joy, from: P, canStep: (x: number, y: number, dir: number) => boolean, prevDir = -1): number {
  if (j.mag <= 0) return -1;
  const r = rankDirs(j.x, j.y);
  // hysteresis: keep the previous direction when it is nearly as good, so a thumb on a boundary does not zig-zag
  if (prevDir >= 0 && r[0].dir !== prevDir) { const pv = r.find((e) => e.dir === prevDir)!; if (pv.dot > r[0].dot - 0.04) { r.splice(r.indexOf(pv), 1); r.unshift(pv); } }
  for (const e of r.slice(0, 3)) {
    if (e.dot < 0.5) break;
    const d = DIRS[e.dir];
    if (canStep(from.x + d.x, from.y + d.y, e.dir)) return e.dir;
  }
  return -1;
}

export interface Cand { id: number; x: number; y: number }
/**
 * Soft-lock target choice for the ATTACK button: keep the locked target while it is alive, visible and within lockRange;
 * otherwise the nearest visible candidate within range, biased toward the facing / stick direction.
 */
export function pickTarget(px: number, py: number, facing: P | null, cands: Cand[], lockedId: number | null, range: number, lockRange: number, visible: (c: Cand) => boolean): Cand | null {
  const dist = (c: Cand) => Math.max(Math.abs(c.x - px), Math.abs(c.y - py)) + 0.01 * Math.hypot(c.x - px, c.y - py);
  if (lockedId !== null) {
    const l = cands.find((c) => c.id === lockedId);
    if (l && dist(l) <= lockRange && visible(l)) return l;
  }
  let best: Cand | null = null, bs = Infinity;
  for (const c of cands) {
    const d = dist(c);
    if (d > range || !visible(c)) continue;
    let s = d;
    if (facing) { const vx = c.x - px, vy = c.y - py, l = Math.hypot(vx, vy) || 1; s -= ((vx * facing.x + vy * facing.y) / l) * 1.25; }
    if (s < bs) { bs = s; best = c; }
  }
  return best;
}

/** Put a spell/scroll/staff id into a slot. If it already sits in another slot the two swap (Diablo Immortal behaviour). */
export function assignSlot(slots: (string | null)[], idx: number, id: string | null): (string | null)[] {
  const out = slots.slice(0, SLOT_COUNT);
  while (out.length < SLOT_COUNT) out.push(null);
  if (idx < 0 || idx >= SLOT_COUNT) return out;
  const prev = id ? out.indexOf(id) : -1;
  if (prev >= 0 && prev !== idx) out[prev] = out[idx];
  out[idx] = id;
  return out;
}
export function defaultSlots(cls: string, spells: Record<string, number>, staffSpell: string | null): (string | null)[] {
  let s: (string | null)[] = [null, null, null, null];
  let i = 0;
  for (const id of Object.keys(spells)) if (i < SLOT_COUNT) s = assignSlot(s, i++, id);
  if (staffSpell && i < SLOT_COUNT) s = assignSlot(s, i++, `staff:${staffSpell}`);
  void cls;
  return s;
}

export interface Interact { target: Target; label: string }
/** What the contextual INTERACT button does right now (nearest within 2 tiles; items, then NPCs, objects, doors, stairs). */
export function interactFor(g: Game): Interact | null {
  const p = g.p, here = { x: p.tx, y: p.ty }, lv = g.level, m = lv.map;
  const cheb = (q: P) => Math.max(Math.abs(q.x - here.x), Math.abs(q.y - here.y));
  const R = 2;
  const opts: { d: number; pri: number; it: Interact }[] = [];
  for (const gi of lv.items) if (gi.item.itype !== 'ITYPE_GOLD' && cheb(gi) <= R) opts.push({ d: cheb(gi), pri: 0, it: { target: { kind: 'item', g: gi }, label: `Pick up ${gi.item.identified ? gi.item.iname : gi.item.name}` } });
  for (const n of g.npcs()) if (cheb(n) <= R) opts.push({ d: cheb(n), pri: 1, it: { target: { kind: 'npc', npc: n }, label: `Talk to ${n.name.split(' ')[0]}` } });
  for (const o of m.objects) {
    if (o.used || cheb(o) > R || o.kind === 'body' || o.kind === 'well' || o.kind === 'cross' || o.kind === 'portal') continue;
    const label = o.kind.startsWith('chest') ? 'Open chest' : o.kind === 'sarc' ? 'Open sarcophagus' : o.kind === 'shrine' ? 'Use shrine' : o.kind.startsWith('barrel') ? 'Break barrel' : 'Use';
    opts.push({ d: cheb(o), pri: 2, it: { target: { kind: 'obj', o }, label } });
  }
  for (let y = here.y - R; y <= here.y + R; y++) for (let x = here.x - R; x <= here.x + R; x++) {
    const t = at(m, x, y);
    if (t === T.DOOR || t === T.DOOR_OPEN) {
      if (t === T.DOOR_OPEN && (x === here.x && y === here.y)) continue;
      opts.push({ d: cheb({ x, y }), pri: 3, it: { target: { kind: 'door', x, y }, label: t === T.DOOR ? 'Open door' : 'Close door' } });
    } else if (t === T.UP || t === T.DOWN) {
      const label = t === T.DOWN ? (g.cur === 'town' ? 'Enter the Cathedral' : 'Stairs down') : 'Up to Tristram';
      opts.push({ d: cheb({ x, y }), pri: 4, it: { target: { kind: 'stairs', x, y }, label } });
    }
  }
  if (g.portal) {
    const pp = g.cur === 'town' ? TOWN_PORTAL_SPOT : g.portal;
    if (cheb(pp) <= R) opts.push({ d: cheb(pp), pri: 4, it: { target: { kind: 'stairs', x: pp.x, y: pp.y }, label: 'Town portal' } });
  }
  opts.sort((a, b) => a.d - b.d || a.pri - b.pri);
  return opts[0]?.it ?? null;
}
