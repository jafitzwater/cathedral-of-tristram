// Diablo Immortal-style control math (pure, unit-tested): floating joystick, analog movement with circle collision + wall slide,
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
 * Order 9b: analog movement (Diablo Immortal style). The hero moves continuously in the stick's exact SCREEN direction; the
 * world velocity is the inverse of the 2:1 iso projection (tileToScreen: sx = (x-y)*32, sy = (x+y)*16), normalised to the D1
 * walk speed in world distance. The facing sprite is the one of the 8 whose on-screen art direction is nearest the stick.
 * Order of the 8 directions by screen angle (0 = right, clockwise with y down): E, SE, S, SW, W, NW, N, NE.
 */
export const SECTOR_DIR = [6, 7, 0, 1, 2, 3, 4, 5] as const;
export const DIR_SECTOR = SECTOR_DIR.reduce((o, d, k) => { o[d] = k; return o; }, [] as number[]);
export const STICK_HYSTERESIS_DEG = 8;
export const HERO_RADIUS = 0.35; // tiles: the hero's collision circle
const DEG = 180 / Math.PI;
/** Stick angle in degrees, 0..360, screen space (0 = right, 90 = down). */
export const stickAngle = (jx: number, jy: number) => ((Math.atan2(jy, jx) * DEG) % 360 + 360) % 360;
/** Smallest angle between two directions in degrees. */
export const angleDiff = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const signedDiff = (a: number, b: number) => { const d = ((a - b) % 360 + 540) % 360 - 180; return d; };
/** Screen angle (degrees) of a world step direction (DIRS index); equals its facing art's on-screen angle (test/joystick.ts). */
export function dirScreenAngle(dir: number): number { const d = DIRS[dir], s = tileToScreen(d.x, d.y); return stickAngle(s.x, s.y); }
/** Unit world-space vector that moves along screen vector (sx, sy): the inverse of the 2:1 iso projection. */
export function screenToWorldDir(sx: number, sy: number): P {
  const wx = sx / 64 + sy / 32, wy = sy / 32 - sx / 64, l = Math.hypot(wx, wy);
  return l ? { x: wx / l, y: wy / l } : { x: 0, y: 0 };
}
const ART = SECTOR_DIR.map((d) => dirScreenAngle(d)); // ascending: 0, 26.57, 90, 153.43, 180, 206.57, 270, 333.43
/**
 * Facing (index into DIRS) for a screen-space direction: the sprite whose art direction is nearest the stick angle; its sector
 * reaches halfway to each neighbouring art direction. With prevDir the previous sprite is kept until the stick leaves its sector by
 * more than STICK_HYSTERESIS_DEG, so a thumb on a boundary does not flicker; a clear move switches at once. -1 when centred.
 */
export function stickDir(j: Joy, prevDir = -1): number {
  if (j.mag <= 0 || (j.x === 0 && j.y === 0)) return -1;
  const a = stickAngle(j.x, j.y);
  if (prevDir >= 0) {
    const k = DIR_SECTOR[prevDir], lo = angleDiff(ART[k], ART[(k + 7) % 8]) / 2, hi = angleDiff(ART[k], ART[(k + 1) % 8]) / 2;
    const d = signedDiff(a, ART[k]);
    if (d >= -(lo + STICK_HYSTERESIS_DEG) && d <= hi + STICK_HYSTERESIS_DEG) return prevDir;
  }
  let best = 0;
  for (let k = 1; k < 8; k++) if (angleDiff(a, ART[k]) < angleDiff(a, ART[best])) best = k;
  return SECTOR_DIR[best];
}
/** Facing toward a world-space offset (attacks and casts face their target). */
export function faceToward(dx: number, dy: number, fallback: number): number {
  const s = tileToScreen(dx, dy);
  const d = stickDir({ x: s.x, y: s.y, mag: 1 });
  return d < 0 ? fallback : d;
}
/**
 * Move a circle of radius r from (x, y) by (dx, dy) against blocked tiles (tile k spans k-0.5..k+0.5). Sub-stepped; a blocked step
 * slides by dropping the blocked world axis (walls are axis-aligned in tile space). Diagonal wall gaps are closed because the two
 * wall squares touch at the corner. An overlap that already exists (an actor stepped next to the hero) may shrink but never grow.
 */
export function moveCircle(x: number, y: number, dx: number, dy: number, r: number, blocked: (tx: number, ty: number) => boolean): P {
  const pen = (px: number, py: number, tx: number, ty: number) => {
    const cx = Math.max(tx - 0.5, Math.min(tx + 0.5, px)), cy = Math.max(ty - 0.5, Math.min(ty + 0.5, py));
    return r - Math.hypot(px - cx, py - cy);
  };
  const ok = (ox: number, oy: number, nx: number, ny: number) => {
    for (let ty = Math.round(ny - r); ty <= Math.round(ny + r); ty++) for (let tx = Math.round(nx - r); tx <= Math.round(nx + r); tx++) {
      const p = pen(nx, ny, tx, ty);
      if (p > 1e-9 && blocked(tx, ty) && p > pen(ox, oy, tx, ty) + 1e-9) return false;
    }
    return true;
  };
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.02)), sx = dx / n, sy = dy / n;
  for (let i = 0; i < n; i++) {
    if (ok(x, y, x + sx, y + sy)) { x += sx; y += sy; continue; }
    const ax = ok(x, y, x + sx, y), ay = ok(x, y, x, y + sy);
    if (ax && (!ay || Math.abs(sx) >= Math.abs(sy))) x += sx;
    else if (ay) y += sy;
    else break;
  }
  return { x, y };
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
