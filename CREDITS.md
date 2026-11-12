# Credits

Cathedral of Tristram is a fan-made, non-commercial browser homage to Blizzard's Diablo (1996).
It ships **no Blizzard files**: no MPQ data, sprites, sounds, music or game text.

## Art (all CC0 1.0, imported by scripts/import-art.mjs, listed in public/art/manifest.json)
- art/tiles-floors.png: isometric ground tiles by rubberduck, https://opengameart.org/content/isometric-ground-tiles (CC0 1.0)
- art/tiles-plants.png: isometric plants by rubberduck (models/textures by yughues), https://opengameart.org/content/free-isometric-plants-pack (CC0 1.0)
- art/tiles-walls-props.png: Isometric Miniature Dungeon by Kenney (www.kenney.nl), https://kenney.nl/assets/isometric-miniature-dungeon (CC0 1.0)
- art/items-items.png: inventory icons painted by the Project Tristram sprite director (CC0 1.0)
- art/ui-*.png: control panel, orbs, belt slot and inventory panel by the Project Tristram sprite director, orb bezels from itsmars "Health Orb 1.1", https://opengameart.org/content/health-orb-11 (CC0 1.0)

## Missing art (code-drawn placeholders for now)
- Hero, NPC and monster sprite sheets: hero and NPC atlases exist in the art pack, but their sidecars declare no license or source, so they are not shipped until one is added. No monster art has landed yet.
- Character sheet and spellbook panels: the art-pack versions are mockups with stat values painted in, so code-drawn panels are used instead.
- Cathedral walls, doors, town houses, the well, crosses, sarcophagi, shrines, tortured bodies, the town portal, missiles and spell effects.
- Title screen and menu art, the item icons not in the 20-icon set (the closest base icon is used instead), and the cursor.
- Audio: no sound or music files yet. Sound effects are synthesized blips and music is silent.

## Game data references (numbers only)
- diasurgical/devilution (github.com/diasurgical/devilution): reconstructed Diablo v1.09 source. The numeric tables in src/data/gen/ (items, affixes, spells and monsters) are extracted from itemdat.cpp, spelldat.cpp and monstdat.cpp by scripts/extract_d1.py, with Hellfire rows removed. The formulas in player.ts, itemgen.ts and game.ts follow player.cpp, items.cpp, monster.cpp, missiles.cpp, objects.cpp and stores.cpp.
- Jarulf's Guide to Diablo and Hellfire v1.62 (Pedro Faria "Jarulf"): to-hit, block, damage, experience and store formulas.
- NPC dialogue is original writing. The only quoted lines are "Ah, fresh meat!" and "Stay a while and listen".

Diablo is a trademark of Blizzard Entertainment, Inc. This project is not affiliated with or endorsed by Blizzard.
