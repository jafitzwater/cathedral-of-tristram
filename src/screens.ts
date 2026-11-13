// Front-end screens (D1 flow): title/intro -> main menu (Single Player, Show Credits, Exit) -> hero select (saved heroes, New Hero, Delete)
// -> class pick (base stats) -> name entry -> game. Plus the loading screen between levels.
import { CLASSES, type ClassId } from './data/classes';
import { VIEW_W, VIEW_H } from './iso';
import type { UI } from './ui';
import type { Hero } from './player';
import { NAME_BOX, NAME_CANCEL, NAME_OK, resolveName } from './nameEntry';
import { divider, hudText, well, xpBar } from './hudSkin';

export type Screen = 'title' | 'menu' | 'credits' | 'select' | 'class' | 'name' | 'game' | 'loading' | 'exit';
export interface ScreenHooks {
  go(s: Screen): void; heroes(): string[]; peek(n: string): Hero | null; load(n: string): void; del(n: string): void;
  create(name: string, cls: ClassId): void; nameInput(): HTMLInputElement; credits: string;
  /** Show the HTML name form and focus its input synchronously (must run inside the tap handler, Order 8). */
  focusName(): void;
}
export class Screens {
  selHero = ''; cls: ClassId = 'warrior'; t = 0; creditsY = 0; confirmDel = false; err = '';
  constructor(private h: ScreenHooks) {}
  bg(ui: UI, title = true) {
    const c = ui.c;
    const gr = c.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 40, VIEW_W / 2, VIEW_H / 2, 420);
    gr.addColorStop(0, '#2a0a06'); gr.addColorStop(1, '#000'); c.fillStyle = gr; c.fillRect(0, 0, VIEW_W, VIEW_H);
    if (title) { this.logo(ui, 70, 34); ui.text('a Diablo (1996) homage', VIEW_W / 2, 104, { align: 'center', size: 14, color: '#9a7a52' }); }
  }
  /** Order 16: the title in Cinzel, blood-red with a dark outline and an ember glow, over a gold rule. */
  logo(ui: UI, y: number, size: number) {
    const c = ui.c; c.save(); c.shadowColor = 'rgba(255,60,20,0.6)'; c.shadowBlur = 16;
    hudText(c, 'CATHEDRAL OF TRISTRAM', VIEW_W / 2, y, { align: 'center', size, color: '#c8281a', weight: 700 }); c.restore();
    divider(c, VIEW_W / 2 - 200, y + size * 0.62, 400);
  }
  draw(ui: UI, s: Screen, dt: number) {
    this.t += dt;
    switch (s) {
      case 'title': {
        this.bg(ui, false);
        const a = Math.min(1, this.t / 1.5);
        ui.c.globalAlpha = a; this.logo(ui, 200, 40); ui.c.globalAlpha = a;
        ui.text('The sleeper has awakened...', VIEW_W / 2, 250, { align: 'center', size: 16, color: '#b08860' });
        ui.c.globalAlpha = 0.5 + 0.5 * Math.sin(this.t * 3); ui.text('TAP TO CONTINUE', VIEW_W / 2, 400, { align: 'center', size: 14, color: '#d8b058', head: true }); ui.c.globalAlpha = 1;
        ui.area(0, 0, VIEW_W, VIEW_H, () => this.h.go('menu'));
        break;
      }
      case 'menu':
        this.bg(ui);
        // Order 16: iron plaques, 52 tall (>= 44 css px at the 0.81 front-end scale on 844x390)
        ui.button('Single Player', 190, 184, 260, 52, () => { this.selHero = this.h.heroes()[0] ?? ''; this.h.go('select'); }, { size: 20, on: true });
        ui.button('Show Credits', 190, 244, 260, 52, () => { this.creditsY = 0; this.h.go('credits'); }, { size: 20 });
        ui.button('Exit Diablo', 190, 304, 260, 52, () => this.h.go('exit'), { size: 20 });
        break;
      case 'credits': {
        this.bg(ui, false);
        this.creditsY += dt * 22;
        const lines = this.h.credits.split('\n');
        lines.forEach((l, i) => { const y = VIEW_H - this.creditsY + i * 20; if (y > -20 && y < VIEW_H + 20) ui.text(l.replace(/^#+\s*/, '').replace(/\*\*/g, ''), VIEW_W / 2, y, { align: 'center', size: l.startsWith('#') ? 18 : 12, color: l.startsWith('#') ? '#d8b860' : '#c8b890' }); });
        if (VIEW_H - this.creditsY + lines.length * 20 < 0) this.creditsY = 0;
        ui.area(0, 0, VIEW_W, VIEW_H, () => this.h.go('menu'));
        break;
      }
      case 'select': {
        this.bg(ui);
        const list = this.h.heroes();
        ui.panel(40, 126, 260, 304, 'Select Hero');
        // rows are 54 tall (44 css px) while they fit; a long hero list tightens to fit the panel
        const rh = Math.min(54, 238 / (list.length + 1)), r0 = 182 - 28 + rh / 2;
        list.forEach((n, i) => { const y = r0 + i * rh; if (this.selHero === n) { ui.c.fillStyle = 'rgba(216,176,88,0.16)'; ui.c.fillRect(54, y - rh / 2 + 3, 232, rh - 6); } ui.menuItem(n, 40, y, 260, () => { this.selHero = n; this.confirmDel = false; }, { size: 16, color: this.selHero === n ? '#fff4d8' : '#d8b860', hit: rh }); });
        ui.menuItem('New Hero', 40, list.length ? r0 + list.length * rh : 182, 260, () => { this.h.go('class'); }, { size: 16, color: '#f0c850', hit: list.length ? rh : 54 });
        ui.panel(330, 126, 270, 304, 'Hero');
        const hero = this.selHero ? this.h.peek(this.selHero) : null;
        if (hero) {
          const rows: [string, string][] = [['Level', `${hero.clvl}`], ['Strength', `${hero.base.str}`], ['Magic', `${hero.base.mag}`], ['Dexterity', `${hero.base.dex}`], ['Vitality', `${hero.base.vit}`]];
          ui.text(`${hero.name} - ${CLASSES[hero.cls].name}`, 465, 172, { align: 'center', size: 15, color: '#efe0b8', head: true });
          rows.forEach(([a, b], i) => { ui.text(a.toUpperCase(), 360, 204 + i * 26, { size: 11, color: '#b89c6a', head: true }); well(ui.c, 520, 193 + i * 26, 50, 21); ui.text(b, 545, 204 + i * 26, { align: 'center', size: 13, color: '#efe0b8' }); });
          ui.button('Play', 350, 364, 110, 46, () => this.h.load(hero.name), { on: true, size: 15 });
          ui.button(this.confirmDel ? 'Really?' : 'Delete', 470, 364, 110, 46, () => { if (this.confirmDel) { this.h.del(hero.name); this.selHero = ''; this.confirmDel = false; } else this.confirmDel = true; }, { danger: true, size: 15 });
        } else ui.wrap('Choose a hero, or make a new one.', 345, 200, 240, 16, { align: 'center' });
        ui.button('Back', 40, 436, 110, 40, () => this.h.go('menu'), { size: 14 });
        break;
      }
      case 'class': {
        this.bg(ui);
        hudText(ui.c, 'CHOOSE CLASS', VIEW_W / 2, 140, { align: 'center', size: 18, color: '#e8c060', weight: 700 });
        (['warrior', 'rogue', 'sorcerer'] as ClassId[]).forEach((id, i) => {
          const c = CLASSES[id], x = 40 + i * 195;
          ui.button('', x, 160, 180, 220, () => { this.cls = id; }, { on: this.cls === id });
          ui.text(c.name.toUpperCase(), x + 90, 184, { align: 'center', size: 17, color: this.cls === id ? '#fff0c0' : '#e8d8a8', head: true }); divider(ui.c, x + 20, 200, 140);
          const rows: [string, number][] = [['Strength', c.base.str], ['Magic', c.base.mag], ['Dexterity', c.base.dex], ['Vitality', c.base.vit]];
          rows.forEach(([a, b], j) => { ui.text(a.toUpperCase(), x + 18, 222 + j * 24, { size: 11, color: '#b89c6a', head: true }); ui.text(`${b}`, x + 160, 222 + j * 24, { align: 'right', size: 14, color: '#efe0b8' }); });
          ui.text({ warrior: 'Skill: Item Repair', rogue: 'Skill: Trap Disarm', sorcerer: 'Skill: Staff Recharge' }[id], x + 90, 330, { align: 'center', size: 12, color: '#b8a070' });
          ui.text({ warrior: 'Short sword, buckler, club', rogue: 'Short bow', sorcerer: 'Staff of Charged Bolt, Firebolt' }[id], x + 90, 350, { align: 'center', size: 11, color: '#9a8a62' });
        });
        ui.button('OK', 200, 396, 110, 42, () => { const inp = this.h.nameInput(); inp.value = ''; this.err = ''; this.h.go('name'); this.h.focusName(); });
        ui.button('Cancel', 330, 396, 110, 42, () => this.h.go('select'));
        break;
      }
      case 'name': {
        this.bg(ui);
        // the typed text, caret, OK and Cancel taps belong to the HTML form laid over these boxes (main.ts); the canvas draws the D1 look
        hudText(ui.c, `ENTER A NAME FOR YOUR ${CLASSES[this.cls].name.toUpperCase()}`, VIEW_W / 2, 170, { align: 'center', size: 16, color: '#e8c060', weight: 700 });
        well(ui.c, NAME_BOX.x, NAME_BOX.y, NAME_BOX.w, NAME_BOX.h, { border: '#c89a48' });
        if (this.err) ui.text(this.err, VIEW_W / 2, 262, { align: 'center', size: 12, color: '#d04040' });
        ui.button('OK', NAME_OK.x, NAME_OK.y, NAME_OK.w, NAME_OK.h, () => this.submitName());
        ui.button('Cancel', NAME_CANCEL.x, NAME_CANCEL.y, NAME_CANCEL.w, NAME_CANCEL.h, () => this.cancelName());
        break;
      }
      case 'loading': {
        this.bg(ui, false);
        hudText(ui.c, 'LOADING', VIEW_W / 2, 220, { align: 'center', size: 22, color: '#e8c060', weight: 700 });
        const f = Math.min(1, this.t / 0.6);
        xpBar(ui.c, 170, 252, 300, f);
        break;
      }
      case 'exit':
        this.bg(ui);
        ui.wrap('Thanks for playing. Close this tab to exit, or tap to return to the menu.', 120, 230, 400, 22, { align: 'center', size: 16 });
        ui.area(0, 0, VIEW_W, VIEW_H, () => this.h.go('menu'));
        break;
      default: break;
    }
  }
  submitName() {
    const inp = this.h.nameInput();
    const r = resolveName(inp.value, CLASSES[this.cls].name, this.h.heroes());
    if ('err' in r) { this.err = r.err; return; }
    this.err = '';
    inp.blur();
    this.h.create(r.name, this.cls);
  }
  cancelName() { this.h.nameInput().blur(); this.err = ''; this.h.go('class'); }
}
