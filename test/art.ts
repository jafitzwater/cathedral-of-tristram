// Order 5: art import, lazy groups + fallback, the 32 MiB resident budget, and the feet anchors.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ArtStore, BUDGET_MIB, DIR_NAME, ROAMERS, animIndex, art, drawActor, groupsMiB, wantedGroups, type ArtManifest, type Loader } from '../src/art';
import { ZoneTracker, RELEASE_S, type ZoneView } from '../src/zones';

const m = JSON.parse(fs.readFileSync('public/art/manifest.json', 'utf8')) as ArtManifest & { skipped: { file: string }[] };
const CLASSES = ['warrior', 'rogue', 'sorcerer'];

// ---- import: CC0 only, every file present, no review/ art, groups as in the addendum ----
for (const a of m.assets) {
  assert.match(a.license, /^CC0/, `${a.key} license`);
  assert.ok(fs.existsSync(`public/art/${a.file}`), `${a.file} shipped`);
  assert.ok(!a.file.includes('review'), 'nothing from review/');
}
for (const f of fs.readdirSync('public/art')) assert.ok(f === 'manifest.json' || f === 'town-layout.json' || m.assets.some((a) => a.file === f), `stray file ${f}`);
const want = ['shared', 'town-tiles', 'dungeon-tiles', 'town-buildings', 'town-npcs', 'roamers', 'butcher', ...CLASSES.flatMap((c) => [`hero-${c}-town`, `hero-${c}-combat`]), ...ROAMERS.map((r) => `roamer-${r}-combat`)];
assert.deepEqual(Object.keys(m.groups).sort(), want.sort());
assert.equal(m.groups['town-npcs'].length, 8, 'all 8 NPC sheets');
assert.equal(m.groups.roamers.length, 4, 'four roamer idle_walk sheets');
assert.deepEqual(m.groups.butcher.sort(), ['monsters/butcher-combat', 'monsters/butcher-idle_walk']);
// Order 7 (2c split): town floors/plants + buildings only in town, cathedral floors + Kenney walls only in the dungeon
assert.deepEqual(m.groups['town-tiles'].sort(), ['tiles/plants', 'tiles/town-floors']);
assert.deepEqual(m.groups['dungeon-tiles'].sort(), ['tiles/cath-floors', 'tiles/walls-props']);
assert.deepEqual(m.groups['town-buildings'], ['town/buildings']);
assert.ok(wantedGroups('town', 'warrior').includes('town-buildings') && !wantedGroups('town', 'warrior').includes('dungeon-tiles'));
for (const z of ['cathedral', 'butcher'] as const) assert.ok(wantedGroups(z, 'rogue').includes('dungeon-tiles') && !wantedGroups(z, 'rogue').some((g) => g.startsWith('town-')));
for (const k of ['ui/panel-character', 'ui/panel-spellbook', 'ui/panel-inventory', 'ui/orb-life', 'ui/orb-mana', 'ui/orb-empty', 'ui/belt-slot']) assert.ok(m.groups.shared.includes(k), k);

// ---- memory budget: every zone / class / engaged type <= 32 MiB decoded (w*h*4) ----
let worst = 0, worstAt = '';
for (const cls of CLASSES) {
  const zones: [string, string[]][] = [['town', wantedGroups('town', cls)], ['butcher', wantedGroups('butcher', cls)], ['cathedral', wantedGroups('cathedral', cls)],
    ...ROAMERS.map((r) => [`cathedral+${r}`, wantedGroups('cathedral', cls, r)] as [string, string[]])];
  for (const [z, g] of zones) {
    const mib = groupsMiB(m, g);
    assert.ok(mib <= BUDGET_MIB, `${cls} ${z}: ${mib.toFixed(3)} MiB > 32`);
    if (mib > worst) { worst = mib; worstAt = `${cls} ${z}`; }
  }
  // only ever one roamer combat sheet
  assert.equal(wantedGroups('cathedral', cls, 'skeleton').filter((g) => g.startsWith('roamer-')).length, 1);
  assert.ok(!wantedGroups('butcher', cls).includes('roamers'), 'roamers released in the Butcher room');
  assert.ok(!wantedGroups('cathedral', cls).includes('town-npcs'));
}
console.log(`worst resident set: ${worst.toFixed(3)} MiB (${worstAt})`);

// ---- lazy loader: fake decode, release-before-load, fallback until decoded / on error ----
const live = new Set<string>();
const fake = (fail = ''): Loader => async (url) => { await new Promise((r) => setTimeout(r, 1)); if (fail && url.includes(fail)) throw new Error('404'); live.add(url); return { img: { url } as unknown as CanvasImageSource, close: () => live.delete(url) }; };
{
  const s = new ArtStore('/', fake());
  s.init(m);
  assert.equal(s.frame('warrior:idle:s:0'), null, 'nothing resident before load');
  await s.setGroups(wantedGroups('menu', null));
  assert.ok(Math.abs(s.mib - groupsMiB(m, ['shared'])) < 1e-9);
  const steps: [string, string[]][] = [];
  for (const cls of CLASSES) steps.push(['town', wantedGroups('town', cls)], ['cath', wantedGroups('cathedral', cls)], ...ROAMERS.map((r) => ['cath+' + r, wantedGroups('cathedral', cls, r)] as [string, string[]]),
    ['butcher', wantedGroups('butcher', cls)], ['cath', wantedGroups('cathedral', cls, 'zombie')], ['town', wantedGroups('town', cls)]);
  for (const [z, g] of steps) {
    await s.setGroups(g);
    assert.ok(Math.abs(s.mib - groupsMiB(m, g)) < 1e-9, `${z}: resident = group sum`);
    assert.equal(live.size, s.residentKeys().length, 'released atlases are closed');
  }
  assert.ok(s.peakMib <= BUDGET_MIB, `peak ${s.peakMib}`);
  assert.ok(Math.abs(s.peakMib - worst) < 1e-9, 'peak = worst zone set (release happens before loading)');
  // switching mid-load aborts the old fetches: resident never exceeds the larger of the two sets
  const s2 = new ArtStore('/', fake()); s2.init(m);
  void s2.setGroups(wantedGroups('town', 'sorcerer'));
  await s2.setGroups(wantedGroups('cathedral', 'sorcerer', 'skeleton'));
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(s2.peakMib <= BUDGET_MIB, `mid-load switch peak ${s2.peakMib}`);
  assert.ok(Math.abs(s2.mib - groupsMiB(m, wantedGroups('cathedral', 'sorcerer', 'skeleton'))) < 1e-9);
  console.log(`loader: peak ${s.peakMib.toFixed(3)} MiB over ${steps.length} zone switches, ${s.loads} loads, ${s.releases} releases`);
}
{
  // Order 10 U5: the wall-brightening pass briefly holds two copies of the walls atlas (+ its pixel buffer): still <= 32 MiB
  const s = new ArtStore('/', fake()); s.init(m);
  let passes = 0;
  s.post.set('tiles/walls-props', (d) => { passes++; return d; });
  for (const cls of CLASSES) for (const g of [wantedGroups('town', cls), wantedGroups('cathedral', cls), ...ROAMERS.map((r) => wantedGroups('cathedral', cls, r)), wantedGroups('butcher', cls), wantedGroups('town', cls)]) await s.setGroups(g);
  assert.ok(passes >= 3, 'the pass runs whenever the walls atlas loads');
  assert.ok(s.peakMib <= BUDGET_MIB, `peak with the wall pass ${s.peakMib.toFixed(3)} MiB`);
  console.log(`loader: peak with the U5 wall pass ${s.peakMib.toFixed(3)} MiB`);
}
{
  // a failed atlas leaves its frames absent (callers draw the fallback silhouette) without breaking the rest
  const s = new ArtStore('/', fake('warrior-town')); s.init(m);
  await s.setGroups(wantedGroups('town', 'warrior'));
  assert.equal(s.errors, 1); assert.equal(s.frame('warrior:idle:s:0'), null); assert.ok(s.frame('griswold:idle:s:0'));
  // global store + drawActor: false before load (fallback), true and anchored after
  Object.assign(art, s);
  let draws: number[][] = [];
  const ctx = { drawImage: (...a: number[]) => draws.push(a.slice(1)), save() {}, restore() {}, translate() {}, scale() {} } as unknown as CanvasRenderingContext2D;
  assert.equal(drawActor(ctx, 'warrior', 'idle', 0, 0, 100, 200), false, 'fallback while warrior sheet missing');
  assert.equal(drawActor(ctx, 'griswold', 'idle', 0, 0, 100, 200), true);
  const f = s.frame('griswold:idle:s:0')!.f, d = draws[0];
  assert.deepEqual(d.slice(0, 4), [f.x, f.y, f.w, f.h]);
  assert.equal(d[4], Math.round(100 - f.ax)); assert.equal(d[5], Math.round(200 - f.ay));
  assert.equal(d[6], f.w, 'packed scale, no upscaling'); assert.equal(d[7], f.h);
  draws = [];
}

// ---- anchors and timings ----
const T = { idle: 120, walk: 80, attack: 70, cast: 80, hit: 70, death: 100, talk: 120 } as Record<string, number>;
for (const [actor, info] of Object.entries(m.anims)) {
  for (const [action, a] of Object.entries(info.actions)) {
    assert.equal(a.ms, T[action], `${actor} ${action} timing`);
    const asset = m.assets.find((x) => x.key === a.asset)!;
    for (const dn of DIR_NAME) for (let i = 0; i < a.n; i++) {
      const f = asset.frames!.find((x) => x.id === `${actor}:${action}:${dn}:${i}`);
      assert.ok(f, `${actor}:${action}:${dn}:${i}`);
      assert.ok(f.x >= 0 && f.y >= 0 && f.x + f.w <= asset.w && f.y + f.h <= asset.h, `${f.id} inside atlas`);
      if (action === 'idle' || action === 'walk' || action === 'talk') {
        assert.ok(f.ax >= 0 && f.ax <= f.w, `${f.id} feet x inside frame (${f.ax} of ${f.w})`);
        assert.ok(f.ay >= f.h - 16 && f.ay <= f.h + 12, `${f.id} feet y at the bottom (${f.ay} of ${f.h})`);
      }
    }
  }
}
// standing heights: hero/NPC 96, roamers D1-relative and smaller, Butcher bigger
for (const a of ['warrior', 'rogue', 'sorcerer', 'griswold', 'cain']) assert.equal(m.anims[a].height, 96);
for (const r of ROAMERS) assert.ok(m.anims[r].height < 96, r);
assert.ok(m.anims.butcher.height > 96);
// timed actions spread over the game's D1 duration, loops at manifest timing, death holds its last frame
assert.equal(animIndex({ n: 16, ms: 70, asset: '' }, 'attack', 0, 0.999), 15);
assert.equal(animIndex({ n: 8, ms: 80, asset: '' }, 'walk', 80 * 9, undefined), 1);
assert.equal(animIndex({ n: 15, ms: 100, asset: '' }, 'death', 99999), 14);

// ---- zone tracker: town / cathedral engage + release / Butcher room ----
{
  const mon = (id: string, tx: number, ty: number, active = true) => ({ def: { id }, alive: true, active, tx, ty, deathT: 0 });
  const g: ZoneView = { cur: 'town', hero: { cls: 'rogue' }, p: { tx: 10, ty: 10 }, level: { map: { butcherRoom: { x: 30, y: 30, w: 8, h: 8 } }, monsters: [] } };
  const z = new ZoneTracker();
  assert.deepEqual(z.update(g, 0.1), wantedGroups('town', 'rogue'));
  g.cur = 'l1'; assert.deepEqual(z.update(g, 0.1), wantedGroups('cathedral', 'rogue'));
  g.level.monsters = [mon('zombie', 12, 10), mon('fallen_sword', 11, 11)];
  z.update(g, 0.1); assert.equal(z.engaged, 'fallen', 'nearest engaged type');
  g.level.monsters[1].tx = 14; z.update(g, 0.1); assert.equal(z.engaged, 'fallen', 'keeps its sheet while still engaged');
  g.level.monsters.splice(1, 1); z.update(g, 0.1); assert.equal(z.engaged, 'zombie', 'switches when the type disengages');
  g.level.monsters = []; for (let t = 0; t < RELEASE_S - 0.2; t += 0.1) z.update(g, 0.1);
  assert.equal(z.engaged, 'zombie'); z.update(g, 0.5); assert.equal(z.engaged, null, 'released after idling');
  g.p = { tx: 33, ty: 33 }; assert.deepEqual(z.update(g, 0.1), wantedGroups('butcher', 'rogue'), 'room entry');
  g.p = { tx: 10, ty: 10 }; z.update(g, 0.5); assert.equal(z.zone, 'butcher', 'hysteresis on leaving');
  z.update(g, 1.2); assert.equal(z.zone, 'cathedral');
}
console.log('art: OK');
