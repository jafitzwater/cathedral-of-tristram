// Order 19: going live from staging must not lose anyone's progress. The fixture was written by the live build's own code
// (main 3a66cad, Order 11c: `git archive` + its saveGame) under the production 'cot.' keys; this build must list and load it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SAVE_NS, SAVE_VERSION, listHeroes, loadGame, peekHero, saveGame, serialize } from '../src/save';

const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/live-saves-o11c.json', import.meta.url), 'utf8')) as { storage: Record<string, string> };
const mem = new Map(Object.entries(fx.storage));
const st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };

assert.equal(SAVE_NS, 'cot.', 'production key');
assert.deepEqual(listHeroes(st), ['Aidan', 'Merlin'], 'live hero list');
const live = JSON.parse(fx.storage['cot.save.Aidan']);
assert.equal(live.v, SAVE_VERSION, 'same save format as live (no migration needed)');
const a = loadGame(st, 'Aidan')!;
assert.ok(a, 'live warrior save loads');
assert.equal(a.hero.cls, 'warrior'); assert.equal(a.hero.clvl, 4); assert.equal(a.hero.exp, 3100); assert.equal(a.hero.gold, 1234);
assert.equal(a.hero.statPts, 2); assert.equal(a.hero.base.str, live.hero.base.str); assert.equal(a.quests.butcher, 'active');
assert.equal(a.cur, 'l1', 'still in the cathedral');
assert.ok(a.level.items.some((x) => x.item.name === 'Long Sword'), 'loot on the floor kept');
assert.equal(a.level.monsters.filter((m) => !m.alive).length, live.levels.l1.monsters.filter((m: { alive: boolean }) => !m.alive).length, 'dead monsters stay dead');
assert.equal(peekHero(st, 'Merlin')!.cls, 'sorcerer');
const s = loadGame(st, 'Merlin')!; assert.equal(s.cur, 'town'); assert.equal(s.hero.gold, 50);
// playing on and saving keeps everything under the same keys, nothing wiped
a.hero.gold += 1; saveGame(st, a);
assert.deepEqual([...mem.keys()].sort(), ['cot.heroes', 'cot.save.Aidan', 'cot.save.Merlin']);
assert.deepEqual(listHeroes(st), ['Aidan', 'Merlin']);
const a2 = loadGame(st, 'Aidan')!; assert.equal(a2.hero.gold, 1235);
assert.equal(JSON.stringify(serialize(a2)), JSON.stringify(serialize(a)), 'round trip lossless');
console.log('livesave: OK (live Order 11c saves list + load under cot., format v1 unchanged, re-save keeps both heroes)');
