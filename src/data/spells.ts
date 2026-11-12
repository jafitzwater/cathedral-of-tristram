// D1 v1.09 spells used by the starting classes and Cathedral books. Source: [DEVIL] spelldat.cpp.
export interface SpellDef {
  id: string; name: string; mana: number; type: 'fire' | 'lightning' | 'magic';
  bookLvl: number; staffLvl: number; targeted: boolean; town: boolean; minMag: number;
  manaAdj: number; minMana: number; bookCost: number;
}
export const SPELLS: Record<string, SpellDef> = {
  firebolt: { id: 'firebolt', name: 'Firebolt', mana: 6, type: 'fire', bookLvl: 1, staffLvl: 1, targeted: true, town: false, minMag: 15, manaAdj: 1, minMana: 3, bookCost: 1000 },
  healing: { id: 'healing', name: 'Healing', mana: 5, type: 'magic', bookLvl: 1, staffLvl: 1, targeted: false, town: true, minMag: 17, manaAdj: 3, minMana: 1, bookCost: 1000 },
  charged_bolt: { id: 'charged_bolt', name: 'Charged Bolt', mana: 6, type: 'lightning', bookLvl: 1, staffLvl: 1, targeted: true, town: false, minMag: 25, manaAdj: 1, minMana: 6, bookCost: 1000 },
  holy_bolt: { id: 'holy_bolt', name: 'Holy Bolt', mana: 7, type: 'magic', bookLvl: 1, staffLvl: 1, targeted: true, town: false, minMag: 20, manaAdj: 1, minMana: 3, bookCost: 1000 },
  lightning: { id: 'lightning', name: 'Lightning', mana: 10, type: 'lightning', bookLvl: 4, staffLvl: 3, targeted: true, town: false, minMag: 20, manaAdj: 1, minMana: 6, bookCost: 3000 },
  fire_wall: { id: 'fire_wall', name: 'Fire Wall', mana: 28, type: 'fire', bookLvl: 3, staffLvl: 2, targeted: true, town: false, minMag: 27, manaAdj: 2, minMana: 16, bookCost: 6000 },
  town_portal: { id: 'town_portal', name: 'Town Portal', mana: 35, type: 'magic', bookLvl: 3, staffLvl: 3, targeted: true, town: false, minMag: 20, manaAdj: 3, minMana: 18, bookCost: 3000 },
};
/** Mana cost at spell level: base - manaAdj*(slvl-1), floored at minMana. [JARULF] ch. 5. */
export function spellMana(s: SpellDef, slvl: number): number {
  return Math.max(s.minMana, s.mana - s.manaAdj * (slvl - 1));
}
