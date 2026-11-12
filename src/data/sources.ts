/**
 * Sources for every table in /src/data (Diablo 1 v1.09, single player).
 * - [JARULF] Jarulf's Guide to Diablo and Hellfire v1.62 (formulas: life/mana, to-hit, damage, block).
 * - [DEVIL] diasurgical/devilution (bit-exact reconstruction of the v1.09 executable):
 *   Source/player.cpp (StrengthTbl, MagicTbl, DexterityTbl, VitalityTbl, MaxStats, ToBlkTbl,
 *   ExpLvlsTbl, CreatePlayer, NextPlrLevel), Source/monstdat.cpp (MonsterData, UniqMonst),
 *   Source/itemdat.cpp (AllItemsList), Source/spelldat.cpp (spelldata).
 * Values marked [TEMP] could not be confirmed against either source.
 */
export const SOURCES = {
  JARULF: "Jarulf's Guide to Diablo and Hellfire v1.62",
  DEVIL: 'github.com/diasurgical/devilution (v1.09 reconstruction)',
} as const;
