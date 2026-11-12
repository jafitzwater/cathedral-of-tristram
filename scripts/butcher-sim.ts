// Order 10 U12: Butcher fight simulation, per class, at clvl 4 (D1 starting gear + the drops of a full L1 clear + 4 healing
// potions). Drives the real Game (same combat code as the build): a simple player bot fights at the Butcher's door, drinks a
// healing potion under 40% life (and a mana potion when a Sorcerer runs dry), Sorcerers cast Firebolt, then staff bolts.
// Usage: npx tsx scripts/butcher-sim.ts [fights per class]
import { Game } from '../src/game';
import { DIRS, tileToScreen } from '../src/iso';
import { T, at } from '../src/levels/types';
import { EXP_LEVELS, type ClassId } from '../src/data/classes';
import { addExp, derive, pickUp, spendStat } from '../src/player';
import { getItemAttrs } from '../src/itemgen';
import { IDI } from '../src/data/items';

export interface SimResult { cls: ClassId; n: number; wins: number; clearExp: number; clearClvl: number; potionsFound: number; avgLeftHp: number; avgTime: number; bLeft: number }
const BUILD: Record<ClassId, [keyof import('../src/data/classes').Stats, number][]> = {
  warrior: [['str', 8], ['dex', 2], ['vit', 5]], rogue: [['dex', 8], ['str', 2], ['vit', 5]], sorcerer: [['mag', 10], ['vit', 5]],
};
/** Full L1 clear: every monster except the Butcher dies (D1 drops), every container opens, the hero picks up everything (U1/U11). */
export function clearL1(g: Game): { exp: number; potions: number } {
  g.travel('l1', null); g.finishTravel();
  const h = g.hero, e0 = h.exp;
  for (const m of g.level.monsters) if (m.alive && m.def.id !== 'butcher') g.killMon(m);
  for (const o of g.level.map.objects) if (!o.used && (o.kind.startsWith('chest') || o.kind === 'sarc' || o.kind === 'barrel' || o.kind === 'barrel_ex')) {
    if (o.kind === 'barrel' || o.kind === 'barrel_ex') { const hp = h.hp; g.breakBarrel(o); h.hp = Math.max(hp, 1); } else g.operate(o);
  }
  let potions = 0;
  for (const gi of [...g.level.items]) {
    if (gi.item.misc === 'IMISC_HEAL' || gi.item.misc === 'IMISC_FULLHEAL') potions++;
    if (pickUp(h, gi.item)) g.level.items.splice(g.level.items.indexOf(gi), 1);
  }
  g.refresh();
  return { exp: h.exp - e0, potions };
}
export function fight(cls: ClassId, seed: number, maxS = 180): { win: boolean; hp: number; t: number; exp: number; clvl: number; potions: number; bLeft: number } {
  const g = new Game('Sim', cls, seed);
  const clr = clearL1(g); const clvl = g.hero.clvl;
  const h = g.hero;
  if (h.exp < EXP_LEVELS[3]) addExp(h, EXP_LEVELS[3] - h.exp);
  h.statPts = 15; for (const [k, n] of BUILD[cls]) for (let i = 0; i < n; i++) spendStat(h, k);
  // exactly 4 healing potions in the belt (the Sorcerer keeps any mana potions)
  h.belt = h.belt.map((i) => (i && i.misc === 'IMISC_MANA' ? i : null));
  let k = 0; for (let i = 0; i < 8 && k < 4; i++) if (!h.belt[i]) { h.belt[i] = getItemAttrs(g.rng, IDI.HEAL, 1); k++; }
  g.refresh(); const d0 = derive(h); h.hp = d0.maxHp; h.mana = d0.maxMana;
  // stand two tiles outside the Butcher's door and open it
  const m = g.level.map, br = m.butcherRoom!;
  let door: { x: number; y: number; nx: number; ny: number } | null = null;
  for (let y = br.y - 1; y <= br.y + br.h && !door; y++) for (let x = br.x - 1; x <= br.x + br.w && !door; x++) {
    const t = at(m, x, y); if (t !== T.DOOR && t !== T.DOOR_OPEN) continue;
    const nx = x < br.x ? -1 : x >= br.x + br.w ? 1 : 0, ny = y < br.y ? -1 : y >= br.y + br.h ? 1 : 0;
    door = { x, y, nx, ny };
  }
  if (!door) throw new Error('no butcher door');
  for (const mm of g.level.monsters) if (mm.def.id !== 'butcher') mm.alive = false;
  g.p.x = g.p.tx = door.x + door.nx * 2; g.p.y = g.p.ty = door.y + door.ny * 2; g.p.path = []; g.p.prog = 0;
  if (at(m, door.x, door.y) === T.DOOR) g.toggleDoor(door.x, door.y);
  const b = g.level.monsters.find((mm) => mm.def.id === 'butcher')!;
  const drink = (misc: string) => { const it = h.belt.find((i) => i && i.misc === misc); return it ? g.useItem(it) : false; };
  let t = 0, kiteT = 0, lastHp = h.hp;
  // Reactive kiting (ranged classes): after taking a hit from him, step away for 0.45 s to the free neighbour farthest from him.
  const kite = () => {
    let best: { x: number; y: number } | null = null, bd = -1;
    for (const dd of DIRS) {
      const x = g.p.tx + dd.x, y = g.p.ty + dd.y;
      if (!g.tileWalk(x, y) || (x === b.tx && y === b.ty)) continue;
      const dist = Math.hypot(x - b.x, y - b.y) + 0.3 * [-1, 0, 1].reduce((a, k) => a + (g.tileWalk(x + dd.x, y + dd.y) ? 1 : 0), 0);
      if (dist > bd) { bd = dist; best = dd; }
    }
    if (!best) return false;
    const sv = tileToScreen(best.x, best.y), l = Math.hypot(sv.x, sv.y); g.move = { x: sv.x / l, y: sv.y / l, mag: 1 }; return true;
  };
  const KITE = cls !== 'warrior' && (globalThis as any).process?.env?.KITE !== '0';
  for (; t < maxS && b.alive && !g.dead; t += 1 / 60) {
    const d = g.d, idle = g.p.state === 'idle' || g.p.state === 'walk';
    if (idle && h.hp < d.maxHp * 0.4 && drink('IMISC_HEAL')) { g.update(1 / 60); continue; }
    if (kiteT > 0) { kiteT -= 1 / 60; g.attackHeld = false; g.update(1 / 60); if (kiteT <= 0) g.move = null; continue; }
    const bdist = Math.max(Math.abs(b.tx - g.p.tx), Math.abs(b.ty - g.p.ty));
    const hurt = h.hp < lastHp; lastHp = h.hp;
    if (KITE && hurt && bdist <= 1 && kite()) { kiteT = 0.45; g.attackHeld = false; g.update(1 / 60); continue; }
    if (cls === 'sorcerer' && idle) {
      g.attackHeld = false;
      if (h.mana >= 6 && h.spells.firebolt) g.castId('firebolt');
      else if (drink('IMISC_MANA')) { /* drank */ }
      else if (h.body.handL?.charges) g.castId('staff:charged_bolt');
      else g.attackHeld = true;
    } else if (cls !== 'sorcerer') g.attackHeld = true;
    g.update(1 / 60);
  }
  return { win: !b.alive, hp: h.hp / g.d.maxHp, t, exp: clr.exp, clvl, potions: clr.potions, bLeft: Math.max(0, b.hp) / b.maxHp };
}
export function simulate(n: number, seed0 = 1): SimResult[] {
  return (['warrior', 'rogue', 'sorcerer'] as ClassId[]).map((cls) => {
    let wins = 0, exp = 0, cl = 0, pot = 0, left = 0, time = 0, bl = 0;
    for (let i = 0; i < n; i++) {
      const r = fight(cls, seed0 + i * 7919); if (r.win) { wins++; left += r.hp; time += r.t; } else bl += r.bLeft;
      exp += r.exp; cl += r.clvl; pot += r.potions;
    }
    return { cls, n, wins, clearExp: Math.round(exp / n), clearClvl: +(cl / n).toFixed(2), potionsFound: +(pot / n).toFixed(2), avgLeftHp: +(left / Math.max(1, wins)).toFixed(2), avgTime: +(time / Math.max(1, wins)).toFixed(1), bLeft: +(bl / Math.max(1, n - wins)).toFixed(2) };
  });
}
if (process.argv[1]?.endsWith('butcher-sim.ts')) {
  const n = Number(process.argv[2] ?? 100);
  for (const r of simulate(n, Number((globalThis as any).process?.env?.SEED0 ?? 1))) console.log(`${r.cls.padEnd(8)} win ${(100 * r.wins / r.n).toFixed(0)}% (${r.wins}/${r.n})  L1 clear exp ${r.clearExp} -> clvl ${r.clearClvl}  heal potions found ${r.potionsFound}  winners' life left ${(r.avgLeftHp * 100).toFixed(0)}%  fight ${r.avgTime}s  losses: Butcher life left ${(r.bLeft * 100).toFixed(0)}%`);
}
