// Cathedral level 1 monsters, D1 v1.09. Source: [DEVIL] monstdat.cpp MonsterData / UniqMonst.
// hp is the table range; single player halves it (min 1): [DEVIL] monster.cpp InitMonster, [JARULF] ch. 4.
export interface MonsterDef {
  id: string; name: string; mlvl: number; minDlvl: number; maxDlvl: number;
  hp: [number, number]; ac: number; toHit: number; dmg: [number, number];
  exp: number; kind: 'undead' | 'demon' | 'animal'; unique?: boolean;
}

export const MONSTERS: Record<string, MonsterDef> = {
  zombie:     { id: 'zombie', name: 'Zombie', mlvl: 1, minDlvl: 1, maxDlvl: 3, hp: [4, 7], ac: 5, toHit: 10, dmg: [2, 5], exp: 54, kind: 'undead' },
  fallen:     { id: 'fallen', name: 'Fallen One', mlvl: 1, minDlvl: 1, maxDlvl: 3, hp: [1, 4], ac: 0, toHit: 15, dmg: [1, 3], exp: 46, kind: 'animal' },
  skeleton:   { id: 'skeleton', name: 'Skeleton', mlvl: 1, minDlvl: 1, maxDlvl: 3, hp: [2, 4], ac: 0, toHit: 20, dmg: [1, 4], exp: 64, kind: 'undead' },
  scavenger:  { id: 'scavenger', name: 'Scavenger', mlvl: 2, minDlvl: 1, maxDlvl: 4, hp: [3, 6], ac: 10, toHit: 20, dmg: [1, 5], exp: 80, kind: 'animal' },
  // UniqMonst "The Butcher": 220 hp listed for the unique (not halved in our single-player use), dmg 6-12; AC/hit/exp from MT_CLEAVER.
  butcher:    { id: 'butcher', name: 'The Butcher', mlvl: 10, minDlvl: 2, maxDlvl: 2, hp: [220, 220], ac: 50, toHit: 50, dmg: [6, 12], exp: 710, kind: 'demon', unique: true },
};

/** Single-player max hp roll: table value halved, floor, at least 1. */
export function spHp(roll: number, unique = false): number {
  return unique ? roll : Math.max(1, Math.floor(roll / 2));
}
