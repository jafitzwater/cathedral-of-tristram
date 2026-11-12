// Which art groups the current scene needs (Order 5 addendum): town / cathedral (+ the one engaged roamer type's combat sheet) /
// the Butcher's room. Pure logic so tests can drive it with fake games.
import { MON_ART, ROAMERS, wantedGroups, type Zone } from './art';

export interface ZoneView {
  cur: string; hero: { cls: string }; p: { tx: number; ty: number };
  level: { map: { butcherRoom: { x: number; y: number; w: number; h: number } | null }; monsters: { def: { id: string }; alive: boolean; active: boolean; tx: number; ty: number; deathT: number }[] };
}
export const ENGAGE_R = 6;      // tiles: an active monster this close is "engaged"
export const CORPSE_R = 8;      // a fresh corpse (death animation) keeps its type's sheet
export const RELEASE_S = 3;     // seconds without an engaged monster before the combat sheet is released
export const BUTCHER_EXIT_S = 1.5;

export class ZoneTracker {
  engaged: string | null = null;
  zone: Zone = 'menu';
  private idle = 0; private out = 0;
  update(g: ZoneView | null, dt: number): string[] {
    if (!g) { this.zone = 'menu'; this.engaged = null; return wantedGroups('menu', null); }
    if (g.cur === 'town') { this.zone = 'town'; this.engaged = null; return wantedGroups('town', g.hero.cls); }
    const p = g.p, d = (m: { tx: number; ty: number }) => Math.max(Math.abs(m.tx - p.tx), Math.abs(m.ty - p.ty));
    // Butcher room: loaded on entry (hero inside the room or its walls/door), or while the awake Butcher is chasing close by.
    const br = g.level.map.butcherRoom;
    const inRoom = !!br && p.tx >= br.x - 1 && p.tx <= br.x + br.w && p.ty >= br.y - 1 && p.ty <= br.y + br.h;
    const chase = g.level.monsters.some((m) => m.def.id === 'butcher' && m.alive && m.active && d(m) <= ENGAGE_R);
    if (inRoom || chase) this.out = 0; else this.out += dt;
    if (this.zone === 'butcher' ? this.out < BUTCHER_EXIT_S : inRoom || chase) { this.zone = 'butcher'; this.engaged = null; return wantedGroups('butcher', g.hero.cls); }
    this.zone = 'cathedral';
    // One roamer combat sheet at a time: keep the current type while any of it is engaged, else switch to the nearest engaged type.
    let best: string | null = null, bd = 1e9; const types = new Set<string>();
    for (const m of g.level.monsters) {
      const a = MON_ART[m.def.id]; if (!a || !ROAMERS.includes(a)) continue;
      const dist = d(m);
      if ((m.alive && m.active && dist <= ENGAGE_R) || (!m.alive && m.deathT < 2.5 && dist <= CORPSE_R)) { types.add(a); if (dist < bd) { bd = dist; best = a; } }
    }
    if (types.size) { this.idle = 0; if (!this.engaged || !types.has(this.engaged)) this.engaged = best; }
    else if ((this.idle += dt) >= RELEASE_S) this.engaged = null;
    return wantedGroups('cathedral', g.hero.cls, this.engaged);
  }
}
