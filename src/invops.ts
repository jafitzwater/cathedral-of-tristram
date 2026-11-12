// Order 10 inventory operations (pure, unit-tested): U8 touch drag and drop with D1's swap-to-cursor rule, U6 item comparison.
import { BODY_SLOTS, INV_W, INV_H, derive, reqOk, slotsFor, isBeltable, clampVitals, type BodySlot, type Hero } from './player';
import { DUR_INDESTRUCTIBLE, type Item } from './itemgen';

export type Place = { kind: 'inv'; x: number; y: number } | { kind: 'body'; slot: BodySlot } | { kind: 'belt'; i: number } | { kind: 'ground' } | { kind: 'none' };
/** Where an item sits on the hero right now (none when it is on the cursor or gone). */
export function locate(h: Hero, it: Item): Place {
  const e = h.inv.find((q) => q.item === it); if (e) return { kind: 'inv', x: e.x, y: e.y };
  for (const s of BODY_SLOTS) if (h.body[s] === it) return { kind: 'body', slot: s };
  const i = h.belt.indexOf(it); if (i >= 0) return { kind: 'belt', i };
  return { kind: 'none' };
}
function lift(h: Hero, it: Item) {
  h.inv = h.inv.filter((q) => q.item !== it);
  for (const s of BODY_SLOTS) if (h.body[s] === it) h.body[s] = null;
  h.belt = h.belt.map((b) => (b === it ? null : b));
}
function put(h: Hero, it: Item, p: Place) {
  if (p.kind === 'inv') h.inv.push({ item: it, x: p.x, y: p.y });
  else if (p.kind === 'body') h.body[p.slot] = it;
  else if (p.kind === 'belt') h.belt[p.i] = it;
}
export interface DropResult { ok: boolean; carry: Item | null; ground: boolean; msg?: string }
/**
 * Drop `it` (held on the finger; it may still be in its old place, or already on the cursor) on a target. D1 rules: an empty
 * target takes it; a target holding exactly one item swaps that item onto the cursor (`carry`); anything invalid leaves the
 * hero unchanged (the item snaps back to where it was, or stays on the cursor). `ground` = drop it on the floor (caller).
 */
export function dropItem(h: Hero, it: Item, target: Place): DropResult {
  const from = locate(h, it);
  const fail = (msg?: string): DropResult => ({ ok: false, carry: from.kind === 'none' ? it : null, ground: false, msg });
  if (target.kind === 'none') return fail();
  if (target.kind === 'ground') { lift(h, it); clampVitals(h); return { ok: true, carry: null, ground: true }; }
  lift(h, it);
  const undo = (msg?: string) => { if (from.kind !== 'none') put(h, it, from); return fail(msg); };
  if (target.kind === 'inv') {
    const { x, y } = target;
    if (x < 0 || y < 0 || x + it.w > INV_W || y + it.h > INV_H) return undo();
    const hit = h.inv.filter((e) => x < e.x + e.item.w && e.x < x + it.w && y < e.y + e.item.h && e.y < y + it.h);
    if (hit.length > 1) return undo('Cannot place it there');
    const out = hit[0]?.item ?? null;
    if (out) h.inv = h.inv.filter((e) => e.item !== out);
    h.inv.push({ item: it, x, y });
    clampVitals(h);
    return { ok: true, carry: out, ground: false };
  }
  if (target.kind === 'belt') {
    if (!isBeltable(it)) return undo('Only potions and scrolls go on the belt');
    const out = h.belt[target.i];
    h.belt[target.i] = it;
    return { ok: true, carry: out, ground: false };
  }
  // body slot
  let slot = target.slot;
  const ok = slotsFor(it);
  if (it.loc === 'ILOC_TWOHAND' && (slot === 'handL' || slot === 'handR')) slot = 'handL';
  else if (!ok.includes(slot)) return undo('That does not go there');
  if (!reqOk(h, it, derive(h))) return undo('You do not meet the requirements');
  const b = h.body, other: BodySlot | null = slot === 'handL' ? 'handR' : slot === 'handR' ? 'handL' : null;
  const out: Item[] = [];
  if (it.loc === 'ILOC_TWOHAND') { for (const s of ['handL', 'handR'] as const) if (b[s]) out.push(b[s]!); }
  else {
    if (b[slot]) out.push(b[slot]!);
    if (other && b[other]) {
      const o = b[other]!;
      if (o.loc === 'ILOC_TWOHAND') out.push(o);
      else if (it.itype === 'ITYPE_SHIELD' ? o.itype === 'ITYPE_SHIELD' : o.itype !== 'ITYPE_SHIELD') return undo('Your hands are full');
    }
  }
  if (out.length > 1) { // a two-hander displacing two items: the second one must fit the pack (checked before changing anything)
    const extra = out[1];
    let spot: { x: number; y: number } | null = null;
    for (let y = 0; y <= INV_H - extra.h && !spot; y++) for (let x = 0; x <= INV_W - extra.w && !spot; x++) {
      if (!h.inv.some((e) => x < e.x + e.item.w && e.x < x + extra.w && y < e.y + e.item.h && e.y < y + extra.h)) spot = { x, y };
    }
    if (!spot) return undo('No room in your pack');
    lift(h, extra); h.inv.push({ item: extra, x: spot.x, y: spot.y });
  }
  const carry = out[0] ?? null;
  if (carry) lift(h, carry);
  b[slot] = it;
  clampVitals(h);
  return { ok: true, carry, ground: false };
}

/** U6: one comparison row: the new item's value, the equipped one's, and whether the new one is better (null = same / n.a.). */
export interface CmpRow { label: string; now: string; cur: string; better: boolean | null }
export function compareItems(nw: Item, cur: Item, known = (i: Item) => i.identified || !i.magical): CmpRow[] {
  const rows: CmpRow[] = [];
  const add = (label: string, a: number, b: number, higherBetter = true, fmt = (v: number) => `${v}`) => {
    if (a === b && a === 0) return;
    rows.push({ label, now: fmt(a), cur: fmt(b), better: a === b ? null : (a > b) === higherBetter });
  };
  const ac = (i: Item) => i.ac + (known(i) ? Math.trunc(i.ac * i.pctAC / 100) : 0);
  add('Armor', ac(nw), ac(cur));
  if (nw.maxDam || cur.maxDam) rows.push({ label: 'Damage', now: `${nw.minDam}-${nw.maxDam}`, cur: `${cur.minDam}-${cur.maxDam}`, better: (nw.minDam + nw.maxDam) === (cur.minDam + cur.maxDam) ? null : (nw.minDam + nw.maxDam) > (cur.minDam + cur.maxDam) });
  const k = (i: Item, f: keyof Item) => (known(i) ? (i[f] as number) : 0);
  const sign = (v: number) => (v > 0 ? `+${v}` : `${v}`);
  for (const [f, l] of [['toHit', 'To hit %'], ['pctDam', 'Damage %'], ['damMod', 'Damage'], ['str', 'Strength'], ['mag', 'Magic'], ['dex', 'Dexterity'], ['vit', 'Vitality'],
    ['life', 'Life'], ['mana', 'Mana'], ['fr', 'Resist fire %'], ['lr', 'Resist lightning %'], ['mr', 'Resist magic %']] as [keyof Item, string][]) add(l, k(nw, f), k(cur, f), true, sign);
  add('Damage taken', -k(nw, 'getHit'), -k(cur, 'getHit'), false, sign);
  const dur = (i: Item) => (i.maxDur === DUR_INDESTRUCTIBLE ? 9999 : i.dur);
  if (nw.maxDur || cur.maxDur) rows.push({ label: 'Durability', now: nw.maxDur === DUR_INDESTRUCTIBLE ? 'Indestr.' : `${nw.dur}/${nw.maxDur}`, cur: cur.maxDur === DUR_INDESTRUCTIBLE ? 'Indestr.' : `${cur.dur}/${cur.maxDur}`, better: dur(nw) === dur(cur) ? null : dur(nw) > dur(cur) });
  for (const [f, l] of [['minStr', 'Str required'], ['minMag', 'Mag required'], ['minDex', 'Dex required']] as [keyof Item, string][]) add(l, nw[f] as number, cur[f] as number, false);
  return rows;
}
/** U6: the equipped item a candidate would be compared with (the first occupied slot it fits), or null. */
export function compareTarget(h: Hero, it: Item): Item | null {
  if (BODY_SLOTS.some((s) => h.body[s] === it)) return null;
  const slots = slotsFor(it);
  if (it.loc === 'ILOC_TWOHAND') return h.body.handL ?? h.body.handR ?? null;
  if (it.loc === 'ILOC_ONEHAND') {
    const pick = (pred: (i: Item) => boolean) => [h.body.handL, h.body.handR].find((i) => i && pred(i)) ?? null;
    return it.itype === 'ITYPE_SHIELD' ? pick((i) => i.itype === 'ITYPE_SHIELD') : pick((i) => i.itype !== 'ITYPE_SHIELD');
  }
  for (const s of slots) if (h.body[s]) return h.body[s];
  return null;
}
