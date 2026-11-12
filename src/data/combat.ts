// D1 v1.09 melee formulas. Source: [JARULF] ch. 6 (to-hit), ch. 7 (damage); [DEVIL] player.cpp CreatePlayer, PlrHitMonst.
import type { ClassId, Stats } from './classes';

/** Character damage bonus (_pDamageMod). */
export function damageMod(cls: ClassId, s: Stats, clvl: number): number {
  return cls === 'rogue' ? Math.floor((s.str + s.dex) * clvl / 200) : Math.floor(s.str * clvl / 100);
}
/** Melee chance to hit a monster, %: 50 + dex/2 + clvl - monster AC (+20 warrior), clamped 5..95. */
export function meleeToHit(cls: ClassId, dex: number, clvl: number, monsterAc: number): number {
  const v = 50 + Math.floor(dex / 2) + clvl - monsterAc + (cls === 'warrior' ? 20 : 0);
  return Math.min(95, Math.max(5, v));
}
/** Monster chance to hit the player, %: 30 + mToHit + 2*(mlvl - clvl) - playerAC, clamped 15..95. */
export function monsterToHit(mToHit: number, mlvl: number, clvl: number, playerAc: number): number {
  const v = 30 + mToHit + 2 * (mlvl - clvl) - playerAc;
  return Math.min(95, Math.max(15, v));
}
/** Base armor class from dexterity. */
export function baseAc(dex: number): number { return Math.floor(dex / 5); }
