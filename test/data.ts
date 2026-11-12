import assert from 'node:assert/strict';
import { CLASSES, EXP_LEVELS, START_GOLD, baseLife, baseMana } from '../src/data/classes';
import { BASE, PREFIXES, SUFFIXES, IDI, idxOf } from '../src/data/items';
import { MONSTERS, L1_POOL, spHp, mtypeLevelOk } from '../src/data/monsters';
import { SPELLS, spellMana } from '../src/data/spells';

const { warrior: w, rogue: r, sorcerer: s } = CLASSES;
assert.deepEqual([baseLife(w, 1), baseMana(w, 1)], [70, 10]);
assert.deepEqual([baseLife(r, 1), baseMana(r, 1)], [45, 22]);
assert.deepEqual([baseLife(s, 1), baseMana(s, 1)], [30, 70]);
assert.deepEqual(w.base, { str: 30, mag: 10, dex: 20, vit: 25 });
assert.deepEqual(r.base, { str: 20, mag: 15, dex: 30, vit: 20 });
assert.deepEqual(s.base, { str: 15, mag: 35, dex: 15, vit: 20 });
assert.deepEqual([w.max.str, r.max.dex, s.max.mag], [250, 250, 250]);
assert.deepEqual([w.baseToBlock, r.baseToBlock, s.baseToBlock], [30, 20, 10]);
assert.equal(START_GOLD, 100);
assert.equal(EXP_LEVELS.length, 51); assert.equal(EXP_LEVELS[1], 2000); assert.equal(EXP_LEVELS[50], 1583495809);
for (let i = 1; i < EXP_LEVELS.length; i++) assert.ok(EXP_LEVELS[i] > EXP_LEVELS[i - 1]);

// items (itemdat.cpp)
assert.equal(BASE[0].iName, 'Gold');
const ss = BASE[IDI.WARRIOR];
assert.deepEqual([ss.iName, ss.iMinDam, ss.iMaxDam, ss.iMinStr, ss.iDurability], ['Short Sword', 2, 6, 18, 20]);
assert.deepEqual([BASE[IDI.WARRSHLD].iMinAC, BASE[IDI.WARRSHLD].iMaxAC], [3, 3]);
assert.deepEqual([BASE[IDI.ROGUE].iMinDam, BASE[IDI.ROGUE].iMaxDam], [1, 4]);
assert.equal(BASE[idxOf('Quilted Armor')].iMaxAC, 10);
assert.ok(BASE.every((b) => !/Jester|Crystalline|Doppelganger|Oil of/.test(b.iName)), 'no Hellfire items');
assert.ok(PREFIXES.length > 50 && SUFFIXES.length > 50);
assert.ok(!PREFIXES.some((p) => ["Jester's", 'Crystalline', "Doppelganger's"].includes(p.name)), 'no Hellfire prefixes');
const bronze = PREFIXES.find((p) => p.name === 'Bronze')!;
assert.deepEqual([bronze.power, bronze.p1, bronze.p2, bronze.minlvl], ['IPL_TOHIT', 1, 5, 1]);
const quality = SUFFIXES.find((p) => p.name === 'quality')!;
assert.deepEqual([quality.power, quality.p1, quality.p2, quality.minlvl], ['IPL_DAMMOD', 1, 2, 2]);

// monsters (monstdat.cpp)
assert.deepEqual([MONSTERS.zombie.hp, MONSTERS.zombie.ac, MONSTERS.zombie.exp, MONSTERS.zombie.toHit], [[4, 7], 5, 54, 10]);
assert.deepEqual([MONSTERS.fallen.dmg, MONSTERS.skeleton.toHit, MONSTERS.scavenger.exp], [[1, 3], 20, 80]);
assert.deepEqual([MONSTERS.butcher.hp[0], MONSTERS.butcher.mlvl, MONSTERS.butcher.exp, MONSTERS.butcher.ac], [110, 6, 1420, 50]);
assert.equal(spHp(4), 2); assert.equal(spHp(1), 1); assert.equal(spHp(110, true), 110);
for (const id of L1_POOL) assert.ok(mtypeLevelOk(MONSTERS[id], 1), id);
assert.ok(!mtypeLevelOk({ minDlvl: 2, maxDlvl: 5 }, 1), 'Ghoul-tier types are not on L1');

// spells (spelldat.cpp)
assert.equal(SPELLS.firebolt.mana, 6); assert.equal(spellMana(SPELLS.firebolt, 2), 5);
assert.equal(spellMana(SPELLS.charged_bolt, 9), 6, 'floors at minMana');
assert.equal(SPELLS.town_portal.mana, 35);
assert.equal(SPELLS.resurrect.inSP, false);
console.log('data ok');
