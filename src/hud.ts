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
import { dropItem, locate, compareItems, compareTarget, type Place } from './invops';
import { Scroller } from './touch';
import { itemPrice, sellPrice, boyPrice, repairCost, rechargeCost, IDENTIFY_COST, DUR_INDESTRUCTIBLE, type Item } from './itemgen';
import { itemColor } from './render';
import { drawFrameBox } from './art';
import { BODY_FONT, HUD_FONT, arrow, cached, closeButton, divider, glassOrb, hudText, ironFrame, itemSlot, rarityColor, runeJoystick, skinPanel, socket, sweep, titleBar, well, xpBar } from './hudSkin';
import { assignSlot, knob, SLOT_COUNT, JOY_RADIUS } from './controls';
import type { Game } from './game';
import type { UI } from './ui';

type StoreMode = 'menu' | 'talk' | 'buy' | 'premium' | 'sell' | 'repair' | 'identify' | 'recharge' | 'wirt';
export interface HudHooks { save(): void; load(): void; newGame(): void; quit(): void; setVolumes(m: number, s: number): void; vol(): [number, number] }
export interface Layout { W: number; H: number; dpr: number; inset: { l: number; r: number; t: number; b: number } }
export interface JoyDraw { ox: number; oy: number; tx: number; ty: number }
const PS_W = 640, PS_H = 352; // panel space
/** Order 16: panel open / close transition, s (<= 150 ms). */
export const FADE_S = 0.12;

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
  // ---- Order 10 touch state ----
  /** U4: finger-drag scrollers by region key (store list, quest log); the spellbook swipes pages. */
  scrollers = new Map<string, Scroller>();
  private swipe = 0; private lastStep = 0;
  /** U8: item held on the finger (press-and-hold drag), and D1's cursor item (swapped out by a drop, placed by the next tap). */
  drag: { item: Item; x: number; y: number } | null = null;
  carry: Item | null = null;
  /** Last touch position (css px), set by main.ts on every pointer event. */
  pointer = { x: 0, y: 0 };
  /** UI sample: fingers currently down on HUD boxes (css px), for the sockets' pressed state. */
  fingers = new Map<number, { x: number; y: number }>();
  constructor(private g: () => Game, private hooks: HudHooks) {}

  sc(key: string) { let s = this.scrollers.get(key); if (!s) { s = new Scroller(); this.scrollers.set(key, s); } return s; }
  scrollStart(key: string, t: number) { this.swipe = 0; if (key !== 'spell') this.sc(key).start(t); }
  /** Finger moved by (dx, dy) css px inside a scroll region. */
  scrollDrag(key: string, dx: number, dy: number, t: number) {
    const ps = this.ps().ps;
    if (key === 'spell') { this.swipe += Math.abs(dx) > Math.abs(dy) ? dx : dy; return; }
    this.sc(key).drag(dy / ps, t);
  }
  scrollEnd(key: string, t: number) {
    if (key === 'spell') { // a swipe of 40 css px flips a page (finger left/up = next page)
      if (Math.abs(this.swipe) >= 40) this.spellPage = Math.max(0, this.spellPage + (this.swipe < 0 ? 1 : -1));
      this.swipe = 0; return;
    }
    this.sc(key).release(t);
  }
  toPS(x: number, y: number) { const { ps, ox, oy } = this.ps(); return { x: (x - ox) / ps, y: (y - oy) / ps }; }
  /** U8: what lies under a finger (css px) for an item being dropped. */
  targetAt(x: number, y: number, it: Item): Place {
    const q = this.toPS(x, y), X = 320;
    if (this.right === 'inv') {
      for (const s of BODY_SLOTS) { const [sx, sy, w, hh] = Hud.SLOT_RECT[s]; if (q.x >= X + sx - 2 && q.x < X + sx + w + 2 && q.y >= sy - 2 && q.y < sy + hh + 2) return { kind: 'body', slot: s }; }
      const G = Hud.GRID, gx = X + G.x, gy = G.y;
      if (q.x >= gx - 4 && q.y >= gy - 4 && q.x < gx + INV_W * G.pitch + 4 && q.y < gy + INV_H * G.pitch + 4) {
        // the finger holds the item by its middle
        const cx = Math.round((q.x - gx) / G.pitch - it.w / 2), cy = Math.round((q.y - gy) / G.pitch - it.h / 2);
        return { kind: 'inv', x: Math.max(0, Math.min(INV_W - it.w, cx)), y: Math.max(0, Math.min(INV_H - it.h, cy)) };
      }
      if (this.left === 'none') {
        const { x: bx, y: by, pitch: bc } = Hud.BELT;
        if (q.y >= by - 4 && q.y < by + bc + 2 && q.x >= bx - 4 && q.x < bx + 8 * bc) return { kind: 'belt', i: Math.max(0, Math.min(7, Math.floor((q.x - bx) / bc))) };
        if (q.x >= bx - 8 && q.x < bx + 8 * bc + 8 && q.y >= by - 26 && q.y < by + bc + 10) return { kind: 'none' }; // belt panel frame
      }
      if (q.x >= X && q.x < X + 320 && q.y >= 0 && q.y < PS_H) return { kind: 'none' }; // on the panel, not on a slot
      if (this.left !== 'none' && q.x >= 0 && q.x < 320 && q.y >= 0 && q.y < PS_H) return { kind: 'none' };
    }
    return { kind: 'ground' };
  }
  beginDrag(it: Item) { if (this.carry) return; this.info = null; this.sel = null; this.drag = { item: it, x: this.pointer.x, y: this.pointer.y }; }
  moveDrag(x: number, y: number) { if (this.drag) { this.drag.x = x; this.drag.y = y; } }
  /** Release a held item: drop it on the slot under the finger (D1 swap to the cursor), on the ground outside the panel, or snap back. */
  endDrag(x: number, y: number) {
    const d = this.drag; if (!d) return;
    this.drag = null;
    this.dropOn(d.item, this.targetAt(x, y, d.item));
  }
  private dropOn(it: Item, t: Place) {
    const g = this.g(), h = g.hero;
    const wasCarry = this.carry === it;
    const r = dropItem(h, it, t);
    if (r.ground) g.drop(it, g.p.tx, g.p.ty);
    if (r.ok) this.carry = r.carry; else if (!wasCarry) this.carry = this.carry ?? null; else this.carry = it;
    if (!r.ok && r.msg) g.say(r.msg, 1.5);
    g.refresh();
  }
  /** Tap with an item on the cursor: put it there (swapping what was there onto the cursor). */
  placeCarry(t: Place) { if (this.carry) this.dropOn(this.carry, t); }
  /** Never lose the cursor item: back into the pack/belt, else onto the ground (before saving or closing the panel). */
  stow() {
    const g = this.g?.(), it = this.carry; this.carry = null; this.drag = null;
    if (!g || !it) return;
    if (!pickUp(g.hero, it)) g.drop(it, g.p.tx, g.p.ty);
    g.refresh();
  }

  /** Order 16 transitions: the 0..1 ease of a panel slot that last changed state at tOpen; a slot that closes leaves a ghost. */
  private tOpen = new Map<string, number>(); private prevState = new Map<string, string>();
  ghosts = new Map<string, { kind: string; t: number }>();
  private ease(key: string, state: string, now: number): number {
    const prev = this.prevState.get(key);
    if (prev !== state) {
      this.prevState.set(key, state); this.tOpen.set(key, now);
      if ((key === 'left' || key === 'right') && prev && prev !== 'none') this.ghosts.set(key, { kind: prev, t: now }); else if (key === 'left' || key === 'right') this.ghosts.delete(key);
      if (prev === undefined) this.tOpen.set(key, now - FADE_S); // first frame: no transition
    }
    if (state === 'none') return 0;
    const t = Math.min(1, (now - (this.tOpen.get(key) ?? 0)) / FADE_S);
    return 1 - (1 - t) * (1 - t) * (1 - t);
  }
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
    const now = performance.now() / 1000, dt = Math.min(0.05, Math.max(0, now - (this.lastStep || now))); this.lastStep = now;
    for (const sc of this.scrollers.values()) sc.step(dt);
    if (this.right !== 'inv' && (this.carry || this.drag)) this.stow();
    if (this.map) this.drawAutomap(ui);
    const overlay = this.menu !== 'none' || !!g.dialog || g.dead;
    if (!overlay) this.drawControls(ui);
    // Order 16: panels ease in (fade + 10-unit slide) over FADE_S and fade out over FADE_S; a closing panel is drawn
    // without its hit boxes, so it can never take a tap.
    const aL = this.ease('left', this.left, now), aR = this.ease('right', this.right, now), aI = this.ease('info', this.info ? 'on' : 'none', now);
    const aO = this.ease('overlay', overlay ? (g.dead ? 'dead' : g.dialog ? 'dialog' : this.menu) : 'none', now);
    const ghosts = [...this.ghosts.entries()].filter(([, gh]) => now - gh.t < FADE_S);
    if (this.panelOpen() || this.info || overlay || ghosts.length) {
      if (overlay) { c.fillStyle = g.dead ? `rgba(40,0,0,${0.55 * aO})` : `rgba(0,0,0,${0.6 * aO})`; c.fillRect(0, 0, W, H); }
      this.enterPS(ui);
      const layer = (a: number, dx: number, fn: () => void) => { if (a <= 0) return; c.save(); c.globalAlpha *= a; c.translate(dx * (1 - a), 0); fn(); c.restore(); };
      const ghost = (fn: () => void) => { const nb = ui.boxes.length, nr = ui.regions.length; fn(); ui.boxes.length = nb; ui.regions.length = nr; };
      for (const [side, gh] of ghosts) {
        const a = 1 - (now - gh.t) / FADE_S;
        layer(a, side === 'left' ? -10 : 10, () => ghost(() => {
          if (gh.kind === 'char') this.drawChar(ui); else if (gh.kind === 'quest') this.drawQuest(ui);
          else if (gh.kind === 'inv') this.drawInv(ui); else if (gh.kind === 'spell') this.drawSpells(ui);
        }));
      }
      if (!overlay) {
        if (this.left === 'char') layer(aL, -10, () => this.drawChar(ui));
        if (this.left === 'quest') layer(aL, -10, () => this.drawQuest(ui));
        if (this.right === 'inv') layer(aR, 10, () => this.drawInv(ui));
        if (this.right === 'spell') layer(aR, 10, () => this.drawSpells(ui));
      }
      if (this.info) { const it = this.info; layer(aI, 0, () => this.drawItemInfo(ui, it)); }
      if (g.dialog) layer(aO, 0, () => this.drawStore(ui));
      if (this.menu !== 'none') layer(aO, 0, () => this.drawMenu(ui));
      if (g.dead) layer(aO, 0, () => this.drawDeath(ui));
      c.restore();
    }
    const held = this.drag?.item ?? this.carry;
    if (held) { // U8: the item rides on the finger (css px)
      const ps = this.ps().ps, pos = this.drag ?? this.pointer, w = (held.w * 29 - 2) * ps, hh = (held.h * 29 - 2) * ps;
      c.globalAlpha = 0.85; drawIcon(c, held, pos.x - w / 2, pos.y - hh / 2, w, hh); c.globalAlpha = 1;
    }
  }
  closeBtn(ui: UI, x: number, y: number, fn: () => void) {
    closeButton(ui.c, x, y, ui.pressed(x - 6, y - 4, 40, 40));
    ui.areaMin(x - 6, y - 4, 40, 40, fn);
  }

  // ---------- Immortal-style controls (css px) ----------
  drawControls(ui: UI) {
    const g = this.g(), c = ui.c, h = g.hero, d = g.d, { W, H, inset } = this.lay;
    const L = inset.l + 10, Tp = inset.t + 8, R = W - inset.r - 10;
    // --- status (UI sample): stone/iron plate, gold level medallion, glassy life/mana globes, Cinzel numbers, slim XP bar ---
    const now = performance.now() / 1000;
    const bw = Math.min(190, W * 0.24);
    ironFrame(c, L - 4, Tp - 4, bw + 52, 52, { r: 8 });
    const lr = socket(c, L + 18, Tp + 22, 17, { rim: 'gold', tint: '#3a1a10' });
    void lr; hudText(c, `${h.clvl}`, L + 18, Tp + 23, { align: 'center', size: 15, color: '#f0c850' });
    const OR = 19, lf = h.hp / Math.max(1, d.maxHp), mf = d.maxMana ? h.mana / d.maxMana : 0;
    glassOrb(c, L + 61, Tp + 22, OR, lf, g.manaShield ? 'shield' : 'life', now);
    glassOrb(c, L + 107, Tp + 22, OR, mf, 'mana', now + 1.7);
    const tx = L + 40 + 44 * 2 + 10, tw = Math.max(30, L + bw + 40 - tx);
    hudText(c, `${Math.ceil(h.hp)}/${d.maxHp}`, tx, Tp + 9, { size: 11, color: g.manaShield ? '#d0b0ff' : '#ff8a78' });
    hudText(c, `${Math.floor(h.mana)}/${d.maxMana}`, tx, Tp + 24, { size: 11, color: '#9cb4ff' });
    const lo = EXP_LEVELS[h.clvl - 1] ?? 0, hi = EXP_LEVELS[h.clvl] ?? lo + 1, xf = h.clvl >= 50 ? 1 : (h.exp - lo) / (hi - lo);
    xpBar(c, tx, Tp + 37, tw, xf);
    ui.area(L - 4, Tp - 4, bw + 52, 52, () => { this.left = this.left === 'char' ? 'none' : 'char'; });
    if (h.statPts) { socket(c, L + 32, Tp + 6, 7, { rim: 'gold', tint: '#c89a30' }); hudText(c, '+', L + 32, Tp + 6.5, { align: 'center', size: 11, color: '#fff4d0' }); }
    // --- minimap (top-right, tap = full automap) + icon buttons ---
    const mw = 132, mh = 88, mx = R - mw, my = Tp - 4;
    this.drawMinimap(ui, mx, my, mw, mh);
    c.save(); c.strokeStyle = '#3a3630'; c.lineWidth = 3; c.beginPath(); c.roundRect(mx - 1, my - 1, mw + 2, mh + 2, 4); c.stroke(); c.strokeStyle = 'rgba(200,160,80,0.6)'; c.lineWidth = 1; c.beginPath(); c.roundRect(mx + 1.5, my + 1.5, mw - 3, mh - 3, 3); c.stroke(); c.restore();
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
      ironFrame(c, x, y, isz, isz, { r: 7, rivets: false });
      if (on || this.isDown(x - 3, y - 3, isz + 6, isz + 6)) { c.save(); c.shadowColor = 'rgba(255,170,70,0.9)'; c.shadowBlur = 10; c.strokeStyle = 'rgba(240,190,90,0.9)'; c.lineWidth = 1.5; c.beginPath(); c.roundRect(x + 2, y + 2, isz - 4, isz - 4, 5); c.stroke(); c.restore(); }
      drawGlyph(c, k, x + isz / 2, y + isz / 2);
      ui.area(x - 3, y - 3, isz + 6, isz + 6, fn);
    });
    // --- message line ---
    if (g.msgT > 0) {
      c.font = `600 13px ${HUD_FONT}`; let tw = c.measureText(g.msg).width + 34;
      if (g.msgSub) { c.font = `12px ${BODY_FONT}`; tw = Math.max(tw, c.measureText(g.msgSub).width + 34); }
      tw = Math.ceil(tw / 8) * 8; // fewer distinct plate sizes for the bitmap cache
      ironFrame(c, W / 2 - tw / 2, Tp + 62, tw, g.msgSub ? 44 : 26, { r: 8, rivets: false });
      hudText(c, g.msg, W / 2, Tp + 75.5, { align: 'center', size: 12.5, color: '#f0dca8', weight: 600 });
      if (g.msgSub) { c.font = `12px ${BODY_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#a8c8ff'; c.fillText(g.msgSub, W / 2, Tp + 93); } // U7: the plain-English effect
    } else if (g.pendingPick) ui.text(`Tap an item to ${g.pendingPick}`, W / 2, Tp + 76, { align: 'center', size: 13, color: '#e8d8a8' });
    // --- joystick (UI sample): translucent rune ring + gripped thumb ---
    const j = this.joy;
    const jo = j ?? { ox: L + 86, oy: H - inset.b - 90, tx: L + 86, ty: H - inset.b - 90 };
    const k = knob(jo.ox, jo.oy, jo.tx, jo.ty);
    runeJoystick(c, jo.ox, jo.oy, JOY_RADIUS, k.x, k.y, !!j, now);
    // --- action cluster (bottom-right): metal-rimmed sockets, inner bevel, pressed = scale + glow, cooldown sweep ---
    if (this.right !== 'none') return; // the right panel covers it
    const A = actionLayout(W, H, inset);
    const busy = g.p.state === 'attack' || g.p.state === 'cast' ? Math.max(0, g.p.t / Math.max(0.01, g.actTotal)) : 0;
    const down = (x: number, y: number, r: number) => this.isDown(x - r - 4, y - r - 4, r * 2 + 8, r * 2 + 8);
    // ATTACK
    const a = A.atk;
    socket(c, a.x, a.y, a.r, { rim: 'gold', tint: '#5a1610', pressed: this.attackDown, glow: 'rgba(255,90,40,0.95)' });
    const as = this.attackDown ? 0.94 : 1;
    drawGlyph(c, d.bow ? 'bow' : 'sword', a.x, a.y - 4 * as, 1.6 * as);
    hudText(c, 'ATTACK', a.x, a.y + 24 * as, { align: 'center', size: 9.5, color: '#f0dca8' });
    ui.press(a.x - a.r - 6, a.y - a.r - 6, a.r * 2 + 12, a.r * 2 + 12, () => { this.attackDown = true; g.attackHeld = true; }, () => { this.attackDown = false; g.attackHeld = false; });
    // class skill
    const sk = A.skill, skl = { warrior: 'Repair', rogue: 'Disarm', sorcerer: 'Recharge' }[h.cls];
    const skd = down(sk.x, sk.y, sk.r), skr = socket(c, sk.x, sk.y, sk.r, { tint: '#3a2e1c', pressed: skd });
    drawGlyph(c, h.cls === 'warrior' ? 'hammer' : h.cls === 'rogue' ? 'trap' : 'staff', sk.x, sk.y - 3);
    hudText(c, skl, sk.x, sk.y + 14, { align: 'center', size: 7, color: '#e0d0a0' });
    ui.area(sk.x - sk.r - 4, sk.y - sk.r - 4, sk.r * 2 + 8, sk.r * 2 + 8, () => { g.classSkill(); });
    // spell slots
    h.slots.slice(0, SLOT_COUNT).forEach((id, i) => {
      const s = A.slots[i], sd = down(s.x, s.y, s.r);
      if (!id) { socket(c, s.x, s.y, s.r, { tint: '#1a1816', dim: true, pressed: sd }); hudText(c, '+', s.x, s.y + 1, { align: 'center', size: 16, color: '#8a7a5a' }); ui.area(s.x - s.r - 4, s.y - s.r - 4, s.r * 2 + 8, s.r * 2 + 8, () => { this.right = 'spell'; }); return; }
      const src = g.spellSource(id), sp = SPELLS[src?.spell ?? id.replace(/^(scroll|staff):/, '')];
      const tint = sp?.type === 'fire' ? '#4a200c' : sp?.type === 'lightning' ? '#142a4a' : '#24183e';
      const ri = socket(c, s.x, s.y, s.r, { tint, pressed: sd, glow: sp?.type === 'fire' ? 'rgba(255,130,40,0.95)' : 'rgba(120,170,255,0.95)' });
      drawGlyph(c, `sp_${sp?.type ?? 'magic'}`, s.x, s.y - 4);
      hudText(c, shortName(sp?.name ?? id), s.x, s.y + 12, { align: 'center', size: 7, color: '#eeeaff' });
      if (src?.from === 'spell' && sp) { const cost = spellMana(sp, Math.max(1, h.spells[sp.id] ?? 1)); if (h.mana < cost) sweep(c, s.x, s.y, ri, 1, 'rgba(20,40,160,0.55)'); }
      const badge = (n: number) => { socket(c, s.x + s.r - 4, s.y - s.r + 5, 7, { rim: 'gold', tint: '#2a1e0c' }); hudText(c, `${n}`, s.x + s.r - 4, s.y - s.r + 5.5, { align: 'center', size: 8, color: '#f0c850' }); };
      if (src?.from === 'staff') badge(src.item!.charges);
      if (id.startsWith('scroll:')) badge([...h.belt, ...h.inv.map((e) => e.item)].filter((it) => it && it.misc.startsWith('IMISC_SCROLL') && SPELL_BY_D1[it.spell]?.id === id.slice(7)).length);
      if (!src) sweep(c, s.x, s.y, ri, 1, 'rgba(0,0,0,0.65)');
      sweep(c, s.x, s.y, ri, busy);
      ui.area(s.x - s.r - 4, s.y - s.r - 4, s.r * 2 + 8, s.r * 2 + 8, () => g.castSlot(i), () => { this.right = 'spell'; this.spellSel = id; });
    });
    sweep(c, sk.x, sk.y, skr, busy);
    // potions (from the belt): framed belt sockets
    const pot = (P: { x: number; y: number; r: number }, life: boolean) => {
      const want = life ? ['IMISC_HEAL', 'IMISC_FULLHEAL', 'IMISC_REJUV', 'IMISC_FULLREJUV'] : ['IMISC_MANA', 'IMISC_FULLMANA', 'IMISC_REJUV', 'IMISC_FULLREJUV'];
      const n = h.belt.filter((b) => b && want.includes(b.misc)).length;
      ironFrame(c, P.x - P.r - 2, P.y - P.r - 2, P.r * 2 + 4, P.r * 2 + 4, { r: 9, rivets: false });
      socket(c, P.x, P.y, P.r - 3, { tint: n ? (life ? '#4a0c0c' : '#0c1a4a') : '#1a1a1a', dim: !n, pressed: down(P.x, P.y, P.r), glow: life ? 'rgba(255,70,50,0.9)' : 'rgba(90,130,255,0.9)' });
      drawGlyph(c, life ? 'pot_red' : 'pot_blue', P.x, P.y - 1);
      hudText(c, `${n}`, P.x + P.r - 4, P.y + P.r - 5, { align: 'center', size: 10, color: n ? '#fff4d0' : '#8a8070' });
      ui.area(P.x - P.r - 5, P.y - P.r - 5, P.r * 2 + 10, P.r * 2 + 10, () => this.quickPotion(life));
    };
    pot(A.hpPot, true); pot(A.mpPot, false);
    // contextual INTERACT
    const it = g.interaction();
    if (it) {
      const b = A.interact;
      ironFrame(c, b.x, b.y, b.w, b.h, { r: 18, rivets: false });
      c.save(); c.strokeStyle = 'rgba(240,192,100,0.9)'; c.lineWidth = 1.5; c.beginPath(); c.roundRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6, 15); c.stroke(); c.restore();
      hudText(c, it.label.length > 22 ? it.label.slice(0, 21) + '...' : it.label, b.x + b.w / 2, b.y + b.h / 2 + 1, { align: 'center', size: 11, color: '#fff0c8' });
      ui.area(b.x - 4, b.y - 6, b.w + 8, b.h + 12, () => g.interact());
    }
  }
  /** UI sample: is a finger currently down inside this css-px rect (for the pressed state)? */
  isDown(x: number, y: number, w: number, h: number) { for (const f of this.fingers.values()) if (f.x >= x && f.y >= y && f.x < x + w && f.y < y + h) return true; return false; }
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

  // ---------- char sheet (panel space, left): Order 16 skin; stat [+] buttons are 40x40 (>= 44 css) ----------
  /** Skinned panel with a title; always blocks taps underneath. */
  artPanel(ui: UI, title: string, x: number) { skinPanel(ui.c, x, 0, 320, PS_H, title); ui.block(x, 0, 320, PS_H); }
  drawChar(ui: UI) {
    const g = this.g(), h = g.hero, d = derive(h), c = ui.c;
    this.artPanel(ui, 'Character', 0);
    this.closeBtn(ui, 284, 5, () => { this.left = 'none'; });
    const label = (s: string, x: number, y: number) => ui.text(s.toUpperCase(), x, y, { size: 9.5, color: '#b89c6a', head: true });
    const box = (s: string, x: number, y: number, w: number, o: { color?: string; size?: number } = {}) => { well(c, x, y, w, 20); ui.text(s, x + w / 2, y + 10.5, { align: 'center', size: o.size ?? 12, color: o.color ?? '#efe0b8' }); };
    label('Name', 18, 50); box(h.name, 70, 40, 140);
    label('Level', 222, 50); box(`${h.clvl}`, 264, 40, 40, { color: '#f0c850' });
    label('Class', 18, 76); box(CLASSES[h.cls].name, 70, 66, 140);
    divider(c, 16, 96, 288);
    const rows: ['str' | 'mag' | 'dex' | 'vit', string, number][] = [['str', 'Strength', d.str], ['mag', 'Magic', d.mag], ['dex', 'Dexterity', d.dex], ['vit', 'Vitality', d.vit]];
    rows.forEach(([k, name, v], i) => {
      const y = 104 + i * 42, cy = y + 20;
      label(name, 18, cy);
      box(`${v}`, 98, cy - 10, 46, { color: v > h.base[k] ? '#8aa8ff' : v < h.base[k] ? '#e05040' : '#efe0b8' });
      const can = h.statPts > 0 && h.base[k] < CLASSES[h.cls].max[k];
      // level-up [+]: a gold socket, 40x40 hit (>= 44 css px)
      const pr = can && ui.pressed(150, y, 40, 40);
      socket(c, 170, cy, 15, can ? { rim: 'gold', tint: '#6a4a14', pressed: pr, glow: 'rgba(255,200,90,0.95)' } : { tint: '#1a1714', dim: true });
      hudText(c, '+', 170, cy + 0.5, { align: 'center', size: 15, color: can ? '#fff0c0' : '#5a5246' });
      if (can) ui.area(150, y, 40, 40, () => { spendStat(h, k); g.refresh(); });
    });
    if (h.statPts) hudText(c, `${h.statPts} point${h.statPts > 1 ? 's' : ''} to spend`, 104, 280, { align: 'center', size: 10, color: '#f0c850' });
    // right column: life, mana and the combat lines
    const side: [string, string, string?][] = [
      ['Life', `${Math.ceil(h.hp)} / ${d.maxHp}`, h.hp < d.maxHp ? '#ff8a78' : undefined], ['Mana', `${Math.floor(h.mana)} / ${d.maxMana}`, h.mana < d.maxMana ? '#9cb4ff' : undefined],
      ['Armor', `${d.ac}`], ['To hit', `${50 + Math.floor(d.dex / 2) + d.toHit + h.clvl + (h.cls === 'warrior' ? 20 : 0)}%`],
      ['Damage', `${d.minDam + d.charDamMod + d.damMod}-${Math.trunc(d.maxDam * (100 + d.pctDam) / 100) + d.charDamMod + d.damMod}`],
      ['Resist magic', `${d.mr}%`], ['Resist fire', `${d.fr}%`], ['Resist lightning', `${d.lr}%`],
    ];
    well(c, 204, 104, 102, 164);
    side.forEach(([a, b, col], i) => { const y = 116 + i * 19.5 + (i >= 2 ? 3 : 0) + (i >= 5 ? 3 : 0); ui.text(a, 210, y, { size: 10, color: '#a89870' }); ui.text(b, 300, y, { size: 11, align: 'right', color: col ?? '#efe0b8' }); });
    divider(c, 16, 292, 288);
    label('Experience', 18, 310); box(`${h.exp}`, 112, 300, 88);
    label('Next', 210, 310); box(h.clvl >= 50 ? 'None' : `${EXP_LEVELS[h.clvl]}`, 240, 300, 64);
    label('Gold', 18, 334); box(`${h.gold}`, 112, 324, 88, { color: '#f0c850' });
  }
  drawQuest(ui: UI) {
    const g = this.g();
    ui.panel(0, 0, 320, PS_H, 'Quest Log');
    this.closeBtn(ui, 284, 5, () => { this.left = 'none'; });
    const q = g.quests.butcher, sc = this.sc('quest'), c = ui.c, top = 44, vh = PS_H - top - 14;
    well(c, 12, top - 4, 296, vh + 6);
    c.save(); c.beginPath(); c.rect(14, top, 292, vh); c.clip();
    ui.beginScroll(14, top, 292, vh, 'quest'); // U4: finger-drag scrolling
    let end = 0;
    if (q === 'inactive') { ui.text('No active quests', 160, 70 - sc.pos, { align: 'center', size: 13, color: '#9a8a62' }); end = 90; }
    else {
      const done = q === 'done';
      c.fillStyle = done ? '#5a5248' : '#b02818'; c.beginPath(); c.arc(28, 70 - sc.pos, 4, 0, Math.PI * 2); c.fill();
      ui.text('The Butcher', 40, 70 - sc.pos, { size: 14, color: done ? '#8a8070' : '#f0c850', head: true });
      divider(c, 24, 84 - sc.pos, 272);
      end = ui.wrap(done ? 'The Butcher is dead. The cathedral is a little quieter.' : NPC_TEXT.wounded.butcher, 26, 102 - sc.pos, 268, 17, { size: 13, color: '#e0d0a8' }) + sc.pos;
    }
    ui.area(14, top, 292, vh);
    ui.endScroll(); c.restore();
    sc.setMax(end - (top + vh));
  }

  // ---------- inventory (panel space, right): the CC0 frame's D1 slot boxes, 28 px cells on a 29 px pitch ----------
  static SLOT_RECT: Record<BodySlot, [number, number, number, number]> = {
    handL: [72, 80, 27, 83], head: [130, 40, 55, 55], amulet: [196, 48, 27, 27], chest: [130, 100, 55, 83], handR: [196, 100, 55, 83], ringL: [72, 170, 27, 27], ringR: [226, 170, 27, 27],
  };
  static GRID = { x: 20, y: 220, pitch: 29, cell: 27 };
  /** Order 16: the belt (while the inventory is open) on a 40-unit pitch (>= 44 css px), reaching into the left margin. */
  static BELT = { x: -12, y: 286, pitch: 40 };
  /** Order 16: finger hit rects for the small paperdoll slots, grown away from their neighbours (>= 40 units = 44 css px). */
  static SLOT_HIT: Partial<Record<BodySlot, [number, number, number, number]>> = { amulet: [196, 35, 40, 40], ringL: [59, 170, 40, 40], ringR: [226, 170, 40, 40], handL: [59, 80, 40, 83] };
  drawInv(ui: UI) {
    const g = this.g(), h = g.hero, c = ui.c, X = 320, dh = derive(h);
    this.artPanel(ui, 'Inventory', X);
    const SL: Record<BodySlot, string> = { head: 'Head', amulet: 'Amulet', handL: 'Weapon', chest: 'Armor', handR: 'Shield', ringL: 'Ring', ringR: 'Ring' };
    this.closeBtn(ui, X + 284, 5, () => { this.right = 'none'; this.sel = null; g.pendingPick = ''; });
    for (const s of BODY_SLOTS) {
      const [x, y, w, hh] = Hud.SLOT_RECT[s];
      const it = h.body[s];
      itemSlot(c, X + x, y, w, hh, it ?? null, { sel: !!it && this.sel === it, bad: !!it && !reqOk(h, it, dh) });
      if (it) drawIcon(c, it, X + x + 2, y + 2, w - 4, hh - 4);
      else ui.text(SL[s].toUpperCase(), X + x + w / 2, y + hh / 2, { align: 'center', size: w < 40 ? 6.5 : 8, color: '#5e5242', head: true });
      const hr = Hud.SLOT_HIT[s] ?? [x - 2, y - 2, w + 4, hh + 4];
      ui.area(X + hr[0], hr[1], hr[2], hr[3], () => { if (this.carry) this.placeCarry({ kind: 'body', slot: s }); else if (it) this.tapItem(it); }, it ? () => this.beginDrag(it) : undefined);
    }
    const G = Hud.GRID, gx = X + G.x, gy = G.y;
    // empty cells (cached wells): a tap puts the cursor item there (U8)
    ui.text('BACKPACK', gx, gy - 9, { size: 9, color: '#b89c6a', head: true });
    for (let cy = 0; cy < INV_H; cy++) for (let cx = 0; cx < INV_W; cx++) {
      cached(c, 'cell', gx + cx * G.pitch, gy + cy * G.pitch, G.cell, G.cell, 2, (q) => well(q, 0, 0, G.cell, G.cell));
      ui.area(gx + cx * G.pitch, gy + cy * G.pitch, G.pitch, G.pitch, () => { const it = this.carry; if (it) this.placeCarry({ kind: 'inv', x: Math.min(cx, INV_W - it.w), y: Math.min(cy, INV_H - it.h) }); });
    }
    for (const e of h.inv) {
      const x = gx + e.x * G.pitch, y = gy + e.y * G.pitch, w = (e.item.w - 1) * G.pitch + G.cell, hh = (e.item.h - 1) * G.pitch + G.cell;
      itemSlot(c, x, y, w, hh, e.item, { sel: this.sel === e.item, bad: !reqOk(h, e.item, dh) });
      drawIcon(c, e.item, x + 1, y + 1, w - 2, hh - 2);
      ui.area(x - 1, y - 1, w + 2, hh + 2, () => { if (this.carry) this.placeCarry({ kind: 'inv', x: e.x, y: e.y }); else this.tapItem(e.item); }, () => this.beginDrag(e.item));
    }
    ui.text('GOLD', X + 39, 172, { align: 'center', size: 9, color: '#b89c6a', head: true }); well(c, X + 12, 181, 54, 18); ui.text(`${h.gold}`, X + 39, 190.5, { align: 'center', size: 11, color: '#f0c850' });
    ui.text(this.carry ? 'Tap a slot to place it - outside the panel drops it' : 'Tap: details   Hold: move', X + 300, 211, { align: 'right', size: 10, color: '#9a8a62' });
    // the belt (8 slots, CC0 belt-slot frame) sits in the left half while the inventory is open
    if (this.left === 'none') {
      const { x: bx, y: by, pitch: bc } = Hud.BELT;
      ui.panel(bx - 8, by - 26, 8 * bc + 16, bc + 36);
      ui.text('BELT', bx + 2, by - 11, { size: 10, color: '#d8b058', head: true });
      for (let i = 0; i < 8; i++) {
        const it = h.belt[i], x = bx + i * bc;
        itemSlot(c, x, by, bc - 2, bc - 2, it ?? null, { sel: !!it && this.sel === it });
        ui.text(`${i + 1}`, x + 5, by + 6, { size: 8, color: '#8a7a52', head: true });
        if (it) drawIcon(c, it, x + 3, by + 3, bc - 8, bc - 8);
        ui.area(x - 1, by - 1, bc, bc, () => { if (this.carry) this.placeCarry({ kind: 'belt', i }); else if (it) this.tapItem(it); }, it ? () => this.beginDrag(it) : undefined);
      }
    }
  }
  /** U9: a tap opens the item's detail card at once (with U6's comparison when it fits an occupied slot). */
  tapItem(it: Item) {
    const g = this.g();
    if (g.pendingPick) { g.pickItem(it); return; }
    if (this.carry) { this.placeCarry(locate(g.hero, it)); return; }
    this.sel = it; this.info = it;
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
  /** One item card (panel space); returns its height. `cmp` rows are drawn under the stats, green = better, red = worse. */
  private card(ui: UI, it: Item, x: number, y: number, w: number, title: string | null, cmp: ReturnType<typeof compareItems> | null, btnRows: number) {
    const g = this.g(), h = g.hero;
    const lines = itemLines(it, h.clvl);
    const top = title ? 22 : 0;
    const hh = top + 44 + lines.length * 14 + (cmp && cmp.length ? 24 + cmp.length * 13 : 0) + btnRows * 46 + 6;
    ui.panel(x, y, w, hh);
    const c = ui.c, col = rarityColor(it) ?? '#e0e0e0';
    if (title) titleBar(c, x + 10, y + 6, w - 20, title, 10);
    // name plate in the item's D1 rarity colour, with a matching rule under it
    ui.text(it.identified || !it.magical ? it.iname : it.name, x + w / 2 - 10, y + top + 20, { align: 'center', size: 13, color: itemColor(it), head: true });
    c.fillStyle = col; c.globalAlpha *= 0.6; c.fillRect(x + 30, y + top + 31, w - 60, 1); c.globalAlpha /= 0.6;
    lines.forEach(([t, lc], i) => ui.text(t, x + w / 2, y + top + 42 + i * 14, { align: 'center', size: 12, color: lc }));
    if (cmp && cmp.length) {
      const cy = y + top + 42 + lines.length * 14 + 2;
      divider(c, x + 24, cy - 4, w - 48);
      ui.text('VS EQUIPPED', x + w / 2, cy + 6, { align: 'center', size: 8.5, color: '#b89c6a', head: true });
      cmp.forEach((r, i) => {
        const ry = cy + 20 + i * 13, rc = r.better === null ? '#c8b890' : r.better ? '#60e060' : '#ff6050';
        ui.text(`${r.label}: ${r.now}  (${r.cur})`, x + w / 2, ry, { align: 'center', size: 11, color: rc });
        if (r.better !== null) { c.font = `11px ${BODY_FONT}`; const tw = c.measureText(`${r.label}: ${r.now}  (${r.cur})`).width; arrow(c, x + w / 2 - tw / 2 - 9, ry, !!r.better, rc); }
      });
    }
    return hh;
  }
  drawItemInfo(ui: UI, it: Item) {
    const g = this.g(), h = g.hero;
    ui.block(-1000, -1000, 4000, 4000);
    const worn = BODY_SLOTS.some((s) => h.body[s] === it);
    const inPack = h.inv.some((e) => e.item === it);
    const inBelt = h.belt.includes(it);
    const done = () => { g.refresh(); this.info = null; this.sel = null; };
    const btns: [string, () => void][] = [];
    if (worn) btns.push(['Unequip', () => { const e = unequip(h, it); if (e) g.say(e); done(); }]);
    else if (it.loc !== 'ILOC_UNEQUIPABLE' && it.loc !== 'ILOC_BELT' && (inPack || inBelt)) btns.push(['Equip', () => { const e = equip(h, it); if (e) g.say(e); done(); }]);
    if (usable(it) && (inPack || inBelt)) btns.push(['Use', () => { g.useItem(it); done(); }]);
    if ((inPack || inBelt) && it.misc.startsWith('IMISC_SCROLL') && SPELL_BY_D1[it.spell] && SPELLS[SPELL_BY_D1[it.spell].id]?.targeted !== undefined) {
      const id = `scroll:${SPELL_BY_D1[it.spell].id}`;
      btns.push(['To slot', () => { const free = h.slots.indexOf(null); h.slots = assignSlot(h.slots, free >= 0 ? free : SLOT_COUNT - 1, id); g.say(`Scroll assigned to slot ${(free >= 0 ? free : SLOT_COUNT - 1) + 1}`); done(); }]);
    }
    if (inPack && isBeltable(it) && h.belt.includes(null)) btns.push(['To belt', () => { removeItem(h, it); h.belt[h.belt.indexOf(null)] = it; done(); }]);
    if (inBelt) btns.push(['To pack', () => { removeItem(h, it); if (!pickUpPack(h, it)) { h.belt[h.belt.indexOf(null)] = it; g.say('No room'); } done(); }]);
    if (g.dialog && this.store === 'sell') { const e = this.storeList().find((q) => q.item === it); if (e) btns.push([`Sell ${e.price}`, () => { this.storeDo(it, e.price); done(); }]); }
    if (!g.dialog && (worn || inPack || inBelt)) btns.push(['Drop', () => { removeItem(h, it); g.drop(it, g.p.tx, g.p.ty); done(); }]);
    const cur = compareTarget(h, it);
    const rows = Math.ceil(btns.length / 4);
    let bx: number, by: number, bw: number;
    if (cur) { // U6: the equipped item's card next to this one
      const cw = 300, lh = this.card(ui, cur, 12, 16, cw, 'Equipped', null, 0);
      const rh = this.card(ui, it, 328, 16, cw, null, compareItems(it, cur), rows);
      void lh;
      this.closeBtn(ui, 328 + cw - 34, 20, () => { this.info = null; });
      bx = 338; by = 16 + rh - rows * 46 - 2; bw = cw - 20;
    } else {
      const cw = 360, hh = this.card(ui, it, 140, 30, cw, null, null, rows);
      this.closeBtn(ui, 140 + cw - 34, 34, () => { this.info = null; });
      bx = 150; by = 30 + hh - rows * 46 - 2; bw = cw - 20;
    }
    const per = Math.min(4, btns.length), w1 = Math.min(84, bw / Math.max(1, per) - 6);
    btns.forEach(([l, f], i) => ui.button(l, bx + (i % 4) * (w1 + 6), by + Math.floor(i / 4) * 46, w1, 40, f, { size: 11, danger: l === 'Drop' }));
  }

  // ---------- spellbook (panel space, right): CC0 two-page frame; left page = learned spells, right = staff + scrolls ----------
  spellPage = 0;
  static SPELL_BOX: [number, number][] = [[28, 70], [90, 70], [28, 140], [90, 140]];
  drawSpells(ui: UI) {
    const g = this.g(), h = g.hero, X = 320, c = ui.c;
    this.artPanel(ui, 'Spellbook', X);
    well(c, X + 14, 40, 142, 192); well(c, X + 164, 40, 142, 192);
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
      ui.text(title.toUpperCase(), X + px + 57, 53, { align: 'center', size: 9.5, color: '#d8b058', head: true }); divider(c, X + px - 8, 62, 130);
      list.slice(this.spellPage * 4, this.spellPage * 4 + 4).forEach((e, i) => {
        const [bx, by] = Hud.SPELL_BOX[i], x = X + px + bx - 28, y = by, slot = h.slots.indexOf(e.id);
        const on = this.spellSel === e.id;
        well(c, x, y, 55, 55, { border: on ? '#f4d690' : slot >= 0 ? '#6a8aff' : 'rgba(150,120,70,0.6)', glow: on ? 'rgba(244,214,144,0.8)' : undefined, fill: on ? '#1e1608' : undefined });
        drawGlyph(c, e.glyph, x + 27, y + 19, 1.2);
        ui.text(shortName(e.name), x + 27, y + 38, { align: 'center', size: 10, color: '#efe0b8' });
        ui.text(e.sub, x + 27, y + 49, { align: 'center', size: 8, color: '#9a8a62' });
        if (slot >= 0) { socket(c, x + 49, y + 7, 6.5, { rim: 'gold', tint: '#14244a' }); hudText(c, `${slot + 1}`, x + 49, y + 7.5, { align: 'center', size: 8, color: '#cfe0ff' }); }
        ui.area(x - 3, y - 3, 61, 61, () => {
          if (this.spellSel === e.id && slot < 0) { const free = h.slots.indexOf(null); if (free >= 0) h.slots = assignSlot(h.slots, free, e.id); }
          this.spellSel = e.id;
        });
      });
    };
    ui.beginScroll(X + 10, 40, 300, 190, 'spell'); // U4: swipe the pages with a finger
    page(learned, 28, 'Spells'); page(carried, 176, 'Staff & scrolls');
    ui.endScroll();
    if (!learned.length && !carried.length) ui.wrap('No spells yet. Read books, or carry scrolls or a staff.', X + 24, 214, 120, 13, { size: 10, color: '#9a8a62' });
    // slot row (Order 4 assignment flow) in the pages' empty lower half
    const sel = this.spellSel ? [...learned, ...carried].find((e) => e.id === this.spellSel) : null;
    ui.text(sel ? `Assign ${skillLabel(g, sel.id)} to:` : 'Tap a spell, then a slot', X + 160, 241, { align: 'center', size: 11, color: '#d8b860' });
    for (let i = 0; i < SLOT_COUNT; i++) {
      const id = h.slots[i], x = X + [24, 86, 172, 234][i];
      ui.button(id ? shortName(skillLabel(g, id)) : `Slot ${i + 1}`, x, 250, 60, 40, () => {
        if (this.spellSel) { h.slots = assignSlot(h.slots, i, this.spellSel); this.spellSel = null; }
        else if (id) h.slots = assignSlot(h.slots, i, null);
      }, { size: 10, on: !!id });
    }
    divider(c, X + 20, 304, 280);
    hudText(c, `PAGE ${this.spellPage + 1} / ${pages}`, X + 160, 324, { align: 'center', size: 10.5, color: '#d8b058' });
    if (pages > 1) { arrow(c, X + 220, 324, false); c.save(); c.translate(X + 100, 324); c.rotate(Math.PI); arrow(c, 0, 0, false); c.restore(); ui.areaMin(X + 56, 310, 208, 34, () => { this.spellPage = (this.spellPage + 1) % pages; }); }
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
    const g = this.g(), dlg = g.dialog!, n = dlg.npc, h = g.hero, tx = NPC_TEXT[n.id], c = ui.c;
    const x = 60, y = 16, w = 520, hh = 330;
    ui.panel(x, y, w, hh, n.name);
    const close = () => { g.dialog = null; this.store = 'menu'; this.pick = null; this.scroll = 0; this.sc('store').pos = 0; };
    const back = () => { this.store = 'menu'; this.pick = null; this.scroll = 0; this.sc('store').pos = 0; };
    this.closeBtn(ui, x + w - 36, y + 6, close);
    const goldPlate = (gx: number, gy: number) => { ui.text('GOLD', gx, gy, { size: 9, color: '#b89c6a', head: true }); well(c, gx + 34, gy - 9, 80, 18); ui.text(`${h.gold}`, gx + 74, gy + 0.5, { align: 'center', size: 12, color: '#f0c850' }); };
    if (this.store === 'menu' || this.store === 'talk') {
      // dialogue: the NPC's words on a dark inset, then the D1 menu as finger-sized iron buttons (2 columns, 40 tall = 44+ css)
      well(c, x + 20, y + 40, w - 40, 86);
      const ty = ui.wrap(this.store === 'talk' ? dlg.text : tx.greet, x + 34, y + 56, w - 68, 17, { align: 'center', size: 13, color: '#e8d8b0' });
      const by0 = Math.max(ty + 12, y + 140), bw = 228, bh = 40;
      tx.menu.forEach((label, i) => {
        const last = i === tx.menu.length - 1, col = last ? 1 : i % 2, row = last ? Math.ceil((tx.menu.length - 1) / 2) : Math.floor(i / 2);
        ui.button(label, x + 24 + col * (bw + 16), by0 + row * 46, bw, bh, () => this.storeAction(n.id, i, tx.menu.length, close), { size: 12, danger: last });
      });
      goldPlate(x + 24, y + hh - 18);
      return;
    }
    const list = this.storeList();
    const per = 5, RH = 40, top = y + 58, vh = per * RH; // rows 40 tall: >= 44 css px
    const sc = this.sc('store'); sc.setMax(list.length * RH - vh);
    hudText(c, storeTitle(this.store), x + w / 2, y + 44, { align: 'center', size: 12, color: '#f0dca8', weight: 600 });
    well(c, x + 12, top - 2, w - 24, vh + 4);
    if (!list.length) ui.text('You have nothing for this.', x + w / 2, y + 120, { align: 'center', size: 13 });
    // U4: the list scrolls with a finger drag (momentum; a drag never buys), the arrows still page it
    c.save(); c.beginPath(); c.rect(x + 14, top, w - 28, vh); c.clip();
    ui.beginScroll(x + 14, top, w - 28, vh, 'store');
    const first = Math.max(0, Math.floor(sc.pos / RH)), last = Math.min(list.length, Math.ceil((sc.pos + vh) / RH));
    for (let i = first; i < last; i++) {
      const e = list[i], yy = top + i * RH - sc.pos;
      const ok = this.store === 'buy' || this.store === 'premium' || this.store === 'wirt' ? reqOk(h, e.item, derive(h)) : true;
      const on = this.pick === e.item;
      itemSlot(c, x + 18, yy + 3, 34, 34, e.item, { sel: on, bad: !ok }); drawIcon(c, e.item, x + 20, yy + 5, 30, 30);
      if (on) { c.fillStyle = 'rgba(216,176,88,0.12)'; c.fillRect(x + 56, yy + 2, w - 96, RH - 4); c.strokeStyle = 'rgba(244,214,144,0.7)'; c.lineWidth = 1; c.strokeRect(x + 56.5, yy + 2.5, w - 97, RH - 5); }
      c.fillStyle = 'rgba(150,120,70,0.25)'; c.fillRect(x + 56, yy + RH - 1, w - 96, 1);
      const y0 = Math.max(top, yy), y1 = Math.min(top + vh, yy + RH);
      if (y1 > y0) ui.area(x + 14, y0, w - 50, y1 - y0, () => { this.pick = e.item; });
      ui.text(e.item.identified || !e.item.magical ? e.item.iname : e.item.name, x + 64, yy + 14, { size: 12, color: ok ? itemColor(e.item) : '#e05040', head: true });
      ui.text(itemLines(e.item, h.clvl).slice(0, 2).map((l) => l[0]).join('   '), x + 64, yy + 29, { size: 10.5, color: '#a89870' });
      hudText(c, `${e.price}`, x + w - 48, yy + 20, { size: 12, align: 'right', color: '#f0c850' });
    }
    ui.endScroll();
    c.restore();
    if (list.length > per) {
      const ax = x + w - 30;
      const pu = ui.pressed(ax - 14, top, 28, 28), pd = ui.pressed(ax - 14, top + vh - 28, 28, 28);
      socket(c, ax, top + 15, 13, { pressed: pu }); arrow(c, ax, top + 15, true);
      socket(c, ax, top + vh - 15, 13, { pressed: pd }); arrow(c, ax, top + vh - 15, false);
      ui.areaMin(ax - 14, top + 1, 28, 28, () => { sc.vel = 0; sc.pos = Math.max(0, sc.pos - vh); });
      ui.areaMin(ax - 14, top + vh - 29, 28, 28, () => { sc.vel = 0; sc.pos = Math.min(sc.max, sc.pos + vh); });
      // scroll bar (gold thumb in an iron groove)
      const gy0 = top + 32, gh = vh - 64, bh = Math.max(16, gh * vh / (list.length * RH)), byy = gy0 + (gh - bh) * (sc.max ? sc.pos / sc.max : 0);
      well(c, ax - 3, gy0, 6, gh); c.fillStyle = '#c89a48'; c.fillRect(ax - 2, byy, 4, bh);
    }
    const by = y + hh - 52;
    const sel = list.find((e) => e.item === this.pick);
    ui.button(verb(this.store), x + 16, by, 120, 40, () => { if (sel) this.storeDo(sel.item, sel.price); }, { disabled: !sel, on: !!sel });
    if (this.pick) ui.button('Info', x + 144, by, 84, 40, () => { this.info = this.pick; });
    ui.button('Back', x + w - 116, by, 100, 40, back);
    goldPlate(x + w / 2 - 40, by + 20);
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
    if (id === 'pepin' && i === 1) { g.pepinHeal(); dlg.text = 'There. You are healed.'; this.store = 'talk'; return; }
    if (id === 'wirt' && mode === 'wirt') {
      if (!g.stores.boy) { dlg.text = 'I have nothing for you right now. Come back later.'; this.store = 'talk'; return; }
      if (g.hero.gold < 50) { dlg.text = 'Looking costs fifty gold. Come back when you have it.'; this.store = 'talk'; return; }
      g.hero.gold -= 50;
    }
    if (mode) { this.store = mode; this.scroll = 0; this.sc('store').pos = 0; this.pick = null; }
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
        const where = pickUp(h, copy); // U11 belt first for potions/scrolls, U1 auto-equip into an empty slot, else the pack
        if (!where) { g.say('You do not have enough room in inventory'); return; }
        if (where === 'equip') g.say(`Equipped ${copy.identified || !copy.magical ? copy.iname : copy.name}`, 1.5);
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
    const c = ui.c;
    if (this.menu === 'main') {
      ui.panel(190, 34, 260, 310, 'Game Menu');
      const items: [string, () => void][] = [
        ['Save Game', () => { this.hooks.save(); this.menu = 'none'; }], ['Options', () => { this.menu = 'options'; }],
        ['New Game', () => { this.menu = 'none'; this.hooks.newGame(); }], ['Load Game', () => { this.menu = 'none'; this.hooks.load(); }],
        ['Quit Game', () => { this.menu = 'none'; this.hooks.quit(); }], ['Resume', () => { this.menu = 'none'; }],
      ];
      items.forEach(([l, f], i) => ui.button(l, 216, 70 + i * 45, 208, 40, f, { size: 14, on: l === 'Resume' }));
    } else {
      const [mv, sv] = this.hooks.vol();
      ui.panel(150, 60, 340, 240, 'Options');
      const row = (label: string, v: number, y: number, set: (n: number) => void) => {
        ui.text(label.toUpperCase(), 176, y, { size: 12, color: '#d8c89a', head: true });
        ui.button('-', 330, y - 20, 40, 40, () => set(Math.max(0, v - 1)), { size: 18 });
        well(c, 376, y - 12, 38, 24); hudText(c, `${v}`, 395, y + 0.5, { align: 'center', size: 14, color: '#f0c850' });
        ui.button('+', 420, y - 20, 40, 40, () => set(Math.min(10, v + 1)), { size: 18 });
        // a slim volume gauge under the row
        xpBar(c, 176, y + 15, 130, v / 10);
      };
      row('Music volume', mv, 128, (n) => this.hooks.setVolumes(n, sv));
      row('Sound volume', sv, 190, (n) => this.hooks.setVolumes(mv, n));
      ui.button('Back', 250, 240, 140, 40, () => { this.menu = 'main'; }, { size: 14 });
    }
  }
  drawDeath(ui: UI) {
    const g = this.g(), c = ui.c;
    ui.block(-1000, -1000, 4000, 4000);
    const vg = c.createRadialGradient(VIEW_W / 2, 176, 40, VIEW_W / 2, 176, 360); vg.addColorStop(0, 'rgba(60,0,0,0)'); vg.addColorStop(1, 'rgba(30,0,0,0.75)');
    c.fillStyle = vg; c.fillRect(-200, -200, VIEW_W + 400, PS_H + 400);
    c.save(); c.shadowColor = 'rgba(255,40,20,0.75)'; c.shadowBlur = 18;
    hudText(c, 'YOU HAVE DIED', VIEW_W / 2, 118, { align: 'center', size: 34, color: '#d02818', weight: 700 }); c.restore();
    divider(c, VIEW_W / 2 - 150, 146, 300);
    ui.button('Restart in town', 200, 170, 240, 40, () => g.restartInTown(), { size: 14, danger: true });
    ui.button('Load Game', 200, 220, 240, 40, () => this.hooks.load(), { size: 14 });
    ui.button('Main Menu', 200, 270, 240, 40, () => this.hooks.quit(), { size: 14 });
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
  if (id && drawFrameBox(c, id, x, y, w, h)) return; // Order 16: the slot well carries the rarity border
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
