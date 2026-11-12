// In-game UI: D1 control panel, char sheet, quest log, inventory, spellbook, automap, item info (tap-and-hold), store dialogs,
// in-game menu with options, death screen. All placeholder-styled after D1's panels.
import { CLASSES, EXP_LEVELS } from './data/classes';
import { SPELLS, SPELL_BY_D1, CASTABLE, spellMana } from './data/spells';
import { NPC_TEXT } from './data/npcs';
import { BASE } from './data/items';
import { PLAY_H, VIEW_W, VIEW_H } from './iso';
import { T } from './levels/types';
import { BODY_SLOTS, INV_W, INV_H, derive, equip, unequip, removeItem, pickUp, spendStat, reqOk, isBeltable, type BodySlot } from './player';
import { itemPrice, sellPrice, boyPrice, repairCost, rechargeCost, IDENTIFY_COST, DUR_INDESTRUCTIBLE, type Item } from './itemgen';
import { itemColor } from './render';
import { drawFrameBox, drawImg, hasImg } from './art';
import type { Game } from './game';
import type { UI } from './ui';

const Y = PLAY_H;
type StoreMode = 'menu' | 'talk' | 'buy' | 'premium' | 'sell' | 'repair' | 'identify' | 'recharge' | 'wirt';
export interface HudHooks { save(): void; load(): void; newGame(): void; quit(): void; setVolumes(m: number, s: number): void; vol(): [number, number] }

export class Hud {
  left: 'none' | 'char' | 'quest' = 'none';
  right: 'none' | 'inv' | 'spell' = 'none';
  map = false; menu: 'none' | 'main' | 'options' = 'none';
  skillArmed = false;
  sel: Item | null = null;
  store: StoreMode = 'menu'; scroll = 0; pick: Item | null = null;
  constructor(private g: () => Game, private hooks: HudHooks) {}

  closeAll() { this.left = 'none'; this.right = 'none'; this.map = false; this.sel = null; }

  draw(ui: UI) {
    const g = this.g();
    if (this.map) this.drawAutomap(ui);
    if (this.left === 'char') this.drawChar(ui);
    if (this.left === 'quest') this.drawQuest(ui);
    if (this.right === 'inv') this.drawInv(ui);
    if (this.right === 'spell') this.drawSpells(ui);
    this.drawPanel(ui);
    if (this.sel) this.drawItemInfo(ui, this.sel);
    if (g.dialog) this.drawStore(ui);
    if (this.menu !== 'none') this.drawMenu(ui);
    if (g.dead) this.drawDeath(ui);
  }

  // ---------- control panel ----------
  drawPanel(ui: UI) {
    // Layout follows the CC0 bottom-panel art (ui/ui.json): orbs at x 64/576, belt at 194+32i, buttons at y 98.
    const g = this.g(), c = ui.c, h = g.hero, d = g.d;
    const art = drawImg(c, 'ui/bottom-panel', 0, Y);
    if (!art) { c.fillStyle = '#2a241c'; c.fillRect(0, Y, VIEW_W, 128); c.strokeStyle = '#8a7a52'; c.lineWidth = 2; c.strokeRect(1, Y + 1, VIEW_W - 2, 126); }
    ui.block(0, Y, VIEW_W, 128);
    orb(c, 64, Y + 64, h.hp / Math.max(1, d.maxHp), '#a01010', 'ui/orb-life');
    orb(c, VIEW_W - 64, Y + 64, d.maxMana ? h.mana / d.maxMana : 0, g.manaShield ? '#3060e0' : '#1830b0', 'ui/orb-mana');
    ui.area(16, Y + 14, 100, 100, () => this.quickPotion(true));
    ui.area(VIEW_W - 116, Y + 14, 100, 100, () => this.quickPotion(false));
    const btn = (label: string, x: number, on: boolean, fn: () => void) => {
      if (art) { ui.area(x, Y + 98, 51, 22, fn); if (on) { c.fillStyle = 'rgba(255,220,140,0.22)'; c.fillRect(x, Y + 98, 51, 22); } }
      else ui.button(label, x, Y + 98, 51, 22, fn, { on, size: 10 });
    };
    btn('CHAR', 175, this.left === 'char', () => { this.left = this.left === 'char' ? 'none' : 'char'; });
    btn('INV', 233, this.right === 'inv', () => { this.right = this.right === 'inv' ? 'none' : 'inv'; });
    btn('SPELLS', 291, this.right === 'spell', () => { this.right = this.right === 'spell' ? 'none' : 'spell'; });
    btn('QUEST', 349, this.left === 'quest', () => { this.left = this.left === 'quest' ? 'none' : 'quest'; });
    btn('MENU', 407, false, () => { this.menu = this.menu === 'none' ? 'main' : 'none'; });
    ui.button('MAP', 464, Y + 98, 40, 22, () => { this.map = !this.map; }, { on: this.map, size: 10 });
    const sk = skillLabel(g, h.skill);
    ui.button(sk, 124, Y + 36, 62, 52, () => this.skillButton(), { on: this.skillArmed, size: 9 });
    // belt
    for (let i = 0; i < 8; i++) {
      const x = 194 + i * 32, y = Y + 36, it = h.belt[i];
      if (!art) { c.fillStyle = '#15120d'; c.fillRect(x, y, 28, 28); c.strokeStyle = '#6a5a3a'; c.strokeRect(x + 0.5, y + 0.5, 27, 27); ui.text(`${i + 1}`, x + 4, y + 6, { size: 8, color: '#9a8a62' }); }
      if (it) drawIcon(c, it, x + 1, y + 1, 26, 26);
      ui.area(x, y, 28, 28, () => { if (it) { if (g.pendingPick) { g.pickItem(it); return; } g.useItem(it); g.refresh(); } }, () => { if (it) this.sel = it; });
    }
    // info line (covers the art's sample text) + status line under the belt
    c.fillStyle = '#100d0a'; c.fillRect(134, Y + 9, 372, 20);
    let line: [string, string];
    if (g.msgT > 0) line = [g.msg, '#e8d8a8'];
    else if (g.pendingPick) line = [`Tap an item to ${g.pendingPick}`, '#e8d8a8'];
    else if (this.skillArmed) line = [`Tap a target to cast ${sk}`, '#9cf'];
    else line = [`Level ${h.clvl}  |  ${g.cur === 'town' ? 'Tristram' : 'Cathedral level 1'}  |  ${h.name}${h.statPts ? `  |  +${h.statPts} points` : ''}`, '#e8d8a8'];
    ui.text(line[0].length > 60 ? line[0].slice(0, 59) + '...' : line[0], 320, Y + 19, { align: 'center', size: 11, color: line[1] });
    ui.text(`Life ${Math.ceil(h.hp)}/${d.maxHp}   Mana ${Math.floor(h.mana)}/${d.maxMana}   Gold ${h.gold}`, 322, Y + 80, { align: 'center', size: 10, color: '#d8c89a' });
  }
  quickPotion(life: boolean) {
    const g = this.g(), h = g.hero;
    const want = life ? ['IMISC_HEAL', 'IMISC_FULLHEAL', 'IMISC_REJUV', 'IMISC_FULLREJUV'] : ['IMISC_MANA', 'IMISC_FULLMANA', 'IMISC_REJUV', 'IMISC_FULLREJUV'];
    const it = h.belt.find((b) => b && want.includes(b.misc));
    if (it) { g.useItem(it); g.refresh(); } else g.say(life ? 'No healing potion in the belt' : 'No mana potion in the belt', 1.5);
  }
  skillButton() {
    const g = this.g(), h = g.hero;
    if (h.skill === 'skill') { g.classSkill(); return; }
    const src = g.spellSource(h.skill);
    const s = src ? SPELLS[src.spell] : null;
    if (s && !s.targeted) { g.castAt(g.p.tx, g.p.ty); return; }
    this.skillArmed = !this.skillArmed;
  }

  // ---------- char sheet ----------
  drawChar(ui: UI) {
    const g = this.g(), h = g.hero, d = derive(h);
    ui.panel(0, 0, 320, PLAY_H);
    ui.text(h.name, 20, 20, { size: 15, bold: true }); ui.text(CLASSES[h.cls].name, 200, 20, { size: 13 });
    ui.text(`Level ${h.clvl}`, 20, 44); ui.text(`Experience ${h.exp}`, 120, 44);
    ui.text(`Next level ${h.clvl >= 50 ? 'None' : EXP_LEVELS[h.clvl]}`, 120, 62);
    const rows: [string, 'str' | 'mag' | 'dex' | 'vit', number][] = [['Strength', 'str', d.str], ['Magic', 'mag', d.mag], ['Dexterity', 'dex', d.dex], ['Vitality', 'vit', d.vit]];
    rows.forEach(([n, k, v], i) => {
      const y = 92 + i * 26;
      ui.text(n, 20, y); ui.text(`${h.base[k]}`, 120, y, { align: 'right' }); ui.text(`${v}`, 170, y, { align: 'right', color: v > h.base[k] ? '#6a8aff' : v < h.base[k] ? '#d04040' : '#d8c89a' });
      if (h.statPts > 0 && h.base[k] < CLASSES[h.cls].max[k]) ui.button('+', 182, y - 10, 22, 20, () => { spendStat(h, k); g.refresh(); });
    });
    if (h.statPts) ui.text(`Points to distribute: ${h.statPts}`, 20, 196, { color: '#e8c040' });
    const r: [string, string][] = [
      ['Gold', `${h.gold}`], ['Armor class', `${d.ac}`], ['To hit', `${50 + Math.floor(d.dex / 2) + d.toHit + h.clvl + (h.cls === 'warrior' ? 20 : 0)}%`],
      ['Damage', `${d.minDam + d.charDamMod + d.damMod}-${Math.trunc(d.maxDam * (100 + d.pctDam) / 100) + d.charDamMod + d.damMod}`],
      ['Life', `${Math.ceil(h.hp)}/${d.maxHp}`], ['Mana', `${Math.floor(h.mana)}/${d.maxMana}`],
      ['Resist magic', `${d.mr}%`], ['Resist fire', `${d.fr}%`], ['Resist lightning', `${d.lr}%`],
    ];
    r.forEach(([a, b], i) => { const col = i < 5 ? 0 : 1; const y = 218 + (i % 5) * 24; ui.text(a, 20 + col * 160, y, { size: 11 }); ui.text(b, 140 + col * 160, y, { size: 11, align: 'right' }); });
  }
  drawQuest(ui: UI) {
    const g = this.g();
    ui.panel(0, 0, 320, PLAY_H);
    ui.text('Quest log', 160, 24, { align: 'center', size: 16, bold: true });
    const q = g.quests.butcher;
    if (q === 'inactive') ui.text('No active quests', 160, 70, { align: 'center' });
    else {
      ui.text('The Butcher', 20, 70, { size: 14, color: q === 'done' ? '#7a7a7a' : '#e8c040' });
      ui.wrap(q === 'done' ? 'The Butcher is dead. The cathedral is a little quieter.' : NPC_TEXT.wounded.butcher, 20, 94, 280, 16);
    }
  }

  // ---------- inventory ----------
  static SLOT_RECT: Record<BodySlot, [number, number, number, number]> = {
    // matches the CC0 inventory panel art (ui/panel-inventory.png)
    head: [130, 40, 56, 56], amulet: [196, 48, 28, 28], chest: [130, 100, 56, 84], handL: [72, 80, 28, 84], handR: [196, 100, 56, 84], ringL: [72, 170, 28, 28], ringR: [226, 170, 28, 28],
  };
  drawInv(ui: UI) {
    const g = this.g(), h = g.hero, c = ui.c, X = 320;
    const art = drawImg(c, 'ui/panel-inventory', X, 0);
    if (art) ui.block(X, 0, 320, PLAY_H); else ui.panel(X, 0, 320, PLAY_H);
    for (const s of BODY_SLOTS) {
      const [x, y, w, hh] = Hud.SLOT_RECT[s];
      if (!art) { c.fillStyle = '#15120d'; c.fillRect(X + x, y, w, hh); c.strokeStyle = '#6a5a3a'; c.strokeRect(X + x + 0.5, y + 0.5, w - 1, hh - 1); }
      const it = h.body[s];
      if (it) { if (!reqOk(h, it, derive(h))) { c.fillStyle = 'rgba(160,0,0,0.35)'; c.fillRect(X + x, y, w, hh); } drawIcon(c, it, X + x + 2, y + 2, w - 4, hh - 4); }
      ui.area(X + x, y, w, hh, () => { if (it) this.tapItem(it); }, () => { if (it) this.sel = it; });
    }
    const gx = X + 20, gy = 220, cs = 28;
    if (!art) for (let yy = 0; yy < INV_H; yy++) for (let xx = 0; xx < INV_W; xx++) { c.fillStyle = '#15120d'; c.fillRect(gx + xx * cs, gy + yy * cs, cs - 1, cs - 1); }
    for (const e of h.inv) {
      const x = gx + e.x * cs, y = gy + e.y * cs, w = e.item.w * cs - 1, hh = e.item.h * cs - 1;
      c.fillStyle = this.sel === e.item ? 'rgba(80,80,140,0.6)' : art ? 'rgba(40,30,20,0.35)' : '#221d15'; c.fillRect(x, y, w, hh);
      if (!reqOk(h, e.item, derive(h))) { c.fillStyle = 'rgba(160,0,0,0.35)'; c.fillRect(x, y, w, hh); }
      drawIcon(c, e.item, x + 1, y + 1, w - 2, hh - 2);
      ui.area(x, y, w, hh, () => this.tapItem(e.item), () => { this.sel = e.item; });
    }
    if (art) ui.text(`${h.gold}`, X + 64, 338, { size: 11, color: '#e8c040' }); else ui.text(`Gold: ${h.gold}`, X + 160, 345, { align: 'center', size: 11, color: '#e8c040' });
  }
  tapItem(it: Item) {
    const g = this.g();
    if (g.pendingPick) { g.pickItem(it); return; }
    this.sel = this.sel === it ? null : it;
  }
  drawItemInfo(ui: UI, it: Item) {
    const g = this.g(), h = g.hero;
    const x = 160, y = 40, w = 320;
    const lines = itemLines(it, h.clvl);
    const hh = 54 + lines.length * 15 + 40;
    ui.panel(x, y, w, hh);
    ui.text(it.identified || !it.magical ? it.iname : it.name, x + w / 2, y + 18, { align: 'center', size: 13, bold: true, color: itemColor(it) });
    lines.forEach(([s, col], i) => ui.text(s, x + w / 2, y + 40 + i * 15, { align: 'center', size: 11, color: col }));
    const by = y + hh - 34;
    const worn = BODY_SLOTS.some((s) => h.body[s] === it);
    const inPack = h.inv.some((e) => e.item === it);
    const inBelt = h.belt.includes(it);
    const btns: [string, () => void][] = [];
    if (worn) btns.push(['Unequip', () => { const e = unequip(h, it); if (e) g.say(e); g.refresh(); this.sel = null; }]);
    else if (it.loc !== 'ILOC_UNEQUIPABLE' && it.loc !== 'ILOC_BELT') btns.push(['Equip', () => { const e = equip(h, it); if (e) g.say(e); g.refresh(); this.sel = null; }]);
    if (it.misc !== 'IMISC_NONE' && it.misc !== 'IMISC_STAFF' && it.misc !== 'IMISC_UNIQUE' && it.loc === 'ILOC_UNEQUIPABLE' || it.misc === 'IMISC_BOOK') btns.push(['Use', () => { g.useItem(it); g.refresh(); this.sel = null; }]);
    if (inPack && isBeltable(it) && h.belt.includes(null)) btns.push(['To belt', () => { removeItem(h, it); h.belt[h.belt.indexOf(null)] = it; this.sel = null; }]);
    if (inBelt) btns.push(['To pack', () => { removeItem(h, it); if (!pickUpPack(h, it)) { h.belt[h.belt.indexOf(null)] = it; g.say('No room'); } this.sel = null; }]);
    if (!g.dialog) btns.push(['Drop', () => { removeItem(h, it); g.drop(it, g.p.tx, g.p.ty); g.refresh(); this.sel = null; }]);
    btns.push(['Close', () => { this.sel = null; }]);
    const bw = Math.min(72, (w - 20) / btns.length - 4);
    btns.forEach(([l, f], i) => ui.button(l, x + 10 + i * (bw + 4), by, bw, 26, f));
  }

  // ---------- spellbook ----------
  drawSpells(ui: UI) {
    const g = this.g(), h = g.hero, X = 320;
    ui.panel(X, 0, 320, PLAY_H);
    ui.text('Spellbook', X + 160, 22, { align: 'center', size: 16, bold: true });
    const entries: [string, string, string][] = [['skill', `Skill: ${CLASSES[h.cls].skill === 'repair' ? 'Item Repair' : CLASSES[h.cls].skill === 'disarm' ? 'Trap Disarm' : 'Staff Recharge'}`, '']];
    for (const [id, lv] of Object.entries(h.spells)) { const s = SPELLS[id]; if (s) entries.push([id, `${s.name}  (level ${lv})`, `Mana ${spellMana(s, lv)}${CASTABLE.has(id) ? '' : '  - not in this build'}`]); }
    const st = h.body.handL;
    if (st?.itype === 'ITYPE_STAFF' && SPELL_BY_D1[st.spell]) { const s = SPELL_BY_D1[st.spell]; entries.push([`staff:${s.id}`, `Staff: ${s.name}`, `${st.charges}/${st.maxCharges} charges`]); }
    const scrolls = new Map<string, number>();
    for (const it of [...h.belt, ...h.inv.map((e) => e.item)]) if (it && it.misc.startsWith('IMISC_SCROLL') && SPELL_BY_D1[it.spell]) { const id = SPELL_BY_D1[it.spell].id; scrolls.set(id, (scrolls.get(id) ?? 0) + 1); }
    for (const [id, n] of scrolls) entries.push([`scroll:${id}`, `Scroll: ${SPELLS[id].name}`, `${n} in pack/belt`]);
    entries.forEach(([id, a, b], i) => {
      const y = 50 + i * 40;
      ui.button('', X + 14, y, 292, 36, () => { h.skill = id; this.skillArmed = false; g.say(`Selected: ${skillLabel(g, id)}`, 1.5); }, { on: h.skill === id });
      ui.text(a, X + 24, y + 12, { size: 12 }); ui.text(b, X + 24, y + 27, { size: 10, color: '#9a8a62' });
    });
  }

  // ---------- automap ----------
  drawAutomap(ui: UI) {
    const g = this.g(), lv = g.level, m = lv.map, c = ui.c, s = 4;
    const cx = VIEW_W / 2, cy = PLAY_H / 2;
    c.save(); c.globalAlpha = 0.85;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      if (!lv.explored[y * m.w + x]) continue;
      const t = m.tiles[y * m.w + x];
      const px = cx + (x - g.p.x - (y - g.p.y)) * s, py = cy + (x - g.p.x + (y - g.p.y)) * s / 2;
      if (px < 0 || py < 0 || px > VIEW_W || py > PLAY_H) continue;
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
    if (this.pick) ui.button('Info', x + 132, by, 70, 26, () => { this.sel = this.pick; });
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
    const c = ui.c;
    c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(0, 0, VIEW_W, VIEW_H); ui.block(0, 0, VIEW_W, VIEW_H);
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
    const c = ui.c, g = this.g();
    c.fillStyle = 'rgba(40,0,0,0.55)'; c.fillRect(0, 0, VIEW_W, VIEW_H); ui.block(0, 0, VIEW_W, VIEW_H);
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
function orb(c: CanvasRenderingContext2D, cx: number, cy: number, frac: number, col: string, artKey: string) {
  const f0 = Math.max(0, Math.min(1, frac));
  if (hasImg(artKey) && hasImg('ui/orb-empty')) {
    drawImg(c, 'ui/orb-empty', cx - 56, cy - 56);
    c.save(); c.beginPath(); c.rect(cx - 56, cy + 44 - 88 * f0, 112, 112); c.clip(); drawImg(c, artKey, cx - 56, cy - 56); c.restore();
    return;
  }
  const r = 50;
  c.fillStyle = '#0a0806'; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
  c.save(); c.beginPath(); c.arc(cx, cy, r - 3, 0, Math.PI * 2); c.clip();
  c.fillStyle = col; const f = Math.max(0, Math.min(1, frac)); c.fillRect(cx - r, cy + r - 2 * r * f, 2 * r, 2 * r * f);
  c.fillStyle = 'rgba(255,255,255,0.12)'; c.beginPath(); c.ellipse(cx - 14, cy - 18, 14, 9, -0.5, 0, Math.PI * 2); c.fill();
  c.restore();
  c.strokeStyle = '#8a7a52'; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
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
