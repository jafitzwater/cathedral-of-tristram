// Game simulation: town + Cathedral L1, D1 v1.09 rules (see player.ts, itemgen.ts for formulas and sources).
import { CLASSES, type ClassId } from './data/classes';
import { MONSTERS, spHp, type MonsterDef } from './data/monsters';
import { SPELLS, SPELL_BY_D1, CASTABLE, spellMana } from './data/spells';
import { BASE, IDI } from './data/items';
import { SHRINE_TEXT } from './data/shrines';
import { NPC_TEXT } from './data/npcs';
import { findPath } from './path';
import { DIRS, dirOf, type P } from './iso';
import { pickTarget, stickDir, faceToward, moveCircle, screenToWorldDir, HERO_RADIUS, MON_RADIUS, interactFor, type Joy, type Interact } from './controls';
import { Rng } from './rng';
import { T, WALKABLE, at, setT, type LevelMap, type Obj } from './levels/types';
import { makeTown, NPCS, SEALED, TOWN_FROM_CATHEDRAL, TOWN_PORTAL_SPOT, TOWN_START, type NpcDef } from './levels/town';
import { generateL1 } from './levels/cathedral';
import {
  type Item, getItemAttrs, goldItem, makeDrop, rndAllItems, rndMonsterItem, rndUseful, butcherCleaver,
  spawnSmith, spawnWitch, spawnHealer, spawnBoy, spawnPremium, storeLevel, DUR_INDESTRUCTIBLE,
} from './itemgen';
import {
  type Hero, type Derived, BODY_SLOTS, derive, newHero, meleeToHit, bowToHit, spellToHit, monsterToHit, blockChance, rollDamage,
  hitRecoveryTicks, monsterStunned, fireboltDamage, chargedBoltDamage, holyBoltDamage, healAmount, potionAmount, killExp, addExp,
  pickUp, removeItem, allItems, wear, clampVitals, repairSkill, rechargeSkill, reqOk, autoPlace,
} from './player';

export const TICK = 1 / 20; // D1 game tick
export const WALK_TICKS = 8; // [JARULF] one tile per 8 ticks (town and dungeon in v1.09)
/** Order 9b: hero analog walk speed in world tiles per second (D1: one tile per WALK_TICKS ticks). */
export const WALK_SPEED = 1 / (WALK_TICKS * TICK);
/** Attack animation length in ticks [TEMP: Jarulf weapon-speed table not re-checked]. */
const ATTACK_TICKS: Record<ClassId, { melee: number; bow: number; cast: number }> = {
  warrior: { melee: 16, bow: 16, cast: 20 }, rogue: { melee: 18, bow: 12, cast: 16 }, sorcerer: { melee: 16, bow: 20, cast: 12 },
};

export type LevelId = 'town' | 'l1';
export interface Actor { x: number; y: number; tx: number; ty: number; dir: number; path: P[]; prog: number; state: 'idle' | 'walk' | 'attack' | 'hit' | 'cast' | 'block' | 'dead'; t: number; stepT: number }
export interface Mon extends Actor { uid: number; def: MonsterDef; hp: number; maxHp: number; alive: boolean; active: boolean; fleeT: number; spoke: boolean; dealt: boolean; deathT: number; flash: number; staggerCd?: number }
export interface GroundItem { item: Item; x: number; y: number }
export interface Missile { kind: 'firebolt' | 'cbolt' | 'arrow' | 'hbolt' | 'lightning'; x: number; y: number; vx: number; vy: number; life: number; dmg: [number, number]; fire: [number, number]; light: [number, number]; toHit: number; wander?: number }
export interface Level { id: LevelId; dlvl: number; map: LevelMap; explored: Uint8Array; monsters: Mon[]; items: GroundItem[]; corpses: P[] }
export type Target =
  | { kind: 'mon'; m: Mon } | { kind: 'npc'; npc: NpcDef } | { kind: 'item'; g: GroundItem } | { kind: 'obj'; o: Obj }
  | { kind: 'door'; x: number; y: number } | { kind: 'tile'; x: number; y: number } | { kind: 'stairs'; x: number; y: number };
export interface Stores { smith: Item[]; premium: { items: (Item | null)[]; level: number }; witch: Item[]; healer: Item[]; boy: Item | null; boyLevel: number }
export interface Float { text: string; x: number; y: number; t: number; color: string }
export type SfxEvent = string;

/** Order 10 U12 (Joseph): +25% experience for Cathedral level 1 kills (D1: x1). */
export const L1_EXP_BONUS = 1.25;

export class Game {
  rng: Rng;
  hero: Hero;
  levels: Partial<Record<LevelId, Level>> = {};
  cur: LevelId = 'town';
  p: Actor;
  target: Target | null = null;
  quests = { butcher: 'inactive' as 'inactive' | 'active' | 'done' };
  stores!: Stores;
  portal: { x: number; y: number; fx?: number; fy?: number } | null = null; // dungeon-side town portal (fx/fy: the exact cast spot)
  l1Seed: number;
  msg = ''; msgT = 0; msgSub = '';
  floats: Float[] = [];
  missiles: Missile[] = [];
  sfx: SfxEvent[] = [];
  dialog: { npc: NpcDef; text: string } | null = null;
  speech: { text: string; t: number } | null = null;
  dead = false;
  pendingLevel: { to: LevelId; at: P; exact?: P } | null = null;
  manaShield = false;
  townDead = new Set<string>(); // NPCs gone (the wounded townsman dies after his message)
  monUid = 1;
  // ---- Immortal-style input state (set by main.ts every frame) ----
  move: Joy | null = null;      // joystick vector, screen space
  attackHeld = false;           // ATTACK button held
  lockId: number | null = null; // soft-locked monster uid (target ring)
  lastMoveDir = -1;
  actTotal = 1;                 // length of the current attack/cast (recovery overlay)
  d!: Derived;

  constructor(name: string, cls: ClassId, seed = Date.now() >>> 0) {
    this.rng = new Rng(seed);
    this.l1Seed = (seed * 2654435761) >>> 0;
    this.hero = newHero(name, cls, this.rng);
    this.p = actorAt(TOWN_START.x, TOWN_START.y);
    this.levels.town = this.makeLevel('town');
    this.restock();
    this.refresh();
  }

  get level(): Level { return this.levels[this.cur]!; }
  refresh() { this.d = derive(this.hero); }
  say(s: string, t = 2.5, sub = '') { this.msg = s; this.msgT = t; this.msgSub = sub; }
  /** U7: a shrine's D1 line with its plain-English effect underneath (again when a used shrine is tapped). */
  sayShrine(name: string) { const t = SHRINE_TEXT[name]; if (t) this.say(t.say, 5, `${name} Shrine: ${t.effect}`); }
  float(text: string, x: number, y: number, color = '#fff') { this.floats.push({ text, x, y, t: 1, color }); }

  makeLevel(id: LevelId): Level {
    const map = id === 'town' ? makeTown() : generateL1(this.l1Seed);
    const lv: Level = { id, dlvl: id === 'town' ? 0 : 1, map, explored: new Uint8Array(map.w * map.h), monsters: [], items: [], corpses: [] };
    if (id === 'town') lv.explored.fill(1);
    for (const s of map.monsterSpots) lv.monsters.push(this.spawnMon(MONSTERS[s.id], s.x, s.y));
    return lv;
  }
  spawnMon(def: MonsterDef, x: number, y: number): Mon {
    const roll = def.hp[0] + this.rng.int(def.hp[1] - def.hp[0] + 1);
    const hp = spHp(roll, def.unique);
    return { ...actorAt(x, y), uid: this.monUid++, def, hp, maxHp: hp, alive: true, active: false, fleeT: 0, spoke: false, dealt: false, deathT: 0, flash: 0 };
  }

  /** Town stores restock on every return to town (SetupTownStores). */
  restock() {
    const lvl = storeLevel(this.hero.maxDlvl);
    const prevBoy = this.stores?.boy ?? null, prevBoyLevel = this.stores?.boyLevel ?? 0;
    const premium = spawnPremium(this.rng, this.hero.clvl, this.stores?.premium);
    const needBoy = prevBoyLevel < (this.hero.clvl >> 1) || !prevBoy;
    this.stores = {
      smith: spawnSmith(this.rng, lvl), premium, witch: spawnWitch(this.rng, lvl), healer: spawnHealer(this.rng, lvl),
      boy: needBoy ? spawnBoy(this.rng, this.hero.clvl) : prevBoy, boyLevel: needBoy ? this.hero.clvl >> 1 : prevBoyLevel,
    };
  }

  // ---------------- queries ----------------
  npcs(): NpcDef[] { return this.cur === 'town' ? NPCS.filter((n) => !this.townDead.has(n.id) && (n.id !== 'wounded' || this.quests.butcher === 'inactive')) : []; }
  tileWalk(x: number, y: number): boolean {
    const m = this.level.map;
    return x >= 0 && y >= 0 && x < m.w && y < m.h && WALKABLE.has(at(m, x, y)) && !this.objBlocks(x, y);
  }
  objBlocks(x: number, y: number) { return this.level.map.objects.some((o) => o.x === x && o.y === y && o.kind !== 'portal' && !(o.used && (o.kind === 'barrel' || o.kind === 'barrel_ex'))); }
  occupied(x: number, y: number, self?: Actor): boolean {
    if (self !== this.p && this.p.tx === x && this.p.ty === y) return true;
    if (this.npcs().some((n) => n.x === x && n.y === y)) return true;
    return this.level.monsters.some((m) => m !== self && m.alive && ((m.tx === x && m.ty === y) || (m.path[0] && m.prog > 0 && m.path[0].x === x && m.path[0].y === y)));
  }
  free(x: number, y: number, self?: Actor) { return this.tileWalk(x, y) && !this.occupied(x, y, self); }
  monAt(x: number, y: number) { return this.level.monsters.find((m) => m.alive && m.tx === x && m.ty === y) ?? null; }
  /** Line of sight on the tile grid (Bresenham), blocked by tall tiles and closed doors. */
  los(a: P, b: P): boolean {
    let x0 = a.x, y0 = a.y; const x1 = b.x, y1 = b.y;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    const m = this.level.map;
    while (!(x0 === x1 && y0 === y1)) {
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
      if (x0 === x1 && y0 === y1) break;
      const t = at(m, x0, y0);
      if (t === T.WALL || t === T.DOOR || t === T.PILLAR || t === T.HOUSE) return false;
    }
    return true;
  }
  adjacent(a: P, b: P) {
    if (Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) !== 1) return false;
    // no attacking around corners (D1 blocks diagonal moves past walls)
    if (a.x !== b.x && a.y !== b.y) return this.tileWalk(a.x, b.y) || this.tileWalk(b.x, a.y) || true;
    return true;
  }

  // ---------------- player input ----------------
  /** D1 left-click on a target or a tile. */
  tap(t: Target) {
    if (this.dead || this.p.state === 'hit') { if (!this.dead) this.target = t; return; }
    this.dialog = null;
    this.target = t;
    if (t.kind === 'tile') this.target = null; // Order 4: no tap-to-move (the joystick moves the hero)
    if (t.kind === 'mon') this.lockId = t.m.uid;
  }
  pathTo(goal: P, adjacentOk: boolean): P[] | null {
    const m = this.level.map, p = this.p;
    const walk = (x: number, y: number) => this.tileWalk(x, y) && !this.level.monsters.some((mm) => mm.alive && mm.tx === x && mm.ty === y) && !this.npcs().some((n) => n.x === x && n.y === y);
    if (!adjacentOk) {
      if (walk(goal.x, goal.y)) return findPath(m.w, m.h, walk, { x: p.tx, y: p.ty }, goal, 5000);
      return null;
    }
    let best: P[] | null = null;
    for (const d of DIRS) {
      const g = { x: goal.x + d.x, y: goal.y + d.y };
      if (g.x === p.tx && g.y === p.ty) return [];
      if (!walk(g.x, g.y)) continue;
      const path = findPath(m.w, m.h, walk, { x: p.tx, y: p.ty }, g, 3000);
      if (path && (!best || path.length < best.length)) best = path;
    }
    return best;
  }
  /** Cast the selected skill/spell at a tile (D1 right-click). */
  castAt(tx: number, ty: number, sel = this.hero.skill) {
    if (this.dead || this.p.state === 'attack' || this.p.state === 'cast' || this.p.state === 'hit') return;
    const h = this.hero;
    if (sel === 'skill') { this.classSkill(); return; }
    const src = this.spellSource(sel);
    if (!src) { this.say('You have no way to cast that'); return; }
    const s = SPELLS[src.spell];
    if (!CASTABLE.has(s.id)) { this.say(`${s.name} is not available in this build`); return; }
    if (this.cur === 'town' && !s.town) { this.say('You cannot cast that in town'); this.sfx.push('nope'); return; }
    const slvl = Math.max(1, (h.spells[s.id] ?? 0)) + this.d.splLvlAdd;
    if (src.from === 'spell') {
      const cost = spellMana(s, Math.max(1, h.spells[s.id] ?? 1));
      if (this.d.flags.has('NOMANA') || h.mana < cost) { this.say('Not enough mana'); this.sfx.push('nope'); return; }
      h.mana -= cost;
    } else if (src.from === 'staff') { src.item!.charges--; }
    else { removeItem(h, src.item!); if (h.skill === sel && !this.spellSource(sel)) h.skill = h.spells[s.id] ? s.id : 'skill'; }
    this.refresh();
    this.p.path = []; this.target = null;
    this.p.dir = faceToward(tx - this.p.x, ty - this.p.y, this.p.dir);
    this.p.state = 'cast'; this.p.t = ATTACK_TICKS[h.cls].cast * TICK; this.actTotal = this.p.t;
    this.sfx.push(`cast_${s.type}`);
    this.doSpell(s.id, slvl, tx, ty);
  }
  /** Facing in tile space: the stick when it is held, else the hero's facing. */
  facing(): P { const j = this.move; return j && j.mag > 0 ? screenToWorldDir(j.x, j.y) : DIRS[this.p.dir] ?? DIRS[0]; }
  /** Facing sprite for the held stick (keeps the hysteresis state), else the current facing. */
  stickFacing(): number { const j = this.move; return j && j.mag > 0 ? stickDir(j, this.lastMoveDir) : this.p.dir; }
  /** Soft-lock auto-target (nearest visible monster in range, facing-biased; keeps the current lock while valid). */
  autoTarget(range: number): Mon | null {
    const p = this.p, here = { x: p.tx, y: p.ty };
    const live = this.level.monsters.filter((m) => m.alive);
    const c = pickTarget(p.tx, p.ty, this.facing(), live.map((m) => ({ id: m.uid, x: m.tx, y: m.ty })), this.lockId, range, range + 2, (q) => this.los(here, q));
    const m = c ? live.find((mm) => mm.uid === c.id) ?? null : null;
    this.lockId = m ? m.uid : null;
    return m;
  }
  lockedMon(): Mon | null { return this.lockId === null ? null : this.level.monsters.find((m) => m.uid === this.lockId && m.alive) ?? null; }
  /** Skill slot i (Immortal skill button): auto-aim at the soft target, else straight ahead. */
  castSlot(i: number) {
    const id = this.hero.slots[i];
    if (!id) { this.say('Empty slot: assign a spell in the Spellbook'); return; }
    this.castId(id);
  }
  castId(id: string) {
    const src = this.spellSource(id);
    if (!src) { this.say(id.startsWith('scroll:') ? 'No scroll of that kind left' : id.startsWith('staff:') ? 'No charges' : 'You have no way to cast that'); this.sfx.push('nope'); return; }
    const s = SPELLS[src.spell], p = this.p;
    let tx = p.tx, ty = p.ty;
    if (s.targeted) {
      const m = this.autoTarget(10);
      if (m) { tx = m.tx; ty = m.ty; } else { const f = this.facing(); tx = Math.round(p.x + f.x * 6); ty = Math.round(p.y + f.y * 6); }
    }
    this.castAt(tx, ty, id);
  }
  /** Contextual INTERACT button. */
  interaction(): Interact | null { return this.dead ? null : interactFor(this); }
  interact() { const it = this.interaction(); if (it) this.tap(it.target); }
  autoGold() {
    const p = this.p;
    for (const gi of this.level.items) if (gi.item.itype === 'ITYPE_GOLD' && Math.max(Math.abs(gi.x - p.tx), Math.abs(gi.y - p.ty)) <= 1) { this.pickGround(gi); return; }
  }
  /** ATTACK held: soft-lock the nearest monster (walk in and hit), else break an adjacent barrel, else swing at the air. */
  autoAttack() {
    const p = this.p;
    if (this.target && this.target.kind === 'mon' && this.target.m.alive && this.target.m.uid === this.lockId) return;
    const m = this.autoTarget(this.d.bow ? 10 : 4);
    if (m) { this.target = { kind: 'mon', m }; return; }
    const b = this.level.map.objects.find((o) => !o.used && (o.kind === 'barrel' || o.kind === 'barrel_ex') && Math.max(Math.abs(o.x - p.tx), Math.abs(o.y - p.ty)) <= 1);
    if (b) { this.target = { kind: 'obj', o: b }; return; }
    if (!this.target) { p.path = []; const dd = this.stickFacing(); if (dd >= 0) p.dir = dd; this.startAttack(null); }
  }
  /** Where the selected spell comes from: learned spell, equipped staff charges, or a scroll in pack/belt. */
  spellSource(sel: string): { spell: string; from: 'spell' | 'staff' | 'scroll'; item?: Item } | null {
    const h = this.hero;
    if (sel.startsWith('scroll:')) {
      const sp = sel.slice(7);
      const it = [...h.belt, ...h.inv.map((e) => e.item)].find((i) => i && i.misc.startsWith('IMISC_SCROLL') && SPELL_BY_D1[i.spell]?.id === sp);
      return it ? { spell: sp, from: 'scroll', item: it } : null;
    }
    if (sel.startsWith('staff:')) {
      const sp = sel.slice(6), st = h.body.handL;
      return st && st.itype === 'ITYPE_STAFF' && SPELL_BY_D1[st.spell]?.id === sp && st.charges > 0 ? { spell: sp, from: 'staff', item: st } : null;
    }
    return h.spells[sel] ? { spell: sel, from: 'spell' } : null;
  }
  doSpell(id: string, slvl: number, tx: number, ty: number) {
    const h = this.hero, p = this.p, d = this.d;
    const dx = tx - p.x, dy = ty - p.y, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
    const bolt = (kind: Missile['kind'], speed: number, dmg: [number, number], extra: Partial<Missile> = {}) =>
      this.missiles.push({ kind, x: p.x, y: p.y, vx: ux * speed, vy: uy * speed, life: 2, dmg, fire: [0, 0], light: [0, 0], toHit: 0, ...extra });
    switch (id) {
      case 'firebolt': bolt('firebolt', 12 + slvl, [0, 0], { fire: fireboltDamage(d.mag, slvl) }); break;
      case 'charged_bolt': for (let i = 0; i < (slvl >> 1) + 3; i++) { const a = (this.rng.next() - 0.5) * 1.2; this.missiles.push({ kind: 'cbolt', x: p.x, y: p.y, vx: (ux * Math.cos(a) - uy * Math.sin(a)) * 6, vy: (uy * Math.cos(a) + ux * Math.sin(a)) * 6, life: 1.6, dmg: [0, 0], fire: [0, 0], light: chargedBoltDamage(d.mag), toHit: 0, wander: 1 }); } break;
      case 'holy_bolt': bolt('hbolt', 14, holyBoltDamage(h.clvl)); break;
      case 'lightning': bolt('lightning', 24, [0, 0], { light: [2, 2 + h.clvl + slvl * 2], life: 0.6 }); break; // [TEMP] lightning damage
      case 'healing': { const v = healAmount(h, slvl, this.rng); h.hp = Math.min(d.maxHp, h.hp + v); this.float(`+${v}`, p.x, p.y, '#f44'); break; }
      case 'town_portal': this.openPortal(); break;
      case 'identify': this.pendingPick = 'identify'; this.say('Select an item to identify'); break;
      case 'phasing': this.phase(); break;
      case 'mana_shield': this.manaShield = true; this.say('Mana Shield'); break;
      case 'infravision': this.say('Infravision'); break;
      default: this.say(`${SPELLS[id]?.name ?? id} is not available in this build`);
    }
  }
  pendingPick: '' | 'identify' | 'repair' | 'recharge' = '';
  classSkill() {
    const h = this.hero;
    if (h.cls === 'warrior') { this.pendingPick = 'repair'; this.say('Repair: select an item'); }
    else if (h.cls === 'sorcerer') { this.pendingPick = 'recharge'; this.say('Recharge: select a staff'); }
    else this.say('There is no trap here to disarm'); // traps are optional in this order and not generated (cathedral chests are never trapped in D1 L1)
  }
  /** Apply the pending pick (identify/repair/recharge) to an item. */
  pickItem(it: Item): boolean {
    const h = this.hero, k = this.pendingPick;
    if (!k) return false;
    this.pendingPick = '';
    if (k === 'identify') { if (it.magical && !it.identified) { it.identified = true; this.say(`Identified: ${it.iname}`); } else this.say('That item needs no identifying'); }
    if (k === 'repair') { if (repairSkill(it, h.clvl, this.rng)) { this.sfx.push('repair'); this.say(`Repaired ${it.name} (${it.dur}/${it.maxDur})`); if (it.maxDur === 0) { removeItem(h, it); this.say(`${it.name} crumbles`); } } else this.say('That does not need repair'); }
    if (k === 'recharge') { const s = SPELL_BY_D1[it.spell]; if (s && rechargeSkill(it, h.clvl, Math.max(1, s.bookLvl), this.rng)) this.say(`Recharged: ${it.charges}/${it.maxCharges}`); else this.say('That cannot be recharged'); }
    this.refresh();
    return true;
  }
  phase() {
    const p = this.p;
    for (let i = 0; i < 50; i++) {
      const x = p.tx + this.rng.int(13) - 6, y = p.ty + this.rng.int(13) - 6;
      if (Math.abs(x - p.tx) + Math.abs(y - p.ty) >= 4 && this.free(x, y)) { Object.assign(p, actorAt(x, y)); return; }
    }
  }
  openPortal() {
    if (this.cur === 'town') { this.say('You cannot cast that in town'); return; }
    this.portal = { x: this.p.tx, y: this.p.ty, fx: this.p.x, fy: this.p.y };
    this.say('A town portal opens');
    this.sfx.push('portal');
  }

  /** Use a belt/inventory consumable. */
  useItem(it: Item): boolean {
    const h = this.hero, d = this.d;
    const take = () => removeItem(h, it);
    switch (it.misc) {
      case 'IMISC_HEAL': { const v = potionAmount(h, d.maxHp, true, this.rng); h.hp = Math.min(d.maxHp, h.hp + v); take(); this.sfx.push('potion'); return true; }
      case 'IMISC_FULLHEAL': h.hp = d.maxHp; take(); this.sfx.push('potion'); return true;
      case 'IMISC_MANA': { if (!d.flags.has('NOMANA')) { const v = potionAmount(h, d.maxMana, false, this.rng); h.mana = Math.min(d.maxMana, h.mana + v); } take(); this.sfx.push('potion'); return true; }
      case 'IMISC_FULLMANA': h.mana = d.maxMana; take(); this.sfx.push('potion'); return true;
      case 'IMISC_REJUV': { h.hp = Math.min(d.maxHp, h.hp + potionAmount(h, d.maxHp, true, this.rng)); h.mana = Math.min(d.maxMana, h.mana + potionAmount(h, d.maxMana, false, this.rng)); take(); this.sfx.push('potion'); return true; }
      case 'IMISC_FULLREJUV': h.hp = d.maxHp; h.mana = d.maxMana; take(); this.sfx.push('potion'); return true;
      case 'IMISC_ELIXSTR': case 'IMISC_ELIXMAG': case 'IMISC_ELIXDEX': case 'IMISC_ELIXVIT': {
        const k = ({ IMISC_ELIXSTR: 'str', IMISC_ELIXMAG: 'mag', IMISC_ELIXDEX: 'dex', IMISC_ELIXVIT: 'vit' } as const)[it.misc];
        const before = derive(h); h.base[k] = Math.min(CLASSES[h.cls].max[k], h.base[k] + 1); const after = derive(h);
        h.hp += after.maxHp - before.maxHp; h.mana += after.maxMana - before.maxMana; take(); this.sfx.push('potion'); this.refresh(); return true;
      }
      case 'IMISC_BOOK': {
        const s = SPELL_BY_D1[it.spell];
        if (!s) return false;
        if (d.mag < it.minMag) { this.say('You need more magic to read this'); return false; }
        h.spells[s.id] = Math.min(15, (h.spells[s.id] ?? 0) + 1);
        take(); this.say(`You learn ${s.name} (level ${h.spells[s.id]})`); this.sfx.push('book');
        if (h.skill === 'skill') h.skill = s.id;
        if (!h.slots.includes(s.id) && h.slots.includes(null)) h.slots[h.slots.indexOf(null)] = s.id; // Immortal: new skills drop into a free slot
        return true;
      }
      case 'IMISC_SCROLL': case 'IMISC_SCROLLT': {
        const s = SPELL_BY_D1[it.spell];
        if (!s) return false;
        if (this.cur === 'town' && !s.town) { this.say('You cannot use that in town'); return false; }
        if (s.targeted) { this.hero.skill = `scroll:${s.id}`; this.say(`${s.name} readied: tap the skill button, then a target`); return true; }
        take(); this.doSpell(s.id, Math.max(1, h.spells[s.id] ?? 1), this.p.tx, this.p.ty); this.sfx.push('scroll');
        return true;
      }
    }
    return false;
  }

  // ---------------- simulation ----------------
  update(dt: number) {
    this.msgT = Math.max(0, this.msgT - dt);
    if (this.speech) { this.speech.t -= dt; if (this.speech.t <= 0) this.speech = null; }
    this.floats = this.floats.filter((f) => (f.t -= dt) > 0);
    if (this.dead) return;
    this.refresh();
    this.updatePlayer(dt);
    for (const m of this.level.monsters) if (m.alive) this.updateMon(m, dt); else m.deathT += dt;
    this.updateMissiles(dt);
    this.explore();
    // Sorcerer/all: no natural regeneration in D1 (life/mana only from potions/spells/shrines/Pepin).
  }

  explore() {
    const lv = this.level, p = this.p, r = 7;
    if (lv.id === 'town') return;
    for (let y = p.ty - r; y <= p.ty + r; y++) for (let x = p.tx - r; x <= p.tx + r; x++) {
      if (x < 0 || y < 0 || x >= lv.map.w || y >= lv.map.h) continue;
      if ((x - p.tx) ** 2 + (y - p.ty) ** 2 <= r * r) lv.explored[y * lv.map.w + x] = 1;
    }
  }

  step(a: Actor, dt: number, tileTime: number): boolean {
    if (!a.path.length) { a.x = a.tx; a.y = a.ty; a.prog = 0; if (a.state === 'walk') a.state = 'idle'; return false; }
    const nx = a.path[0];
    if (a.prog === 0) {
      const diag = nx.x !== a.tx && nx.y !== a.ty;
      if (!this.free(nx.x, nx.y, a) || (diag && (!this.tileWalk(nx.x, a.ty) || !this.tileWalk(a.tx, nx.y)))) { a.path = []; a.state = 'idle'; return false; }
      a.dir = dirOf(nx.x - a.tx, nx.y - a.ty); a.state = 'walk';
    }
    a.prog += dt / tileTime;
    if (a.prog >= 1) { a.tx = nx.x; a.ty = nx.y; a.path.shift(); a.prog = 0; a.x = a.tx; a.y = a.ty; return true; }
    a.x = a.tx + (nx.x - a.tx) * a.prog; a.y = a.ty + (nx.y - a.ty) * a.prog;
    return false;
  }

  updatePlayer(dt: number) {
    const p = this.p, h = this.hero;
    if (p.state === 'attack' || p.state === 'cast' || p.state === 'hit' || p.state === 'block') {
      p.t -= dt;
      if (p.state === 'attack' && !p.stepT && p.t <= (ATTACK_TICKS[h.cls][this.d.bow ? 'bow' : 'melee'] * TICK) * 0.4) { p.stepT = 1; this.resolvePlayerAttack(); }
      if (p.t <= 0) { p.state = 'idle'; p.stepT = 0; }
      return;
    }
    this.autoGold();
    if (this.attackHeld) { this.autoAttack(); if ((p.state as string) === 'attack') return; }
    else if (this.move && this.move.mag > 0) {
      // Order 9b: analog walk in the stick's exact screen direction; stops in place on release.
      this.target = null; p.path = [];
      const dir = stickDir(this.move, this.lastMoveDir);
      this.lastMoveDir = dir; p.dir = dir;
      const w = screenToWorldDir(this.move.x, this.move.y), d = WALK_SPEED * dt;
      const moved = this.moveHero(w.x * d, w.y * d);
      p.state = moved ? 'walk' : 'idle';
      this.heroAtNode = true;
      return;
    } else this.lastMoveDir = -1;
    const t = this.target;
    if (t && (this.heroAtNode || !p.path.length)) {
      this.heroAtNode = false;
      if (this.actOnTarget(t)) return;
    }
    this.followPath(dt);
  }
  /** Tile-based D1 rules use the tile containing the hero (tiles are centred on integers, so that is floor(pos + 0.5)). */
  heroTile() { const p = this.p; p.tx = Math.round(p.x); p.ty = Math.round(p.y); }
  heroAtNode = true;
  /** Move the hero's 0.35-tile circle with wall sliding; returns true when it moved. Fires the tile rules on a tile change. */
  moveHero(dx: number, dy: number): boolean {
    const p = this.p, ox = p.x, oy = p.y, otx = p.tx, oty = p.ty;
    // Order 10 B1: walls, closed doors, objects and NPCs are tile squares; monsters are circles the hero slides round; a tile a
    // monster stands on or is stepping into can't take the hero's centre (D1 tile occupancy stays exact).
    const npcs = this.npcs();
    const mons = this.level.monsters.filter((m) => m.alive && Math.abs(m.x - p.x) < 3 && Math.abs(m.y - p.y) < 3);
    const q = moveCircle(p.x, p.y, dx, dy, HERO_RADIUS, (x, y) => !this.tileWalk(x, y) || npcs.some((n) => n.x === x && n.y === y),
      mons.map((m) => ({ x: m.x, y: m.y, r: MON_RADIUS })),
      (x, y) => mons.some((m) => (m.tx === x && m.ty === y) || (m.prog > 0 && m.path[0] && m.path[0].x === x && m.path[0].y === y)));
    p.x = q.x; p.y = q.y; this.heroTile();
    if (p.tx !== otx || p.ty !== oty) this.onPlayerTile();
    return Math.hypot(p.x - ox, p.y - oy) > 1e-6;
  }
  /** INTERACT / attack-move paths: glide from the current position to each waypoint's centre at walk speed (no snapping). */
  followPath(dt: number) {
    const p = this.p;
    if (!p.path.length) { p.prog = 0; if (p.state === 'walk') p.state = 'idle'; return; }
    const nx = p.path[0];
    const diag = nx.x !== p.tx && nx.y !== p.ty;
    if ((nx.x !== p.tx || nx.y !== p.ty) && (!this.free(nx.x, nx.y, p) || (diag && (!this.tileWalk(nx.x, p.ty) || !this.tileWalk(p.tx, nx.y))))) { p.path = []; p.state = 'idle'; this.heroAtNode = true; return; }
    const vx = nx.x - p.x, vy = nx.y - p.y, dist = Math.hypot(vx, vy), d = WALK_SPEED * dt;
    if (dist > 1e-9) p.dir = faceToward(vx, vy, p.dir);
    p.state = 'walk';
    const otx = p.tx, oty = p.ty;
    if (dist <= d) { p.x = nx.x; p.y = nx.y; p.path.shift(); this.heroAtNode = true; }
    else { p.x += vx / dist * d; p.y += vy / dist * d; }
    this.heroTile();
    if (this.heroAtNode || p.tx !== otx || p.ty !== oty) this.onPlayerTile();
  }
  attackTarget: Mon | Obj | null = null;
  /** Returns true when the player started an action this tick. */
  actOnTarget(t: Target): boolean {
    const p = this.p, here = { x: p.tx, y: p.ty };
    const near = (q: P) => Math.max(Math.abs(q.x - p.tx), Math.abs(q.y - p.ty)) <= 1;
    const go = (q: P, adj: boolean) => { if (!p.path.length) { const path = this.pathTo(q, adj); if (path) p.path = path; else this.target = null; } };
    switch (t.kind) {
      case 'mon': {
        const m = t.m;
        if (!m.alive) { this.target = null; return false; }
        const dist = Math.max(Math.abs(m.tx - p.tx), Math.abs(m.ty - p.ty));
        if (this.d.bow && dist <= 12 && this.los(here, { x: m.tx, y: m.ty })) { p.path = []; this.startAttack(m); return true; }
        if (dist === 1 && this.adjacent(here, { x: m.tx, y: m.ty })) { p.path = []; this.startAttack(m); return true; }
        if (!p.path.length || p.path.length > 0 && (this.rng.int(4) === 0)) { const path = this.pathTo({ x: m.tx, y: m.ty }, true); if (path) p.path = path; else if (!p.path.length) this.target = null; }
        return false;
      }
      case 'npc': if (near(t.npc)) { p.path = []; this.target = null; this.talk(t.npc); return true; } go(t.npc, true); return false;
      case 'item': if (p.tx === t.g.x && p.ty === t.g.y || near(t.g)) { p.path = []; this.target = null; this.pickGround(t.g); return true; } go(t.g, !this.tileWalk(t.g.x, t.g.y)); if (!p.path.length) go(t.g, true); return false;
      case 'obj': {
        const o = t.o;
        if (o.used) { this.target = null; if (o.kind === 'shrine' && o.shrine) this.sayShrine(o.shrine); return false; }
        if (near(o)) { p.path = []; this.target = null; if (o.kind === 'barrel' || o.kind === 'barrel_ex') { this.startAttack(o); return true; } this.operate(o); return true; }
        go(o, true); return false;
      }
      case 'door': if (near(t)) { p.path = []; this.target = null; this.toggleDoor(t.x, t.y); return true; } go(t, true); return false;
      case 'tile': this.target = null; return false;
      case 'stairs': if (p.tx === t.x && p.ty === t.y) { this.portalArmed = true; this.onPlayerTile(); return true; } go(t, false); if (!p.path.length) this.target = null; return false;
    }
  }
  startAttack(m: Mon | Obj | null) {
    const p = this.p, h = this.hero;
    if (m) p.dir = faceToward(m.x - p.x, m.y - p.y, p.dir); // attacks face the target
    p.state = 'attack'; p.t = ATTACK_TICKS[h.cls][this.d.bow ? 'bow' : 'melee'] * TICK; p.stepT = 0; this.actTotal = p.t;
    this.attackTarget = m;
    this.sfx.push(this.d.bow ? 'bow' : 'swing');
  }
  resolvePlayerAttack() {
    const m = this.attackTarget, h = this.hero, d = this.d;
    if (!m) return;
    if (!('def' in m)) { this.breakBarrel(m); return; }
    if (!m.alive) return;
    if (d.bow) {
      const ux = m.tx - this.p.tx, uy = m.ty - this.p.ty, l = Math.hypot(ux, uy) || 1;
      this.missiles.push({ kind: 'arrow', x: this.p.x, y: this.p.y, vx: ux / l * 16, vy: uy / l * 16, life: 1.2, dmg: [-1, -1], fire: [d.weapon?.fMin ?? 0, d.weapon?.fMax ?? 0], light: [d.weapon?.lMin ?? 0, d.weapon?.lMax ?? 0], toHit: bowToHit(h, d, m.def.ac) });
      return;
    }
    // Order 10 B2: melee lands on a target in any of the 8 neighbour tiles of the hero's tile (D1 tile adjacency)
    if (Math.max(Math.abs(m.tx - this.p.tx), Math.abs(m.ty - this.p.ty)) > 1) { this.sfx.push('miss'); return; }
    if (this.rng.int(100) >= meleeToHit(h, d, m.def.ac)) { this.sfx.push('miss'); return; }
    let dam = rollDamage(h, d, this.rng);
    const w = d.weapon;
    if (w?.fMax) dam += this.elemental(m, 'fire', w.fMin + this.rng.int(w.fMax - w.fMin + 1));
    if (w?.lMax) dam += this.elemental(m, 'light', w.lMin + this.rng.int(w.lMax - w.lMin + 1));
    this.hurtMon(m, dam);
    if (this.rng.int(3) === 0) this.wearMsg(wear(h, w)); // [TEMP] weapon wear chance per hit
  }
  elemental(m: Mon, kind: 'fire' | 'light' | 'magic', dam: number): number {
    const def = m.def;
    if (kind === 'fire') return def.immuneFire ? 0 : def.resFire ? (def.fireMul !== undefined ? Math.floor(dam * def.fireMul) : dam >> 2) : dam;
    if (kind === 'light') return def.resLight ? dam >> 2 : dam;
    return def.immuneMagic ? 0 : dam;
  }
  wearMsg(broken: string | null) { if (broken) { this.say(`Your ${broken} has broken`); this.refresh(); } }
  hurtMon(m: Mon, dam: number) {
    if (dam <= 0) return;
    m.hp -= dam; m.flash = 0.15; m.active = true;
    this.float(`${dam}`, m.x, m.y, '#ff8');
    this.sfx.push('hit');
    if (m.hp <= 0) { this.killMon(m); return; }
    const sg = m.def.stagger; // Order 10 U12: the tuned Butcher flinches briefly on any hit (not again within cd)
    if (sg && m.state !== 'hit' && !((m.staggerCd ?? 0) > 0) && !monsterStunned(dam, m.def.mlvl)) {
      if (m.state !== 'attack') { m.state = 'hit'; m.t = sg.t; m.dealt = false; m.path = []; m.prog = 0; m.x = m.tx; m.y = m.ty; m.staggerCd = sg.cd; }
    }
    if (monsterStunned(dam, m.def.mlvl)) { m.state = 'hit'; m.t = Math.max(1, m.def.frames[3]) * TICK; m.path = []; m.prog = 0; m.x = m.tx; m.y = m.ty; }
    if (m.def.ai === 'AI_FALLEN' && this.rng.int(2) === 0) m.fleeT = 2; // [TEMP] Fallen Ones run when hurt
  }
  killMon(m: Mon) {
    m.alive = false; m.state = 'dead'; m.path = []; m.x = m.tx; m.y = m.ty;
    this.level.corpses.push({ x: m.tx, y: m.ty });
    this.sfx.push(m.def.id === 'butcher' ? 'butcher_die' : 'mon_die');
    if (this.target?.kind === 'mon' && this.target.m === m) this.target = null;
    const lvls = addExp(this.hero, Math.floor(killExp(m.def.exp, m.def.mlvl, this.hero.clvl) * (this.level.dlvl === 1 ? L1_EXP_BONUS : 1)));
    if (lvls) { this.say(`You have reached level ${this.hero.clvl}`); this.sfx.push('levelup'); }
    if (m.def.id === 'butcher') {
      this.drop(butcherCleaver(this.rng), m.tx, m.ty);
      this.quests.butcher = 'done'; this.say('The Butcher is dead');
    } else {
      const idx = rndMonsterItem(this.rng, m.def.mlvl);
      if (idx >= 0) this.drop(makeDrop(this.rng, idx, m.def.mlvl, this.level.dlvl), m.tx, m.ty);
    }
    this.refresh();
  }
  /** Drop an item on the nearest free floor tile (GetSuperItemSpace). */
  drop(it: Item, x: number, y: number) {
    const lv = this.level;
    for (let r = 0; r < 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const xx = x + dx, yy = y + dy;
      if (this.tileWalk(xx, yy) && !lv.items.some((g) => g.x === xx && g.y === yy)) { lv.items.push({ item: it, x: xx, y: yy }); this.sfx.push('item_drop'); return; }
    }
    lv.items.push({ item: it, x, y });
  }
  pickGround(g: GroundItem) {
    const where = pickUp(this.hero, g.item);
    if (where) {
      this.level.items = this.level.items.filter((x) => x !== g);
      this.sfx.push(g.item.itype === 'ITYPE_GOLD' ? 'gold' : 'pickup');
      const nm = g.item.identified ? g.item.iname : g.item.name;
      this.say(g.item.itype === 'ITYPE_GOLD' ? `${g.item.gold} gold` : where === 'equip' ? `Equipped ${nm}` : nm, 1.5);
      this.refresh();
    } else this.say('I have no room');
  }
  onPlayerTile() {
    const p = this.p, m = this.level.map;
    // Order 4: with continuous joystick walking, stairs and portals only fire when deliberately targeted (INTERACT / tap),
    // so brushing past the stairs does not change level.
    const t0 = this.target;
    if (!(t0 && t0.kind === 'stairs' && t0.x === p.tx && t0.y === p.ty)) { this.portalArmed = true; return; }
    this.target = null;
    const t = at(m, p.tx, p.ty);
    if (t === T.DOWN && this.cur === 'town') { this.travel('l1', null); return; }
    if (t === T.DOWN && this.cur === 'l1') { this.say('The way down is not available (only Cathedral level 1 in this build)'); p.path = []; return; }
    if (t === T.UP && this.cur === 'l1') { this.travel('town', TOWN_FROM_CATHEDRAL); return; }
    // town portal
    if (this.portal) {
      if (this.cur === 'l1' && p.tx === this.portal.x && p.ty === this.portal.y && this.portalArmed) { this.travel('town', { x: TOWN_PORTAL_SPOT.x, y: TOWN_PORTAL_SPOT.y + 1 }); return; }
      if (this.cur === 'town' && p.tx === TOWN_PORTAL_SPOT.x && p.ty === TOWN_PORTAL_SPOT.y) {
        // Order 12: back to the exact spot it was cast, and the portal closes (both ends)
        const pt = this.portal; this.portal = null; this.travel('l1', { x: pt.x, y: pt.y }); this.pendingLevel!.exact = pt.fx === undefined ? undefined : { x: pt.fx, y: pt.fy! }; return;
      }
    }
    this.portalArmed = true;
  }
  portalArmed = true;
  travel(to: LevelId, atP: P | null) {
    this.pendingLevel = { to, at: atP ?? { x: -1, y: -1 } };
  }
  /** Called by the loading screen. */
  finishTravel() {
    const pl = this.pendingLevel;
    if (!pl) return;
    this.pendingLevel = null;
    const from = this.cur;
    if (!this.levels[pl.to]) this.levels[pl.to] = this.makeLevel(pl.to);
    this.cur = pl.to;
    const lv = this.level;
    const spot = pl.at.x >= 0 ? pl.at : lv.map.start;
    const s = this.nearestFree(spot);
    this.p = actorAt(s.x, s.y);
    if (pl.exact && s.x === spot.x && s.y === spot.y && Math.round(pl.exact.x) === s.x && Math.round(pl.exact.y) === s.y) { this.p.x = pl.exact.x; this.p.y = pl.exact.y; }
    this.target = null; this.missiles = []; this.dialog = null;
    if (pl.to === 'l1') { this.hero.maxDlvl = Math.max(this.hero.maxDlvl, 1); this.portalArmed = !(this.portal && s.x === this.portal.x && s.y === this.portal.y); }
    if (pl.to === 'town' && from !== 'town') this.restock();
    this.sfx.push(pl.to === 'town' ? 'music_town' : 'music_l1');
  }
  /** Order 10 B3: does the hero's circle overlap tile (x, y)? (D1 won't close a door with someone standing in it.) */
  heroOverlaps(x: number, y: number) {
    const p = this.p, cx = Math.max(x - 0.5, Math.min(x + 0.5, p.x)), cy = Math.max(y - 0.5, Math.min(y + 0.5, p.y));
    return Math.hypot(p.x - cx, p.y - cy) < HERO_RADIUS - 1e-9;
  }
  nearestFree(q: P): P {
    for (let r = 0; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (this.free(q.x + dx, q.y + dy)) return { x: q.x + dx, y: q.y + dy };
    return q;
  }
  toggleDoor(x: number, y: number) {
    const m = this.level.map, t = at(m, x, y);
    if (t === T.DOOR) { setT(m, x, y, T.DOOR_OPEN); this.sfx.push('door'); }
    else if (t === T.DOOR_OPEN && !this.occupied(x, y) && !this.heroOverlaps(x, y) && !this.level.items.some((g) => g.x === x && g.y === y)) { setT(m, x, y, T.DOOR); this.sfx.push('door'); }
    // Butcher wakes when his door opens
    const br = m.butcherRoom;
    if (br && t === T.DOOR) for (const mm of this.level.monsters) if (mm.def.id === 'butcher') mm.active = true;
  }

  // ---------------- objects ----------------
  /** U10 (Joseph's override of D1, where Pepin restores life only): full life AND full mana. */
  pepinHeal() { this.refresh(); this.hero.hp = this.d.maxHp; this.hero.mana = this.d.maxMana; this.sfx.push('heal'); }
  /** HP when the current barrel chain started (U2: a chain can't kill a hero who was above 30% HP). */
  barrelChainHp = -1;
  /**
   * U2 (Joseph's override of D1's flat 8-16): an exploding barrel burns the hero for 20-25% of max HP, then fire resistance; and a
   * barrel (or a chain of them) never kills a hero who was above 30% HP when it went off. Monsters still take D1's 1-4 fire.
   */
  barrelDamage(r: Rng): number {
    const h = this.hero, max = this.d.maxHp;
    let dam = Math.floor(max * (20 + r.int(6)) / 100);
    dam = Math.max(1, Math.floor(dam * (100 - this.d.fr) / 100));
    const start = this.barrelChainHp >= 0 ? this.barrelChainHp : h.hp;
    if (start > 0.3 * max) dam = Math.min(dam, Math.max(0, Math.ceil(h.hp) - 1));
    return dam;
  }
  breakBarrel(o: Obj) {
    if (o.used) return;
    const outer = this.barrelChainHp < 0;
    if (outer) this.barrelChainHp = this.hero.hp;
    try { this.breakBarrel0(o); } finally { if (outer) this.barrelChainHp = -1; }
  }
  private breakBarrel0(o: Obj) {
    o.used = true; this.sfx.push('barrel');
    const r = new Rng(o.seed);
    if (o.kind === 'barrel_ex') {
      // OBJ_BARRELEX: D1's 1-4 fire damage to monsters in the 3x3 around it; the hero takes U2's barrelDamage.
      for (const m of this.level.monsters) if (m.alive && Math.abs(m.tx - o.x) <= 1 && Math.abs(m.ty - o.y) <= 1) this.hurtMon(m, this.elemental(m, 'fire', 1 + r.int(4)));
      if (Math.abs(this.p.tx - o.x) <= 1 && Math.abs(this.p.ty - o.y) <= 1) this.hurtPlayer(this.barrelDamage(r), 1);
      for (const b of this.level.map.objects) if (b.kind === 'barrel_ex' && !b.used && Math.abs(b.x - o.x) <= 1 && Math.abs(b.y - o.y) <= 1) this.breakBarrel(b);
      this.sfx.push('explode');
      return;
    }
    if (o.var2 <= 1) this.drop(r.int(3) === 0 ? getItemAttrs(r, rndUseful(r, this.level.dlvl), 1) : makeDrop(r, rndAllItems(r, 1), 2, 1), o.x, o.y);
    if (o.var2 >= 8) this.spawnSkeleton(o.x, o.y);
  }
  spawnSkeleton(x: number, y: number) {
    const s = this.nearestFree({ x, y });
    const m = this.spawnMon(MONSTERS.skeleton, s.x, s.y); m.active = true;
    this.level.monsters.push(m);
  }
  operate(o: Obj) {
    const r = new Rng(o.seed);
    switch (o.kind) {
      case 'chest1': case 'chest2': case 'chest3': {
        o.used = true; this.sfx.push('chest');
        for (let i = 0; i < o.var1; i++) this.drop(o.var2 === 0 ? getItemAttrs(r, rndUseful(r, this.level.dlvl), 1) : makeDrop(r, rndAllItems(r, 1), 2, 1), o.x, o.y);
        if (o.var1 === 0) this.say('The chest is empty', 1.5);
        break;
      }
      case 'sarc': {
        o.used = true; this.sfx.push('sarc');
        if (o.var1 <= 2) this.drop(makeDrop(r, rndAllItems(r, 1), 2, 1), o.x, o.y);
        if (o.var1 >= 8) this.spawnSkeleton(o.x, o.y);
        break;
      }
      case 'shrine': o.used = true; this.shrine(o.shrine ?? 'Mysterious', r); break;
      case 'barrel': case 'barrel_ex': this.breakBarrel(o); break;
      case 'sealed': this.say(`The way into ${SEALED[o.var1] ?? 'the depths'} is sealed`, 2); break; // Order 12: decorative, closed
      default: break;
    }
    this.refresh();
  }
  /** Shrine effects (objects.cpp OperateShrine, single player). */
  shrine(name: string, r: Rng) {
    const h = this.hero, worn = BODY_SLOTS.map((s) => h.body[s]).filter((i): i is Item => !!i);
    const stats = ['str', 'mag', 'dex', 'vit'] as const;
    const learned = Object.keys(h.spells);
    const spellUp = (id: string) => { h.spells[id] = Math.min(15, (h.spells[id] ?? 0) + 2); const d = derive(h); h.manaPenalty += Math.floor(d.maxMana / 10); clampVitals(h); };
    this.sfx.push('shrine');
    switch (name) {
      case 'Mysterious': { const k = stats[r.int(4)]; for (const s of stats) h.base[s] = Math.max(0, h.base[s] + (s === k ? 5 : -1));  break; }
      case 'Hidden': { const dur = worn.filter((i) => i.maxDur && i.maxDur !== DUR_INDESTRUCTIBLE); if (dur.length) { const k = r.int(dur.length); dur.forEach((i, j) => { if (j === k) { i.maxDur = Math.max(1, i.maxDur - 10); i.dur = Math.min(i.dur, i.maxDur); } else { i.maxDur += 10; i.dur += 10; } }); }  break; }
      case 'Gloomy': for (const i of worn) { if (i.itype.endsWith('ARMOR') || i.itype === 'ITYPE_HELM' || i.itype === 'ITYPE_SHIELD') i.ac += 2; if (['ITYPE_SWORD', 'ITYPE_AXE', 'ITYPE_MACE', 'ITYPE_BOW', 'ITYPE_STAFF'].includes(i.itype)) i.maxDam = Math.max(i.minDam, i.maxDam - 1); }  break;
      case 'Weird': for (const i of worn) if (['ITYPE_SWORD', 'ITYPE_AXE', 'ITYPE_MACE', 'ITYPE_BOW', 'ITYPE_STAFF'].includes(i.itype)) i.maxDam++;  break;
      case 'Magical': case 'Magical2': this.manaShield = true;  break;
      case 'Stone': for (const i of allItems(h)) if (i.itype === 'ITYPE_STAFF') i.charges = i.maxCharges;  break;
      case 'Religious': for (const i of allItems(h)) if (i.maxDur && i.maxDur !== DUR_INDESTRUCTIBLE) i.dur = i.maxDur;  break;
      case 'Enchanted': if (learned.length) { const k = learned[r.int(learned.length)]; for (const s of learned) h.spells[s] = s === k ? Math.max(0, h.spells[s] - 1) : Math.min(15, h.spells[s] + 1); if (h.spells[k] === 0) delete h.spells[k]; }  break;
      case 'Thaumaturgic': for (const o of this.level.map.objects) if (o.kind.startsWith('chest')) o.used = false;  break;
      case 'Fascinating': spellUp('firebolt'); break;
      case 'Cryptic': h.mana = this.d.maxMana; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; this.missiles.push({ kind: 'lightning', x: this.p.x, y: this.p.y, vx: Math.cos(a) * 10, vy: Math.sin(a) * 10, life: 0.5, dmg: [0, 0], fire: [0, 0], light: [1, 10], toHit: 100 }); }  break;
      case 'Eldritch': for (const i of allItems(h)) if (['IMISC_HEAL', 'IMISC_MANA', 'IMISC_FULLHEAL', 'IMISC_FULLMANA'].includes(i.misc)) { const full = i.misc.startsWith('IMISC_FULL'); const n = getItemAttrs(r, full ? IDI.FULLREJUV : IDI.REJUV, 1); Object.assign(i, { ...n, uid: i.uid, identified: true }); }  break;
      case 'Eerie': h.base.mag = Math.min(CLASSES[h.cls].max.mag, h.base.mag + 2);  break;
      case 'Divine': { for (const idx of this.level.dlvl < 4 ? [IDI.FULLMANA, IDI.FULLHEAL] : [IDI.FULLREJUV, IDI.FULLREJUV]) this.drop(getItemAttrs(r, idx, 1), this.p.tx, this.p.ty); const d = derive(h); h.hp = d.maxHp; h.mana = d.maxMana;  break; }
      case 'Holy': this.phase();  break;
      case 'Sacred': spellUp('charged_bolt'); break;
      case 'Spiritual': { let n = 0; while (n < 40 && autoPlace(h, goldItem(1))) n++; const golds = h.inv.filter((e) => e.item.itype === 'ITYPE_GOLD'); for (const g of golds) { h.inv = h.inv.filter((e) => e !== g); h.gold += 5 + r.int(5); }  break; }
      case 'Abandoned': h.base.dex = Math.min(CLASSES[h.cls].max.dex, h.base.dex + 2);  break;
      case 'Creepy': h.base.str = Math.min(CLASSES[h.cls].max.str, h.base.str + 2);  break;
      case 'Quiet': h.base.vit = Math.min(CLASSES[h.cls].max.vit, h.base.vit + 2);  break;
      case 'Secluded': this.level.explored.fill(1);  break;
      case 'Ornate': spellUp('holy_bolt'); break;
      case 'Glimmering': for (const i of allItems(h)) i.identified = true;  break;
      default: this.say('Nothing happens'); this.refresh(); return;
    }
    this.sayShrine(name);
    this.refresh(); clampVitals(h);
  }

  // ---------------- NPCs ----------------
  talk(n: NpcDef) {
    const tx = NPC_TEXT[n.id];
    this.dialog = { npc: n, text: tx.greet };
    this.sfx.push(`npc_${n.id}`);
    if (n.id === 'pepin') this.pepinHeal(); // Pepin heals for free whenever you talk to him (D1); U10: life AND mana
    if (n.id === 'wounded') {
      this.dialog.text = tx.butcher;
      this.quests.butcher = 'active';
      this.townDead.add('wounded'); // he dies after his message (D1)
    }
  }
  gossip(n: NpcDef): string {
    const tx = NPC_TEXT[n.id];
    if (this.quests.butcher === 'active' && this.rng.int(2) === 0) return tx.butcher;
    return tx.gossip.length ? tx.gossip[this.rng.int(tx.gossip.length)] : tx.greet;
  }

  // ---------------- monsters ----------------
  updateMon(m: Mon, dt: number) {
    const p = this.p, def = m.def;
    m.flash = Math.max(0, m.flash - dt);
    if (m.staggerCd) m.staggerCd = Math.max(0, m.staggerCd - dt);
    if (m.state === 'hit' || m.state === 'attack') {
      m.t -= dt;
      if (m.state === 'attack' && !m.dealt && m.t <= Math.max(8, def.frames[2]) * TICK * 0.4) { m.dealt = true; this.resolveMonAttack(m); }
      if (m.t <= 0) { m.state = 'idle'; m.dealt = false; }
      return;
    }
    const dist = Math.max(Math.abs(p.tx - m.tx), Math.abs(p.ty - m.ty));
    if (!m.active) {
      const sight = def.id === 'butcher' ? 0 : def.ai === 'AI_ZOMBIE' ? 5 : 8; // [TEMP] activation radius
      if (dist <= sight && this.los({ x: m.tx, y: m.ty }, { x: p.tx, y: p.ty })) m.active = true;
      else return;
    }
    if (def.id === 'butcher' && !m.spoke && dist <= 10 && this.los({ x: m.tx, y: m.ty }, { x: p.tx, y: p.ty })) {
      m.spoke = true; this.speech = { text: def.quote ?? '', t: 3 }; this.sfx.push('fresh_meat');
    }
    if (m.fleeT > 0) m.fleeT -= dt;
    const walkTime = Math.max(6, def.frames[1]) * TICK * (def.walkMul ?? 1); // monstdat walk frames, one per tick [TEMP]
    if (m.prog === 0 && m.fleeT <= 0 && dist === 1 && this.adjacent({ x: m.tx, y: m.ty }, { x: p.tx, y: p.ty })) {
      m.path = []; m.dir = dirOf(p.tx - m.tx, p.ty - m.ty);
      m.state = 'attack'; m.t = Math.max(8, def.frames[2]) * TICK * (def.attackMul ?? 1); m.dealt = false;
      return;
    }
    if (m.prog === 0 && !m.path.length) {
      let goal = { x: p.tx, y: p.ty };
      if (m.fleeT > 0) goal = { x: m.tx + Math.sign(m.tx - p.tx) * 4, y: m.ty + Math.sign(m.ty - p.ty) * 4 };
      const mp = this.level.map;
      const walk = (x: number, y: number) => this.tileWalk(x, y) && !this.level.monsters.some((o) => o !== m && o.alive && o.tx === x && o.ty === y);
      const path = dist < 25 ? findPath(mp.w, mp.h, (x, y) => (x === p.tx && y === p.ty) || walk(x, y), { x: m.tx, y: m.ty }, goal, 400) : null;
      if (path && path.length > 0 && !(path[0].x === p.tx && path[0].y === p.ty)) m.path = [path[0]];
      else if (!path && m.fleeT <= 0) { // wander one step
        const d = DIRS[this.rng.int(8)];
        if (this.free(m.tx + d.x, m.ty + d.y, m)) m.path = [{ x: m.tx + d.x, y: m.ty + d.y }];
      }
    }
    this.step(m, dt, walkTime);
  }
  resolveMonAttack(m: Mon) {
    const p = this.p, h = this.hero, d = this.d, def = m.def;
    if (Math.max(Math.abs(p.tx - m.tx), Math.abs(p.ty - m.ty)) > 1) return;
    if (this.rng.int(100) >= monsterToHit(def.toHit, def.mlvl, h.clvl, d.ac)) return;
    if ((p.state === 'idle' || p.state === 'attack') && this.rng.int(100) < blockChance(h, d, def.mlvl)) {
      p.state = 'block'; p.t = 4 * TICK; this.sfx.push('block'); this.float('block', p.x, p.y, '#aaf'); return;
    }
    const dam = Math.max(1, def.dmg[0] + this.rng.int(def.dmg[1] - def.dmg[0] + 1) + d.getHit);
    this.hurtPlayer(dam, def.mlvl);
    const armour = BODY_SLOTS.map((s) => h.body[s]).filter((i) => i && (i.itype.endsWith('ARMOR') || i.itype === 'ITYPE_HELM' || i.itype === 'ITYPE_SHIELD'));
    if (armour.length && this.rng.int(3) === 0) this.wearMsg(wear(h, armour[this.rng.int(armour.length)]!)); // [TEMP] armour wear chance
  }
  hurtPlayer(dam: number, _mlvl: number) {
    const h = this.hero, p = this.p;
    if (this.manaShield && h.mana > 0) { const a = Math.min(h.mana, dam); h.mana -= a; dam -= a; if (h.mana <= 0) this.manaShield = false; }
    if (dam <= 0) return;
    h.hp -= dam;
    this.float(`${dam}`, p.x, p.y, '#f66');
    this.sfx.push('player_hit');
    if (h.hp <= 0) { h.hp = 0; this.die(); return; }
    if (dam >= h.clvl && p.state !== 'attack') { p.state = 'hit'; p.t = hitRecoveryTicks(h, this.d) * TICK; p.path = []; p.prog = 0; }
  }
  die() {
    this.dead = true; this.p.state = 'dead'; this.target = null;
    this.say('You have died', 9999); this.sfx.push('player_die');
  }
  /** Restart in town: gold is dropped where you fell (D1 multiplayer-style; see deviations). */
  restartInTown() {
    const h = this.hero;
    if (h.gold > 0 && this.cur !== 'town') this.drop(goldItem(h.gold), this.p.tx, this.p.ty);
    h.gold = 0;
    this.dead = false;
    const d = derive(h); h.hp = d.maxHp; h.mana = d.maxMana;
    this.msgT = 0;
    this.travel('town', TOWN_START);
  }

  updateMissiles(dt: number) {
    const lv = this.level;
    for (const ms of this.missiles) {
      const sub = 4;
      for (let s = 0; s < sub && ms.life > 0; s++) {
        if (ms.wander) { const a = (this.rng.next() - 0.5) * 0.6; const c = Math.cos(a), sn = Math.sin(a); [ms.vx, ms.vy] = [ms.vx * c - ms.vy * sn, ms.vy * c + ms.vx * sn]; }
        ms.x += ms.vx * dt / sub; ms.y += ms.vy * dt / sub;
        const tx = Math.round(ms.x), ty = Math.round(ms.y);
        const t = at(lv.map, tx, ty);
        if (t === undefined || t === T.WALL || t === T.DOOR || t === T.PILLAR) { ms.life = 0; break; }
        const m = this.monAt(tx, ty);
        if (m) {
          ms.life = 0;
          const h = this.hero, d = this.d;
          if (ms.kind === 'arrow') {
            if (this.rng.int(100) < ms.toHit) {
              let dam = rollDamage(h, d, this.rng);
              if (ms.fire[1]) dam += this.elemental(m, 'fire', ms.fire[0] + this.rng.int(ms.fire[1] - ms.fire[0] + 1));
              if (ms.light[1]) dam += this.elemental(m, 'light', ms.light[0] + this.rng.int(ms.light[1] - ms.light[0] + 1));
              this.hurtMon(m, dam);
              if (this.rng.int(3) === 0) this.wearMsg(wear(h, d.weapon));
            } else this.sfx.push('miss');
          } else if (ms.toHit >= 100 || this.rng.int(100) < spellToHit(h, d, m.def.mlvl)) {
            let dam = 0;
            if (ms.kind === 'hbolt') dam = m.def.kind === 'undead' ? ms.dmg[0] + this.rng.int(ms.dmg[1] - ms.dmg[0] + 1) : 0;
            if (ms.fire[1]) dam += this.elemental(m, 'fire', ms.fire[0] + this.rng.int(ms.fire[1] - ms.fire[0] + 1));
            if (ms.light[1]) dam += this.elemental(m, 'light', ms.light[0] + this.rng.int(ms.light[1] - ms.light[0] + 1));
            this.hurtMon(m, dam);
          }
          break;
        }
      }
      ms.life -= dt;
    }
    this.missiles = this.missiles.filter((m) => m.life > 0);
  }
}

export function actorAt(x: number, y: number): Actor {
  return { x, y, tx: x, ty: y, dir: 0, path: [], prog: 0, state: 'idle', t: 0, stepT: 0 };
}
export { reqOk, BASE };
