// Front-end screens (D1 flow): title/intro -> main menu (Single Player, Show Credits, Exit) -> hero select (saved heroes, New Hero, Delete)
// -> class pick (base stats) -> name entry -> game. Plus the loading screen between levels.
import { CLASSES, type ClassId } from './data/classes';
import { VIEW_W, VIEW_H } from './iso';
import type { UI } from './ui';
import type { Hero } from './player';
import { NAME_BOX, NAME_CANCEL, NAME_OK, resolveName } from './nameEntry';

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
    if (title) { ui.text('CATHEDRAL OF TRISTRAM', VIEW_W / 2, 70, { align: 'center', size: 34, color: '#c03020', bold: true }); ui.text('a Diablo (1996) homage', VIEW_W / 2, 102, { align: 'center', size: 13, color: '#8a6a4a' }); }
  }
  draw(ui: UI, s: Screen, dt: number) {
    this.t += dt;
    switch (s) {
      case 'title': {
        this.bg(ui, false);
        const a = Math.min(1, this.t / 1.5);
        ui.c.globalAlpha = a; ui.text('CATHEDRAL OF TRISTRAM', VIEW_W / 2, 200, { align: 'center', size: 40, color: '#c03020', bold: true });
        ui.text('The sleeper has awakened...', VIEW_W / 2, 250, { align: 'center', size: 16, color: '#b08860' });
        ui.c.globalAlpha = 0.5 + 0.5 * Math.sin(this.t * 3); ui.text('Tap to continue', VIEW_W / 2, 400, { align: 'center', size: 14 }); ui.c.globalAlpha = 1;
        ui.area(0, 0, VIEW_W, VIEW_H, () => this.h.go('menu'));
        break;
      }
      case 'menu':
        this.bg(ui);
        ui.menuItem('Single Player', 170, 210, 300, () => { this.selHero = this.h.heroes()[0] ?? ''; this.h.go('select'); }, { size: 26 });
        ui.menuItem('Show Credits', 170, 270, 300, () => { this.creditsY = 0; this.h.go('credits'); }, { size: 26 });
        ui.menuItem('Exit Diablo', 170, 330, 300, () => this.h.go('exit'), { size: 26 });
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
        ui.panel(40, 130, 260, 300);
        ui.text('Select Hero', 170, 150, { align: 'center', size: 16, color: '#d8b860' });
        list.forEach((n, i) => ui.menuItem(n, 40, 182 + i * 28, 260, () => { this.selHero = n; this.confirmDel = false; }, { size: 15, color: this.selHero === n ? '#ffffff' : '#d8b860' }));
        ui.menuItem('New Hero', 40, 182 + list.length * 28, 260, () => { this.h.go('class'); }, { size: 15, color: '#e8c040' });
        ui.panel(330, 130, 270, 300);
        const hero = this.selHero ? this.h.peek(this.selHero) : null;
        if (hero) {
          const rows: [string, string][] = [['Level', `${hero.clvl}`], ['Strength', `${hero.base.str}`], ['Magic', `${hero.base.mag}`], ['Dexterity', `${hero.base.dex}`], ['Vitality', `${hero.base.vit}`]];
          ui.text(`${hero.name} - ${CLASSES[hero.cls].name}`, 465, 152, { align: 'center', size: 14, color: '#e8d8a8' });
          rows.forEach(([a, b], i) => { ui.text(a, 360, 186 + i * 24); ui.text(b, 560, 186 + i * 24, { align: 'right' }); });
          ui.button('Play', 350, 370, 100, 34, () => this.h.load(hero.name));
          ui.button(this.confirmDel ? 'Really?' : 'Delete', 480, 370, 100, 34, () => { if (this.confirmDel) { this.h.del(hero.name); this.selHero = ''; this.confirmDel = false; } else this.confirmDel = true; });
        } else ui.wrap('Choose a hero, or make a new one.', 345, 200, 240, 16, { align: 'center' });
        ui.button('Back', 40, 440, 100, 30, () => this.h.go('menu'));
        break;
      }
      case 'class': {
        this.bg(ui);
        ui.text('Choose Class', VIEW_W / 2, 140, { align: 'center', size: 18, color: '#d8b860' });
        (['warrior', 'rogue', 'sorcerer'] as ClassId[]).forEach((id, i) => {
          const c = CLASSES[id], x = 40 + i * 195;
          ui.button('', x, 160, 180, 220, () => { this.cls = id; }, { on: this.cls === id });
          ui.text(c.name, x + 90, 182, { align: 'center', size: 17, color: '#e8d8a8' });
          const rows: [string, number][] = [['Strength', c.base.str], ['Magic', c.base.mag], ['Dexterity', c.base.dex], ['Vitality', c.base.vit]];
          rows.forEach(([a, b], j) => { ui.text(a, x + 18, 220 + j * 24); ui.text(`${b}`, x + 160, 220 + j * 24, { align: 'right' }); });
          ui.text({ warrior: 'Skill: Item Repair', rogue: 'Skill: Trap Disarm', sorcerer: 'Skill: Staff Recharge' }[id], x + 90, 330, { align: 'center', size: 11, color: '#9a8a62' });
          ui.text({ warrior: 'Short sword, buckler, club', rogue: 'Short bow', sorcerer: 'Staff of Charged Bolt, Firebolt' }[id], x + 90, 350, { align: 'center', size: 10, color: '#9a8a62' });
        });
        ui.button('OK', 200, 400, 110, 34, () => { const inp = this.h.nameInput(); inp.value = ''; this.err = ''; this.h.go('name'); this.h.focusName(); });
        ui.button('Cancel', 330, 400, 110, 34, () => this.h.go('select'));
        break;
      }
      case 'name': {
        this.bg(ui);
        // the typed text, caret, OK and Cancel taps belong to the HTML form laid over these boxes (main.ts); the canvas draws the D1 look
        ui.text(`Enter a name for your ${CLASSES[this.cls].name}`, VIEW_W / 2, 170, { align: 'center', size: 18, color: '#d8b860' });
        ui.panel(NAME_BOX.x, NAME_BOX.y, NAME_BOX.w, NAME_BOX.h);
        if (this.err) ui.text(this.err, VIEW_W / 2, 262, { align: 'center', size: 12, color: '#d04040' });
        ui.button('OK', NAME_OK.x, NAME_OK.y, NAME_OK.w, NAME_OK.h, () => this.submitName());
        ui.button('Cancel', NAME_CANCEL.x, NAME_CANCEL.y, NAME_CANCEL.w, NAME_CANCEL.h, () => this.cancelName());
        break;
      }
      case 'loading': {
        this.bg(ui, false);
        ui.text('Loading...', VIEW_W / 2, 220, { align: 'center', size: 22, color: '#d8b860' });
        const f = Math.min(1, this.t / 0.6);
        ui.c.fillStyle = '#300'; ui.c.fillRect(170, 250, 300, 14); ui.c.fillStyle = '#c03020'; ui.c.fillRect(170, 250, 300 * f, 14);
        break;
      }
      case 'exit':
        this.bg(ui);
        ui.wrap('Thanks for playing. Close this tab to exit, or tap to return to the menu.', 120, 230, 400, 20, { align: 'center', size: 15 });
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
