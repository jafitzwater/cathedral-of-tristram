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
/**
 * Order 9: the stick's SCREEN angle picks one of 8 equal 45-degree sectors (0 = right, clockwise with y down), and each sector
 * maps to the world step that moves that way on screen with the engine's axes (tileToScreen: +x = down-right, +y = down-left):
 * right = E (+1,-1), down-right = SE (+1,0), down = S (+1,+1), down-left = SW (0,+1), left = W (-1,+1), up-left = NW (-1,0),
 * up = N (-1,-1), up-right = NE (0,-1). (On the 2:1 view the diagonal steps sit at 26.57 degrees, not 45.)
 */
export const SECTOR_DIR = [6, 7, 0, 1, 2, 3, 4, 5] as const;
export const DIR_SECTOR = SECTOR_DIR.reduce((o, d, k) => { o[d] = k; return o; }, [] as number[]);
export const STICK_HYSTERESIS_DEG = 8;
const DEG = 180 / Math.PI;
/** Stick angle in degrees, 0..360, screen space (0 = right, 90 = down). */
export const stickAngle = (jx: number, jy: number) => ((Math.atan2(jy, jx) * DEG) % 360 + 360) % 360;
/** Smallest angle between two directions in degrees. */
export const angleDiff = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
/** Screen angle (degrees) of a world step direction (DIRS index). */
export function dirScreenAngle(dir: number): number { const d = DIRS[dir], s = tileToScreen(d.x, d.y); return stickAngle(s.x, s.y); }
/** The 8 directions ordered by how close their stick sector is to the stick angle (best first). */
export function rankDirs(jx: number, jy: number): { dir: number; dot: number }[] {
  const a = stickAngle(jx, jy);
  return SECTOR_DIR.map((dir, k) => ({ dir, dot: Math.cos(angleDiff(a, k * 45) / DEG) })).sort((p, q) => q.dot - p.dot);
}
/**
 * 8-way sector of the stick (index into DIRS), or -1 when centred. With prevDir the previous sector is kept until the stick
 * leaves it by more than STICK_HYSTERESIS_DEG, so a thumb on a boundary does not flicker but a clear move switches at once.
 */
export function stickDir(j: Joy, prevDir = -1): number {
  if (j.mag <= 0) return -1;
  const a = stickAngle(j.x, j.y);
  if (prevDir >= 0 && angleDiff(a, DIR_SECTOR[prevDir] * 45) <= 22.5 + STICK_HYSTERESIS_DEG) return prevDir;
  return SECTOR_DIR[Math.round(a / 45) % 8];
}
/**
 * Next tile while the stick is held: step straight in the stick's sector; only when that tile is blocked, slide along the wall
 * with the neighbouring sector nearer the stick angle, then the other one. No pathfinding, so no wandering.
 */
export function stepFor(j: Joy, from: P, canStep: (x: number, y: number, dir: number) => boolean, prevDir = -1): number {
  const dir = stickDir(j, prevDir);
  if (dir < 0) return -1;
  const k = DIR_SECTOR[dir], a = stickAngle(j.x, j.y);
  const left = SECTOR_DIR[(k + 7) % 8], right = SECTOR_DIR[(k + 1) % 8];
  const slides = angleDiff(a, ((k + 7) % 8) * 45) <= angleDiff(a, ((k + 1) % 8) * 45) ? [left, right] : [right, left];
  for (const d of [dir, ...slides]) if (canStep(from.x + DIRS[d].x, from.y + DIRS[d].y, d)) return d;
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
