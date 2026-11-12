import assert from 'node:assert/strict';
import { Rng } from '../src/rng';
import { CLASSES } from '../src/data/classes';
import { IDI, idxOf, BASE } from '../src/data/items';
import { newHero, derive, meleeToHit, bowToHit, monsterToHit, blockChance, rollDamage, hitRecoveryTicks, monsterStunned, fireboltDamage,
  chargedBoltDamage, healAmount, potionAmount, killExp, addExp, spendStat, autoPlace, equip, pickUp, repairSkill, rechargeSkill } from '../src/player';
import { getItemAttrs, setupAllItems, calcItemValue, saveItemPower, sellPrice, rndMonsterItem, spawnSmith, spawnWitch, spawnHealer, spawnPremium, storeLevel, goldRoll } from '../src/itemgen';
import { PREFIXES } from '../src/data/items';

const rng = new Rng(7);
// --- starting heroes (CreatePlayer / CreatePlrItems) ---
const w = newHero('W', 'warrior', rng), r = newHero('R', 'rogue', rng), s = newHero('S', 'sorcerer', rng);
const dw = derive(w), dr = derive(r), ds = derive(s);
assert.deepEqual([dw.maxHp, dw.maxMana, w.hp, w.mana, w.gold], [70, 10, 70, 10, 100]);
assert.deepEqual([dr.maxHp, dr.maxMana], [45, 22]);
assert.deepEqual([ds.maxHp, ds.maxMana], [30, 70]);
assert.equal(w.body.handL!.name, 'Short Sword'); assert.equal(w.body.handR!.name, 'Buckler'); assert.equal(w.inv[0].item.name, 'Club');
assert.equal(r.body.handL!.name, 'Short Bow'); assert.equal(s.body.handL!.name, 'Short Staff of Charged Bolt');
assert.equal(s.spells.firebolt, 2, 'Sorcerer starts with Firebolt slvl 2');
assert.equal(w.belt.filter(Boolean).length, 2);
// AC = dex/5 + buckler 3; to-hit 50 + 10 + 1 + 20 - 5 = 76 vs a zombie
assert.equal(dw.ac, 4 + 3);
assert.equal(meleeToHit(w, dw, 5), 76);
assert.equal(meleeToHit(s, ds, 200), 5, 'min 5');
assert.equal(bowToHit(r, dr, 0), 95, "50+30+1+20 capped at 95"); assert.equal(bowToHit(r, dr, 50), 51);
assert.equal(monsterToHit(10, 1, 1, 7), 33);
assert.equal(monsterToHit(0, 1, 30, 100), 15, 'min 15');
assert.equal(blockChance(w, dw, 1), 20 + 30 + 0);
assert.equal(blockChance(r, dr, 1), 0, 'no shield, no block');
assert.deepEqual([hitRecoveryTicks(w, dw), hitRecoveryTicks(r, dr), hitRecoveryTicks(s, ds)], [6, 7, 8]);
assert.ok(monsterStunned(4, 1) && !monsterStunned(3, 1));
// damage: short sword 2-6, +0 char mod at clvl1
for (let i = 0; i < 200; i++) { const d = rollDamage(w, dw, rng); assert.ok(d >= 2 && d <= 12, `dmg ${d}`); }
assert.deepEqual(fireboltDamage(35, 2), [4 + 2 + 1, 4 + 2 + 10]);
assert.deepEqual(chargedBoltDamage(35), [1, 9]);
for (let i = 0; i < 50; i++) { const v = potionAmount(w, 70, true, rng); assert.ok(v >= 16 && v <= 2 * (8 + 16), `potion ${v}`); }
for (let i = 0; i < 50; i++) { const v = healAmount(s, 1, rng); assert.ok(v >= 3 && v <= 20); }
// experience & levels
assert.equal(killExp(54, 1, 1), 54); assert.equal(killExp(54, 1, 11), 0); assert.equal(killExp(1420, 6, 1), 1420 * 1.5);
const lw = newHero('L', 'warrior', rng);
assert.equal(addExp(lw, 2000), 1); assert.equal(lw.clvl, 2); assert.equal(lw.statPts, 5);
assert.equal(derive(lw).maxHp, 72, 'warrior +2 life per level'); assert.equal(lw.hp, 72);
spendStat(lw, 'vit'); assert.equal(derive(lw).maxHp, 74, 'warrior +2 life per vitality');
const ls = newHero('L2', 'sorcerer', rng); addExp(ls, 4620); assert.equal(ls.clvl, 3); assert.deepEqual([derive(ls).maxHp, derive(ls).maxMana], [32, 74]);
spendStat(ls, 'mag'); assert.equal(derive(ls).maxMana, 76, 'sorcerer +2 mana per magic');
for (let i = 0; i < 300; i++) spendStat(ls, 'str');
assert.ok(ls.base.str <= CLASSES.sorcerer.max.str);

// --- items ---
const it = getItemAttrs(rng, IDI.WARRIOR, 1);
it.vadd1 = 0; it.vmult1 = 0;
saveItemPower(rng, it, PREFIXES.find((p) => p.name === 'Bronze')!);
assert.ok(it.toHit >= 1 && it.toHit <= 5); calcItemValue(it);
assert.ok(it.ivalue >= 100 + 2 * 50 && it.ivalue <= 500 + 100, `bronze value ${it.ivalue}`);
assert.equal(sellPrice(getItemAttrs(rng, IDI.WARRIOR, 1)), Math.floor(50 / 4));
let magic = 0, unid = 0;
for (let i = 0; i < 400; i++) { const x = setupAllItems(rng, idxOf('Long Sword'), 10, 1, false); if (x.magical) { magic++; if (!x.identified) unid++; for (const p of [x.pre, x.suf].filter(Boolean)) { const a = PREFIXES.find((q) => q.name === p) ?? null; if (a) assert.ok(a.minlvl <= 10, 'qlvl filter'); } } assert.ok(x.dur >= 1 && x.dur <= x.maxDur); }
assert.ok(magic > 0 && magic < 400 && unid === magic, 'magic drops are unidentified');
let drops = 0, gold = 0;
for (let i = 0; i < 2000; i++) { const d = rndMonsterItem(rng, 1); if (d >= 0) drops++; if (d === 0) gold++; if (d > 0) assert.ok(BASE[d].iMinMLvl <= 1); }
assert.ok(drops > 700 && drops < 950, `~41% drop rate: ${drops}`); assert.ok(gold / drops > 0.65 && gold / drops < 0.82);
for (let i = 0; i < 100; i++) { const g = goldRoll(rng, 1); assert.ok(g >= 5 && g <= 14); }
// stores
assert.equal(storeLevel(0), 6); assert.equal(storeLevel(1), 6); assert.equal(storeLevel(15), 16);
const sm = spawnSmith(rng, 6); assert.ok(sm.length >= 10 && sm.length < 20 && sm.every((i) => i.identified && !['ITYPE_MISC', 'ITYPE_STAFF', 'ITYPE_RING'].includes(i.itype)));
const wi = spawnWitch(rng, 6); assert.deepEqual(wi.slice(0, 3).map((i) => i.name), ['Potion of Mana', 'Potion of Full Mana', 'Scroll of Town Portal']);
const he = spawnHealer(rng, 6); assert.deepEqual(he.slice(0, 2).map((i) => i.name), ['Potion of Healing', 'Potion of Full Healing']);
const pr = spawnPremium(rng, 1); assert.equal(pr.items.length, 6); assert.ok(pr.items.every((i) => i && i.magical));
// inventory, equip, skills
const inv = newHero('I', 'warrior', rng);
assert.ok(autoPlace(inv, getItemAttrs(rng, idxOf('Quilted Armor'), 1)));
const armour = inv.inv.find((e) => e.item.name === 'Quilted Armor')!.item;
assert.equal(equip(inv, armour), null); assert.equal(inv.body.chest, armour); assert.ok(derive(inv).ac >= 7 + 7);
const bow = getItemAttrs(rng, IDI.ROGUE, 1); autoPlace(inv, bow);
assert.equal(equip(inv, bow), null); assert.equal(inv.body.handL, bow); assert.equal(inv.body.handR, null, 'two-hander frees the off hand');
let n = 0; while (pickUp(inv, getItemAttrs(rng, IDI.HEAL, 1))) if (++n > 60) break;
assert.ok(n < 60 && inv.belt.every(Boolean), 'belt fills first, then the 10x4 grid');
const worn = getItemAttrs(rng, IDI.WARRIOR, 1); worn.dur = 5;
assert.ok(repairSkill(worn, 1, rng)); assert.equal(worn.dur, worn.maxDur); assert.ok(worn.maxDur < 20, 'repair skill costs max durability');
const staff = getItemAttrs(rng, IDI.SORCEROR, 1); staff.charges = 0;
assert.ok(rechargeSkill(staff, 5, 1, rng)); assert.ok(staff.charges === staff.maxCharges && staff.maxCharges < 40);
console.log('formulas ok');
