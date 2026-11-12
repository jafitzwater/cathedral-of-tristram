// D1 v1.09 classes. Source: [DEVIL] player.cpp tables + CreatePlayer/NextPlrLevel; [JARULF] ch. 2-3.
export type ClassId = 'warrior' | 'rogue' | 'sorcerer';

export interface Stats { str: number; mag: number; dex: number; vit: number }

export interface ClassDef {
  id: ClassId;
  name: string;
  base: Stats;          // StrengthTbl/MagicTbl/DexterityTbl/VitalityTbl
  max: Stats;           // MaxStats
  baseToBlock: number;  // ToBlkTbl
  /** Life = (vit + 10) * lifePerVit at creation; then lifePerLevel per clvl gained (NextPlrLevel). */
  lifePerVit: number;
  lifePerLevel: number;
  /** Mana = mag * manaPerMag at creation; then manaPerLevel per clvl gained. */
  manaPerMag: number;
  manaPerLevel: number;
  skill: string;        // class skill
  startItems: string[]; // item ids in items.ts
  startSpell?: { spell: string; level: number };
}

export const CLASSES: Record<ClassId, ClassDef> = {
  warrior: {
    id: 'warrior', name: 'Warrior',
    base: { str: 30, mag: 10, dex: 20, vit: 25 },
    max: { str: 250, mag: 50, dex: 60, vit: 100 },
    baseToBlock: 30, lifePerVit: 2, lifePerLevel: 2, manaPerMag: 1, manaPerLevel: 1,
    skill: 'repair',
    startItems: ['short_sword', 'buckler', 'club', 'potion_healing', 'potion_healing'],
  },
  rogue: {
    id: 'rogue', name: 'Rogue',
    base: { str: 20, mag: 15, dex: 30, vit: 20 },
    max: { str: 55, mag: 70, dex: 250, vit: 80 },
    baseToBlock: 20, lifePerVit: 1.5, lifePerLevel: 2, manaPerMag: 1.5, manaPerLevel: 2,
    skill: 'disarm',
    startItems: ['short_bow', 'potion_healing', 'potion_healing'],
  },
  sorcerer: {
    id: 'sorcerer', name: 'Sorcerer',
    base: { str: 15, mag: 35, dex: 15, vit: 20 },
    max: { str: 45, mag: 250, dex: 85, vit: 80 },
    baseToBlock: 10, lifePerVit: 1, lifePerLevel: 1, manaPerMag: 2, manaPerLevel: 2,
    skill: 'recharge',
    startItems: ['short_staff_cbolt', 'potion_mana', 'potion_mana'],
    startSpell: { spell: 'firebolt', level: 2 },
  },
};

export const START_GOLD = 100; // [DEVIL] CreatePlrItems (100 gold for every class)
export const STAT_POINTS_PER_LEVEL = 5; // [DEVIL] NextPlrLevel
export const MAX_CLVL = 50;

/** Life at a character level with the given (base, unequipped) vitality. Values are floored like the 1/64 fixed point. */
export function baseLife(c: ClassDef, clvl: number, vit = c.base.vit): number {
  return Math.floor((vit + 10) * c.lifePerVit) + (clvl - 1) * c.lifePerLevel;
}
export function baseMana(c: ClassDef, clvl: number, mag = c.base.mag): number {
  return Math.floor(mag * c.manaPerMag) + (clvl - 1) * c.manaPerLevel;
}

/** Experience needed to reach level index+1. [DEVIL] ExpLvlsTbl */
export const EXP_LEVELS = [0, 2000, 4620, 8040, 12489, 18258, 25712, 35309, 47622, 63364, 83419, 108879, 141086, 181683, 231075, 313656, 424067, 571190, 766569, 1025154, 1366227, 1814568, 2401895, 3168651, 4166200, 5459523, 7130496, 9281874, 12042092, 15571031, 20066900, 25774405, 32994399, 42095202, 53525811, 67831218, 85670061, 107834823, 135274799, 169122009, 210720231, 261657253, 323800420, 399335440, 490808349, 601170414, 733825617, 892680222, 1082908612, 1310707109, 1583495809];
