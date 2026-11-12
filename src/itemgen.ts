// D1 v1.09 item creation, ported from devilution Source/items.cpp (GetItemAttrs, SetupAllItems, GetItemBonus,
// GetItemPower, SaveItemPower, PLVal, CalcItemValue, GetStaffSpell, GetBookSpell, ItemRndDur, RndItem,
// RndAllItems, store spawns). Unique items: only the Butcher's Cleaver (CheckUnique for other uniques is not run: deviation).
import { BASE, IDI, PREFIXES, SUFFIXES, itemSize, type Affix, type BaseItem } from './data/items';
import { SPELLS, SPELL_BY_D1, type SpellDef } from './data/spells';
import type { Rng } from './rng';

export const DUR_INDESTRUCTIBLE = 255;
let uidSeq = 1;
export function nextUid() { return uidSeq++; }
export function setUidSeq(n: number) { uidSeq = Math.max(uidSeq, n); }

export interface Item {
  uid: number; idx: number; name: string; iname: string;
  magical: 0 | 1 | 2; identified: boolean;
  itype: string; loc: string; misc: string; w: number; h: number;
  ac: number; minDam: number; maxDam: number; dur: number; maxDur: number;
  minStr: number; minMag: number; minDex: number;
  toHit: number; pctDam: number; pctAC: number; str: number; mag: number; dex: number; vit: number;
  life: number; mana: number; fr: number; lr: number; mr: number; damMod: number; getHit: number;
  light: number; splLvlAdd: number; targAc: number; fMin: number; fMax: number; lMin: number; lMax: number;
  flags: string[]; spell: string; charges: number; maxCharges: number;
  value: number; ivalue: number; vadd1: number; vmult1: number; vadd2: number; vmult2: number;
  pre: string; suf: string; gold?: number;
}

export function getItemAttrs(rng: Rng, idx: number, lvl: number, dlvl = 1): Item {
  const b = BASE[idx];
  const [w, h] = itemSize(b);
  const it: Item = {
    uid: nextUid(), idx, name: b.iName, iname: b.iName, magical: 0, identified: false,
    itype: b.itype, loc: b.iLoc, misc: b.iMiscId, w, h,
    ac: b.iMinAC + rng.int(b.iMaxAC - b.iMinAC + 1), minDam: b.iMinDam, maxDam: b.iMaxDam,
    dur: b.iDurability, maxDur: b.iDurability, minStr: b.iMinStr, minMag: b.iMinMag, minDex: b.iMinDex,
    toHit: 0, pctDam: 0, pctAC: 0, str: 0, mag: 0, dex: 0, vit: 0, life: 0, mana: 0, fr: 0, lr: 0, mr: 0,
    damMod: 0, getHit: 0, light: 0, splLvlAdd: 0, targAc: 0, fMin: 0, fMax: 0, lMin: 0, lMax: 0,
    flags: [], spell: b.iSpell, charges: 0, maxCharges: 0, value: b.iValue, ivalue: b.iValue,
    vadd1: 0, vmult1: 0, vadd2: 0, vmult2: 0, pre: '', suf: '',
  };
  if (b.iMiscId === 'IMISC_BOOK') getBookSpell(rng, it, lvl);
  if (b.itype === 'ITYPE_GOLD') it.gold = goldRoll(rng, dlvl);
  if (idx === IDI.SORCEROR) { it.charges = 40; it.maxCharges = 40; } // [TEMP] CreatePlrItems sets 40 charges
  return it;
}
/** Gold pile on normal difficulty: 5*dlvl + rnd(10*dlvl), max 5000. */
export function goldRoll(rng: Rng, dlvl: number) { return Math.min(5000, 5 * dlvl + rng.int(10 * dlvl)); }
export function goldItem(amount: number): Item {
  const it = getItemAttrs({ int: () => 0 } as unknown as Rng, IDI.GOLD, 1);
  it.gold = amount; it.name = it.iname = `${amount} gold`;
  return it;
}

function spellD1(id: string): SpellDef | undefined { return SPELL_BY_D1[id]; }

export function getBookSpell(rng: Rng, it: Item, lvl: number) {
  if (lvl === 0) lvl = 1;
  if (lvl > 5) lvl = 5;
  const ok = Object.values(SPELLS).filter((s) => s.bookLvl !== -1 && lvl >= s.bookLvl && s.inSP);
  const s = ok[rng.int(ok.length)];
  it.name += s.name; it.iname = it.name; it.spell = s.d1; it.minMag = s.minMag;
  it.value += s.bookCost; it.ivalue += s.bookCost;
}

export function getStaffSpell(rng: Rng, it: Item, lvl: number, onlygood: boolean) {
  if (rng.int(4) === 0) { getItemPower(rng, it, lvl >> 1, lvl, 'PLT_STAFF', onlygood); return; }
  let l = lvl >> 1; if (l === 0) l = 1;
  const ok = Object.values(SPELLS).filter((s) => s.staffLvl !== -1 && l >= s.staffLvl && s.inSP);
  const s = ok[rng.int(ok.length)];
  it.name = `${it.name} of ${s.name}`; it.iname = it.name;
  it.spell = s.d1;
  it.charges = s.staffMin + rng.int(s.staffMax - s.staffMin + 1); it.maxCharges = it.charges;
  it.minMag = s.minMag;
  const v = Math.floor(it.charges * s.staffCost / 5);
  it.value += v; it.ivalue += v;
  // GetStaffPower: 1 in 10 chance of a prefix on top. [TEMP] simplified (no GOE check against the spell).
  if (rng.int(10) === 0) getItemPower(rng, it, lvl >> 1, lvl, 'PLT_STAFF', onlygood, true);
}

function plVal(pv: number, p1: number, p2: number, minv: number, maxv: number) {
  if (p1 === p2 || minv === maxv) return minv;
  return minv + Math.trunc((maxv - minv) * Math.trunc(100 * (pv - p1) / (p2 - p1)) / 100);
}
const rndPL = (rng: Rng, a: number, b: number) => a + rng.int(b - a + 1);

export function saveItemPower(rng: Rng, it: Item, a: Affix) {
  const { p1, p2 } = a;
  let r = rndPL(rng, p1, p2), r2 = 0;
  switch (a.power) {
    case 'IPL_TOHIT': it.toHit += r; break;
    case 'IPL_TOHIT_CURSE': it.toHit -= r; break;
    case 'IPL_DAMP': it.pctDam += r; break;
    case 'IPL_DAMP_CURSE': it.pctDam -= r; break;
    case 'IPL_TOHIT_DAMP': {
      r = rndPL(rng, p1, p2); it.pctDam += r;
      const t: Record<number, [number, number]> = { 20: [1, 5], 36: [6, 10], 51: [11, 15], 66: [16, 20], 81: [21, 30], 96: [31, 40], 111: [41, 50], 126: [51, 75], 151: [76, 100] };
      if (t[p1]) r2 = rndPL(rng, ...t[p1]);
      it.toHit += r2; it.minStr = 0; break;
    }
    case 'IPL_TOHIT_DAMP_CURSE': it.pctDam -= r; r2 = p1 === 25 ? rndPL(rng, 1, 5) : p1 === 50 ? rndPL(rng, 6, 10) : 0; it.toHit -= r2; break;
    case 'IPL_ACP': it.pctAC += r; break;
    case 'IPL_ACP_CURSE': it.pctAC -= r; break;
    case 'IPL_FIRERES': it.fr += r; break;
    case 'IPL_LIGHTRES': it.lr += r; break;
    case 'IPL_MAGICRES': it.mr += r; break;
    case 'IPL_ALLRES': it.fr = Math.max(0, it.fr + r); it.lr = Math.max(0, it.lr + r); it.mr = Math.max(0, it.mr + r); break;
    case 'IPL_SPLLVLADD': it.splLvlAdd = r; break;
    case 'IPL_CHARGES': it.charges *= p1; it.maxCharges = it.charges; break;
    case 'IPL_FIREDAM': it.flags.push('FIREDAM'); it.fMin = p1; it.fMax = p2; break;
    case 'IPL_LIGHTDAM': it.flags.push('LIGHTDAM'); it.lMin = p1; it.lMax = p2; break;
    case 'IPL_STR': it.str += r; break;
    case 'IPL_STR_CURSE': it.str -= r; break;
    case 'IPL_MAG': it.mag += r; break;
    case 'IPL_MAG_CURSE': it.mag -= r; break;
    case 'IPL_DEX': it.dex += r; break;
    case 'IPL_DEX_CURSE': it.dex -= r; break;
    case 'IPL_VIT': it.vit += r; break;
    case 'IPL_VIT_CURSE': it.vit -= r; break;
    case 'IPL_ATTRIBS': it.str += r; it.mag += r; it.dex += r; it.vit += r; break;
    case 'IPL_ATTRIBS_CURSE': it.str -= r; it.mag -= r; it.dex -= r; it.vit -= r; break;
    case 'IPL_GETHIT_CURSE': it.getHit += r; break;
    case 'IPL_GETHIT': it.getHit -= r; break;
    case 'IPL_LIFE': it.life += r; break;
    case 'IPL_LIFE_CURSE': it.life -= r; break;
    case 'IPL_MANA': it.mana += r; break;
    case 'IPL_MANA_CURSE': it.mana -= r; break;
    case 'IPL_DUR': r2 = Math.trunc(r * it.maxDur / 100); it.maxDur += r2; it.dur += r2; break;
    case 'IPL_DUR_CURSE': it.maxDur = Math.max(1, it.maxDur - Math.trunc(r * it.maxDur / 100)); it.dur = it.maxDur; break;
    case 'IPL_INDESTRUCTIBLE': it.dur = it.maxDur = DUR_INDESTRUCTIBLE; break;
    case 'IPL_LIGHT': it.light += p1; break;
    case 'IPL_LIGHT_CURSE': it.light -= p1; break;
    case 'IPL_FIRE_ARROWS': it.flags.push('FIRE_ARROWS'); it.fMin = p1; it.fMax = p2; break;
    case 'IPL_LIGHT_ARROWS': it.flags.push('LIGHT_ARROWS'); it.lMin = p1; it.lMax = p2; break;
    case 'IPL_TARGAC': it.targAc += r; break;
    case 'IPL_DAMMOD': it.damMod += r; break;
    case 'IPL_FASTATTACK': it.flags.push(`FASTATTACK${p1}`); break;
    case 'IPL_FASTRECOVER': it.flags.push(`FASTRECOVER${p1}`); break;
    case 'IPL_STEALMANA': it.flags.push(`STEALMANA${p1}`); break;
    case 'IPL_STEALLIFE': it.flags.push(`STEALLIFE${p1}`); break;
    default: it.flags.push(a.power.replace('IPL_', '')); // THORNS, NOMANA, ABSHALFTRAP, KNOCKBACK, FASTBLOCK
  }
  if (it.vadd1 || it.vmult1) { it.vadd2 = plVal(r, p1, p2, a.minval, a.maxval); it.vmult2 = a.mult; }
  else { it.vadd1 = plVal(r, p1, p2, a.minval, a.maxval); it.vmult1 = a.mult; }
}

export function calcItemValue(it: Item) {
  let v = it.vmult1 + it.vmult2;
  if (v > 0) v *= it.value;
  if (v < 0) v = Math.trunc(it.value / v);
  v = it.vadd1 + it.vadd2 + v;
  it.ivalue = Math.max(1, v);
}

export function getItemPower(rng: Rng, it: Item, minlvl: number, maxlvl: number, flg: string, onlygood: boolean, prefixOnly = false) {
  let pre = rng.int(4), post = rng.int(3);
  if (prefixOnly) { pre = 0; post = 0; }
  if (pre !== 0 && post === 0) { if (rng.int(2) !== 0) post = 1; else pre = 0; }
  let goe = 'GOE_ANY';
  if (!onlygood && rng.int(3) !== 0) onlygood = true;
  let pa: Affix | null = null, sa: Affix | null = null;
  if (pre === 0) {
    const l: Affix[] = [];
    for (const p of PREFIXES) {
      if (p.itype.includes(flg) && p.minlvl >= minlvl && p.minlvl <= maxlvl && (!onlygood || p.ok) && (flg !== 'PLT_STAFF' || p.power !== 'IPL_CHARGES' || prefixOnly)) {
        l.push(p); if (p.double) l.push(p);
      }
    }
    if (l.length) { pa = l[rng.int(l.length)]; it.iname = `${pa.name} ${it.iname}`; it.magical = 1; saveItemPower(rng, it, pa); it.pre = pa.name; goe = pa.goe; }
  }
  if (post !== 0) {
    const l = SUFFIXES.filter((s) => s.itype.includes(flg) && s.minlvl >= minlvl && s.minlvl <= maxlvl
      && !((goe === 'GOE_GOOD' && s.goe === 'GOE_EVIL') || (goe === 'GOE_EVIL' && s.goe === 'GOE_GOOD')) && (!onlygood || s.ok));
    if (l.length) { sa = l[rng.int(l.length)]; it.iname = `${it.iname} of ${sa.name}`; it.magical = 1; saveItemPower(rng, it, sa); it.suf = sa.name; }
  }
  if (pa || sa) calcItemValue(it);
}

export function getItemBonus(rng: Rng, it: Item, minlvl: number, maxlvl: number, onlygood: boolean) {
  if (it.itype === 'ITYPE_GOLD') return;
  if (minlvl > 25) minlvl = 25;
  switch (it.itype) {
    case 'ITYPE_SWORD': case 'ITYPE_AXE': case 'ITYPE_MACE': getItemPower(rng, it, minlvl, maxlvl, 'PLT_WEAP', onlygood); break;
    case 'ITYPE_BOW': getItemPower(rng, it, minlvl, maxlvl, 'PLT_BOW', onlygood); break;
    case 'ITYPE_SHIELD': getItemPower(rng, it, minlvl, maxlvl, 'PLT_SHLD', onlygood); break;
    case 'ITYPE_LARMOR': case 'ITYPE_HELM': case 'ITYPE_MARMOR': case 'ITYPE_HARMOR': getItemPower(rng, it, minlvl, maxlvl, 'PLT_ARMO', onlygood); break;
    case 'ITYPE_STAFF': getStaffSpell(rng, it, maxlvl, onlygood); break;
    case 'ITYPE_RING': case 'ITYPE_AMULET': getItemPower(rng, it, minlvl, maxlvl, 'PLT_MISC', onlygood); break;
  }
}

export function itemRndDur(rng: Rng, it: Item) {
  if (it.dur && it.dur !== DUR_INDESTRUCTIBLE) it.dur = rng.int(it.maxDur >> 1) + (it.maxDur >> 2) + 1;
}

/** SetupAllItems for a dropped item. uper 15 = unique monster drop. */
export function setupAllItems(rng: Rng, idx: number, lvl: number, uper: number, onlygood: boolean, dlvl = 1): Item {
  const it = getItemAttrs(rng, idx, lvl >> 1, dlvl);
  if (it.misc !== 'IMISC_UNIQUE') {
    let iblvl = -1;
    if (rng.int(100) <= 10 || rng.int(100) <= lvl) iblvl = lvl;
    if (iblvl === -1 && (it.misc === 'IMISC_STAFF' || it.misc === 'IMISC_RING' || it.misc === 'IMISC_AMULET')) iblvl = lvl;
    if (onlygood) iblvl = lvl;
    if (uper === 15) iblvl = lvl + 4;
    if (iblvl !== -1) getItemBonus(rng, it, iblvl >> 1, iblvl, onlygood);
    itemRndDur(rng, it);
  }
  if (it.magical === 0) it.identified = true; // normal items need no identify
  it.iname = it.magical ? it.iname : it.name;
  return it;
}

const dropable = (b: BaseItem) => b.iRnd !== 'IDROP_NEVER' && b.iSpell !== 'SPL_RESURRECT' && b.iSpell !== 'SPL_HEALOTHER';
/** RndItem(m): monster drop. Returns -1 none, 0 gold, else base index. 40% drop, of which 74% gold (v1.09 SP). */
export function rndMonsterItem(rng: Rng, mlvl: number): number {
  if (rng.int(100) > 40) return -1;
  if (rng.int(100) > 25) return 0;
  const l: number[] = [];
  BASE.forEach((b, i) => { if (i && dropable(b) && mlvl >= b.iMinMLvl) { l.push(i); if (b.iRnd === 'IDROP_DOUBLE') l.push(i); } });
  return l[rng.int(l.length)];
}
/** RndAllItems for chests/sarcophagi/barrels (ilvl = 2*dlvl): 74% gold. */
export function rndAllItems(rng: Rng, dlvl: number): number {
  if (rng.int(100) > 25) return 0;
  const l: number[] = [];
  BASE.forEach((b, i) => { if (i && dropable(b) && 2 * dlvl >= b.iMinMLvl) l.push(i); });
  return l[rng.int(l.length)];
}
/** SetupAllUseful (D1 v1.09): healing or mana potion 50/50; below dlvl 1 one in three becomes a town portal scroll. (Order 10 U12 audit: was 50/25/25.) */
export function rndUseful(rng: Rng, lvl = 1): number {
  let idx = rng.int(2) ? IDI.HEAL : IDI.MANA;
  if (lvl > 1 && rng.int(3) === 0) idx = IDI.PORTAL;
  return idx;
}
export function makeDrop(rng: Rng, idx: number, ilvl: number, dlvl: number, unique = false): Item {
  if (idx === 0) return goldItem(goldRoll(rng, dlvl));
  return setupAllItems(rng, idx, ilvl, unique ? 15 : 1, unique, dlvl);
}

export function butcherCleaver(rng: Rng): Item {
  const it = getItemAttrs(rng, IDI.CLEAVER, 10);
  it.magical = 2; it.identified = false; it.iname = "The Butcher's Cleaver";
  it.str += 10; it.minDam = 4; it.maxDam = 24; it.dur = it.maxDur = 10; it.ivalue = 3650; // UniqueItemList "The Butcher's Cleaver"
  return it;
}

// ---- Stores (SetupTownStores: smith/witch/healer at lvl = clamp(maxVisitedDlvl+2, 6, 16); boy/premium at clvl) ----
const smithOk = (b: BaseItem) => !['ITYPE_MISC', 'ITYPE_GOLD', 'ITYPE_FOOD', 'ITYPE_STAFF', 'ITYPE_RING', 'ITYPE_AMULET'].includes(b.itype);
const premiumOk = (b: BaseItem) => !['ITYPE_MISC', 'ITYPE_GOLD', 'ITYPE_FOOD', 'ITYPE_STAFF'].includes(b.itype);
const witchOk = (b: BaseItem) => (b.itype === 'ITYPE_MISC' || b.itype === 'ITYPE_STAFF')
  && !['IMISC_MANA', 'IMISC_FULLMANA', 'IMISC_FULLHEAL', 'IMISC_HEAL'].includes(b.iMiscId) && b.iSpell !== 'SPL_TOWN'
  && b.iSpell !== 'SPL_RESURRECT' && b.iSpell !== 'SPL_HEALOTHER';
const healerOk = (b: BaseItem) => b.itype === 'ITYPE_MISC' && (
  (b.iMiscId === 'IMISC_SCROLL' && b.iSpell === 'SPL_HEAL') || ['IMISC_ELIXSTR', 'IMISC_ELIXMAG', 'IMISC_ELIXDEX', 'IMISC_ELIXVIT', 'IMISC_REJUV', 'IMISC_FULLREJUV'].includes(b.iMiscId));
function pool(ok: (b: BaseItem) => boolean, lvl: number, dbl: boolean): number[] {
  const l: number[] = [];
  BASE.forEach((b, i) => { if (i && b.iRnd !== 'IDROP_NEVER' && ok(b) && lvl >= b.iMinMLvl) { l.push(i); if (dbl && b.iRnd === 'IDROP_DOUBLE') l.push(i); } });
  return l;
}
function sortStore(a: Item[]) { a.sort((x, y) => x.idx - y.idx); return a; }
export function storeLevel(maxVisited: number) { return Math.min(16, Math.max(6, maxVisited + 2)); }

export function spawnSmith(rng: Rng, lvl: number): Item[] {
  const n = rng.int(20 - 10) + 10, out: Item[] = [], p = pool(smithOk, lvl, true);
  for (let i = 0; i < n; i++) {
    let it: Item;
    do { it = getItemAttrs(rng, p[rng.int(p.length)], lvl); } while (it.ivalue > 140000);
    it.identified = true; out.push(it);
  }
  return sortStore(out);
}
const premiumAdd = [-1, -1, 0, 0, 1, 2];
export function spawnOnePremium(rng: Rng, plvl: number): Item {
  plvl = Math.min(30, Math.max(1, plvl));
  const l: number[] = [];
  BASE.forEach((b, i) => { if (i && b.iRnd !== 'IDROP_NEVER' && premiumOk(b) && b.iMinMLvl >= plvl >> 2 && b.iMinMLvl <= plvl) l.push(i); });
  let it: Item;
  do { it = getItemAttrs(rng, l[rng.int(l.length)], plvl); getItemBonus(rng, it, plvl >> 1, plvl, true); } while (it.ivalue > 140000);
  it.identified = true;
  return it;
}
export function spawnPremium(rng: Rng, clvl: number, prev?: { items: (Item | null)[]; level: number }) {
  const st = prev ?? { items: [null, null, null, null, null, null] as (Item | null)[], level: 1 };
  for (let i = 0; i < 6; i++) if (!st.items[i]) st.items[i] = spawnOnePremium(rng, st.level + premiumAdd[i]);
  while (st.level < clvl) {
    st.level++;
    st.items[0] = st.items[2]; st.items[1] = st.items[3]; st.items[2] = st.items[4];
    st.items[3] = spawnOnePremium(rng, st.level + premiumAdd[3]);
    st.items[4] = st.items[5];
    st.items[5] = spawnOnePremium(rng, st.level + premiumAdd[5]);
  }
  return st;
}
export function spawnWitch(rng: Rng, lvl: number): Item[] {
  const out: Item[] = [IDI.MANA, IDI.FULLMANA, IDI.PORTAL].map((i) => { const it = getItemAttrs(rng, i, 1); it.identified = true; return it; });
  const n = rng.int(8) + 10, p = pool(witchOk, lvl, false);
  for (let i = 3; i < n; i++) {
    let it: Item;
    do {
      it = getItemAttrs(rng, p[rng.int(p.length)], lvl);
      let maxlvl = -1;
      if (rng.int(100) <= 5) maxlvl = 2 * lvl;
      if (maxlvl === -1 && it.misc === 'IMISC_STAFF') maxlvl = 2 * lvl;
      if (maxlvl !== -1) getItemBonus(rng, it, maxlvl >> 1, maxlvl, true);
    } while (it.ivalue > 140000);
    it.identified = true; out.push(it);
  }
  return [...out.slice(0, 3), ...sortStore(out.slice(3))];
}
export function spawnHealer(rng: Rng, lvl: number): Item[] {
  const out: Item[] = [IDI.HEAL, IDI.FULLHEAL].map((i) => { const it = getItemAttrs(rng, i, 1); it.identified = true; return it; });
  const n = rng.int(8) + 10, p = pool(healerOk, lvl, false);
  for (let i = 2; i < n; i++) { const it = getItemAttrs(rng, p[rng.int(p.length)], lvl); it.identified = true; out.push(it); }
  return [...out.slice(0, 2), ...sortStore(out.slice(2))];
}
export function spawnBoy(rng: Rng, clvl: number): Item {
  const p = pool(premiumOk, clvl, false);
  let it: Item;
  do { it = getItemAttrs(rng, p[rng.int(p.length)], clvl); getItemBonus(rng, it, clvl, 2 * clvl, true); } while (it.ivalue > 90000);
  it.identified = true;
  return it;
}

// ---- Prices (stores.cpp) ----
export function itemPrice(it: Item) { return it.magical && it.identified ? it.ivalue : it.value; }
/** Selling: value / 4 (identified magic uses the magic value), at least 1. [TEMP] unidentified magic sells at base value/4. */
export function sellPrice(it: Item) { return Math.max(1, Math.floor(itemPrice(it) / 4)); }
/** Wirt's price: +50% [TEMP]; seeing his item costs 50 gold (D1). */
export function boyPrice(it: Item) { return itemPrice(it) + (itemPrice(it) >> 1); }
/** Griswold repair cost: (maxdur - dur) share of value; magic items 30% of value. [TEMP] from stores.cpp memory. */
export function repairCost(it: Item) {
  const due = it.maxDur - it.dur;
  if (due <= 0 || it.maxDur === DUR_INDESTRUCTIBLE) return 0;
  if (it.magical && it.identified) return Math.max(1, Math.floor(30 * it.ivalue * due / (100 * it.maxDur)));
  return Math.max(1, Math.floor(it.value * due / (2 * it.maxDur)));
}
export const IDENTIFY_COST = 100;
/** Adria recharge cost: spell staff cost scaled by missing charges + value/2. [TEMP] */
export function rechargeCost(it: Item) {
  const s = spellD1(it.spell);
  if (!s || it.charges >= it.maxCharges) return 0;
  return Math.floor((s.staffCost * (it.maxCharges - it.charges)) / (it.maxCharges * 2)) + (it.value >> 1);
}
