// Canvas 2D isometric world renderer. Actors come from the CC0 atlases (src/art.ts) at their packed scale; while an atlas is
// still loading (or released by the zone groups) a dim silhouette stands in.
import { TILE_H, TILE_W, view, tileToScreen, dirOf, pickTile, type P } from './iso';
import type { NpcDef } from './levels/town';
import { T, TALL, at } from './levels/types';
import { BUILDINGS, TOWN_PORTAL_SPOT, type Building } from './levels/town';
import { buildingFade, frontS, sortKey, type SpriteBox } from './townArt';
import { art, drawActor, drawCell, drawFrame, hasFrame, MON_ART } from './art';
import { wallData, wallFade } from './walls';
import { itemIconId } from './hud';
import type { Actor, Game, Target } from './game';

const LIGHT_R = 10;

export function camera(g: Game) {
  const s = tileToScreen(g.p.x, g.p.y);
  return { x: view.w / 2 - s.x, y: view.h / 2 - s.y - TILE_H / 2 + 20 };
}
function diamond(c: CanvasRenderingContext2D, x: number, y: number) {
  c.beginPath(); c.moveTo(x, y); c.lineTo(x + TILE_W / 2, y + TILE_H / 2); c.lineTo(x, y + TILE_H); c.lineTo(x - TILE_W / 2, y + TILE_H / 2); c.closePath();
}
const FLOOR_COL: Record<number, [string, string]> = {
  [T.FLOOR]: ['#3b3428', '#352f24'], [T.GRASS]: ['#2f3a22', '#2b351f'], [T.PATH]: ['#5a4a32', '#54452f'], [T.BRIDGE]: ['#6a5034', '#5e472e'],
  [T.WATER]: ['#1a2a4a', '#18263f'], [T.UP]: ['#6a6050', '#6a6050'], [T.DOWN]: ['#201a14', '#201a14'], [T.DOOR_OPEN]: ['#4a3a24', '#4a3a24'],
};
const TALL_COL: Record<number, [string, string, string, number]> = {
  [T.WALL]: ['#4a4338', '#2e2a23', '#3a352c', 56], [T.PILLAR]: ['#5a5244', '#363026', '#443d31', 56], [T.DOOR]: ['#6a4a28', '#3e2a16', '#4e3620', 48],
  [T.HOUSE]: ['#5a4630', '#3a2c1e', '#4a3826', 64], [T.TREE]: ['#1e3a1a', '#16291a', '#1a3218', 60],
};

export interface Sprite { t: Target; x: number; y: number; w: number; h: number; depth: number }
export let lastSprites: Sprite[] = [];

export function drawWorld(c: CanvasRenderingContext2D, g: Game, time: number) {
  const lv = g.level, m = lv.map, cam = camera(g);
  const town = lv.id === 'town';
  c.fillStyle = '#000'; c.fillRect(0, 0, view.w, view.h);
  c.save(); c.beginPath(); c.rect(0, 0, view.w, view.h); c.clip();
  const sprites: Sprite[] = [];
  // gather entities by diagonal
  type Ent = { s: number; draw: () => void; x?: number; y?: number };
  const ents: Ent[] = [];
  const pd = g.p.x + g.p.y;
  const lightAt = (x: number, y: number) => town ? 1 : Math.max(0, 1 - Math.hypot(x - g.p.x, y - g.p.y) / (LIGHT_R + g.d.light));
  const vis = (x: number, y: number) => town || (lv.explored[Math.round(y) * m.w + Math.round(x)] && lightAt(x, y) > 0.05);
  for (const o of m.objects) if (vis(o.x, o.y)) ents.push({ s: o.x + o.y, x: o.x, y: o.y, draw: () => drawObj(c, g, o, cam, sprites, lightAt(o.x, o.y)) });
  if (g.portal) {
    const pp = town ? TOWN_PORTAL_SPOT : g.portal;
    if (vis(pp.x, pp.y)) ents.push({ s: pp.x + pp.y, x: pp.x, y: pp.y, draw: () => drawPortal(c, pp, cam, time) });
  }
  for (const gi of lv.items) if (vis(gi.x, gi.y)) ents.push({ s: gi.x + gi.y - 0.1, x: gi.x, y: gi.y, draw: () => drawItem(c, gi.item, gi.x, gi.y, cam, sprites, gi) });
  for (const mo of lv.monsters) if (vis(mo.x, mo.y)) ents.push({ s: mo.x + mo.y + (mo.alive ? 0 : -0.2), x: mo.x, y: mo.y, draw: () => drawMon(c, g, mo, cam, sprites, lightAt(mo.x, mo.y), time) });
  for (const n of g.npcs()) ents.push({ s: n.x + n.y, x: n.x, y: n.y, draw: () => drawNpc(c, g, n, cam, sprites, time) });
  if (!g.dead || true) ents.push({ s: pd, x: g.p.x, y: g.p.y, draw: () => drawPlayer(c, g, g.p, cam, time) });
  // Order 7: town buildings and set dressing (CC0 Order 2c art) as sorted sprites; footprint tiles render as ground under them
  const pieces = town ? townPieces() : [];
  for (const pc of pieces) {
    const fade = buildingFade(pc.b, pc.f, g.p.x, g.p.y);
    ents.push({ s: frontS(pc.b), draw: () => drawPiece(c, pc.b, cam, fade) });
  }
  if (pieces.length) for (const e of ents) if (e.x !== undefined) e.s = sortKey(e.s, e.x, e.y!, pieces);
  ents.sort((a, b) => a.s - b.s);
  let ei = 0;
  const wd = !town && hasFrame('stoneWall_n') ? wallData(m) : null;
  for (let s = 0; s < m.w + m.h - 1; s++) {
    for (let x = Math.max(0, s - m.h + 1); x <= Math.min(s, m.w - 1); x++) {
      const y = s - x, t = at(m, x, y);
      const p = tileToScreen(x, y), sx = p.x + cam.x, sy = p.y + cam.y;
      if (sx < -TILE_W || sx > view.w + TILE_W || sy < -TILE_H * 3 || sy > view.h + TILE_H * 2) continue;
      if (!town && !lv.explored[y * m.w + x]) continue;
      const lit = lightAt(x, y), seen = town ? 1 : Math.max(0.18, lit);
      c.globalAlpha = 1;
      // Order 6: Cathedral walls, doors, pillars and arches from the CC0 Kenney pieces (wall-facing pass in walls.ts)
      if (wd) {
        const wt = wd[y * m.w + x], a = wallFade(x, y, g.p.x, g.p.y) * seen;
        if (t === T.WALL) {
          if (wt) { c.globalAlpha = a; for (const pc of wt.pieces) drawCell(c, pc.id, sx + (pc.dx ?? 0), sy + (pc.dy ?? 0)); c.globalAlpha = 1; }
          continue;
        }
        if (t === T.DOOR || t === T.DOOR_OPEN || t === T.PILLAR) {
          floorArt(c, false, t === T.PILLAR ? T.FLOOR : T.DOOR_OPEN, x, y, sx, sy, seen);
          c.globalAlpha = a;
          drawCell(c, t === T.PILLAR ? 'stoneColumn_n' : `stoneWallDoor${t === T.DOOR ? 'Closed' : 'Open'}_${wt?.door ?? 'n'}`, sx, sy);
          c.globalAlpha = 1;
          if (t === T.DOOR) sprites.push({ t: { kind: 'door', x, y }, x: sx - 20, y: sy - 40, w: 40, h: 72, depth: x + y - 0.5 });
          continue;
        }
      }
      if (t === T.HOUSE && town && pieces.length) { floorArt(c, town, T.GRASS, x, y, sx, sy, seen); continue; }
      if (t === T.TREE && hasFrame('bigtree01')) {
        floorArt(c, town, T.GRASS, x, y, sx, sy, seen);
        drawFrame(c, `bigtree0${1 + ((x * 7 + y * 13) % 3)}`, sx, sy + TILE_H - 4, 1.6);
      } else if (TALL.has(t)) {
        const [top, left, right, hgt] = TALL_COL[t];
        // D1 wall transparency: walls just in front of the hero fade
        const front = s > pd && s < pd + 4 && Math.abs((x - y) - (g.p.x - g.p.y)) < 4;
        c.globalAlpha = front ? 0.35 : 1;
        if (!(t === T.PILLAR && floorArt(c, town, T.FLOOR, x, y, sx, sy, seen) && drawFrame(c, 'stoneColumn_s', sx, sy + TILE_H - 4, 1.3))) {
          shade(c, left, seen); c.beginPath(); c.moveTo(sx - TILE_W / 2, sy + TILE_H / 2 - hgt); c.lineTo(sx, sy + TILE_H - hgt); c.lineTo(sx, sy + TILE_H); c.lineTo(sx - TILE_W / 2, sy + TILE_H / 2); c.fill();
          shade(c, right, seen); c.beginPath(); c.moveTo(sx, sy + TILE_H - hgt); c.lineTo(sx + TILE_W / 2, sy + TILE_H / 2 - hgt); c.lineTo(sx + TILE_W / 2, sy + TILE_H / 2); c.lineTo(sx, sy + TILE_H); c.fill();
          shade(c, top, seen); diamond(c, sx, sy - hgt); c.fill();
        }
        c.globalAlpha = 1;
      } else {
        const [a, b] = FLOOR_COL[t] ?? FLOOR_COL[T.FLOOR];
        if (!floorArt(c, town, t, x, y, sx, sy, seen)) { shade(c, (x + y) % 2 ? a : b, seen); diamond(c, sx, sy); c.fill(); }
        if (!town && (t === T.UP || t === T.DOWN)) drawFrame(c, t === T.UP ? 'stairs_s' : 'stairsAged_s', sx, sy + TILE_H - 2);
        if (t === T.UP || t === T.DOWN) { c.fillStyle = `rgba(255,230,160,${0.6 * seen})`; c.font = '10px serif'; c.textAlign = 'center'; c.fillText(t === T.UP ? 'UP' : 'DOWN', sx, sy + 20); }
        if (t === T.WATER) { c.fillStyle = 'rgba(120,160,255,0.15)'; c.fillRect(sx - 6 + Math.sin(time + x) * 6, sy + 14, 12, 2); }
        const arch = wd?.[y * m.w + x]?.arch;
        if (arch) { c.globalAlpha = wallFade(x, y, g.p.x, g.p.y) * seen; drawCell(c, `stoneWallArchway_${arch}`, sx, sy); c.globalAlpha = 1; }
      }
      if (t === T.DOOR) sprites.push({ t: { kind: 'door', x, y }, x: sx - 20, y: sy - 40, w: 40, h: 72, depth: x + y - 0.5 });
    }
    while (ei < ents.length && ents[ei].s <= s + 0.5) ents[ei++].draw();
  }
  while (ei < ents.length) ents[ei++].draw();
  // missiles
  for (const ms of g.missiles) {
    const p = tileToScreen(ms.x, ms.y);
    c.fillStyle = ms.kind === 'firebolt' ? '#ff8a20' : ms.kind === 'arrow' ? '#ddd' : ms.kind === 'hbolt' ? '#fff8c0' : '#9cf';
    c.beginPath(); c.arc(p.x + cam.x, p.y + cam.y + TILE_H / 2 - 24, ms.kind === 'arrow' ? 2 : 5, 0, Math.PI * 2); c.fill();
  }
  // floating combat text
  c.font = 'bold 12px serif'; c.textAlign = 'center';
  for (const f of g.floats) { const p = tileToScreen(f.x, f.y); c.globalAlpha = Math.min(1, f.t * 2); c.fillStyle = f.color; c.fillText(f.text, p.x + cam.x, p.y + cam.y - 50 - (1 - f.t) * 20); }
  c.globalAlpha = 1;
  // target info (D1 shows the hovered monster's name + life bar)
  const lm = g.lockedMon(), t = lm ? { kind: 'mon' as const, m: lm } : g.target;
  if (t?.kind === 'mon' && t.m.alive) {
    c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(view.w / 2 - 90, 36, 180, 30);
    c.fillStyle = t.m.def.unique ? '#d8b040' : '#ddd'; c.font = '12px serif'; c.fillText(t.m.def.name, view.w / 2, 49);
    c.fillStyle = '#400'; c.fillRect(view.w / 2 - 80, 54, 160, 6); c.fillStyle = '#c00'; c.fillRect(view.w / 2 - 80, 54, 160 * Math.max(0, t.m.hp / t.m.maxHp), 6);
  }
  if (g.speech) { c.fillStyle = '#ff6040'; c.font = 'bold 16px serif'; c.fillText(g.speech.text, view.w / 2, 86); }
  c.restore();
  lastSprites = sprites;
}

/** The town's placed pieces with their atlas frames (empty while the town-buildings group is not resident). */
function townPieces(): { b: Building; f: SpriteBox }[] {
  if (!hasFrame('smithy_full')) return [];
  const out: { b: Building; f: SpriteBox }[] = [];
  for (const b of BUILDINGS) { const e = art.frame(b.art); if (e) out.push({ b, f: { ax: e.f.ax, ay: e.f.ay, w: e.f.w, h: e.f.h, eaves: e.f.eaves } }); }
  return out;
}
function drawPiece(c: CanvasRenderingContext2D, b: Building, cam: { x: number; y: number }, fade: { roof: number; base: number }) {
  const p = tileToScreen(b.x, b.y), x = p.x + cam.x, y = p.y + cam.y + TILE_H / 2;
  if (fade.roof === fade.base) { c.globalAlpha = fade.base; drawFrame(c, b.art, x, y, 1, b.flip); c.globalAlpha = 1; return; }
  const f = art.frame(b.art)!.f, ey = Math.round(y - f.ay + (f.eaves ?? 0));
  for (const [y0, y1, a] of [[-1e4, ey, fade.roof], [ey, 1e4, fade.base]] as const) {
    c.save(); c.beginPath(); c.rect(-1e4, y0, 3e4, y1 - y0); c.clip(); c.globalAlpha = a; drawFrame(c, b.art, x, y, 1, b.flip); c.restore();
  }
}

const hash = (x: number, y: number) => ((x * 73856093) ^ (y * 19349663)) >>> 0;
/** Floor diamonds from the CC0 tile atlas (rubberduck), darkened by the light level. */
function floorArt(c: CanvasRenderingContext2D, town: boolean, t: number, x: number, y: number, sx: number, sy: number, seen: number): boolean {
  const set = town ? ({ [T.GRASS]: 'town_grass', [T.PATH]: 'town_path', [T.BRIDGE]: 'town_dirt_dark', [T.FLOOR]: 'town_dirt', [T.DOWN]: 'town_sand', [T.UP]: 'town_sand' } as Record<number, string>)[t]
    : ({ [T.FLOOR]: 'cath_stone', [T.UP]: 'cath_stone', [T.DOWN]: 'cath_stone', [T.DOOR_OPEN]: 'cath_dirt' } as Record<number, string>)[t];
  if (!set) return false;
  const h = hash(x, y), v = !town && t === T.FLOOR && h % 23 === 0 ? 'cath_blood' : set;
  if (!drawFrame(c, `${v}_${String(h % 16).padStart(2, '0')}`, sx, sy + TILE_H - 1)) return false;
  if (seen < 0.999) { c.fillStyle = `rgba(0,0,0,${1 - seen})`; diamond(c, sx, sy); c.fill(); }
  return true;
}
function shade(c: CanvasRenderingContext2D, col: string, k: number) {
  if (k >= 0.999) { c.fillStyle = col; return; }
  const n = parseInt(col.slice(1), 16);
  const f = (v: number) => Math.round(v * k);
  c.fillStyle = `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
/** Stand-in while an actor's atlas is not resident: a shadow and a dim silhouette of the actor's standing height. */
function silhouette(c: CanvasRenderingContext2D, x: number, y: number, h: number) {
  shadow(c, x, y, h);
  c.fillStyle = 'rgba(20,16,12,0.55)'; const w = h * 0.2;
  c.beginPath(); c.ellipse(x, y - h * 0.42, w, h * 0.38, 0, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(x, y - h * 0.86, w * 0.7, 0, Math.PI * 2); c.fill();
}
function shadow(c: CanvasRenderingContext2D, x: number, y: number, h: number) {
  c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(x, y, h * 0.18, h * 0.08, 0, 0, Math.PI * 2); c.fill();
}
/** Per-actor state clock: when the state changed and its countdown at that moment (for progress through timed actions). */
const clock = new WeakMap<object, { s: string; t0: number; d0: number }>();
function stateClock(o: object, s: string, now: number, t: number) {
  let e = clock.get(o);
  if (!e || e.s !== s) { e = { s, t0: now, d0: Math.max(t, 1e-3) }; clock.set(o, e); }
  return { ms: (now - e.t0) * 1000, progress: 1 - Math.max(0, t) / e.d0 };
}
const heightOf = (actor: string, dflt: number) => art.m?.anims[actor]?.height ?? dflt;
/** Map a game state to an art action (+ progress for timed actions). Looping actions use the global clock so walk cycles
 * don't restart between tile steps. */
function actorPose(o: Actor, now: number, deathMs?: number): { action: string; ms: number; progress?: number } {
  const ck = stateClock(o, o.state, now, o.t);
  switch (o.state) {
    case 'attack': case 'cast': case 'hit': return { action: o.state, ms: ck.ms, progress: ck.progress };
    case 'block': return { action: 'hit', ms: 0, progress: 0 }; // no block sheet: hold the first hit frame
    case 'dead': return { action: 'death', ms: deathMs ?? ck.ms };
    case 'walk': return { action: 'walk', ms: now * 1000 };
    default: return { action: 'idle', ms: now * 1000 };
  }
}
function drawPlayer(c: CanvasRenderingContext2D, g: Game, a: Actor, cam: P, time: number) {
  const p = tileToScreen(a.x, a.y), x = p.x + cam.x, y = p.y + cam.y + TILE_H / 2;
  const cls = g.hero.cls, h = heightOf(cls, 96);
  const pose = g.dead ? { action: 'death', ms: stateClock(a, 'dead', time, 0).ms } : actorPose(a, time);
  shadow(c, x, y, h);
  if (!drawActor(c, cls, pose.action, a.dir, pose.ms, x, y, pose.progress)) {
    // combat sheet still decoding: stand in with the town sheet's idle, else the silhouette
    if (!drawActor(c, cls, a.state === 'walk' ? 'walk' : 'idle', a.dir, time * 1000, x, y)) silhouette(c, x, y, h);
  }
}
function drawNpc(c: CanvasRenderingContext2D, g: Game, n: NpcDef, cam: P, sprites: Sprite[], time: number) {
  const p = tileToScreen(n.x, n.y), x = p.x + cam.x, y = p.y + cam.y + TILE_H / 2;
  if (n.id === 'wounded') { // no sheet for the dying townsman (not in the art set): a body lying in blood
    c.fillStyle = 'rgba(90,10,10,0.8)'; c.beginPath(); c.ellipse(x + 4, y, 26, 10, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#4a3a2e'; c.beginPath(); c.ellipse(x - 2, y - 4, 20, 6, -0.25, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#c8a080'; c.beginPath(); c.arc(x + 18, y - 9, 5, 0, Math.PI * 2); c.fill();
    sprites.push({ t: { kind: 'npc', npc: n }, x: x - 26, y: y - 24, w: 52, h: 32, depth: n.x + n.y });
    return;
  }
  const talking = g.dialog?.npc === n, h = heightOf(n.id, 96);
  // D1 town NPCs face the hero while talking, otherwise they keep their post's facing (south)
  const dir = talking || Math.max(Math.abs(g.p.x - n.x), Math.abs(g.p.y - n.y)) <= 3 ? Math.max(0, dirOf(Math.round(g.p.x) - n.x, Math.round(g.p.y) - n.y)) : 0;
  const ms = time * 1000 + (n.x * 37 + n.y * 11) * 10;
  shadow(c, x, y, h);
  if (!drawActor(c, n.id, talking ? 'talk' : 'idle', dir, ms, x, y)) silhouette(c, x, y, h);
  sprites.push({ t: { kind: 'npc', npc: n }, x: x - 18, y: y - h * 0.9, w: 36, h: h * 0.9 + 4, depth: n.x + n.y });
}
function drawMon(c: CanvasRenderingContext2D, g: Game, mo: Game['level']['monsters'][number], cam: P, sprites: Sprite[], lit: number, time: number) {
  const p = tileToScreen(mo.x, mo.y), x = p.x + cam.x, y = p.y + cam.y + TILE_H / 2;
  const actor = MON_ART[mo.def.id] ?? mo.def.id, h = heightOf(actor, 64);
  c.globalAlpha = Math.max(0.35, lit);
  if (!mo.alive) {
    // corpse: last death frame while the type's combat sheet is resident, else a blood pool
    if (!drawActor(c, actor, 'death', mo.dir, mo.deathT * 1000, x, y)) { c.fillStyle = '#3a1a10'; c.beginPath(); c.ellipse(x, y, h * 0.22, h * 0.09, 0, 0, Math.PI * 2); c.fill(); }
    c.globalAlpha = 1; return;
  }
  if (g.lockId === mo.uid) { // Immortal soft-lock ring
    const r = Math.max(16, h * 0.3);
    c.strokeStyle = 'rgba(255,60,30,0.9)'; c.lineWidth = 2; c.beginPath(); c.ellipse(x, y, r, r / 2, 0, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = 'rgba(255,160,60,0.5)'; c.lineWidth = 1; c.beginPath(); c.ellipse(x, y, r + 4, r / 2 + 2, 0, 0, Math.PI * 2); c.stroke();
  }
  const pose = actorPose(mo, time + (mo.uid % 7) * 0.13);
  shadow(c, x, y, h);
  if (!drawActor(c, actor, pose.action, mo.dir, pose.ms, x, y, pose.progress)) {
    // combat sheet not resident for this type (only one roamer type's is): idle/walk sheet, else the silhouette
    if (!drawActor(c, actor, mo.state === 'walk' ? 'walk' : 'idle', mo.dir, time * 1000, x, y)) silhouette(c, x, y, h);
  }
  if (mo.flash > 0) { c.globalAlpha = Math.min(0.5, mo.flash * 4); c.fillStyle = '#fff'; c.beginPath(); c.ellipse(x, y - h * 0.45, h * 0.2, h * 0.42, 0, 0, Math.PI * 2); c.fill(); }
  c.globalAlpha = 1;
  const bw = Math.max(32, h * 0.5);
  sprites.push({ t: { kind: 'mon', m: mo }, x: x - bw / 2, y: y - h - 4, w: bw, h: h + 8, depth: mo.x + mo.y + 1 });
}
function drawObj(c: CanvasRenderingContext2D, g: Game, o: Game['level']['map']['objects'][number], cam: P, sprites: Sprite[], lit: number) {
  const p = tileToScreen(o.x, o.y), x = p.x + cam.x, y = p.y + cam.y + TILE_H / 2;
  c.globalAlpha = g.level.id === 'town' ? 1 : Math.max(0.3, lit);
  const objArt = o.kind === 'barrel' || o.kind === 'barrel_ex' ? (o.used ? '' : 'barrel_s') : o.kind.startsWith('chest') ? (o.used ? 'chestOpen_s' : 'chestClosed_s') : '';
  if (!(objArt && drawFrame(c, objArt, x, y + 2, o.kind === 'chest3' ? 1.25 : 1))) {
    switch (o.kind) {
      case 'barrel': case 'barrel_ex':
        if (o.used) { if (!drawFrame(c, 'woodenPile_s', x, y + 2, 0.8)) { c.fillStyle = '#3a2a1a'; c.fillRect(x - 10, y - 4, 20, 4); } break; }
        c.fillStyle = o.kind === 'barrel_ex' ? '#7a3a1a' : '#6a4a2a'; c.fillRect(x - 9, y - 24, 18, 22); c.fillStyle = '#2a1a0a'; c.fillRect(x - 9, y - 18, 18, 2); c.fillRect(x - 9, y - 8, 18, 2); break;
      case 'chest1': case 'chest2': case 'chest3': { const s = o.kind === 'chest1' ? 0.8 : o.kind === 'chest2' ? 1 : 1.2; c.fillStyle = o.used ? '#3a2a1a' : '#8a6a2a'; c.fillRect(x - 12 * s, y - 14 * s, 24 * s, 12 * s); c.fillStyle = '#c8a040'; c.fillRect(x - 2, y - 10 * s, 4, 4); break; }
      case 'sarc': c.fillStyle = o.used ? '#3a3a3a' : '#6a6a6a'; c.beginPath(); c.moveTo(x - 24, y - 4); c.lineTo(x, y - 16); c.lineTo(x + 24, y - 4); c.lineTo(x, y + 8); c.closePath(); c.fill(); c.fillStyle = '#4a4a4a'; c.fillRect(x - 3, y - 12, 6, 14); break;
      case 'shrine': c.fillStyle = o.used ? '#4a4a5a' : '#8a8ab0'; c.fillRect(x - 8, y - 34, 16, 32); c.fillStyle = o.used ? '#333' : '#c0c0ff'; c.beginPath(); c.arc(x, y - 38, 6, 0, Math.PI * 2); c.fill(); break;
      case 'body': c.fillStyle = '#5a2a2a'; c.fillRect(x - 3, y - 44, 6, 42); c.fillStyle = '#8a4a3a'; c.fillRect(x - 6, y - 36, 12, 18); break;
      case 'well': c.fillStyle = '#555'; c.beginPath(); c.ellipse(x, y - 6, 22, 11, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#123'; c.beginPath(); c.ellipse(x, y - 8, 14, 7, 0, 0, Math.PI * 2); c.fill(); break;
      case 'cross': c.fillStyle = '#777'; c.fillRect(x - 2, y - 26, 4, 24); c.fillRect(x - 8, y - 20, 16, 4); break;
      default: break;
    }
  }
  c.globalAlpha = 1;
  if (!o.used && !['body', 'well', 'cross'].includes(o.kind)) sprites.push({ t: { kind: 'obj', o }, x: x - 20, y: y - 40, w: 40, h: 46, depth: o.x + o.y });
}
function drawPortal(c: CanvasRenderingContext2D, pp: P, cam: P, time: number) {
  const p = tileToScreen(pp.x, pp.y), x = p.x + cam.x, y = p.y + cam.y + TILE_H / 2;
  c.fillStyle = `rgba(80,120,255,${0.5 + 0.2 * Math.sin(time * 4)})`; c.beginPath(); c.ellipse(x, y - 30, 14, 30, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#cdf'; c.lineWidth = 2; c.stroke();
}
export function itemColor(it: { magical: number; identified: boolean; itype: string }) {
  return it.itype === 'ITYPE_GOLD' ? '#e8c040' : it.magical === 2 && it.identified ? '#c8a040' : it.magical ? '#6a8aff' : '#e0e0e0';
}
function drawItem(c: CanvasRenderingContext2D, it: Game['level']['items'][number]['item'], tx: number, ty: number, cam: P, sprites: Sprite[], gi: Game['level']['items'][number]) {
  const p = tileToScreen(tx, ty), x = p.x + cam.x, y = p.y + cam.y + TILE_H / 2;
  if (!drawFrame(c, itemIconId(it), x - 7, y - 12, 0.5)) { c.fillStyle = itemColor(it); c.beginPath(); c.moveTo(x, y - 9); c.lineTo(x + 7, y - 3); c.lineTo(x, y + 3); c.lineTo(x - 7, y - 3); c.closePath(); c.fill(); }
  const label = it.itype === 'ITYPE_GOLD' ? `${it.gold} gold` : it.identified ? it.iname : it.name;
  c.font = '9px serif'; c.textAlign = 'center';
  const w = c.measureText(label).width + 6;
  c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(x - w / 2, y - 24, w, 11);
  c.fillStyle = itemColor(it); c.fillText(label, x, y - 15);
  sprites.push({ t: { kind: 'item', g: gi }, x: x - Math.max(14, w / 2), y: y - 26, w: Math.max(28, w), h: 32, depth: tx + ty + 2 });
}

/** What a tap at play-area coords hits: sprites first (front-most), else the floor tile. */
export function pickAt(g: Game, x: number, y: number): Target {
  const hits = lastSprites.filter((s) => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h);
  const pri = (t: Target) => (t.kind === 'mon' ? 4 : t.kind === 'item' ? 3 : t.kind === 'npc' ? 3 : t.kind === 'obj' ? 2 : 1);
  hits.sort((a, b) => pri(b.t) - pri(a.t) || b.depth - a.depth);
  if (hits.length) {
    const h = hits[0];
    if (h.t.kind !== 'door' || hits.length === 1) return h.t;
  }
  const cam = camera(g);
  const t = pickTile(x - cam.x, y - cam.y);
  const tt = at(g.level.map, t.x, t.y);
  if (tt === T.DOOR || tt === T.DOOR_OPEN) return { kind: 'door', x: t.x, y: t.y };
  // tapping near a monster's feet tile also targets it (touch slop)
  const m = g.level.monsters.find((mm) => mm.alive && Math.abs(mm.tx - t.x) <= 0 && Math.abs(mm.ty - t.y) <= 0);
  if (m) return { kind: 'mon', m };
  return { kind: 'tile', x: t.x, y: t.y };
}
