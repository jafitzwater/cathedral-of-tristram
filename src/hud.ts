// In-game UI, Order 4 (Diablo Immortal-style controls): floating joystick (drawn here, driven by main.ts), ATTACK button with
// soft-lock, 4 skill slots + class skill with recovery and mana overlays, contextual INTERACT, potion quick buttons, compact
// top HUD (life/mana/XP bars, minimap, icon buttons). D1 panels (char sheet, quest log, inventory, spellbook, stores, menu,
// death screen) open over the game in a 640x352 "panel space" scaled to the screen, with close buttons and bigger slots.
import { CLASSES, EXP_LEVELS } from './data/classes';
import { SPELLS, SPELL_BY_D1, CASTABLE, spellMana } from './data/spells';
import { NPC_TEXT } from './data/npcs';
import { BASE } from './data/items';
import { VIEW_W } from './iso';
import { T } from './levels/types';
import { BODY_SLOTS, INV_W, INV_H, derive, equip, unequip, removeItem, pickUp, spendStat, reqOk, isBeltable, type BodySlot } from './player';
import { itemPrice, sellPrice, boyPrice, repairCost, rechargeCost, IDENTIFY_COST, DUR_INDESTRUCTIBLE, type Item } from './itemgen';
import { itemColor } from './render';
import { drawFrameBox, drawImg } from './art';
import { assignSlot, knob, SLOT_COUNT, JOY_RADIUS } from './controls';
import type { Game } from './game';
import type { UI } from './ui';

type StoreMode = 'menu' | 'talk' | 'buy' | 'premium' | 'sell' | 'repair' | 'identify' | 'recharge' | 'wirt';
export interface HudHooks { save(): void; load(): void; newGame(): void; quit(): void; setVolumes(m: number, s: number): void; vol(): [number, number] }
export interface Layout { W: number; H: number; dpr: number; inset: { l: number; r: number; t: number; b: number } }
export interface JoyDraw { ox: number; oy: number; tx: number; ty: number }
const PS_W = 640, PS_H = 352; // panel space

/** Positions of the right-hand action cluster (css px), shared by drawing and the tests. */
export function actionLayout(W: number, H: number, inset: Layout['inset']) {
  const R = W - inset.r - 10, B = H - inset.b - 10;
  const atk = { x: R - 50, y: B - 50, r: 46 };
  const ring = 100, ang = [160, 192, 224, 256, 288].map((a) => (a * Math.PI) / 180);
  const at = (a: number, r: number) => ({ x: atk.x + Math.cos(a) * ring, y: atk.y + Math.sin(a) * ring, r });
  return {
    atk,
    skill: at(ang[0], 25),                             // class skill (Repair / Disarm / Recharge)
    slots: [at(ang[1], 25), at(ang[2], 25), at(ang[3], 25), at(ang[4], 25)],
    hpPot: { x: atk.x - 196, y: B - 22, r: 21 }, mpPot: { x: atk.x - 244, y: B - 22, r: 21 },
    interact: { x: atk.x - 300, y: B - 168, w: 150, h: 40 },
  };
}

export class Hud {
  left: 'none' | 'char' | 'quest' = 'none';
  right: 'none' | 'inv' | 'spell' = 'none';
  map = false; menu: 'none' | 'main' | 'options' = 'none';
  sel: Item | null = null;   // tap once = select, tap again = use/equip
  info: Item | null = null;  // long-press = item info popup
  spellSel: string | null = null;
  store: StoreMode = 'menu'; scroll = 0; pick: Item | null = null;
  lay: Layout = { W: 844, H: 390, dpr: 1, inset: { l: 0, r: 0, t: 0, b: 0 } };
  joy: JoyDraw | null = null;
  attackDown = false;
  constructor(private g: () => Game, private hooks: HudHooks) {}

  closeAll() { this.left = 'none'; this.right = 'none'; this.map = false; this.sel = null; this.info = null; }
  panelOpen() { return this.left !== 'none' || this.right !== 'none'; }
  /** Blocks the joystick/world on the given css x when a panel covers it. */
  covers(x: number): boolean {
    const { ox, ps } = this.ps();
    if (this.menu !== 'none' || this.g().dialog || this.g().dead || this.info) return true;
    return (this.left !== 'none' && x < ox + 320 * ps) || (this.right !== 'none' && x >= ox + 320 * ps);
  }
  ps() { const { W, H } = this.lay, ps = Math.min(W / PS_W, H / PS_H); return { ps, ox: (W - PS_W * ps) / 2, oy: (H - PS_H * ps) / 2 }; }
  private enterPS(ui: UI) { const { ps, ox, oy } = this.ps(), k = this.lay.dpr; ui.c.save(); ui.c.setTransform(k * ps, 0, 0, k * ps, k * ox, k * oy); }

  draw(ui: UI) {
    const g = this.g(), c = ui.c, { W, H } = this.lay;
    if (g.pendingPick && this.right !== 'inv') this.right = 'inv';
    if (this.map) this.drawAutomap(ui);
    const overlay = this.menu !== 'none' || !!g.dialog || g.dead;
    if (!overlay) this.drawControls(ui);
    if (this.panelOpen() || this.info || overlay) {
      if (overlay) { c.fillStyle = g.dead ? 'rgba(40,0,0,0.55)' : 'rgba(0,0,0,0.6)'; c.fillRect(0, 0, W, H); }
      this.enterPS(ui);
      if (!overlay) {
        if (this.left === 'char') this.drawChar(ui);
        if (this.left === 'quest') this.drawQuest(ui);
        if (this.right === 'inv') this.drawInv(ui);
        if (this.right === 'spell') this.drawSpells(ui);
      }
      if (this.info) this.drawItemInfo(ui, this.info);
      if (g.dialog) this.drawStore(ui);
      if (this.menu !== 'none') this.drawMenu(ui);
      if (g.dead) this.drawDeath(ui);
      c.restore();
    }
  }
  closeBtn(ui: UI, x: number, y: number, fn: () => void) {
    const c = ui.c;
    c.fillStyle = '#3a1a12'; c.fillRect(x, y, 30, 30); c.strokeStyle = '#c8a060'; c.lineWidth = 1.5; c.strokeRect(x + 0.5, y + 0.5, 29, 29);
    c.strokeStyle = '#e8d8a8'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(x + 9, y + 9); c.lineTo(x + 21, y + 21); c.moveTo(x + 21, y + 9); c.lineTo(x + 9, y + 21); c.stroke();
    ui.area(x - 6, y - 4, 40, 40, fn);
  }

  // ---------- Immortal-style controls (css px) ----------
  drawControls(ui: UI) {
    const g = this.g(), c = ui.c, h = g.hero, d = g.d, { W, H, inset } = this.lay;
    const L = inset.l + 10, Tp = inset.t + 8, R = W - inset.r - 10;
    // --- status: level badge + life/mana orbs (CC0 orb art) + numbers + XP bar (top-left) ---
    const bw = Math.min(190, W * 0.24);
    c.fillStyle = 'rgba(10,8,6,0.75)'; c.fillRect(L - 4, Tp - 4, bw + 52, 52);
    c.strokeStyle = '#8a7a52'; c.lineWidth = 1; c.strokeRect(L - 3.5, Tp - 3.5, bw + 51, 51);
    c.fillStyle = '#2a1a10'; c.beginPath(); c.arc(L + 18, Tp + 22, 18, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#c8a060'; c.lineWidth = 2; c.stroke();
    ui.text(`${h.clvl}`, L + 18, Tp + 23, { align: 'center', size: 16, bold: true, color: '#e8c040' });
    const OD = 44, lf = h.hp / Math.max(1, d.maxHp), mf = d.maxMana ? h.mana / d.maxMana : 0;
    orb(c, 'ui/orb-life', L + 40, Tp, OD, lf, g.manaShield ? '#8050c0' : '#a01010');
    orb(c, 'ui/orb-mana', L + 40 + OD + 2, Tp, OD, mf, '#2040c0');
    const tx = L + 40 + OD * 2 + 8, tw = Math.max(30, L + bw + 46 - tx);
    ui.text(`${Math.ceil(h.hp)}/${d.maxHp}`, tx, Tp + 8, { size: 11, bold: true, color: g.manaShield ? '#c8a0ff' : '#ff8070' });
    ui.text(`${Math.floor(h.mana)}/${d.maxMana}`, tx, Tp + 23, { size: 11, bold: true, color: '#90a8ff' });
    const lo = EXP_LEVELS[h.clvl - 1] ?? 0, hi = EXP_LEVELS[h.clvl] ?? lo + 1, xf = h.clvl >= 50 ? 1 : (h.exp - lo) / (hi - lo);
    c.fillStyle = '#1a0e08'; c.fillRect(tx, Tp + 35, tw, 6); c.fillStyle = '#c8a040'; c.fillRect(tx, Tp + 35, tw * Math.max(0, Math.min(1, xf)), 6);
    c.strokeStyle = '#5a4a2a'; c.strokeRect(tx + 0.5, Tp + 35.5, tw - 1, 5);
    ui.area(L - 4, Tp - 4, bw + 52, 52, () => { this.left = this.left === 'char' ? 'none' : 'char'; });
    if (h.statPts) { c.fillStyle = '#e8c040'; c.beginPath(); c.arc(L + 32, Tp + 6, 6, 0, Math.PI * 2); c.fill(); ui.text('+', L + 32, Tp + 7, { align: 'center', size: 11, bold: true, color: '#000' }); }
    // --- minimap (top-right, tap = full automap) + icon buttons ---
    const mw = 132, mh = 88, mx = R - mw, my = Tp - 4;
    this.drawMinimap(ui, mx, my, mw, mh);
    ui.area(mx, my, mw, mh, () => { this.map = !this.map; });
    const icons: [string, boolean, () => void][] = [
      ['inv', this.right === 'inv', () => { this.right = this.right === 'inv' ? 'none' : 'inv'; }],
      ['char', this.left === 'char', () => { this.left = this.left === 'char' ? 'none' : 'char'; }],
      ['spell', this.right === 'spell', () => { this.right = this.right === 'spell' ? 'none' : 'spell'; }],
      ['quest', this.left === 'quest', () => { this.left = this.left === 'quest' ? 'none' : 'quest'; }],
      ['menu', false, () => { this.menu = 'main'; }],
    ];
    const isz = 38;
    icons.forEach(([k, on, fn], i) => {
      const x = mx - 8 - (icons.length - i) * (isz + 6), y = my;
      c.fillStyle = on ? 'rgba(90,70,40,0.9)' : 'rgba(20,16,10,0.8)'; c.fillRect(x, y, isz, isz);
      c.strokeStyle = '#8a7a52'; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, isz - 1, isz - 1);
      drawGlyph(c, k, x + isz / 2, y + isz / 2);
      ui.area(x - 3, y - 3, isz + 6, isz + 6, fn);
    });
    // --- message line ---
    if (g.msgT > 0) {
      c.font = '13px serif'; const tw = c.measureText(g.msg).width + 20;
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(W / 2 - tw / 2, Tp + 64, tw, 22);
      ui.text(g.msg, W / 2, Tp + 76, { align: 'center', size: 13, color: '#e8d8a8' });
    } else if (g.pendingPick) ui.text(`Tap an item to ${g.pendingPick}`, W / 2, Tp + 76, { align: 'center', size: 13, color: '#e8d8a8' });
    // --- joystick ---
    const j = this.joy;
    const jo = j ?? { ox: L + 86, oy: H - inset.b - 90, tx: L + 86, ty: H - inset.b - 90 };
    c.globalAlpha = j ? 0.75 : 0.28;
    c.strokeStyle = '#c8a060'; c.lineWidth = 2; c.beginPath(); c.arc(jo.ox, jo.oy, JOY_RADIUS, 0, Math.PI * 2); c.stroke();
    c.fillStyle = 'rgba(40,30,20,0.5)'; c.fill();
    const k = knob(jo.ox, jo.oy, jo.tx, jo.ty);
    c.fillStyle = '#8a6a3a'; c.beginPath(); c.arc(k.x, k.y, 24, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#e8c890'; c.stroke();
    c.globalAlpha = 1;
    // --- action cluster (bottom-right) ---
    if (this.right !== 'none') return; // the right panel covers it
    const A = actionLayout(W, H, inset);
    const busy = g.p.state === 'attack' || g.p.state === 'cast' ? Math.max(0, g.p.t / Math.max(0.01, g.actTotal)) : 0;
    const circle = (x: number, y: number, r: number, fill: string, edge: string) => {
      c.fillStyle = fill; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.strokeStyle = edge; c.lineWidth = 2; c.stroke();
    };
    const sweep = (x: number, y: number, r: number, f: number, col = 'rgba(0,0,0,0.6)') => {
      if (f <= 0) return; c.fillStyle = col; c.beginPath(); c.moveTo(x, y); c.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f); c.closePath(); c.fill();
    };
    // ATTACK
    const a = A.atk;
    circle(a.x, a.y, a.r, this.attackDown ? '#7a2a1a' : '#4a1a10', '#d8a050');
    drawGlyph(c, d.bow ? 'bow' : 'sword', a.x, a.y - 4, 1.6);
    ui.text('ATTACK', a.x, a.y + 26, { align: 'center', size: 10, bold: true, color: '#e8d8a8' });
    ui.press(a.x - a.r - 6, a.y - a.r - 6, a.r * 2 + 12, a.r * 2 + 12, () => { this.attackDown = true; g.attackHeld = true; }, () => { this.attackDown = false; g.attackHeld = false; });
    // class skill
    const sk = A.skill, skl = { warrior: 'Repair', rogue: 'Disarm', sorcerer: 'Recharge' }[h.cls];
    circle(sk.x, sk.y, sk.r, '#2a2418', '#8a7a52'); drawGlyph(c, h.cls === 'warrior' ? 'hammer' : h.cls === 'rogue' ? 'trap' : 'staff', sk.x, sk.y - 3);
    ui.text(skl, sk.x, sk.y + 15, { align: 'center', size: 8, color: '#d8c89a' });
    ui.area(sk.x - sk.r - 4, sk.y - sk.r - 4, sk.r * 2 + 8, sk.r * 2 + 8, () => { g.classSkill(); });
    // spell slots
    h.slots.slice(0, SLOT_COUNT).forEach((id, i) => {
      const s = A.slots[i];
      circle(s.x, s.y, s.r, '#1a1a2a', id ? '#8a8ad0' : '#4a4232');
      if (!id) { ui.text('+', s.x, s.y + 1, { align: 'center', size: 18, color: '#6a6050' }); ui.area(s.x - s.r - 4, s.y - s.r - 4, s.r * 2 + 8, s.r * 2 + 8, () => { this.right = 'spell'; }); return; }
      const src = g.spellSource(id), sp = SPELLS[src?.spell ?? id.replace(/^(scroll|staff):/, '')];
      drawGlyph(c, `sp_${sp?.type ?? 'magic'}`, s.x, s.y - 4);
      ui.text(shortName(sp?.name ?? id), s.x, s.y + 13, { align: 'center', size: 8, color: '#e8e8ff' });
      let blocked = !src;
      if (src?.from === 'spell' && sp) { const cost = spellMana(sp, Math.max(1, h.spells[sp.id] ?? 1)); if (h.mana < cost) { blocked = true; sweep(s.x, s.y, s.r, 1, 'rgba(20,40,160,0.55)'); } }
      if (src?.from === 'staff') ui.text(`${src.item!.charges}`, s.x + s.r - 4, s.y - s.r + 6, { align: 'center', size: 10, bold: true, color: '#e8c040' });
      if (id.startsWith('scroll:')) { const n = [...h.belt, ...h.inv.map((e) => e.item)].filter((it) => it && it.misc.startsWith('IMISC_SCROLL') && SPELL_BY_D1[it.spell]?.id === id.slice(7)).length; ui.text(`${n}`, s.x + s.r - 4, s.y - s.r + 6, { align: 'center', size: 10, bold: true, color: '#e8c040' }); }
      if (!src) sweep(s.x, s.y, s.r, 1, 'rgba(0,0,0,0.65)');
      sweep(s.x, s.y, s.r, busy);
      void blocked;
      ui.area(s.x - s.r - 4, s.y - s.r - 4, s.r * 2 + 8, s.r * 2 + 8, () => g.castSlot(i), () => { this.right = 'spell'; this.spellSel = id; });
    });
    sweep(sk.x, sk.y, sk.r, busy);
    // potions (from the belt)
    const pot = (P: { x: number; y: number; r: number }, life: boolean) => {
      const want = life ? ['IMISC_HEAL', 'IMISC_FULLHEAL', 'IMISC_REJUV', 'IMISC_FULLREJUV'] : ['IMISC_MANA', 'IMISC_FULLMANA', 'IMISC_REJUV', 'IMISC_FULLREJUV'];
      const n = h.belt.filter((b) => b && want.includes(b.misc)).length;
      circle(P.x, P.y, P.r, n ? (life ? '#5a1010' : '#10205a') : '#222', '#8a7a52');
      drawGlyph(c, life ? 'pot_red' : 'pot_blue', P.x, P.y - 2);
      ui.text(`${n}`, P.x + P.r - 3, P.y + P.r - 5, { align: 'center', size: 11, bold: true, color: '#fff' });
      ui.area(P.x - P.r - 5, P.y - P.r - 5, P.r * 2 + 10, P.r * 2 + 10, () => this.quickPotion(life));
    };
    pot(A.hpPot, true); pot(A.mpPot, false);
    // contextual INTERACT
    const it = g.interaction();
    if (it) {
      const b = A.interact;
      c.fillStyle = 'rgba(60,46,24,0.92)'; c.beginPath(); c.roundRect(b.x, b.y, b.w, b.h, 18); c.fill(); c.strokeStyle = '#e8c070'; c.lineWidth = 2; c.stroke();
      ui.text(it.label.length > 22 ? it.label.slice(0, 21) + '...' : it.label, b.x + b.w / 2, b.y + b.h / 2 + 1, { align: 'center', size: 12, bold: true, color: '#fff0c8' });
      ui.area(b.x - 4, b.y - 6, b.w + 8, b.h + 12, () => g.interact());
    }
  }
  drawMinimap(ui: UI, x: number, y: number, w: number, hh: number) {
    const g = this.g(), lv = g.level, m = lv.map, c = ui.c, s = 2.2, town = lv.id === 'town';
    c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(x, y, w, hh); c.strokeStyle = '#8a7a52'; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, w - 1, hh - 1);
    c.save(); c.beginPath(); c.rect(x + 1, y + 1, w - 2, hh - 2); c.clip();
    const cx = x + w / 2, cy = y + hh / 2, R = 30;
    for (let ty = Math.max(0, g.p.ty - R); ty < Math.min(m.h, g.p.ty + R); ty++) for (let tx = Math.max(0, g.p.tx - R); tx < Math.min(m.w, g.p.tx + R); tx++) {
      if (!town && !lv.explored[ty * m.w + tx]) continue;
      const t = m.tiles[ty * m.w + tx];
      const col = t === T.WALL || t === T.HOUSE || t === T.PILLAR ? '#a89060' : t === T.DOOR || t === T.DOOR_OPEN ? '#c86030' : t === T.UP || t === T.DOWN ? '#ffffff' : t === T.WATER ? '#2040a0' : t === T.TREE ? '#2a4a20' : '';
      if (!col) continue;
      c.fillStyle = col; c.fillRect(cx + (tx - g.p.x - (ty - g.p.y)) * s - 1, cy + (tx - g.p.x + (ty - g.p.y)) * s / 2 - 1, 2.4, 1.6);
    }
    for (const mo of lv.monsters) if (mo.alive && (town || lv.explored[mo.ty * m.w + mo.tx]) && Math.hypot(mo.tx - g.p.tx, mo.ty - g.p.ty) < 9) { c.fillStyle = '#ff3030'; c.fillRect(cx + (mo.x - g.p.x - (mo.y - g.p.y)) * s - 1, cy + (mo.x - g.p.x + (mo.y - g.p.y)) * s / 2 - 1, 3, 3); }
    for (const n of g.npcs()) { c.fillStyle = '#40e040'; c.fillRect(cx + (n.x - g.p.x - (n.y - g.p.y)) * s - 1, cy + (n.x - g.p.x + (n.y - g.p.y)) * s / 2 - 1, 3, 3); }
    c.fillStyle = '#ffd040'; c.fillRect(cx - 2, cy - 2, 4, 4);
    c.restore();
  }
  quickPotion(life: boolean) {
    const g = this.g(), h = g.hero;
    const want = life ? ['IMISC_HEAL', 'IMISC_FULLHEAL', 'IMISC_REJUV', 'IMISC_FULLREJUV'] : ['IMISC_MANA', 'IMISC_FULLMANA', 'IMISC_REJUV', 'IMISC_FULLREJUV'];
    const it = h.belt.find((b) => b && want.includes(b.misc));
    if (it) { g.useItem(it); g.refresh(); } else g.say(life ? 'No healing potion in the belt' : 'No mana potion in the belt', 1.5);
  }

  // ---------- char sheet (panel space, left): live values on the empty CC0 panel frame ----------
  /** Panel art (empty frame) or, while it loads, the plain code panel. Always blocks taps underneath. */
  artPanel(ui: UI, key: string, x: number) {
    if (!drawImg(ui.c, key, x, 0, 320, PS_H)) ui.panel(x, 0, 320, PS_H); else ui.block(x, 0, 320, PS_H);
  }
  drawChar(ui: UI) {
    const g = this.g(), h = g.hero, d = derive(h), c = ui.c;
    this.artPanel(ui, 'ui/panel-character', 0);
    this.closeBtn(ui, 284, 5, () => { this.left = 'none'; });
    const val = (s: string, x: number, y: number, w: number, o: { color?: string; size?: number } = {}) => ui.text(s, x + w / 2, y + 9, { align: 'center', size: o.size ?? 11, color: o.color ?? '#e8d8a8' });
    val(h.name, 80, 42, 199); val(CLASSES[h.cls].name, 80, 68, 119); val(`${h.clvl}`, 262, 68, 35);
    const rows: ['str' | 'mag' | 'dex' | 'vit', number][] = [['str', d.str], ['mag', d.mag], ['dex', d.dex], ['vit', d.vit]];
    rows.forEach(([k, v], i) => {
      const y = 100 + i * 28;
      val(`${v}`, 140, y, 47, { color: v > h.base[k] ? '#6a8aff' : v < h.base[k] ? '#d04040' : '#e8d8a8' });
      const can = h.statPts > 0 && h.base[k] < CLASSES[h.cls].max[k];
      // the frame paints a small [+] at (198, y+1); light it up when a point can go there, with a finger-sized hit box
      if (can) { c.strokeStyle = '#e8c040'; c.lineWidth = 2; c.strokeRect(197, y, 17, 17); ui.area(190, y - 6, 32, 29, () => { spendStat(h, k); g.refresh(); }); }
      else { c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(197, y, 17, 17); }
    });
    if (h.statPts) ui.text(`${h.statPts} point${h.statPts > 1 ? 's' : ''} to distribute`, 24, 208, { size: 10, color: '#e8c040' });
    val(`${Math.ceil(h.hp)}`, 80, 220, 55, { color: h.hp < d.maxHp ? '#ff8070' : '#e8d8a8' }); val(`${d.maxHp}`, 160, 220, 55);
    val(`${Math.floor(h.mana)}`, 80, 248, 55, { color: h.mana < d.maxMana ? '#90a8ff' : '#e8d8a8' }); val(`${d.maxMana}`, 160, 248, 55);
    val(`${h.exp}`, 140, 284, 79); val(h.clvl >= 50 ? 'None' : `${EXP_LEVELS[h.clvl]}`, 140, 308, 79); val(`${h.gold}`, 80, 328, 79, { color: '#e8c040' });
    // D1's combat lines have no box on this frame: small text in the empty column right of the stat buttons
    const side: [string, string][] = [
      ['Armor', `${d.ac}`], ['To hit', `${50 + Math.floor(d.dex / 2) + d.toHit + h.clvl + (h.cls === 'warrior' ? 20 : 0)}%`],
      ['Damage', `${d.minDam + d.charDamMod + d.damMod}-${Math.trunc(d.maxDam * (100 + d.pctDam) / 100) + d.charDamMod + d.damMod}`],
      ['Res mag', `${d.mr}%`], ['Res fire', `${d.fr}%`], ['Res ltn', `${d.lr}%`],
    ];
    side.forEach(([a, b], i) => { const y = 104 + i * 17 + (i >= 3 ? 8 : 0); ui.text(a, 226, y, { size: 9, color: '#a89870' }); ui.text(b, 306, y, { size: 10, align: 'right' }); });
  }
  drawQuest(ui: UI) {
    const g = this.g();
    ui.panel(0, 0, 320, PS_H);
    this.closeBtn(ui, 286, 4, () => { this.left = 'none'; });
    ui.text('Quest log', 160, 24, { align: 'center', size: 16, bold: true });
    const q = g.quests.butcher;
    if (q === 'inactive') ui.text('No active quests', 160, 70, { align: 'center' });
    else {
      ui.text('The Butcher', 20, 70, { size: 14, color: q === 'done' ? '#7a7a7a' : '#e8c040' });
      ui.wrap(q === 'done' ? 'The Butcher is dead. The cathedral is a little quieter.' : NPC_TEXT.wounded.butcher, 20, 94, 280, 16);
    }
  }

  // ---------- inventory (panel space, right): the CC0 frame's D1 slot boxes, 28 px cells on a 29 px pitch ----------
  static SLOT_RECT: Record<BodySlot, [number, number, number, number]> = {
    handL: [72, 80, 27, 83], head: [130, 40, 55, 55], amulet: [196, 48, 27, 27], chest: [130, 100, 55, 83], handR: [196, 100, 55, 83], ringL: [72, 170, 27, 27], ringR: [226, 170, 27, 27],
  };
  static GRID = { x: 20, y: 220, pitch: 29, cell: 27 };
  drawInv(ui: UI) {
    const g = this.g(), h = g.hero, c = ui.c, X = 320, dh = derive(h);
    this.artPanel(ui, 'ui/panel-inventory', X);
    this.closeBtn(ui, X + 284, 5, () => { this.right = 'none'; this.sel = null; g.pendingPick = ''; });
    for (const s of BODY_SLOTS) {
      const [x, y, w, hh] = Hud.SLOT_RECT[s];
      const it = h.body[s];
      if (it) {
        c.fillStyle = this.sel === it ? 'rgba(80,80,140,0.8)' : 'rgba(40,34,24,0.9)'; c.fillRect(X + x, y, w, hh);
        if (!reqOk(h, it, dh)) { c.fillStyle = 'rgba(160,0,0,0.35)'; c.fillRect(X + x, y, w, hh); }
        drawIcon(c, it, X + x + 1, y + 1, w - 2, hh - 2);
      }
      ui.area(X + x - 2, y - 2, w + 4, hh + 4, () => { if (it) this.tapItem(it); }, () => { if (it) this.info = it; });
    }
    const G = Hud.GRID, gx = X + G.x, gy = G.y;
    for (const e of h.inv) {
      const x = gx + e.x * G.pitch, y = gy + e.y * G.pitch, w = (e.item.w - 1) * G.pitch + G.cell, hh = (e.item.h - 1) * G.pitch + G.cell;
      c.fillStyle = this.sel === e.item ? 'rgba(80,80,140,0.8)' : 'rgba(40,34,24,0.9)'; c.fillRect(x, y, w, hh);
      if (!reqOk(h, e.item, dh)) { c.fillStyle = 'rgba(160,0,0,0.35)'; c.fillRect(x, y, w, hh); }
      drawIcon(c, e.item, x + 1, y + 1, w - 2, hh - 2);
      ui.area(x - 1, y - 1, w + 2, hh + 2, () => this.tapItem(e.item), () => { this.info = e.item; });
    }
    ui.text(`${h.gold}`, X + 78, 340, { size: 11, color: '#e8c040' });
    if (this.sel) ui.text('Tap again to use / equip - hold for info', X + 300, 211, { align: 'right', size: 9, color: '#9a8a62' });
    // the belt (8 slots, CC0 belt-slot frame) sits in the left half while the inventory is open
    if (this.left === 'none') {
      const bx = 24, by = 280, bc = 34;
      ui.panel(bx - 8, by - 26, 8 * bc + 16, bc + 36);
      ui.text('Belt', bx, by - 12, { size: 11, color: '#d8b860' });
      for (let i = 0; i < 8; i++) {
        const it = h.belt[i], x = bx + i * bc;
        if (!drawImg(c, 'ui/belt-slot', x, by, bc - 2, bc - 2)) { c.fillStyle = '#15120d'; c.fillRect(x, by, bc - 2, bc - 2); c.strokeStyle = '#6a5a3a'; c.strokeRect(x + 0.5, by + 0.5, bc - 3, bc - 3); }
        if (this.sel && this.sel === it) { c.fillStyle = 'rgba(80,80,140,0.6)'; c.fillRect(x, by, bc - 2, bc - 2); }
        ui.text(`${i + 1}`, x + 5, by + 6, { size: 8, color: '#8a7a52' });
        if (it) drawIcon(c, it, x + 3, by + 3, bc - 8, bc - 8);
        ui.area(x, by, bc - 2, bc - 2, () => { if (it) this.tapItem(it); }, () => { if (it) this.info = it; });
      }
    }
  }
  /** Tap = select; tap the selected item again = its main action (equip / unequip / use). */
  tapItem(it: Item) {
    const g = this.g();
    if (g.pendingPick) { g.pickItem(it); return; }
    if (this.sel !== it) { this.sel = it; return; }
    this.sel = null;
    this.primary(it);
  }
  primary(it: Item) {
    const g = this.g(), h = g.hero;
    const worn = BODY_SLOTS.some((s) => h.body[s] === it);
    if (worn) { const e = unequip(h, it); if (e) g.say(e); }
    else if (it.loc !== 'ILOC_UNEQUIPABLE' && it.loc !== 'ILOC_BELT') { const e = equip(h, it); if (e) g.say(e); }
    else if (usable(it)) g.useItem(it);
    else this.info = it;
    g.refresh();
  }
  drawItemInfo(ui: UI, it: Item) {
    const g = this.g(), h = g.hero;
    const x = 140, y = 30, w = 360;
    const lines = itemLines(it, h.clvl);
    const hh = 54 + lines.length * 15 + 50;
    ui.block(-1000, -1000, 4000, 4000);
    ui.panel(x, y, w, hh);
    this.closeBtn(ui, x + w - 34, y + 4, () => { this.info = null; });
    ui.text(it.identified || !it.magical ? it.iname : it.name, x + w / 2 - 10, y + 20, { align: 'center', size: 13, bold: true, color: itemColor(it) });
    lines.forEach(([s, col], i) => ui.text(s, x + w / 2, y + 44 + i * 15, { align: 'center', size: 11, color: col }));
    const by = y + hh - 42;
    const worn = BODY_SLOTS.some((s) => h.body[s] === it);
    const inPack = h.inv.some((e) => e.item === it);
    const inBelt = h.belt.includes(it);
    const done = () => { g.refresh(); this.info = null; this.sel = null; };
    const btns: [string, () => void][] = [];
    if (worn) btns.push(['Unequip', () => { const e = unequip(h, it); if (e) g.say(e); done(); }]);
    else if (it.loc !== 'ILOC_UNEQUIPABLE' && it.loc !== 'ILOC_BELT') btns.push(['Equip', () => { const e = equip(h, it); if (e) g.say(e); done(); }]);
    if (usable(it)) btns.push(['Use', () => { g.useItem(it); done(); }]);
    if (it.misc.startsWith('IMISC_SCROLL') && SPELL_BY_D1[it.spell] && SPELLS[SPELL_BY_D1[it.spell].id]?.targeted !== undefined) {
      const id = `scroll:${SPELL_BY_D1[it.spell].id}`;
      btns.push(['To slot', () => { const free = h.slots.indexOf(null); h.slots = assignSlot(h.slots, free >= 0 ? free : SLOT_COUNT - 1, id); g.say(`Scroll assigned to slot ${(free >= 0 ? free : SLOT_COUNT - 1) + 1}`); done(); }]);
    }
    if (inPack && isBeltable(it) && h.belt.includes(null)) btns.push(['To belt', () => { removeItem(h, it); h.belt[h.belt.indexOf(null)] = it; done(); }]);
    if (inBelt) btns.push(['To pack', () => { removeItem(h, it); if (!pickUpPack(h, it)) { h.belt[h.belt.indexOf(null)] = it; g.say('No room'); } done(); }]);
    if (!g.dialog) btns.push(['Drop', () => { removeItem(h, it); g.drop(it, g.p.tx, g.p.ty); done(); }]);
    const bw = Math.min(80, (w - 20) / btns.length - 6);
    btns.forEach(([l, f], i) => ui.button(l, x + 10 + i * (bw + 6), by, bw, 34, f, { size: 12 }));
  }

  // ---------- spellbook (panel space, right): CC0 two-page frame; left page = learned spells, right = staff + scrolls ----------
  spellPage = 0;
  static SPELL_BOX: [number, number][] = [[28, 70], [90, 70], [28, 140], [90, 140]];
  drawSpells(ui: UI) {
    const g = this.g(), h = g.hero, X = 320, c = ui.c;
    this.artPanel(ui, 'ui/panel-spellbook', X);
    this.closeBtn(ui, X + 284, 5, () => { this.right = 'none'; });
    type E = { id: string; name: string; sub: string; glyph: string };
    const learned: E[] = [], carried: E[] = [];
    for (const [id, lv] of Object.entries(h.spells)) { const s = SPELLS[id]; if (s) learned.push({ id, name: s.name, sub: `L${lv}  ${spellMana(s, lv)}m${CASTABLE.has(id) ? '' : ' *'}`, glyph: spellGlyph(id) }); }
    const st = h.body.handL;
    if (st?.itype === 'ITYPE_STAFF' && SPELL_BY_D1[st.spell]) { const s = SPELL_BY_D1[st.spell]; carried.push({ id: `staff:${s.id}`, name: s.name, sub: `staff ${st.charges}/${st.maxCharges}`, glyph: 'staff' }); }
    const scrolls = new Map<string, number>();
    for (const it of [...h.belt, ...h.inv.map((e) => e.item)]) if (it && it.misc.startsWith('IMISC_SCROLL') && SPELL_BY_D1[it.spell]) { const id = SPELL_BY_D1[it.spell].id; scrolls.set(id, (scrolls.get(id) ?? 0) + 1); }
    for (const [id, n] of scrolls) carried.push({ id: `scroll:${id}`, name: SPELLS[id].name, sub: `scroll x${n}`, glyph: spellGlyph(id) });
    const pages = Math.max(1, Math.ceil(learned.length / 4), Math.ceil(carried.length / 4));
    this.spellPage = Math.min(this.spellPage, pages - 1);
    const page = (list: E[], px: number, title: string) => {
      ui.text(title, X + px + 57, 54, { align: 'center', size: 10, color: '#d8b860' });
      list.slice(this.spellPage * 4, this.spellPage * 4 + 4).forEach((e, i) => {
        const [bx, by] = Hud.SPELL_BOX[i], x = X + px + bx - 28, y = by, slot = h.slots.indexOf(e.id);
        if (this.spellSel === e.id) { c.fillStyle = 'rgba(80,80,140,0.6)'; c.fillRect(x, y, 55, 55); }
        drawGlyph(c, e.glyph, x + 27, y + 19, 1.2);
        ui.text(shortName(e.name), x + 27, y + 39, { align: 'center', size: 9 });
        ui.text(e.sub, x + 27, y + 49, { align: 'center', size: 8, color: '#9a8a62' });
        if (slot >= 0) ui.text(`${slot + 1}`, x + 50, y + 7, { align: 'right', size: 10, bold: true, color: '#9cf' });
        ui.area(x - 3, y - 3, 61, 61, () => {
          if (this.spellSel === e.id && slot < 0) { const free = h.slots.indexOf(null); if (free >= 0) h.slots = assignSlot(h.slots, free, e.id); }
          this.spellSel = e.id;
        });
      });
    };
    page(learned, 28, 'Spells'); page(carried, 176, 'Staff & scrolls');
    if (!learned.length && !carried.length) ui.wrap('No spells yet. Read books, or carry scrolls or a staff.', X + 24, 214, 120, 13, { size: 10, color: '#9a8a62' });
    // slot row (Order 4 assignment flow) in the pages' empty lower half
    const sel = this.spellSel ? [...learned, ...carried].find((e) => e.id === this.spellSel) : null;
    ui.text(sel ? `Assign ${skillLabel(g, sel.id)} to:` : 'Tap a spell, then a slot', X + 160, 236, { align: 'center', size: 10, color: '#d8b860' });
    for (let i = 0; i < SLOT_COUNT; i++) {
      const id = h.slots[i], x = X + [24, 86, 172, 234][i];
      ui.button(id ? shortName(skillLabel(g, id)) : `Slot ${i + 1}`, x, 250, 60, 40, () => {
        if (this.spellSel) { h.slots = assignSlot(h.slots, i, this.spellSel); this.spellSel = null; }
        else if (id) h.slots = assignSlot(h.slots, i, null);
      }, { size: 10, on: !!id });
    }
    ui.text(`${this.spellPage + 1}`, X + 81, 334, { align: 'center', size: 10 }); ui.text(`${pages}`, X + 137, 334, { align: 'center', size: 10 });
    if (pages > 1) ui.area(X + 56, 316, 110, 34, () => { this.spellPage = (this.spellPage + 1) % pages; });
  }

  // ---------- full automap (css px) ----------
  drawAutomap(ui: UI) {
    const g = this.g(), lv = g.level, m = lv.map, c = ui.c, s = 5, { W, H } = this.lay;
    const cx = W / 2, cy = H / 2;
    c.save(); c.globalAlpha = 0.85;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      if (!lv.explored[y * m.w + x] && lv.id !== 'town') continue;
      const t = m.tiles[y * m.w + x];
      const px = cx + (x - g.p.x - (y - g.p.y)) * s, py = cy + (x - g.p.x + (y - g.p.y)) * s / 2;
      if (px < 0 || py < 0 || px > W || py > H) continue;
      if (t === T.WALL || t === T.HOUSE || t === T.PILLAR) { c.fillStyle = '#a89060'; c.fillRect(px - 1, py - 1, 3, 2); }
      else if (t === T.DOOR || t === T.DOOR_OPEN) { c.fillStyle = '#c86030'; c.fillRect(px - 2, py - 1, 4, 3); }
      else if (t === T.UP || t === T.DOWN) { c.fillStyle = '#ffffff'; c.fillRect(px - 2, py - 2, 5, 4); }
      else if (t === T.WATER) { c.fillStyle = '#2040a0'; c.fillRect(px - 1, py - 1, 2, 2); }
    }
    c.fillStyle = '#ff4040'; c.fillRect(cx - 2, cy - 2, 5, 5);
    c.restore();
  }

  // ---------- stores / NPC dialogs ----------
  drawStore(ui: UI) {
    const g = this.g(), dlg = g.dialog!, n = dlg.npc, h = g.hero, tx = NPC_TEXT[n.id];
    const x = 60, y = 16, w = 520, hh = 330;
    ui.panel(x, y, w, hh);
    ui.text(n.name, x + w / 2, y + 20, { align: 'center', size: 15, bold: true, color: '#e8c040' });
    const close = () => { g.dialog = null; this.store = 'menu'; this.pick = null; this.scroll = 0; };
    const back = () => { this.store = 'menu'; this.pick = null; this.scroll = 0; };
    this.closeBtn(ui, x + w - 36, y + 6, close);
    if (this.store === 'menu' || this.store === 'talk') {
      const ty = ui.wrap(this.store === 'talk' ? dlg.text : tx.greet, x + 30, y + 52, w - 60, 16, { align: 'center' });
      tx.menu.forEach((label, i) => {
        ui.menuItem(label, x, Math.max(ty + 20, y + 130) + i * 30, w, () => this.storeAction(n.id, i, tx.menu.length, close));
      });
      ui.text(`Your gold: ${h.gold}`, x + w - 20, y + hh - 16, { align: 'right', size: 11, color: '#e8c040' });
      return;
    }
    const list = this.storeList();
    const per = 7;
    this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, list.length - per)));
    ui.text(storeTitle(this.store), x + w / 2, y + 44, { align: 'center', size: 13 });
    if (!list.length) ui.text('You have nothing for this.', x + w / 2, y + 120, { align: 'center' });
    list.slice(this.scroll, this.scroll + per).forEach((e, i) => {
      const yy = y + 62 + i * 34;
      const ok = this.store === 'buy' || this.store === 'premium' || this.store === 'wirt' ? reqOk(h, e.item, derive(h)) : true;
      ui.button('', x + 16, yy, w - 32, 30, () => { this.pick = e.item; }, { on: this.pick === e.item });
      ui.text(e.item.identified || !e.item.magical ? e.item.iname : e.item.name, x + 26, yy + 10, { size: 12, color: ok ? itemColor(e.item) : '#d04040' });
      ui.text(itemLines(e.item, h.clvl).slice(0, 2).map((l) => l[0]).join('   '), x + 26, yy + 23, { size: 9, color: '#9a8a62' });
      ui.text(`${e.price}`, x + w - 28, yy + 15, { size: 12, align: 'right', color: '#e8c040' });
    });
    if (list.length > per) {
      ui.button('▲', x + w - 46, y + 36, 30, 22, () => { this.scroll = Math.max(0, this.scroll - per); });
      ui.button('▼', x + w - 46, y + hh - 62, 30, 22, () => { this.scroll += per; });
    }
    const by = y + hh - 34;
    const sel = list.find((e) => e.item === this.pick);
    ui.button(verb(this.store), x + 16, by, 110, 26, () => { if (sel) this.storeDo(sel.item, sel.price); }, { disabled: !sel });
    if (this.pick) ui.button('Info', x + 132, by, 70, 26, () => { this.info = this.pick; });
    ui.button('Back', x + w - 96, by, 80, 26, back);
    ui.text(`Your gold: ${h.gold}`, x + w / 2 + 60, by + 13, { align: 'center', size: 11, color: '#e8c040' });
  }
  storeAction(id: string, i: number, n: number, close: () => void) {
    const g = this.g(), dlg = g.dialog!;
    if (i === n - 1) { close(); return; }
    if (i === 0) { dlg.text = g.gossip(dlg.npc); this.store = 'talk'; return; }
    const map: Record<string, StoreMode[]> = {
      griswold: ['talk', 'buy', 'premium', 'sell', 'repair'], pepin: ['talk', 'menu', 'buy'], adria: ['talk', 'buy', 'sell', 'recharge'],
      cain: ['talk', 'identify'], wirt: ['talk', 'wirt'],
    };
    const mode = map[id]?.[i];
    if (id === 'pepin' && i === 1) { const d = derive(g.hero); g.hero.hp = d.maxHp; dlg.text = 'There. You are healed.'; this.store = 'talk'; return; }
    if (id === 'wirt' && mode === 'wirt') {
      if (!g.stores.boy) { dlg.text = 'I have nothing for you right now. Come back later.'; this.store = 'talk'; return; }
      if (g.hero.gold < 50) { dlg.text = 'Looking costs fifty gold. Come back when you have it.'; this.store = 'talk'; return; }
      g.hero.gold -= 50;
    }
    if (mode) { this.store = mode; this.scroll = 0; this.pick = null; }
  }
  storeList(): { item: Item; price: number }[] {
    const g = this.g(), h = g.hero, st = g.stores, npc = g.dialog!.npc.id;
    const carried = [...BODY_SLOTS.map((s) => h.body[s]), ...h.inv.map((e) => e.item)].filter((i): i is Item => !!i);
    switch (this.store) {
      case 'buy': return (npc === 'griswold' ? st.smith : npc === 'adria' ? st.witch : st.healer).map((i) => ({ item: i, price: itemPrice(i) }));
      case 'premium': return st.premium.items.filter((i): i is Item => !!i).map((i) => ({ item: i, price: itemPrice(i) }));
      case 'wirt': return st.boy ? [{ item: st.boy, price: boyPrice(st.boy) }] : [];
      case 'sell': {
        const pack = h.inv.map((e) => e.item);
        // Griswold buys weapons/armour (not misc/staves); Adria buys potions/scrolls/books/staves (StoreSellOk / WitchSellOk)
        const ok = npc === 'griswold' ? (i: Item) => !['ITYPE_MISC', 'ITYPE_GOLD', 'ITYPE_STAFF', 'ITYPE_RING', 'ITYPE_AMULET'].includes(i.itype) && i.misc !== 'IMISC_UNIQUE'
          : (i: Item) => i.itype === 'ITYPE_MISC' && i.misc !== 'IMISC_UNIQUE' || i.itype === 'ITYPE_STAFF';
        return pack.filter(ok).map((i) => ({ item: i, price: sellPrice(i) }));
      }
      case 'repair': return carried.filter((i) => i.maxDur && i.maxDur !== DUR_INDESTRUCTIBLE && i.dur < i.maxDur).map((i) => ({ item: i, price: repairCost(i) }));
      case 'identify': return carried.filter((i) => i.magical && !i.identified).map((i) => ({ item: i, price: IDENTIFY_COST }));
      case 'recharge': return carried.filter((i) => i.itype === 'ITYPE_STAFF' && i.maxCharges && i.charges < i.maxCharges).map((i) => ({ item: i, price: rechargeCost(i) }));
      default: return [];
    }
  }
  storeDo(it: Item, price: number) {
    const g = this.g(), h = g.hero, st = g.stores, npc = g.dialog!.npc.id;
    const pay = () => { if (h.gold < price) { g.say('You do not have enough gold'); g.sfx.push('nope'); return false; } h.gold -= price; return true; };
    switch (this.store) {
      case 'buy': case 'premium': case 'wirt': {
        if (h.gold < price) { g.say('You do not have enough gold'); g.sfx.push('nope'); return; }
        const copy: Item = JSON.parse(JSON.stringify(it));
        if (!pickUpPack(h, copy) && !pickUp(h, copy)) { g.say('You do not have enough room in inventory'); return; }
        h.gold -= price; g.sfx.push('gold');
        if (this.store === 'premium') st.premium.items[st.premium.items.indexOf(it)] = null;
        else if (this.store === 'wirt') st.boy = null;
        else if (!(npc === 'adria' && st.witch.indexOf(it) < 3) && !(npc === 'pepin' && st.healer.indexOf(it) < 2)) {
          const arr = npc === 'griswold' ? st.smith : npc === 'adria' ? st.witch : st.healer; arr.splice(arr.indexOf(it), 1); // basic potions/scrolls are unlimited (D1)
        }
        break;
      }
      case 'sell': removeItem(h, it); h.gold += price; g.sfx.push('gold'); break;
      case 'repair': if (pay()) { it.dur = it.maxDur; g.sfx.push('repair'); } break;
      case 'identify': if (pay()) { it.identified = true; g.say(`It is ${it.iname}`); } break;
      case 'recharge': if (pay()) { it.charges = it.maxCharges; } break;
    }
    this.pick = null; g.refresh();
  }

  // ---------- menus ----------
  drawMenu(ui: UI) {
    ui.block(-1000, -1000, 4000, 4000);
    if (this.menu === 'main') {
      const items: [string, () => void][] = [
        ['Save Game', () => { this.hooks.save(); this.menu = 'none'; }], ['Options', () => { this.menu = 'options'; }],
        ['New Game', () => { this.menu = 'none'; this.hooks.newGame(); }], ['Load Game', () => { this.menu = 'none'; this.hooks.load(); }],
        ['Quit Game', () => { this.menu = 'none'; this.hooks.quit(); }], ['Resume', () => { this.menu = 'none'; }],
      ];
      items.forEach(([l, f], i) => ui.menuItem(l, 170, 110 + i * 44, 300, f, { size: 22 }));
    } else {
      const [mv, sv] = this.hooks.vol();
      ui.text('Options', VIEW_W / 2, 100, { align: 'center', size: 22, color: '#d8b860' });
      const row = (label: string, v: number, y: number, set: (n: number) => void) => {
        ui.text(label, 200, y, { size: 16 }); ui.button('-', 340, y - 14, 32, 28, () => set(Math.max(0, v - 1))); ui.text(`${v}`, 395, y, { align: 'center', size: 16 }); ui.button('+', 420, y - 14, 32, 28, () => set(Math.min(10, v + 1)));
      };
      row('Music volume', mv, 170, (n) => this.hooks.setVolumes(n, sv));
      row('Sound volume', sv, 220, (n) => this.hooks.setVolumes(mv, n));
      ui.menuItem('Back', 170, 300, 300, () => { this.menu = 'main'; }, { size: 20 });
    }
  }
  drawDeath(ui: UI) {
    const g = this.g();
    ui.block(-1000, -1000, 4000, 4000);
    ui.text('You have died', VIEW_W / 2, 150, { align: 'center', size: 34, color: '#c02020', bold: true });
    ui.menuItem('Restart in town', 170, 230, 300, () => g.restartInTown(), { size: 20 });
    ui.menuItem('Load Game', 170, 275, 300, () => this.hooks.load(), { size: 20 });
    ui.menuItem('Main Menu', 170, 320, 300, () => this.hooks.quit(), { size: 20 });
  }
}

function pickUpPack(h: Game['hero'], it: Item): boolean {
  if (it.itype === 'ITYPE_GOLD') { h.gold += it.gold ?? 0; return true; }
  for (let y = 0; y <= INV_H - it.h; y++) for (let x = 0; x <= INV_W - it.w; x++) {
    if (!h.inv.some((e) => x < e.x + e.item.w && e.x < x + it.w && y < e.y + e.item.h && e.y < y + it.h)) { h.inv.push({ item: it, x, y }); return true; }
  }
  return false;
}
function usable(it: Item) { return (it.misc !== 'IMISC_NONE' && it.misc !== 'IMISC_STAFF' && it.misc !== 'IMISC_UNIQUE' && it.loc === 'ILOC_UNEQUIPABLE') || it.misc === 'IMISC_BOOK'; }
function shortName(s: string) { const w = s.replace(/^(Scroll|Staff) /, '').split(' '); return (w.length > 1 ? w.map((x) => x[0]).join('') : w[0]).slice(0, 8); }
/** Life/mana orb: the CC0 empty orb, then the full orb clipped to the fill level (D1 fills from the bottom). */
function orb(c: CanvasRenderingContext2D, key: string, x: number, y: number, d: number, f: number, col: string) {
  f = Math.max(0, Math.min(1, f));
  if (drawImg(c, 'ui/orb-empty', x, y, d, d)) {
    c.save(); c.beginPath(); c.rect(x, y + d * (1 - f), d, d * f); c.clip(); drawImg(c, key, x, y, d, d); c.restore();
    return;
  }
  c.fillStyle = '#1a0e08'; c.beginPath(); c.arc(x + d / 2, y + d / 2, d / 2, 0, Math.PI * 2); c.fill();
  c.save(); c.clip(); c.fillStyle = col; c.fillRect(x, y + d * (1 - f), d, d * f); c.restore();
}
function spellGlyph(id: string) { return /fire|inferno|flame|elemental/.test(id) ? 'sp_fire' : /bolt|light|chain|nova/.test(id) && id !== 'firebolt' ? 'sp_lightning' : 'spell'; }
/** Small vector icons for the HUD (no icon font needed). */
export function drawGlyph(c: CanvasRenderingContext2D, k: string, x: number, y: number, s = 1) {
  c.save(); c.translate(x, y); c.scale(s, s); c.lineWidth = 2; c.strokeStyle = '#e8d8a8'; c.fillStyle = '#e8d8a8';
  const L = (pts: number[]) => { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.stroke(); };
  switch (k) {
    case 'inv': c.strokeRect(-9, -5, 18, 14); L([-5, -5, -5, -9, 5, -9, 5, -5]); break;
    case 'char': c.beginPath(); c.arc(0, -6, 5, 0, Math.PI * 2); c.stroke(); L([-9, 11, -7, 2, 7, 2, 9, 11]); break;
    case 'spell': c.strokeRect(-8, -9, 16, 18); L([-4, -9, -4, 9]); L([0, -3, 5, -3]); L([0, 2, 5, 2]); break;
    case 'quest': c.strokeRect(-7, -10, 14, 20); c.font = 'bold 14px serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('!', 0, 1); break;
    case 'menu': L([-9, -6, 9, -6]); L([-9, 0, 9, 0]); L([-9, 6, 9, 6]); break;
    case 'sword': L([-9, 9, 8, -8]); L([-6, 2, 2, 10]); L([8, -8, 10, -10]); break;
    case 'bow': c.beginPath(); c.arc(-6, 0, 12, -1.1, 1.1); c.stroke(); L([-1, -10, -1, 10]); L([-8, 0, 10, 0]); break;
    case 'hammer': c.fillRect(-8, -9, 12, 7); L([-2, -2, -2, 10]); break;
    case 'trap': L([-9, 6, -3, -4, 0, 4, 3, -4, 9, 6]); break;
    case 'staff': L([-6, 10, 5, -7]); c.beginPath(); c.arc(6, -8, 3, 0, Math.PI * 2); c.fill(); break;
    case 'pot_red': case 'pot_blue': c.fillStyle = k === 'pot_red' ? '#e03030' : '#3060ff'; c.beginPath(); c.arc(0, 3, 8, 0, Math.PI * 2); c.fill(); c.fillRect(-3, -9, 6, 7); c.fillStyle = '#c8b890'; c.fillRect(-4, -11, 8, 3); break;
    case 'sp_fire': c.fillStyle = '#ff8a20'; c.beginPath(); c.moveTo(0, -10); c.quadraticCurveTo(9, 2, 0, 9); c.quadraticCurveTo(-9, 2, 0, -10); c.fill(); break;
    case 'sp_lightning': c.strokeStyle = '#9cf'; L([3, -10, -4, 1, 3, 1, -3, 10]); break;
    default: c.strokeStyle = '#c8a0ff'; c.beginPath(); c.arc(0, 0, 7, 0, Math.PI * 2); c.stroke(); L([-4, 0, 4, 0]); L([0, -4, 0, 4]); break;
  }
  c.restore();
}
function storeTitle(m: StoreMode) {
  return ({ buy: 'I have these items for sale', premium: 'I have these premium items for sale', sell: 'Which item is for sale?', repair: 'Repair which item?', identify: 'Identify which item? (100 gold)', recharge: 'Recharge which item?', wirt: 'I have this item for sale', menu: '', talk: '' } as Record<StoreMode, string>)[m];
}
function verb(m: StoreMode) { return ({ buy: 'Buy', premium: 'Buy', wirt: 'Buy', sell: 'Sell', repair: 'Repair', identify: 'Identify', recharge: 'Recharge' } as Record<string, string>)[m] ?? 'OK'; }
export function skillLabel(g: Game, id: string): string {
  if (id === 'skill') return { warrior: 'Repair', rogue: 'Disarm', sorcerer: 'Recharge' }[g.hero.cls];
  if (id.startsWith('scroll:')) return `Scroll ${SPELLS[id.slice(7)]?.name ?? ''}`;
  if (id.startsWith('staff:')) return `Staff ${SPELLS[id.slice(6)]?.name ?? ''}`;
  return SPELLS[id]?.name ?? id;
}
/** Icon id in the CC0 item atlas; closest base when the exact item has no icon yet. */
export function itemIconId(it: Item): string {
  const n = it.name.toLowerCase();
  const exact: Record<string, string> = { 'short sword': 'short_sword', buckler: 'buckler', 'short bow': 'short_bow', club: 'club', dagger: 'dagger', axe: 'axe', 'small axe': 'axe', mace: 'mace', cap: 'cap', rags: 'rags', cape: 'cape', 'leather armor': 'leather_armor', 'small shield': 'small_shield', ring: 'ring', gold: 'gold' };
  if (exact[n]) return exact[n];
  if (it.itype === 'ITYPE_GOLD') return 'gold';
  if (it.misc.includes('MANA')) return 'potion_mana';
  if (it.misc.includes('HEAL') || it.misc.includes('REJUV') || it.misc.startsWith('IMISC_ELIX')) return 'potion_healing';
  if (it.misc.startsWith('IMISC_SCROLL')) return 'scroll';
  if (it.misc === 'IMISC_BOOK') return 'book';
  return ({ ITYPE_SWORD: 'short_sword', ITYPE_AXE: 'axe', ITYPE_MACE: 'mace', ITYPE_BOW: 'short_bow', ITYPE_STAFF: 'short_staff', ITYPE_SHIELD: 'small_shield', ITYPE_HELM: 'cap', ITYPE_LARMOR: 'leather_armor', ITYPE_MARMOR: 'leather_armor', ITYPE_HARMOR: 'leather_armor', ITYPE_RING: 'ring', ITYPE_AMULET: 'ring' } as Record<string, string>)[it.itype] ?? '';
}
export function drawIcon(c: CanvasRenderingContext2D, it: Item, x: number, y: number, w: number, h: number) {
  const id = itemIconId(it);
  if (id && drawFrameBox(c, id, x, y, w, h)) { if (it.magical) { c.strokeStyle = itemColor(it); c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); } return; }
  const col = it.misc === 'IMISC_HEAL' || it.misc === 'IMISC_FULLHEAL' ? '#c02020' : it.misc === 'IMISC_MANA' || it.misc === 'IMISC_FULLMANA' ? '#2040d0'
    : it.misc === 'IMISC_REJUV' || it.misc === 'IMISC_FULLREJUV' ? '#a040c0' : it.misc.startsWith('IMISC_SCROLL') ? '#d8c8a0' : it.misc === 'IMISC_BOOK' ? '#6a3a2a'
    : it.misc.startsWith('IMISC_ELIX') ? '#e0a020' : '#8a8a8a';
  c.fillStyle = col;
  if (it.misc.includes('HEAL') || it.misc.includes('MANA') || it.misc.includes('REJUV') || it.misc.startsWith('IMISC_ELIX')) { c.beginPath(); c.arc(x + w / 2, y + h / 2 + 2, Math.min(w, h) / 3, 0, Math.PI * 2); c.fill(); c.fillRect(x + w / 2 - 2, y + 2, 4, h / 3); }
  else { c.fillRect(x + 2, y + 2, w - 4, h - 4); }
  c.fillStyle = itemColor(it); c.font = '8px serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  const abbr = (it.identified ? it.iname : it.name).split(' ').filter((s) => s.length > 2).slice(-1)[0] ?? '';
  if (w >= 25) c.fillText(abbr.slice(0, Math.floor(w / 5)), x + w / 2, y + h / 2);
}
export function itemLines(it: Item, _clvl: number): [string, string][] {
  const out: [string, string][] = [];
  const known = it.identified || !it.magical;
  if (it.itype === 'ITYPE_GOLD') return [[`${it.gold} gold pieces`, '#e8c040']];
  if (it.maxDam) out.push([`Damage: ${it.minDam}-${it.maxDam}`, '#d8c89a']);
  if (it.ac) out.push([`Armor: ${it.ac}`, '#d8c89a']);
  if (it.maxDur) out.push([it.maxDur === DUR_INDESTRUCTIBLE ? 'Indestructible' : `Durability: ${it.dur}/${it.maxDur}`, '#d8c89a']);
  if (it.maxCharges) out.push([`Charges: ${it.charges}/${it.maxCharges}`, '#d8c89a']);
  if (!known) out.push(['Not Identified', '#d04040']);
  else {
    const fx: [number, string][] = [[it.toHit, 'to hit'], [it.pctDam, '% damage'], [it.pctAC, '% armor'], [it.str, 'to strength'], [it.mag, 'to magic'], [it.dex, 'to dexterity'],
      [it.vit, 'to vitality'], [it.life, 'life'], [it.mana, 'mana'], [it.fr, '% resist fire'], [it.lr, '% resist lightning'], [it.mr, '% resist magic'], [it.damMod, 'damage'], [-it.getHit, 'damage from enemies (reduced)'], [it.splLvlAdd, 'spell levels'], [it.light * 10, '% light radius']];
    for (const [v, s] of fx) if (v) out.push([`${v > 0 ? '+' : ''}${v} ${s}`, '#6a8aff']);
    if (it.fMax) out.push([`Fire damage ${it.fMin}-${it.fMax}`, '#6a8aff']);
    if (it.lMax) out.push([`Lightning damage ${it.lMin}-${it.lMax}`, '#6a8aff']);
    for (const f of it.flags) if (!['FIREDAM', 'LIGHTDAM'].includes(f)) out.push([f.toLowerCase().replace(/_/g, ' '), '#6a8aff']);
  }
  const sp = SPELL_BY_D1[it.spell];
  if (sp && it.misc === 'IMISC_BOOK') out.push([`Teaches ${sp.name}`, '#d8c89a']);
  if (sp && it.misc.startsWith('IMISC_SCROLL')) out.push([`Casts ${sp.name}`, '#d8c89a']);
  const req = [it.minStr && `${it.minStr} Str`, it.minMag && `${it.minMag} Mag`, it.minDex && `${it.minDex} Dex`].filter(Boolean).join(', ');
  if (req) out.push([`Required: ${req}`, '#d8c89a']);
  out.push([`Value: ${itemPrice(it)}`, '#9a8a62']);
  void BASE;
  return out;
}
