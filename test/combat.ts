import assert from 'node:assert/strict';
import { damageMod, meleeToHit, monsterToHit, baseAc } from '../src/data/combat';
import { Game } from '../src/game';

assert.equal(damageMod('warrior', { str: 30, mag: 10, dex: 20, vit: 25 }, 1), 0);
assert.equal(damageMod('rogue', { str: 100, mag: 0, dex: 100, vit: 0 }, 10), 10);
assert.equal(meleeToHit('warrior', 20, 1, 5), 50 + 10 + 1 - 5 + 20);
assert.equal(meleeToHit('sorcerer', 0, 1, 500), 5);
assert.equal(meleeToHit('warrior', 250, 50, 0), 95);
assert.equal(monsterToHit(10, 1, 1, 4), 36);
assert.equal(baseAc(20), 4);

// tap-to-attack: warrior walks to a zombie and kills it
let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const g = new Game('warrior', rnd);
const z = g.monsters[0];
g.tapTile({ x: z.tx, y: z.ty });
assert.equal(g.target, z);
for (let i = 0; i < 2000 && z.alive; i++) g.update(0.05);
assert.equal(z.alive, false, 'zombie died');
assert.ok(g.exp > 0);
// tap-to-move
const g2 = new Game('rogue', rnd);
g2.monsters.length = 0;
g2.tapTile({ x: 10, y: 8 });
for (let i = 0; i < 400; i++) g2.update(0.05);
assert.deepEqual([g2.player.tx, g2.player.ty], [10, 8]);
// belt potion
g2.player.hp = 1; const slot = g2.belt.findIndex((b) => b === 'potion_healing');
g2.useBelt(slot); assert.ok(g2.player.hp > 1); assert.equal(g2.belt[slot], null);
console.log('combat ok');
