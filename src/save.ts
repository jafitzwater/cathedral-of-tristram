import { defaultSlots } from './controls';
import { nearestOpen, townReach } from './levels/town';
import { WALKABLE, at } from './levels/types';
// Save / load (localStorage). One save slot per hero, like D1 single player (hero + current game state).
import { Game, actorAt, type Level, type LevelId, type Mon } from './game';
import { MONSTERS } from './data/monsters';
import { setUidSeq, type Item } from './itemgen';
import { Rng } from './rng';
import type { Hero } from './player';

export const SAVE_VERSION = 1;
export interface Storage { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

interface SavedMon { id: string; uid: number; tx: number; ty: number; hp: number; maxHp: number; alive: boolean; active: boolean; spoke: boolean }
interface SavedLevel { tiles: number[]; explored: string; monsters: SavedMon[]; items: { item: Item; x: number; y: number }[]; objects: Level['map']['objects']; corpses: { x: number; y: number }[] }
export interface SaveData {
  v: number; hero: Hero; cur: LevelId; pos: { x: number; y: number }; l1Seed: number; rng: number;
  quests: Game['quests']; stores: Game['stores']; portal: Game['portal']; townDead: string[]; levels: Partial<Record<LevelId, SavedLevel>>; uid: number; monUid: number;
}

const b64 = (a: Uint8Array) => { let s = ''; for (let i = 0; i < a.length; i += 8) { let v = 0; for (let j = 0; j < 8; j++) v |= (a[i + j] ? 1 : 0) << j; s += String.fromCharCode(48 + (v >> 4), 48 + (v & 15)); } return s; };
const unb64 = (s: string, n: number) => { const a = new Uint8Array(n); for (let i = 0; i < s.length / 2; i++) { const v = ((s.charCodeAt(2 * i) - 48) << 4) | (s.charCodeAt(2 * i + 1) - 48); for (let j = 0; j < 8 && i * 8 + j < n; j++) a[i * 8 + j] = (v >> j) & 1; } return a; };

function maxUid(g: Game): number {
  let m = 0;
  const scan = (i: Item | null | undefined) => { if (i && i.uid > m) m = i.uid; };
  const h = g.hero;
  Object.values(h.body).forEach(scan); h.inv.forEach((e) => scan(e.item)); h.belt.forEach(scan);
  for (const lv of Object.values(g.levels)) lv?.items.forEach((x) => scan(x.item));
  return m + 1;
}

export function serialize(g: Game): SaveData {
  const levels: SaveData['levels'] = {};
  for (const [id, lv] of Object.entries(g.levels) as [LevelId, Level][]) {
    if (id === 'town') continue; // town is static; NPC state lives in townDead
    levels[id] = {
      tiles: Array.from(lv.map.tiles), explored: b64(lv.explored),
      monsters: lv.monsters.map((m) => ({ id: m.def.id, uid: m.uid, tx: m.tx, ty: m.ty, hp: m.hp, maxHp: m.maxHp, alive: m.alive, active: m.active, spoke: m.spoke })),
      items: lv.items, objects: lv.map.objects, corpses: lv.corpses,
    };
  }
  return {
    v: SAVE_VERSION, hero: g.hero, cur: g.cur, pos: { x: g.p.tx, y: g.p.ty }, l1Seed: g.l1Seed, rng: g.rng.s,
    quests: g.quests, stores: g.stores, portal: g.portal, townDead: [...g.townDead], levels, uid: maxUid(g), monUid: g.monUid,
  };
}

export function deserialize(s: SaveData): Game {
  if (s.v !== SAVE_VERSION) throw new Error(`save version ${s.v} not supported`);
  const g = new Game(s.hero.name, s.hero.cls, 1);
  g.hero = s.hero;
 g.l1Seed = s.l1Seed;
  if (!Array.isArray(g.hero.slots)) g.hero.slots = defaultSlots(g.hero.cls, g.hero.spells, null); // pre-Order-4 saves
  g.quests = s.quests; g.stores = s.stores; g.portal = s.portal; g.townDead = new Set(s.townDead);
  setUidSeq(s.uid);
  let regenL1 = false;
  for (const [id, sl] of Object.entries(s.levels) as [LevelId, SavedLevel][]) {
    const lv = g.makeLevel(id);
    // Order 9: pre-Order-9 Cathedral saves are on the old 56x56 one-tile-per-cell map. Like D1 (which regenerates a level from
    // its seed on entry) the level is rebuilt fresh from the same seed; its saved monsters/items/objects no longer fit it.
    if (id !== 'town' && sl.tiles.length !== lv.map.tiles.length) {
      regenL1 = true;
      if (s.quests?.butcher === 'done') lv.monsters = lv.monsters.filter((m) => m.def.id !== 'butcher'); // he stays dead
      g.levels[id] = lv;
      continue;
    }
    // Town is static and rebuilt from makeTown (Order 7 moved its buildings), so a save's town tiles/objects are not restored.
    if (id !== 'town') { lv.map.tiles = Uint8Array.from(sl.tiles); lv.map.objects = sl.objects; }
    lv.explored = unb64(sl.explored, lv.map.w * lv.map.h);
    lv.items = sl.items; lv.corpses = sl.corpses;
    lv.monsters = sl.monsters.map((sm) => {
      const m: Mon = { ...g.spawnMon(MONSTERS[sm.id], sm.tx, sm.ty), uid: sm.uid, hp: sm.hp, maxHp: sm.maxHp, alive: sm.alive, active: sm.active, spoke: sm.spoke };
      if (!m.alive) m.state = 'dead';
      return m;
    });
    g.levels[id] = lv;
  }
  if (!g.levels[s.cur]) g.levels[s.cur] = g.makeLevel(s.cur);
  g.cur = s.cur;
  g.rng = new Rng(s.rng); g.monUid = s.monUid; // restore last: rebuilding levels above draws from the rng and monster uids
  g.p = actorAt(Math.round(s.pos.x), Math.round(s.pos.y)); // Order 9b: a fractional position loads snapped to its tile centre
  if (regenL1) { g.portal = null; if (g.cur !== 'town') { const st = g.levels[g.cur]!.map.start; g.p = actorAt(st.x, st.y); } }
  { // Order 12: the town was rebuilt at D1 size, so an old town position (or a dropped item) may sit inside a building, the brush
    // or water, or in a pocket cut off from the square: move it to the nearest open tile reachable from the spawn.
    const tm = g.levels.town!.map, walk = (x: number, y: number) => x >= 0 && y >= 0 && x < tm.w && y < tm.h && WALKABLE.has(at(tm, x, y)) && !tm.objects.some((o) => o.x === x && o.y === y && o.kind !== 'portal');
    const reach = townReach(tm, walk), ok = (x: number, y: number) => x >= 0 && y >= 0 && x < tm.w && y < tm.h && reach[y * tm.w + x] === 1;
    if (g.cur === 'town' && !ok(g.p.tx, g.p.ty)) { const f = nearestOpen(tm, walk, g.p.tx, g.p.ty); g.p = actorAt(f.x, f.y); }
    for (const it of g.levels.town!.items) if (!ok(it.x, it.y)) { const q = nearestOpen(tm, walk, it.x, it.y); it.x = q.x; it.y = q.y; }
  }
  g.refresh();
  return g;
}

/** Order 16: storage namespace. The staging branch builds with VITE_SAVE_NS=cot-staging. (.env), so a staging
 *  build never reads or writes live saves; main (live) has no such file and keeps 'cot.'. The save format is unchanged. */
export const SAVE_NS: string = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_SAVE_NS) || 'cot.';
const KEY = (name: string) => `${SAVE_NS}save.${name}`;
export function listHeroes(st: Storage): string[] {
  try { return JSON.parse(st.getItem(`${SAVE_NS}heroes`) ?? '[]'); } catch { return []; }
}
export function saveGame(st: Storage, g: Game) {
  st.setItem(KEY(g.hero.name), JSON.stringify(serialize(g)));
  const l = listHeroes(st);
  if (!l.includes(g.hero.name)) { l.push(g.hero.name); st.setItem(`${SAVE_NS}heroes`, JSON.stringify(l)); }
}
export function loadGame(st: Storage, name: string): Game | null {
  const raw = st.getItem(KEY(name));
  if (!raw) return null;
  return deserialize(JSON.parse(raw));
}
export function peekHero(st: Storage, name: string): Hero | null {
  const raw = st.getItem(KEY(name));
  return raw ? (JSON.parse(raw) as SaveData).hero : null;
}
export function deleteHero(st: Storage, name: string) {
  st.removeItem(KEY(name));
  st.setItem(`${SAVE_NS}heroes`, JSON.stringify(listHeroes(st).filter((n) => n !== name)));
}
