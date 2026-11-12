import assert from 'node:assert/strict';
import { CLASSES, EXP_LEVELS, START_GOLD, baseLife, baseMana } from '../src/data/classes';
import { ITEMS } from '../src/data/items';
import { MONSTERS, spHp } from '../src/data/monsters';
import { SPELLS, spellMana } from '../src/data/spells';

const { warrior: w, rogue: r, sorcerer: s } = CLASSES;
// D1 v1.09 starting sheets: life/mana 70/10, 45/22, 30/70
assert.deepEqual([baseLife(w, 1), baseMana(w, 1)], [70, 10]);
assert.deepEqual([baseLife(r, 1), baseMana(r, 1)], [45, 22]);
assert.deepEqual([baseLife(s, 1), baseMana(s, 1)], [30, 70]);
assert.deepEqual(w.base, { str: 30, mag: 10, dex: 20, vit: 25 });
assert.deepEqual(r.base, { str: 20, mag: 15, dex: 30, vit: 20 });
assert.deepEqual(s.base, { str: 15, mag: 35, dex: 15, vit: 20 });
assert.deepEqual([w.max.str, r.max.dex, s.max.mag], [250, 250, 250]);
assert.deepEqual([w.baseToBlock, r.baseToBlock, s.baseToBlock], [30, 20, 10]);
assert.equal(START_GOLD, 100);
assert.equal(EXP_LEVELS.length, 51);
assert.equal(EXP_LEVELS[1], 2000);
for (let i = 1; i < EXP_LEVELS.length; i++) assert.ok(EXP_LEVELS[i] > EXP_LEVELS[i - 1]);
for (const c of Object.values(CLASSES)) for (const it of c.startItems) assert.ok(ITEMS[it], `${c.id} item ${it}`);
assert.equal(s.startSpell?.spell, 'firebolt');

assert.deepEqual(ITEMS.short_sword.dmg, [2, 6]);
assert.deepEqual(ITEMS.buckler.ac, [3, 3]);
assert.deepEqual(ITEMS.short_bow.dmg, [1, 4]);

assert.deepEqual([MONSTERS.zombie.hp, MONSTERS.zombie.ac, MONSTERS.zombie.exp], [[4, 7], 5, 54]);
assert.deepEqual([MONSTERS.fallen.dmg, MONSTERS.skeleton.toHit, MONSTERS.scavenger.exp], [[1, 3], 20, 80]);
assert.equal(MONSTERS.butcher.hp[0], 220);
assert.equal(spHp(4), 2); assert.equal(spHp(1), 1); assert.equal(spHp(220, true), 220);
for (const m of Object.values(MONSTERS)) { assert.ok(m.hp[0] <= m.hp[1] && m.dmg[0] <= m.dmg[1] && m.exp > 0, m.id); }

assert.equal(SPELLS.firebolt.mana, 6);
assert.equal(spellMana(SPELLS.firebolt, 2), 5);
assert.equal(spellMana(SPELLS.charged_bolt, 9), 6, 'floors at minMana');
console.log('data ok');
