# Credits

Cathedral of Tristram is a fan-made, non-commercial browser homage to Blizzard's Diablo (1996).
It ships **no Blizzard files**: no MPQ data, sprites, sounds, music or game text.

## Art (all CC0 1.0, imported by scripts/import-art.mjs, listed with licenses in public/art/manifest.json)
- art/heroes-*.png, art/npcs-*.png, art/monsters-*.png: Warrior, Rogue, Sorcerer, the eight Tristram townsfolk, Zombie, Fallen One, Skeleton, Scavenger and the Butcher, rendered by the Project Tristram sprite director from Quaternius "Universal Base Characters" + "Universal Animation Library" and the Quaternius "Animated Monster Pack" (skeleton), https://quaternius.com (CC0 1.0), dressed with self-made CC0 clothes, hair and props. The Scavenger model and rig are self-made (CC0 1.0).
- art/tiles-town-floors.png, art/tiles-cath-floors.png: isometric ground tiles by rubberduck (split into town and Cathedral sets), https://opengameart.org/content/isometric-ground-tiles (CC0 1.0)
- art/tiles-plants.png: isometric plants by rubberduck (models/textures by yughues), https://opengameart.org/content/free-isometric-plants-pack (CC0 1.0)
- art/tiles-walls-props.png: Isometric Miniature Dungeon 2.3 by Kenney (www.kenney.nl), https://kenney.nl/assets/isometric-miniature-dungeon (CC0 1.0)
- art/town-buildings.png (+ art/town-layout.json, the D1 Tristram placement table): Griswold's smithy, Pepin's house, Ogden's tavern and the town well from the Quaternius "Medieval Village Pack", https://quaternius.com (CC0 1.0), retextured with thatch; Adria's hut, the cathedral front, the fence, the bridge and the two trees self-made by the Project Tristram sprite director (CC0 1.0). The art pack's CREDITS.md declares every file CC0 1.0; the atlas sidecar has no license field of its own.
- Order 11b town set pieces in art/town-buildings.png: Gillian's house, the crates and the cart from the Quaternius "Medieval Village Pack", https://quaternius.com (CC0 1.0); Farnham's, the north, north-west and south-east cottages, the catacombs hut, cave mouth, hell rift, smithy eave/anvil/forge, stone wall, headstones, dead trees, blue-grey brush, ditch and the slain townsman self-made by the Project Tristram sprite director (CC0 1.0). Stream water/bank tiles appended to art/tiles-town-floors.png by the sprite director (CC0 1.0).
- art/npcs-cow-town.png: the Tristram cows, rendered from the Quaternius "Farm Animal Pack" Cow (June 2018), https://quaternius.com/packs/farmanimal.html (CC0 1.0), 8 facings, idle head/tail loop.
- art/items-items.png: inventory icons painted by the Project Tristram sprite director (CC0 1.0)
- art/ui-*.png: life/mana orbs, belt slot and the inventory, character and spellbook panel frames (empty; values are drawn live by the game) by the Project Tristram sprite director, orb bezels and carved frames from itsmars "Health Orb 1.1", https://opengameart.org/content/health-orb-11 (CC0 1.0). The art pack's 640x128 bottom panel is not shipped (the Order 4 touch HUD replaces it).
- fonts/cinzel-latin.woff2: Cinzel by Natanael Gama / The Cinzel Project Authors (https://github.com/NDISCOVER/Cinzel), SIL Open Font License 1.1 (licence shipped as fonts/Cinzel-OFL.txt). Latin subset (16 KB) used for the HUD lettering.
- HUD skin (UI sample: stone/iron frames, glass orbs, metal sockets, cooldown sweep, rune-ring joystick, rune glyphs, stone noise): self-made, drawn with Canvas 2D in src/hudSkin.ts. No image files.
- No CC-BY packs, Mixamo, Spriters Resource rips or MPQ extracts are used. Attribution is not required under CC0; it is given gladly.

## Missing art (code-drawn for now)
- Sarcophagi, shrines, tortured bodies, the town portal, missiles and spell effects.
- While an actor's atlas is still loading (or released by the zone memory groups), a dim silhouette stands in.
- Title screen and menu art, the item icons not in the 20-icon set (the closest base icon is used instead), and the cursor.
- Audio: no sound or music files yet. Sound effects are synthesized blips and music is silent.

## Game data references (numbers only)
- diasurgical/devilution (github.com/diasurgical/devilution): reconstructed Diablo v1.09 source. The numeric tables in src/data/gen/ (items, affixes, spells and monsters) are extracted from itemdat.cpp, spelldat.cpp and monstdat.cpp by scripts/extract_d1.py, with Hellfire rows removed. The formulas in player.ts, itemgen.ts and game.ts follow player.cpp, items.cpp, monster.cpp, missiles.cpp, objects.cpp and stores.cpp.
- Jarulf's Guide to Diablo and Hellfire v1.62 (Pedro Faria "Jarulf"): to-hit, block, damage, experience and store formulas.
- NPC dialogue is original writing. The only quoted lines are "Ah, fresh meat!" and "Stay a while and listen".

Diablo is a trademark of Blizzard Entertainment, Inc. This project is not affiliated with or endorsed by Blizzard.
