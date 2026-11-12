import assert from 'node:assert/strict';
import { Game } from '../src/game';
import { saveGame, loadGame, listHeroes, deleteHero, serialize, deserialize } from '../src/save';
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
{ const old = JSON.parse(JSON.stringify(serialize(g))); delete old.hero.slots; const mg = deserialize(old); assert.deepEqual(mg.hero.slots, [null, null, null, null], "pre-Order-4 save gets default slots"); assert.equal(mg.l1Seed, g.l1Seed); }
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
// Order 9: a pre-Order-9 save (56x56 Cathedral) loads into a freshly generated 80x80 level from the same seed
{
  const old = JSON.parse(JSON.stringify(serialize(g)));
  const sl = old.levels.l1; sl.tiles = new Array(56 * 56).fill(1); sl.monsters = sl.monsters.slice(0, 3); sl.items = []; sl.objects = []; sl.explored = '';
  old.pos = { x: 50, y: 50 }; old.quests.butcher = 'done'; old.portal = { x: 3, y: 3 };
  const mg = deserialize(old);
  assert.equal(mg.cur, 'l1'); assert.equal(mg.level.map.w, 80);
  assert.deepEqual({ x: mg.p.tx, y: mg.p.ty }, mg.level.map.start, 'hero placed at the new level start');
  assert.ok(mg.tileWalk(mg.p.tx, mg.p.ty));
  assert.ok(!mg.level.monsters.some((x) => x.def.id === 'butcher'), 'a killed Butcher stays dead');
  assert.ok(mg.level.monsters.length > 20 && mg.level.map.objects.length > 10, 'fresh monsters and objects');
  assert.equal(mg.portal, null, 'old portal position dropped');
  assert.equal(mg.hero.gold, 777, 'hero kept');
  for (let i = 0; i < 60; i++) mg.update(0.05);
  const again = deserialize(JSON.parse(JSON.stringify(serialize(mg)))); assert.deepEqual(Array.from(again.level.map.tiles), Array.from(mg.level.map.tiles), 'migrated save round-trips');
}
deleteHero(st, 'Aidan');
assert.deepEqual(listHeroes(st), []); assert.equal(loadGame(st, 'Aidan'), null);
// Order 9b: analog positions are fractional; the save stores the hero's tile as before and loads at that tile's centre
{ const fg = new Game('F', 'rogue', 21); const t0 = { x: fg.p.tx, y: fg.p.ty }; fg.p.x += 0.3; fg.p.y -= 0.2;
  const sd = serialize(fg); assert.deepEqual(sd.pos, t0, 'stores the tile');
  const lg = deserialize(JSON.parse(JSON.stringify(sd))); assert.deepEqual([lg.p.x, lg.p.y, lg.p.tx, lg.p.ty], [t0.x, t0.y, t0.x, t0.y], 'loads at the tile centre');
  const odd = JSON.parse(JSON.stringify(sd)); odd.pos = { x: t0.x + 0.4, y: t0.y - 0.3 }; const og = deserialize(odd); assert.deepEqual([og.p.x, og.p.y], [t0.x, t0.y], 'a fractional saved position snaps to its tile centre'); }
console.log('save ok');
