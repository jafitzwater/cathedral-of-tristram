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
MONSTERS.butcher = { ...b, mlvl: b.mlvl + 5, hp: [110, 110], dmg: [6, 12], exp: b.exp * 2, unique: true, quote: 'Ah, fresh meat!' };

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
