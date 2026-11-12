import { CLASSES, START_GOLD, baseLife, baseMana, type ClassId } from './data/classes';
import { ITEMS } from './data/items';
import { MONSTERS, spHp, type MonsterDef } from './data/monsters';
import { SPELLS, spellMana } from './data/spells';
import { baseAc, damageMod, meleeToHit, monsterToHit } from './data/combat';
import { findPath } from './path';
import { DIRS, dirOf, type P } from './iso';
import { FLOOR, MAP_H, MAP_W, makeTestLevel } from './map';

// Timing is [TEMP]: D1 runs at 20 game ticks/s; real per-class frame counts come with the art pack.
export const WALK_TILE_S = 0.4;
export const ATTACK_S = 0.6;

export interface Actor { x: number; y: number; tx: number; ty: number; dir: number; path: P[]; prog: number; hp: number; maxHp: number; cd: number; flash: number }
export interface Monster extends Actor { def: MonsterDef; alive: boolean }
export interface Bolt { x: number; y: number; vx: number; vy: number; life: number }
export type Panel = 'none' | 'char' | 'inv' | 'spell';

export class Game {
  map = makeTestLevel();
  cls: ClassId;
  clvl = 1;
  exp = 0;
  gold = START_GOLD;
  player: Actor;
  mana: number; maxMana: number;
  monsters: Monster[] = [];
  bolts: Bolt[] = [];
  belt: (string | null)[] = [];
  target: Monster | null = null;
  skillArmed = false;
  panel: Panel = 'none';
  msg = ''; msgT = 0;

  constructor(cls: ClassId, private rnd: () => number = Math.random) {
    this.cls = cls;
    const c = CLASSES[cls];
    const hp = baseLife(c, 1), mp = baseMana(c, 1);
    this.player = { x: 5, y: 5, tx: 5, ty: 5, dir: 0, path: [], prog: 0, hp, maxHp: hp, cd: 0, flash: 0 };
    this.mana = mp; this.maxMana = mp;
    this.belt = c.startItems.filter((i) => ITEMS[i].slot === 'belt');
    while (this.belt.length < 8) this.belt.push(null);
    const spawns: [string, number, number][] = [['zombie', 12, 6], ['fallen', 8, 14], ['skeleton', 14, 13], ['scavenger', 26, 6], ['zombie', 28, 14], ['fallen', 6, 26]];
    for (const [id, x, y] of spawns) this.spawn(MONSTERS[id], x, y);
  }

  walkable(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && this.map[y * MAP_W + x] === FLOOR;
  }
  free(x: number, y: number, self?: Actor): boolean {
    if (!this.walkable(x, y)) return false;
    if (self !== this.player && this.player.tx === x && this.player.ty === y) return false;
    return !this.monsters.some((m) => m !== self && m.alive && m.tx === x && m.ty === y);
  }
  spawn(def: MonsterDef, x: number, y: number) {
    const roll = def.hp[0] + Math.floor(this.rnd() * (def.hp[1] - def.hp[0] + 1));
    const hp = spHp(roll, def.unique);
    this.monsters.push({ def, alive: true, x, y, tx: x, ty: y, dir: 0, path: [], prog: 0, hp, maxHp: hp, cd: 0, flash: 0 });
  }
  monsterAt(x: number, y: number) { return this.monsters.find((m) => m.alive && m.tx === x && m.ty === y) ?? null; }
  say(s: string) { this.msg = s; this.msgT = 2.5; }

  /** D1 left-click: on a monster -> walk up and attack; on floor -> walk there. */
  tapTile(t: P) {
    if (this.skillArmed) { this.skillArmed = false; this.useSkill(t); return; }
    const m = this.monsterAt(t.x, t.y);
    this.target = m;
    const goal = m ? this.adjacentTo(m) : t;
    if (!goal) return;
    const p = this.player;
    const path = findPath(MAP_W, MAP_H, (x, y) => this.walkable(x, y), { x: p.tx, y: p.ty }, goal);
    if (path) p.path = path;
  }
  adjacentTo(m: Actor): P | null {
    const p = this.player;
    if (Math.max(Math.abs(p.tx - m.tx), Math.abs(p.ty - m.ty)) <= 1) return { x: p.tx, y: p.ty };
    let best: P | null = null, bd = Infinity;
    for (const d of DIRS) {
      const x = m.tx + d.x, y = m.ty + d.y;
      if (!this.free(x, y, p)) continue;
      const dd = Math.hypot(x - p.tx, y - p.ty);
      if (dd < bd) { bd = dd; best = { x, y }; }
    }
    return best;
  }
  useSkill(t: P) {
    const sp = CLASSES[this.cls].startSpell;
    if (!sp) { this.say(`${CLASSES[this.cls].skill}: nothing to use it on`); return; }
    const s = SPELLS[sp.spell], cost = spellMana(s, sp.level);
    if (this.mana < cost) { this.say('Not enough mana'); return; }
    this.mana -= cost;
    const p = this.player, dx = t.x - p.x, dy = t.y - p.y, l = Math.hypot(dx, dy) || 1;
    p.dir = dirOf(Math.round(dx / l), Math.round(dy / l));
    this.bolts.push({ x: p.x, y: p.y, vx: (dx / l) * 8, vy: (dy / l) * 8, life: 1.5 });
  }
  useBelt(i: number) {
    const id = this.belt[i];
    if (!id) return;
    // [TEMP] potion amounts: Jarulf's exact class-weighted roll lands with the item order.
    const frac = 0.125 + this.rnd() * 0.25;
    if (id === 'potion_healing') this.player.hp = Math.min(this.player.maxHp, this.player.hp + Math.ceil(this.player.maxHp * frac));
    if (id === 'potion_mana') this.mana = Math.min(this.maxMana, this.mana + Math.ceil(this.maxMana * frac));
    this.belt[i] = null;
  }
  weaponDmg(): [number, number] {
    const w = CLASSES[this.cls].startItems.map((i) => ITEMS[i]).find((i) => i.dmg);
    return w?.dmg ?? [1, 1];
  }

  step(a: Actor, dt: number, speed: number) {
    if (!a.path.length) { a.x = a.tx; a.y = a.ty; a.prog = 0; return; }
    const nx = a.path[0];
    if (a.prog === 0) {
      if (!this.free(nx.x, nx.y, a)) { a.path = []; return; }
      a.dir = dirOf(nx.x - a.tx, nx.y - a.ty);
    }
    a.prog += dt / speed;
    const fx = a.tx, fy = a.ty;
    if (a.prog >= 1) { a.tx = nx.x; a.ty = nx.y; a.path.shift(); a.prog = 0; a.x = a.tx; a.y = a.ty; }
    else { a.x = fx + (nx.x - fx) * a.prog; a.y = fy + (nx.y - fy) * a.prog; }
  }

  update(dt: number) {
    const p = this.player;
    if (p.hp <= 0) return;
    this.msgT = Math.max(0, this.msgT - dt);
    p.cd = Math.max(0, p.cd - dt); p.flash = Math.max(0, p.flash - dt);
    const t = this.target;
    if (t && t.alive && p.prog === 0 && Math.max(Math.abs(p.tx - t.tx), Math.abs(p.ty - t.ty)) <= 1) {
      p.path = []; p.dir = dirOf(t.tx - p.tx, t.ty - p.ty);
      if (p.cd === 0) { p.cd = ATTACK_S; this.attackMonster(t); }
    } else if (t && t.alive && p.prog === 0 && !p.path.length) {
      this.tapTile({ x: t.tx, y: t.ty });
    }
    this.step(p, dt, WALK_TILE_S);
    for (const m of this.monsters) if (m.alive) this.updateMonster(m, dt);
    for (const b of this.bolts) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      const tx = Math.round(b.x), ty = Math.round(b.y);
      if (!this.walkable(tx, ty)) { b.life = 0; continue; }
      const m = this.monsterAt(tx, ty);
      if (m) { b.life = 0; this.hurt(m, 1 + Math.floor(this.rnd() * 10) + 2); } // [TEMP] Firebolt slvl2 dmg roll
    }
    this.bolts = this.bolts.filter((b) => b.life > 0);
  }

  attackMonster(m: Monster) {
    const c = CLASSES[this.cls];
    const chance = meleeToHit(this.cls, c.base.dex, this.clvl, m.def.ac);
    if (this.rnd() * 100 >= chance) return;
    const [lo, hi] = this.weaponDmg();
    this.hurt(m, lo + Math.floor(this.rnd() * (hi - lo + 1)) + damageMod(this.cls, c.base, this.clvl));
  }
  hurt(m: Monster, dmg: number) {
    m.hp -= dmg; m.flash = 0.15;
    if (m.hp <= 0) {
      m.alive = false;
      if (this.target === m) this.target = null;
      // [JARULF] exp = mExp * (1 + (mlvl - clvl)/10), never below 0.
      this.exp += Math.max(0, Math.floor(m.def.exp * (1 + (m.def.mlvl - this.clvl) / 10)));
    }
  }
  updateMonster(m: Monster, dt: number) {
    const p = this.player;
    m.cd = Math.max(0, m.cd - dt); m.flash = Math.max(0, m.flash - dt);
    const dist = Math.max(Math.abs(p.tx - m.tx), Math.abs(p.ty - m.ty));
    if (m.prog === 0 && dist <= 1) {
      m.path = []; m.dir = dirOf(p.tx - m.tx, p.ty - m.ty);
      if (m.cd === 0) {
        m.cd = ATTACK_S * 1.5;
        const ac = baseAc(CLASSES[this.cls].base.dex);
        if (this.rnd() * 100 < monsterToHit(m.def.toHit, m.def.mlvl, this.clvl, ac)) {
          const [lo, hi] = m.def.dmg;
          p.hp = Math.max(0, p.hp - (lo + Math.floor(this.rnd() * (hi - lo + 1)))); p.flash = 0.15;
          if (p.hp <= 0) this.say('You have died');
        }
      }
    } else if (m.prog === 0 && dist <= 8 && !m.path.length) {
      const path = findPath(MAP_W, MAP_H, (x, y) => this.walkable(x, y), { x: m.tx, y: m.ty }, { x: p.tx, y: p.ty }, 600);
      if (path && path.length > 1) m.path = path.slice(0, 1);
    }
    this.step(m, dt, WALK_TILE_S * 1.6);
  }
}
