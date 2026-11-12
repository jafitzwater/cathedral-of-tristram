// Hero model and D1 v1.09 character formulas.
// Sources: devilution player.cpp (CreatePlayer, NextPlrLevel, ModifyPlrVit/Mag), items.cpp (CalcPlrItemVals, UseItem),
// missiles.cpp (spell damage), and Jarulf's Guide v1.62 ch. 3-7 (to-hit, block, hit recovery, damage).
import { CLASSES, EXP_LEVELS, MAX_CLVL, START_GOLD, STAT_POINTS_PER_LEVEL, type ClassId, type Stats } from './data/classes';
import { IDI } from './data/items';
import { DUR_INDESTRUCTIBLE, getItemAttrs, type Item } from './itemgen';
import type { Rng } from './rng';

export type BodySlot = 'head' | 'amulet' | 'chest' | 'handL' | 'handR' | 'ringL' | 'ringR';
export const BODY_SLOTS: BodySlot[] = ['head', 'amulet', 'chest', 'handL', 'handR', 'ringL', 'ringR'];
export const INV_W = 10, INV_H = 4;

export interface InvEntry { item: Item; x: number; y: number }
export interface Hero {
  name: string; cls: ClassId; clvl: number; exp: number; statPts: number;
  base: Stats; hp: number; mana: number; manaPenalty: number;
  body: Record<BodySlot, Item | null>; inv: InvEntry[]; belt: (Item | null)[]; gold: number;
  spells: Record<string, number>; skill: string; maxDlvl: number;
}

export function newHero(name: string, cls: ClassId, rng: Rng): Hero {
  const c = CLASSES[cls];
  const h: Hero = {
    name, cls, clvl: 1, exp: 0, statPts: 0, base: { ...c.base }, hp: 0, mana: 0, manaPenalty: 0,
    body: { head: null, amulet: null, chest: null, handL: null, handR: null, ringL: null, ringR: null },
    inv: [], belt: [null, null, null, null, null, null, null, null], gold: START_GOLD,
    spells: {}, skill: 'skill', maxDlvl: 0,
  };
  const mk = (idx: number) => { const it = getItemAttrs(rng, idx, 1); it.identified = true; return it; };
  // CreatePlrItems (v1.09): Warrior short sword + buckler (+ club in pack), Rogue short bow, Sorcerer staff of charged bolt; 2 potions in belt.
  if (cls === 'warrior') { h.body.handL = mk(IDI.WARRIOR); h.body.handR = mk(IDI.WARRSHLD); autoPlace(h, mk(IDI.WARRCLUB)); h.belt[0] = mk(IDI.HEAL); h.belt[1] = mk(IDI.HEAL); }
  if (cls === 'rogue') { h.body.handL = mk(IDI.ROGUE); h.belt[0] = mk(IDI.HEAL); h.belt[1] = mk(IDI.HEAL); }
  if (cls === 'sorcerer') { h.body.handL = mk(IDI.SORCEROR); h.belt[0] = mk(IDI.MANA); h.belt[1] = mk(IDI.MANA); }
  if (c.startSpell) { h.spells[c.startSpell.spell] = c.startSpell.level; h.skill = c.startSpell.spell; }
  const d = derive(h);
  h.hp = d.maxHp; h.mana = d.maxMana;
  return h;
}

export interface Derived {
  str: number; mag: number; dex: number; vit: number;
  maxHp: number; maxMana: number; ac: number; toHit: number;
  minDam: number; maxDam: number; pctDam: number; damMod: number; charDamMod: number;
  fr: number; lr: number; mr: number; getHit: number; splLvlAdd: number; light: number;
  hasShield: boolean; bow: boolean; weapon: Item | null; flags: Set<string>;
}

/** Item requirements met (D1 _iStatFlag): unmet items give no bonuses and cannot be used. */
export function reqOk(h: Hero, it: Item, d?: Pick<Derived, 'str' | 'mag' | 'dex'>): boolean {
  const s = d ?? { str: h.base.str, mag: h.base.mag, dex: h.base.dex };
  return s.str >= it.minStr && s.mag >= it.minMag && s.dex >= it.minDex;
}

export function derive(h: Hero): Derived {
  const c = CLASSES[h.cls];
  const worn = BODY_SLOTS.map((s) => h.body[s]).filter((i): i is Item => !!i && i.dur !== 0);
  // D1 checks requirements against base stats + item bonuses; approximate with a two-pass check.
  let act = worn.filter((i) => reqOk(h, i));
  const sum = (k: keyof Item) => act.reduce((a, i) => a + (i[k] as number), 0); // unidentified items still work in D1
  const str = h.base.str + sum('str'), mag = h.base.mag + sum('mag'), dex = h.base.dex + sum('dex'), vit = h.base.vit + sum('vit');
  act = worn.filter((i) => reqOk(h, i, { str, mag, dex }));
  const flags = new Set(act.flatMap((i) => i.flags));
  const itemVit = sum('vit'), itemMag = sum('mag');
  const maxHp = Math.floor((h.base.vit + 10) * c.lifePerVit) + (h.clvl - 1) * c.lifePerLevel + Math.floor(itemVit * c.lifePerVit) + sum('life');
  let maxMana = Math.floor(h.base.mag * c.manaPerMag) + (h.clvl - 1) * c.manaPerLevel + Math.floor(itemMag * c.manaPerMag) + sum('mana') - h.manaPenalty;
  if (flags.has('NOMANA')) maxMana = 0;
  let ac = Math.floor(dex / 5);
  for (const i of act) ac += i.ac + Math.trunc(i.ac * i.pctAC / 100);
  const weapon = [h.body.handL, h.body.handR].find((i) => i && act.includes(i) && i.itype !== 'ITYPE_SHIELD') ?? null;
  const hasShield = [h.body.handL, h.body.handR].some((i) => i && act.includes(i) && i.itype === 'ITYPE_SHIELD');
  const bow = weapon?.itype === 'ITYPE_BOW';
  // Unarmed 1-1; shield only 1-3 (CalcPlrItemVals).
  const minDam = weapon ? weapon.minDam : hasShield ? 1 : 1, maxDam = weapon ? weapon.maxDam : hasShield ? 3 : 1;
  const charDamMod = h.cls === 'rogue' ? Math.floor((str + dex) * h.clvl / 200) : Math.floor(str * h.clvl / 100);
  const cap = (v: number) => Math.min(75, Math.max(0, v));
  return {
    str, mag, dex, vit, maxHp: Math.max(1, maxHp), maxMana: Math.max(0, maxMana), ac: Math.max(0, ac),
    toHit: sum('toHit'), minDam, maxDam, pctDam: sum('pctDam'), damMod: sum('damMod'), charDamMod,
    fr: cap(sum('fr')), lr: cap(sum('lr')), mr: cap(sum('mr')), getHit: sum('getHit'), splLvlAdd: sum('splLvlAdd'), light: sum('light'),
    hasShield, bow, weapon, flags,
  };
}

// ---------- combat formulas ----------
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
/** Melee to-hit %: 50 + Dex/2 + item to-hit + clvl - monster AC (+20 Warrior), clamped 5..95. [JARULF] */
export function meleeToHit(h: Hero, d: Derived, monsterAc: number): number {
  return clamp(50 + Math.floor(d.dex / 2) + d.toHit + h.clvl - monsterAc + (h.cls === 'warrior' ? 20 : 0), 5, 95);
}
/** Arrow to-hit %: 50 + Dex + item to-hit + clvl - monster AC (+20 Rogue, +10 Warrior), clamped 5..95. Distance term omitted [TEMP]. */
export function bowToHit(h: Hero, d: Derived, monsterAc: number): number {
  return clamp(50 + d.dex + d.toHit + h.clvl - monsterAc + (h.cls === 'rogue' ? 20 : h.cls === 'warrior' ? 10 : 0), 5, 95);
}
/** Spell (missile) to-hit vs monsters %: 50 + Magic - 2*mlvl, clamped 5..95 [JARULF; Sorcerer +20 [TEMP]]. */
export function spellToHit(h: Hero, d: Derived, mlvl: number): number {
  return clamp(50 + d.mag - 2 * mlvl + (h.cls === 'sorcerer' ? 20 : 0), 5, 95);
}
/** Monster melee to-hit vs hero %: 30 + mToHit + 2*(mlvl - clvl) - hero AC, clamped 15..95. [JARULF] */
export function monsterToHit(mToHit: number, mlvl: number, clvl: number, ac: number): number {
  return clamp(30 + mToHit + 2 * (mlvl - clvl) - ac, 15, 95);
}
/** Block %: Dex + class base block + 2*(clvl - mlvl), clamped 0..100; needs a shield. [JARULF] */
export function blockChance(h: Hero, d: Derived, mlvl: number): number {
  if (!d.hasShield) return 0;
  return clamp(d.dex + CLASSES[h.cls].baseToBlock + 2 * (h.clvl - mlvl), 0, 100);
}
/** Physical hit damage: weapon roll * (100 + %dam)/100 + item damage mod + character damage mod. Warrior melee crit: clvl% chance of x2. */
export function rollDamage(h: Hero, d: Derived, rng: Rng): number {
  let dam = d.minDam + rng.int(d.maxDam - d.minDam + 1);
  dam = Math.trunc(dam * (100 + d.pctDam) / 100) + d.damMod + d.charDamMod;
  if (h.cls === 'warrior' && !d.bow && rng.int(100) < h.clvl) dam *= 2;
  return Math.max(1, dam);
}
/** Hit recovery (ticks at 20/s): Warrior 6, Rogue 7, Sorcerer 8; reduced by Fast Recovery items. Triggers when damage >= clvl. [JARULF] */
export function hitRecoveryTicks(h: Hero, d: Derived): number {
  const base = { warrior: 6, rogue: 7, sorcerer: 8 }[h.cls];
  const fr = d.flags.has('FASTRECOVER3') ? 3 : d.flags.has('FASTRECOVER2') ? 2 : d.flags.has('FASTRECOVER1') ? 1 : 0;
  return Math.max(2, base - fr);
}
/** Monster enters hit recovery when damage >= mlvl + 3 (monster.cpp M_StartHit). */
export const monsterStunned = (dam: number, mlvl: number) => dam >= mlvl + 3;

/** Firebolt: (Mag/8 + slvl + 1) .. (Mag/8 + slvl + 10). missiles.cpp GetDamageAmt. */
export function fireboltDamage(mag: number, slvl: number): [number, number] { return [(mag >> 3) + slvl + 1, (mag >> 3) + slvl + 10]; }
/** Charged Bolt: 1 .. Mag/4 + 1 per bolt. */
export function chargedBoltDamage(mag: number): [number, number] { return [1, (mag >> 2) + 1]; }
/** Holy Bolt (undead only): clvl + 9 .. clvl + 18. [TEMP] */
export function holyBoltDamage(clvl: number): [number, number] { return [clvl + 9, clvl + 18]; }
/** Healing spell: (rnd10+1) + sum over clvl of (rnd4+1) + sum over slvl of (rnd6+1); x2 Warrior, x1.5 Rogue (AddHeal). */
export function healAmount(h: Hero, slvl: number, rng: Rng): number {
  let v = rng.int(10) + 1;
  for (let i = 0; i < h.clvl; i++) v += rng.int(4) + 1;
  for (let i = 0; i < slvl; i++) v += rng.int(6) + 1;
  if (h.cls === 'warrior') v *= 2;
  if (h.cls === 'rogue') v += v >> 1;
  return v;
}
/** Potion of Healing/Mana: maxX/8 + rnd(maxX/4) (UseItem, 1/64 fixed point); x2 Warrior (life) / Sorcerer (mana), x1.5 Rogue. */
export function potionAmount(h: Hero, max: number, life: boolean, rng: Rng): number {
  const j = Math.floor(max / 4); // (_pMaxHP >> 8) with 1/64 fixed point = maxPoints / 4
  let v = (j >> 1) + rng.int(j);
  if (life && h.cls === 'warrior') v *= 2;
  if (!life && h.cls === 'sorcerer') v *= 2;
  if (h.cls === 'rogue') v += v >> 1;
  return Math.max(1, v);
}

// ---------- experience ----------
/** Experience for a kill: mExp * (1 + (mlvl - clvl)/10), floor, min 0 (AddPlrExperience; multiplayer caps not applied in SP). */
export function killExp(mExp: number, mlvl: number, clvl: number): number {
  return Math.max(0, Math.floor(mExp * (1 + (mlvl - clvl) / 10)));
}
/** Adds experience; returns the number of levels gained. Level up: +5 stat points, life and mana refilled (NextPlrLevel). */
export function addExp(h: Hero, exp: number): number {
  h.exp = Math.min(EXP_LEVELS[EXP_LEVELS.length - 1], h.exp + exp);
  let n = 0;
  while (h.clvl < MAX_CLVL && h.exp >= EXP_LEVELS[h.clvl]) {
    h.clvl++; n++; h.statPts += STAT_POINTS_PER_LEVEL;
    const d = derive(h); h.hp = d.maxHp; h.mana = d.maxMana;
  }
  return n;
}
/** Spend one stat point (capped at the class maximum). Vitality/Magic raise current life/mana too. */
export function spendStat(h: Hero, k: keyof Stats): boolean {
  if (h.statPts <= 0 || h.base[k] >= CLASSES[h.cls].max[k]) return false;
  const before = derive(h);
  h.base[k]++; h.statPts--;
  const after = derive(h);
  h.hp += after.maxHp - before.maxHp; h.mana += after.maxMana - before.maxMana;
  return true;
}

// ---------- inventory ----------
function cellsFree(h: Hero, x: number, y: number, w: number, hh: number, ignore?: Item): boolean {
  if (x < 0 || y < 0 || x + w > INV_W || y + hh > INV_H) return false;
  for (const e of h.inv) {
    if (e.item === ignore) continue;
    if (x < e.x + e.item.w && e.x < x + w && y < e.y + e.item.h && e.y < y + hh) return false;
  }
  return true;
}
/** D1 AutoPlace: first free spot scanning columns of the 10x4 grid. */
export function autoPlace(h: Hero, it: Item): boolean {
  for (let y = 0; y <= INV_H - it.h; y++) for (let x = 0; x <= INV_W - it.w; x++) {
    if (cellsFree(h, x, y, it.w, it.h)) { h.inv.push({ item: it, x, y }); return true; }
  }
  return false;
}
export const isBeltable = (it: Item) => it.w === 1 && it.h === 1 && (it.misc.startsWith('IMISC_') && ['IMISC_HEAL', 'IMISC_FULLHEAL', 'IMISC_MANA', 'IMISC_FULLMANA', 'IMISC_REJUV', 'IMISC_FULLREJUV', 'IMISC_SCROLL', 'IMISC_SCROLLT'].includes(it.misc));
/** Pick up: potions/scrolls go to the belt first when there is room (D1 v1.09 AutoPlace belt), else the grid. */
export function pickUp(h: Hero, it: Item): boolean {
  if (it.itype === 'ITYPE_GOLD') { h.gold += it.gold ?? 0; return true; }
  if (isBeltable(it)) { const i = h.belt.indexOf(null); if (i >= 0) { h.belt[i] = it; return true; } }
  return autoPlace(h, it);
}
export function removeItem(h: Hero, it: Item) {
  h.inv = h.inv.filter((e) => e.item !== it);
  for (const s of BODY_SLOTS) if (h.body[s] === it) h.body[s] = null;
  h.belt = h.belt.map((b) => (b === it ? null : b));
}
export function allItems(h: Hero): Item[] {
  return [...BODY_SLOTS.map((s) => h.body[s]), ...h.inv.map((e) => e.item), ...h.belt].filter((i): i is Item => !!i);
}
export function slotsFor(it: Item): BodySlot[] {
  switch (it.loc) {
    case 'ILOC_HELM': return ['head'];
    case 'ILOC_AMULET': return ['amulet'];
    case 'ILOC_ARMOR': return ['chest'];
    case 'ILOC_RING': return ['ringL', 'ringR'];
    case 'ILOC_ONEHAND': return it.itype === 'ITYPE_SHIELD' ? ['handR', 'handL'] : ['handL', 'handR'];
    case 'ILOC_TWOHAND': return ['handL'];
    default: return [];
  }
}
/** Equip from inventory; swaps out what is there. Two-handed weapons need both hands free (displaced items go to the pack). */
export function equip(h: Hero, it: Item): string | null {
  const slots = slotsFor(it);
  if (!slots.length) return 'Cannot equip that';
  if (!reqOk(h, it, derive(h))) return 'You do not meet the requirements';
  let slot = slots.find((s) => !h.body[s]) ?? slots[0];
  const out: Item[] = [];
  if (it.loc === 'ILOC_TWOHAND') { slot = 'handL'; for (const s of ['handL', 'handR'] as const) if (h.body[s]) out.push(h.body[s]!); }
  else {
    if (h.body[slot]) out.push(h.body[slot]!);
    const other = slot === 'handL' ? 'handR' : slot === 'handR' ? 'handL' : null;
    if (other && h.body[other]?.loc === 'ILOC_TWOHAND') out.push(h.body[other]!);
    if (other && it.itype !== 'ITYPE_SHIELD' && h.body[other] && h.body[other]!.itype !== 'ITYPE_SHIELD') out.push(h.body[other]!);
  }
  removeItem(h, it);
  for (const o of out) removeItem(h, o);
  h.body[slot] = it;
  for (const o of out) if (!autoPlace(h, o)) { removeItem(h, it); h.body[slot] = o; autoPlace(h, it); return 'No room in your pack'; }
  clampVitals(h);
  return null;
}
export function unequip(h: Hero, it: Item): string | null {
  const slot = BODY_SLOTS.find((s) => h.body[s] === it);
  if (!slot) return null;
  h.body[slot] = null;
  if (!autoPlace(h, it)) { h.body[slot] = it; return 'No room in your pack'; }
  clampVitals(h);
  return null;
}
export function clampVitals(h: Hero) {
  const d = derive(h);
  h.hp = Math.min(h.hp, d.maxHp); h.mana = Math.min(h.mana, d.maxMana);
}
/** Durability loss; at 0 the item breaks and is destroyed (D1). Returns broken item name. */
export function wear(h: Hero, it: Item | null): string | null {
  if (!it || it.maxDur === 0 || it.dur === DUR_INDESTRUCTIBLE) return null;
  it.dur--;
  if (it.dur <= 0) { removeItem(h, it); clampVitals(h); return it.identified ? it.iname : it.name; }
  return null;
}
/** Warrior Repair skill: restores durability but each pass lowers max durability by maxdur/(clvl+9) (RepairItem). [TEMP] */
export function repairSkill(it: Item, clvl: number, rng: Rng): boolean {
  if (it.dur === it.maxDur || it.maxDur === DUR_INDESTRUCTIBLE || it.maxDur <= 0) return false;
  let d = 0;
  do {
    d += clvl + rng.int(clvl);
    const dm = Math.max(1, Math.floor(it.maxDur / (clvl + 9)));
    it.maxDur -= dm;
    if (it.maxDur <= 0) { it.maxDur = 0; it.dur = 0; return true; }
  } while (d + it.dur < it.maxDur);
  it.dur = Math.min(it.maxDur, it.dur + d);
  return true;
}
/** Sorcerer Recharge Staff: each pass adds rnd(clvl/bookLvl)+1 charges and lowers max charges by 1 (RechargeItem). [TEMP] */
export function rechargeSkill(it: Item, clvl: number, bookLvl: number, rng: Rng): boolean {
  if (it.itype !== 'ITYPE_STAFF' || !it.maxCharges || it.charges >= it.maxCharges) return false;
  const r = rng.int(Math.max(1, Math.floor(clvl / Math.max(1, bookLvl)))) + 1;
  do { it.maxCharges--; it.charges += r; } while (it.charges < it.maxCharges);
  it.charges = Math.min(it.charges, it.maxCharges);
  return true;
}
