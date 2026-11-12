// Monsters, D1 v1.09, generated from devilution Source/monstdat.cpp (scripts/extract_d1.py).
// Single player halves max hp (min 1): monster.cpp InitMonster. Uniques: PlaceUniqueMonst (mlvl+5 when unset, exp x2, hp halved in SP).
import raw from './gen/monstdat.json';

export interface MonsterDef {
  id: string; name: string; mlvl: number; minDlvl: number; maxDlvl: number;
  hp: [number, number]; ac: number; toHit: number; dmg: [number, number];
  exp: number; kind: 'undead' | 'demon' | 'animal'; ai: string; int: number;
  immuneMagic: boolean; resFire: boolean; resLight: boolean; immuneFire: boolean;
  /** frame counts: stand, walk, attack, hit, death (monstdat Frames). */
  frames: number[]; unique?: boolean; quote?: string;
  /** Order 10 U12 tuning: fireMul = fire damage taken when resFire (D1 75% resist = 0.25); walk time multiplier (>1 = slower), and a short stagger on every hit (seconds; not again within cd). */
  walkMul?: number; attackMul?: number; fireMul?: number; stagger?: { t: number; cd: number };
}
interface RawMon { name: string; minDlvl: number; maxDlvl: number; mlvl: number; minHp: number; maxHp: number; ai: string; int: number; hit: number; minDam: number; maxDam: number; ac: number; mclass: string; mres: string[] | number | string; exp: number; frames: string }
const RAW = raw as RawMon[];
const KIND: Record<string, MonsterDef['kind']> = { MC_UNDEAD: 'undead', MC_DEMON: 'demon', MC_ANIMAL: 'animal' };
function mk(id: string, i: number): MonsterDef {
  const r = RAW[i];
  const res = Array.isArray(r.mres) ? r.mres : typeof r.mres === 'string' ? [r.mres] : [];
  return { id, name: r.name, mlvl: r.mlvl, minDlvl: r.minDlvl, maxDlvl: r.maxDlvl, hp: [r.minHp, r.maxHp], ac: r.ac, toHit: r.hit,
    dmg: [r.minDam, r.maxDam], exp: r.exp, kind: KIND[r.mclass] ?? 'animal', ai: r.ai, int: r.int,
    immuneMagic: res.includes('IMMUNE_MAGIC'), resFire: res.includes('RESIST_FIRE'), resLight: res.includes('RESIST_LIGHTNING'), immuneFire: res.includes('IMMUNE_FIRE'),
    frames: r.frames.replace(/[{}]/g, '').split(',').map((x) => parseInt(x, 10)) };
}
const find = (name: string, nth = 0) => RAW.map((r, i) => [r, i] as const).filter(([r]) => r.name === name)[nth][1];

export const MONSTERS: Record<string, MonsterDef> = {
  zombie: mk('zombie', find('Zombie')),
  fallen: mk('fallen', find('Fallen One', 0)),          // MT_RFALLSP (spear)
  fallen_sword: mk('fallen_sword', find('Fallen One', 1)), // MT_RFALLSD (sword)
  skeleton: mk('skeleton', find('Skeleton', 0)),        // MT_WSKELAX
  scavenger: mk('scavenger', find('Scavenger')),
  skeleton_captain: mk('skeleton_captain', find('Skeleton Captain')),
};
// The Butcher: monstdat MT_CLEAVER + UniqMonst {mlevel 0 -> mlvl+5, hp 220 halved in SP, dmg 6-12, exp x2}.
const b = mk('butcher', find('The Butcher'));
export const BUTCHER_D1 = { ...b, mlvl: b.mlvl + 5, hp: [110, 110] as [number, number], dmg: [6, 12] as [number, number], exp: b.exp * 2, unique: true, quote: 'Ah, fresh meat!' };
const E = (k: string, d: number) => Number((globalThis as { process?: { env?: Record<string, string> } }).process?.env?.[k] ?? d); // sim overrides
/**
 * Order 10 U12: tuned for Joseph so a clvl 4 hero of any class wins 60-85% (scripts/butcher-sim.ts; results in the status file).
 * D1 v1.09 single player: battle mlvl 6, 110 life (220 multiplayer), AC 50, to-hit 50, 6-12, fire+lightning resist 75%, exp 710 x2.
 * Tuned: mlvl 18 (his to-hit and the Warrior's block, the only lever that tames the Warrior without killing the Rogue), 115 life,
 * 4-9 damage, AC 25, swings 20% slower, walks 25% slower (kiting works), takes 70% fire. Exp is set so the kill pays what D1's does.
 */
export const BUTCHER_TUNE = { mlvl: E('B_LVL', 18), hp: E('B_HP', 115), dmg: [E('B_DMIN', 4), E('B_DMAX', 9)] as [number, number], ac: E('B_AC', 25), toHit: E('B_HIT', 50),
  walkMul: E('B_WALK', 1.25), attackMul: E('B_ATK', 1.2), resFire: E('B_RESF', 0.7) < 1, fireMul: E('B_RESF', 0.7), stagger: { t: E('B_ST', 0), cd: E('B_CD', 1) } };
/** Exp that makes killExp(exp, tuned mlvl, clvl 4) equal D1's killExp(1420, 6, 4). */
const butcherExp = (mlvl: number) => Math.round(BUTCHER_D1.exp * (1 + (BUTCHER_D1.mlvl - 4) / 10) / (1 + (mlvl - 4) / 10));
MONSTERS.butcher = { ...BUTCHER_D1, mlvl: BUTCHER_TUNE.mlvl, exp: butcherExp(BUTCHER_TUNE.mlvl), hp: [BUTCHER_TUNE.hp, BUTCHER_TUNE.hp], dmg: BUTCHER_TUNE.dmg, ac: BUTCHER_TUNE.ac, toHit: BUTCHER_TUNE.toHit, resFire: BUTCHER_TUNE.resFire, fireMul: BUTCHER_TUNE.fireMul,
  walkMul: BUTCHER_TUNE.walkMul, attackMul: BUTCHER_TUNE.attackMul, stagger: BUTCHER_TUNE.stagger.t > 0 ? BUTCHER_TUNE.stagger : undefined };

/** Cathedral level 1 monster types: GetLevelMTypes keeps types with 15*minDlvl/30+1 <= 1 <= 15*maxDlvl/30+1 and MonstAvailTbl != NEVER;
 * all six fit the 4000 image budget. D1 L1 has no unique monsters (Bladeskin, Soulpus, Pukerat... are dlvl 2). */
export const L1_POOL = ['zombie', 'fallen', 'fallen_sword', 'skeleton', 'scavenger', 'skeleton_captain'];
export function mtypeLevelOk(m: { minDlvl: number; maxDlvl: number }, dlvl: number) {
  return Math.trunc(15 * m.minDlvl / 30) + 1 <= dlvl && dlvl <= Math.trunc(15 * m.maxDlvl / 30) + 1;
}

/** Single-player max hp roll: table value halved, floor, at least 1. Uniques already store the halved value. */
export function spHp(roll: number, unique = false): number {
  return unique ? roll : Math.max(1, Math.floor(roll / 2));
}
