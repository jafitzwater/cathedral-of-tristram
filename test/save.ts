import assert from 'node:assert/strict';
import { Game } from '../src/game';
import { saveGame, loadGame, listHeroes, deleteHero, serialize } from '../src/save';
import { getItemAttrs } from '../src/itemgen';
import { idxOf } from '../src/data/items';

const mem = new Map<string, string>();
const st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
const g = new Game('Aidan', 'warrior', 1234);
g.travel('l1', null); g.finishTravel();
assert.equal(g.cur, 'l1');
// change state: kill a monster, open a chest, drop an item, pick up gold, spend stats, explore
const m = g.level.monsters.find((x) => x.def.id !== 'butcher')!;
g.killMon(m);
const chest = g.level.map.objects.find((o) => o.kind.startsWith('chest'))!;
g.operate(chest);
const sword = getItemAttrs(g.rng, idxOf('Long Sword'), 5); g.drop(sword, g.p.tx, g.p.ty);
g.hero.gold = 777; g.hero.statPts = 3; g.hero.base.str += 2; g.quests.butcher = 'active';
g.explore();
saveGame(st, g);
assert.deepEqual(listHeroes(st), ['Aidan']);
const g2 = loadGame(st, 'Aidan')!;
assert.ok(g2);
{ const a = JSON.stringify(serialize(g2)), b = JSON.stringify(serialize(g)); let i = 0; while (i < a.length && a[i] === b[i]) i++; assert.equal(a, b, 'round trip is lossless @' + i + ' ' + a.slice(i - 80, i + 40) + ' VS ' + b.slice(i - 80, i + 40)); }
assert.equal(g2.cur, 'l1'); assert.equal(g2.hero.gold, 777); assert.equal(g2.quests.butcher, 'active');
assert.equal(g2.level.monsters.find((x) => x.uid === m.uid)!.alive, false, 'dead monsters stay dead');
assert.equal(g2.level.map.objects.find((o) => o.id === chest.id)!.used, true);
assert.ok(g2.level.items.some((x) => x.item.uid === sword.uid));
assert.deepEqual(Array.from(g2.level.explored), Array.from(g.level.explored));
assert.equal(g2.hero.body.handL!.name, 'Short Sword');
assert.equal(g2.stores.smith.length, g.stores.smith.length);
// the loaded game still runs
for (let i = 0; i < 100; i++) g2.update(0.05);
deleteHero(st, 'Aidan');
assert.deepEqual(listHeroes(st), []); assert.equal(loadGame(st, 'Aidan'), null);
console.log('save ok');
