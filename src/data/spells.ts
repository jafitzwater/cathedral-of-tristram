// D1 v1.09 spells, generated from devilution Source/spelldat.cpp (scripts/extract_d1.py).
import raw from './gen/spelldat.json';

interface RawSpell { id: string; mana: number; type: string; name: string; skill: string | null; bookLvl: number; staffLvl: number; targeted: boolean; town: boolean; minMag: number; manaAdj: number; minMana: number; staffMin: number; staffMax: number; bookCost: number; staffCost: number }
export interface SpellDef {
  id: string; d1: string; name: string; mana: number; type: 'fire' | 'lightning' | 'magic';
  bookLvl: number; staffLvl: number; targeted: boolean; town: boolean; minMag: number;
  manaAdj: number; minMana: number; staffMin: number; staffMax: number; bookCost: number; staffCost: number;
  /** Usable in single player (Resurrect / Heal Other are multiplayer only). */
  inSP: boolean;
}
const ID: Record<string, string> = {
  SPL_FIREBOLT: 'firebolt', SPL_HEAL: 'healing', SPL_LIGHTNING: 'lightning', SPL_FLASH: 'flash', SPL_IDENTIFY: 'identify',
  SPL_FIREWALL: 'fire_wall', SPL_TOWN: 'town_portal', SPL_STONE: 'stone_curse', SPL_INFRA: 'infravision', SPL_RNDTELEPORT: 'phasing',
  SPL_MANASHIELD: 'mana_shield', SPL_FIREBALL: 'fireball', SPL_GUARDIAN: 'guardian', SPL_CHAIN: 'chain_lightning', SPL_WAVE: 'flame_wave',
  SPL_DOOMSERP: 'doom_serpents', SPL_BLODRIT: 'blood_ritual', SPL_NOVA: 'nova', SPL_INVISIBIL: 'invisibility', SPL_FLAME: 'inferno',
  SPL_GOLEM: 'golem', SPL_BLODBOIL: 'blood_boil', SPL_TELEPORT: 'teleport', SPL_APOCA: 'apocalypse', SPL_ETHEREALIZE: 'etherealize',
  SPL_REPAIR: 'repair', SPL_RECHARGE: 'recharge', SPL_DISARM: 'disarm', SPL_ELEMENT: 'elemental', SPL_CBOLT: 'charged_bolt',
  SPL_HBOLT: 'holy_bolt', SPL_RESURRECT: 'resurrect', SPL_TELEKINESIS: 'telekinesis', SPL_HEALOTHER: 'heal_other', SPL_FLARE: 'blood_star', SPL_BONESPIRIT: 'bone_spirit',
};
const TYPES: Record<string, SpellDef['type']> = { STYPE_FIRE: 'fire', STYPE_LIGHTNING: 'lightning', STYPE_MAGIC: 'magic' };
export const SPELLS: Record<string, SpellDef> = {};
export const SPELL_BY_D1: Record<string, SpellDef> = {};
for (const r of raw as RawSpell[]) {
  const id = ID[r.id];
  if (!id || SPELLS[id]) continue;
  const s: SpellDef = { id, d1: r.id, name: r.name, mana: r.mana, type: TYPES[r.type] ?? 'magic', bookLvl: r.bookLvl, staffLvl: r.staffLvl,
    targeted: r.targeted, town: r.town, minMag: r.minMag, manaAdj: r.manaAdj, minMana: r.minMana, staffMin: r.staffMin, staffMax: r.staffMax,
    bookCost: r.bookCost, staffCost: r.staffCost, inSP: r.id !== 'SPL_RESURRECT' && r.id !== 'SPL_HEALOTHER' && r.mana > 0 };
  SPELLS[id] = s; SPELL_BY_D1[r.id] = s;
}
/** Spells this build can actually cast; others can appear on books/staves/scrolls but show "not available in this build". */
export const CASTABLE = new Set(['firebolt', 'charged_bolt', 'healing', 'holy_bolt', 'lightning', 'town_portal', 'identify', 'inferno', 'fire_wall', 'flash', 'phasing', 'mana_shield', 'infravision', 'fireball', 'nova', 'stone_curse', 'teleport', 'chain_lightning', 'flame_wave', 'guardian', 'golem', 'telekinesis', 'apocalypse', 'elemental', 'bone_spirit', 'blood_star']);
/** Mana cost at spell level: base - manaAdj*(slvl-1), floored at minMana. [JARULF] ch. 5; Healing scales up (+3/level)? kept as table. */
export function spellMana(s: SpellDef, slvl: number): number {
  return Math.max(s.minMana, s.mana - s.manaAdj * (slvl - 1));
}
