// Order 10 updates from Joseph's phone playtest: U1 auto-equip, U2 barrel fire, U4 finger scrolling, U8 drag and drop,
// U9 tap card, U10 Pepin, U11 belt first, U7 shrine lines, U12 Butcher tune data.
import assert from 'node:assert/strict';
import { Game, actorAt } from '../src/game';
import { Hud } from '../src/hud';
import { Rng } from '../src/rng';
import { getItemAttrs, type Item } from '../src/itemgen';
import { IDI, idxOf } from '../src/data/items';
import { derive, newHero, pickUp, autoEquipSlot, type Hero } from '../src/player';
import { dropItem, locate, compareItems } from '../src/invops';
import { Scroller, TAP_SLOP, HOLD_MS } from '../src/touch';
import { worldZoom } from '../src/iso';
import { SHRINE_TEXT } from '../src/data/shrines';
import { MONSTERS } from '../src/data/monsters';
import { brightenWalls, wallRects } from '../src/art';
import { WALL_AMBIENT, WALL_LIT } from '../src/render';

const rng = new Rng(7);
const mk = (name: string, lvl = 1) => { const it = getItemAttrs(rng, idxOf(name), lvl); it.identified = true; return it; };
const bare = (cls: 'warrior' | 'rogue' | 'sorcerer' = 'warrior'): Hero => {
  const h = newHero('T', cls, new Rng(1)); for (const s of Object.keys(h.body) as (keyof Hero['body'])[]) h.body[s] = null; h.inv = []; h.belt = h.belt.map(() => null); return h;
};

// ---- U1: a wearable you pick up or buy goes on if its slot is empty and you meet the requirements ----
{
  const h = bare();
  const cap = mk('Cap'); assert.equal(pickUp(h, cap), 'equip'); assert.equal(h.body.head, cap);
  const cap2 = mk('Cap'); assert.equal(pickUp(h, cap2), 'pack', 'slot taken: into the pack'); assert.equal(locate(h, cap2).kind, 'inv');
  const r1 = mk('Ring'), r2 = mk('Ring'), r3 = mk('Ring');
  assert.equal(pickUp(h, r1), 'equip'); assert.equal(h.body.ringL, r1, 'first ring: left ring slot');
  assert.equal(pickUp(h, r2), 'equip'); assert.equal(h.body.ringR, r2, 'second ring: the other empty ring slot');
  assert.equal(pickUp(h, r3), 'pack');
  const am = mk('Amulet'); assert.equal(pickUp(h, am), 'equip'); assert.equal(h.body.amulet, am);
  const ar = mk('Rags'); assert.equal(pickUp(h, ar), 'equip'); assert.equal(h.body.chest, ar);
  // weapons only when legal
  const sw = mk('Dagger'); assert.equal(pickUp(h, sw), 'equip'); assert.equal(h.body.handL, sw);
  const sh = mk('Buckler'); assert.equal(pickUp(h, sh), 'equip'); assert.equal(h.body.handR, sh, 'shield into the free off hand');
  const sh2 = mk('Buckler'); assert.equal(pickUp(h, sh2), 'pack', 'no second shield');
  const ax = mk('Small Axe'); assert.equal(pickUp(h, ax), 'pack', 'two-hander needs both hands free');
  const h2 = bare(); const ax2 = mk('Small Axe'); assert.equal(pickUp(h2, ax2), 'equip'); assert.equal(h2.body.handL, ax2);
  assert.equal(pickUp(h2, mk('Buckler')), 'pack', 'no shield next to a two-hander');
  assert.equal(pickUp(h2, mk('Dagger')), 'pack', 'no weapon next to a two-hander');
  const h3 = bare(); h3.body.handL = mk('Dagger'); assert.equal(autoEquipSlot(h3, mk('Dagger')), null, 'one weapon at a time (D1)');
  const hs = bare('sorcerer'); assert.equal(pickUp(hs, mk('Helm')), 'pack', 'requirements not met (Str 25 > 15): into the pack');
}

// ---- U11: a potion or scroll you pick up or buy goes to the first empty belt cell, else the pack ----
{
  const h = bare(); h.belt[0] = getItemAttrs(rng, IDI.HEAL, 1);
  const p = getItemAttrs(rng, IDI.MANA, 1); assert.equal(pickUp(h, p), 'belt'); assert.equal(h.belt[1], p, 'first EMPTY belt cell');
  const sc = getItemAttrs(rng, IDI.PORTAL, 1); assert.equal(pickUp(h, sc), 'belt'); assert.equal(h.belt[2], sc, 'scrolls too');
  for (let i = 0; i < 8; i++) h.belt[i] ??= getItemAttrs(rng, IDI.HEAL, 1);
  const q = getItemAttrs(rng, IDI.HEAL, 1); assert.equal(pickUp(h, q), 'pack', 'belt full: into the pack');
  // buying (the store uses the same rule)
  const g = new Game('B', 'warrior', 3); const hud = new Hud(() => g, {} as never);
  g.hero.belt = g.hero.belt.map(() => null); g.hero.gold = 1000;
  g.dialog = { npc: { id: 'pepin' } as never, text: '' }; hud.store = 'buy';
  const pot = getItemAttrs(rng, IDI.HEAL, 1); g.stores.healer = [pot];
  hud.storeDo(pot, 50); assert.equal(g.hero.belt[0]?.misc, 'IMISC_HEAL', 'bought potion lands in the belt');
  // a bought cap goes on the empty head (U1 for purchases)
  g.dialog = { npc: { id: 'griswold' } as never, text: '' }; g.hero.body.head = null;
  const cap = mk('Cap'); g.stores.smith = [cap]; hud.storeDo(cap, 10); assert.equal((g.hero.body.head as Item | null)?.iname, 'Cap', 'bought cap is worn');
}

// ---- U2: barrel fire = 20-25% of max life, then fire resistance; never kills a hero who was above 30% life ----
{
  for (let seed = 1; seed <= 200; seed++) {
    const g = new Game('B', 'warrior', seed); g.travel('l1', null); g.finishTravel(); g.level.monsters = [];
    const p = g.p, max = g.d.maxHp;
    const ob = (dx: number, dy: number) => ({ id: 900 + dx * 3 + dy, kind: 'barrel_ex' as const, x: p.tx + dx, y: p.ty + dy, used: false, var1: 0, var2: 0, seed: seed * 31 + dx + dy * 7 });
    g.level.map.objects = [ob(1, 0)];
    g.hero.hp = max; g.breakBarrel(g.level.map.objects[0]);
    const dam = max - g.hero.hp;
    assert.ok(dam >= Math.floor(max * 0.2) && dam <= Math.floor(max * 0.25), `seed ${seed}: one barrel ${dam} of ${max}`);
    // a chain of four next to a hero at 31% life: he lives
    g.level.map.objects = [ob(1, 0), ob(1, 1), ob(0, 1), ob(-1, 1)];
    g.hero.hp = Math.ceil(max * 0.31); g.dead = false; g.breakBarrel(g.level.map.objects[0]);
    assert.ok(!g.dead && g.hero.hp >= 1, `seed ${seed}: a barrel chain never kills from above 30%`);
    assert.ok(g.level.map.objects.every((o) => o.used), 'the chain went off');
  }
  // fire resistance cuts it; below 30% it can kill
  const g = new Game('B', 'warrior', 9); g.travel('l1', null); g.finishTravel(); g.level.monsters = [];
  g.d.fr = 50; const max = g.d.maxHp, d = g.barrelDamage(new Rng(4));
  assert.ok(d <= Math.ceil(max * 0.25 * 0.5) && d >= Math.floor(Math.floor(max * 0.2) * 0.5), `50% fire resistance halves it (${d})`);
  g.hero.hp = 2; g.barrelChainHp = 2; g.d.fr = 0; assert.ok(g.barrelDamage(new Rng(4)) >= 2, 'at low life a barrel can still kill');
  g.barrelChainHp = -1;
  // monsters still take D1's 1-4
  const z = g.spawnMon(MONSTERS.zombie, g.p.tx + 2, g.p.ty); z.hp = 100; z.maxHp = 100; g.level.monsters.push(z);
  g.level.map.objects = [{ id: 1, kind: 'barrel_ex', x: g.p.tx + 3, y: g.p.ty, used: false, var1: 0, var2: 0, seed: 5 }];
  g.breakBarrel(g.level.map.objects[0]); assert.ok(z.hp >= 96 && z.hp <= 99, `monster took 1-4 (${100 - z.hp})`);
}

// ---- U10: Pepin restores full life AND mana ----
{
  const g = new Game('B', 'sorcerer', 4); g.hero.hp = 1; g.hero.mana = 0;
  g.talk({ id: 'pepin', name: 'Pepin' } as never);
  assert.equal(g.hero.hp, g.d.maxHp); assert.equal(g.hero.mana, g.d.maxMana);
}

// ---- U7: every L1 shrine has D1's line and a plain effect line; tapping a used shrine shows it again ----
{
  for (const [n, t] of Object.entries(SHRINE_TEXT)) { assert.ok(t.say.length > 5 && t.effect.length > 5, n); }
  const g = new Game('B', 'warrior', 4); g.travel('l1', null); g.finishTravel();
  g.shrine('Glimmering', new Rng(1)); assert.equal(g.msg, SHRINE_TEXT.Glimmering.say); assert.match(g.msgSub, /^Glimmering Shrine: /);
  g.say('x'); assert.equal(g.msgSub, '', 'other messages have no effect line');
  const o = { id: 5, kind: 'shrine' as const, x: g.p.tx + 1, y: g.p.ty, used: true, var1: 0, var2: 0, seed: 1, shrine: 'Glimmering' };
  g.level.map.objects.push(o); g.actOnTarget({ kind: 'obj', o }); assert.match(g.msgSub, /Glimmering Shrine/, 'tapped again: the effect is shown again');
}

// ---- U4: finger-drag scrolling with momentum; a move of TAP_SLOP px cancels the tap ----
{
  assert.equal(TAP_SLOP, 8); assert.equal(HOLD_MS, 350);
  const s = new Scroller(); s.setMax(500);
  s.start(0); for (let i = 1; i <= 6; i++) s.drag(-20, i / 60); // finger up 20 units a frame: content scrolls down
  assert.equal(s.pos, 120, 'content follows the finger');
  s.release(6 / 60 + 0.01); assert.ok(s.vel > 600, `fling keeps the finger's speed (${s.vel.toFixed(0)})`);
  let t = 0; while (s.step(1 / 60) && t < 10) t += 1 / 60;
  assert.ok(s.pos > 200 && s.pos <= 500, `momentum carried it on (${s.pos.toFixed(0)})`);
  s.start(1); s.drag(1000, 1.01); assert.equal(s.pos, 0, 'clamped at the top');
  s.release(2); assert.equal(s.vel, 0, 'a still finger lifts without a fling');
  // the HUD registers a scroll region for the store list, quest log and spellbook (and a swipe flips spellbook pages)
  const g = new Game('B', 'warrior', 2); const hud = new Hud(() => g, {} as never);
  hud.scrollStart('store', 0); hud.sc('store').setMax(300); hud.scrollDrag('store', 0, -100, 0.016); assert.ok(hud.sc('store').pos > 0, 'store list drags');
  hud.scrollEnd('store', 0.03);
  hud.spellPage = 0; hud.scrollStart('spell', 0); hud.scrollDrag('spell', -60, 0, 0.05); hud.scrollEnd('spell', 0.06); assert.equal(hud.spellPage, 1, 'spellbook swipe');
}

// ---- U8: press-and-hold drag; D1 swap rule; drop outside = ground; invalid = snap back ----
{
  const h = bare();
  const a = mk('Dagger'), b = mk('Cap'), c = mk('Rags');
  h.inv.push({ item: a, x: 0, y: 0 }, { item: b, x: 4, y: 0 });
  // move to an empty cell
  let r = dropItem(h, a, { kind: 'inv', x: 2, y: 0 }); assert.ok(r.ok && !r.carry); assert.deepEqual(locate(h, a), { kind: 'inv', x: 2, y: 0 });
  // onto one item: they swap, the other one goes to the cursor
  r = dropItem(h, a, { kind: 'inv', x: 4, y: 0 }); assert.ok(r.ok); assert.equal(r.carry, b, 'swapped item on the cursor'); assert.equal(locate(h, b).kind, 'none');
  r = dropItem(h, b, { kind: 'inv', x: 0, y: 0 }); assert.ok(r.ok && !r.carry, 'cursor item placed'); assert.equal(locate(h, b).kind, 'inv');
  // over two items: refused (D1), everything snaps back
  const state = (hh: Hero) => JSON.stringify(hh.inv.map((e) => [e.item.iname, e.x, e.y]).sort());
  h.inv = [{ item: b, x: 0, y: 0 }, { item: a, x: b.w, y: 0 }, { item: c, x: 6, y: 0 }];
  assert.ok(c.w >= 2, 'rags are two cells wide');
  const snap = state(h);
  r = dropItem(h, c, { kind: 'inv', x: b.w - 1, y: 0 }); assert.ok(!r.ok, 'two items under it: refused'); assert.equal(state(h), snap, 'snap back');
  r = dropItem(h, a, { kind: 'none' }); assert.ok(!r.ok); assert.equal(state(h), snap, 'released over nothing: snap back');
  r = dropItem(h, a, { kind: 'belt', i: 0 }); assert.ok(!r.ok && /belt/.test(r.msg ?? '')); assert.equal(state(h), snap, 'dagger refused by the belt, snapped back');
  r = dropItem(h, a, { kind: 'body', slot: 'head' }); assert.ok(!r.ok); assert.equal(state(h), snap);
  // to an equip slot, swapping the worn one onto the cursor
  const cap2 = mk('Cap'); h.body.head = cap2; const capInv = h.inv.find((e) => e.item.iname === 'Cap')!.item;
  r = dropItem(h, capInv, { kind: 'body', slot: 'head' }); assert.ok(r.ok); assert.equal(h.body.head, capInv); assert.equal(r.carry, cap2);
  // a two-hander displaces both hands: one to the cursor, the other into the pack
  const h2 = bare(); h2.body.handL = mk('Dagger'); h2.body.handR = mk('Buckler'); const ax = mk('Small Axe'); h2.inv.push({ item: ax, x: 0, y: 0 });
  r = dropItem(h2, ax, { kind: 'body', slot: 'handR' }); assert.ok(r.ok); assert.equal(h2.body.handL, ax); assert.equal(h2.body.handR, null);
  assert.ok(r.carry && h2.inv.length === 1, 'one hand item on the cursor, the other in the pack');
  // belt: potions only
  const pot = getItemAttrs(rng, IDI.HEAL, 1); h2.inv.push({ item: pot, x: 9, y: 3 });
  r = dropItem(h2, pot, { kind: 'belt', i: 3 }); assert.ok(r.ok); assert.equal(h2.belt[3], pot);
  // outside the panel: on the ground
  r = dropItem(h2, pot, { kind: 'ground' }); assert.ok(r.ok && r.ground); assert.equal(locate(h2, pot).kind, 'none');
  // through the HUD: hold lifts it, release over the world drops it on the floor; a cancelled drag snaps back
  const g = new Game('B', 'warrior', 2); const hud = new Hud(() => g, {} as never); hud.right = 'inv';
  const club = g.hero.inv[0].item; const n0 = g.level.items.length;
  hud.beginDrag(club); hud.drag = null; assert.equal(locate(g.hero, club).kind, 'inv', 'cancelled drag: still in the pack');
  hud.beginDrag(club); hud.endDrag(5, 5); // top-left of the screen: outside the panel (the world)
  assert.equal(locate(g.hero, club).kind, 'none'); assert.equal(g.level.items.length, n0 + 1, 'dropped on the ground');
  assert.ok(g.level.items.some((gi) => gi.item === club));
}

// ---- U9: a tap opens the detail card at once (no delay), with the U6 comparison when the slot is taken ----
{
  const g = new Game('B', 'warrior', 2); const hud = new Hud(() => g, {} as never); hud.right = 'inv';
  const club = g.hero.inv[0].item;
  const t0 = performance.now(); hud.tapItem(club); const dt = performance.now() - t0;
  assert.equal(hud.info, club, 'card open synchronously on the tap'); assert.ok(dt < 150, `tap -> card ${dt.toFixed(2)} ms`);
  assert.ok(HOLD_MS >= 300 && HOLD_MS <= 400, 'hold threshold about 350 ms');
  const rows = compareItems(club, g.hero.body.handL!);
  assert.ok(rows.some((r) => r.label === 'Damage'), 'damage compared'); assert.ok(rows.every((r) => r.better === null || typeof r.better === 'boolean'));
  const sw2 = mk('Short Sword'); sw2.minDam = 9; sw2.maxDam = 12;
  assert.equal(compareItems(sw2, g.hero.body.handL!).find((r) => r.label === 'Damage')?.better, true, 'better shows green');
  // with an item on the cursor, a tap places it (D1) instead of opening a card
  hud.info = null; hud.carry = mk('Cap'); hud.tapItem(club); assert.equal(hud.info, null);
}

// ---- U5: brighter, warmer wall/pillar pixels with a lighter rim; transparent pixels and props untouched ----
{
  const W = 8, H = 8, px = new Uint8ClampedArray(W * H * 4);
  for (let y = 2; y < 8; y++) for (let x = 0; x < 4; x++) { const i = (y * W + x) * 4; px[i] = px[i + 1] = px[i + 2] = 80; px[i + 3] = 255; }
  for (let y = 0; y < 8; y++) for (let x = 4; x < 8; x++) { const i = (y * W + x) * 4; px[i] = px[i + 1] = px[i + 2] = 80; px[i + 3] = 255; } // a prop (no rect)
  brightenWalls(px, W, [{ x: 0, y: 0, w: 4, h: 8, sides: false }]);
  const P = (x: number, y: number) => Array.from(px.slice((y * W + x) * 4, (y * W + x) * 4 + 4));
  assert.deepEqual(P(1, 0), [0, 0, 0, 0], 'transparent stays transparent');
  const mid = P(1, 5), rim = P(1, 2), prop = P(5, 5);
  assert.deepEqual(prop, [80, 80, 80, 255], 'props untouched');
  const lum = (p: number[]) => (p[0] + p[1] + p[2]) / 3;
  assert.ok(lum(mid) >= 80 * 1.3 && lum(mid) <= 80 * 1.6, `about +35-50% light (${(lum(mid) / 80).toFixed(2)}x)`);
  assert.ok(mid[0] > mid[1] && mid[1] > mid[2], 'warmer: red up, blue down');
  assert.ok(lum(rim) > lum(mid) * 1.2, 'lighter rim on the top course');
  assert.ok(WALL_AMBIENT > 0.18 && WALL_LIT > 1, 'walls get a higher ambient minimum than the floor (0.18)');
  const walls = wallRects({ key: 'tiles/walls-props', file: '', w: 1, h: 1, frames: [{ id: 'stoneWall_N', x: 0, y: 0, w: 4, h: 4 }, { id: 'stoneColumn_E', x: 4, y: 0, w: 4, h: 4 }, { id: 'barrel_N', x: 0, y: 4, w: 4, h: 4 }] } as never);
  assert.deepEqual(walls.map((r) => r.sides), [false, true], 'walls and columns only (corners/columns get side rims)');
}

// ---- U3 / Order 19: the Phase B hero (88 px sole-to-crown art) is 85-90 css px tall on 844x390 ----
{
  const z = worldZoom(844, 390), hero = 88 * z;
  assert.ok(hero >= 85 && hero <= 90, `hero ${hero.toFixed(1)} css px at zoom ${z.toFixed(3)}`);
  assert.ok(worldZoom(932, 430) > z, 'bigger phone, same hero share of the screen');
}

// ---- U12: the tuned Butcher is in the data (see scripts/butcher-sim.ts for the win rates) ----
assert.ok(MONSTERS.butcher.hp[0] >= 100 && MONSTERS.butcher.dmg[1] <= 9 && (MONSTERS.butcher.walkMul ?? 1) > 1);
void actorAt; void derive; void ({} as Item);
console.log('updates: OK (U1 auto-equip, U2 barrel cap, U3 zoom, U4 scrolling, U5 wall pixels, U7 shrine lines, U8 drag/swap/ground/snap, U9 tap card, U10 Pepin, U11 belt first)');
