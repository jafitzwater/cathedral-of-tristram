// D1-style control panel (640x128 at the bottom of the 640x480 view). Placeholder art: flat shapes only.
import { CLASSES, EXP_LEVELS } from './data/classes';
import { ITEMS } from './data/items';
import { SPELLS } from './data/spells';
import { PLAY_H, VIEW_W } from './iso';
import type { Game, Panel } from './game';

export interface Rect { x: number; y: number; w: number; h: number }
export type Hit = { kind: 'panel'; panel: Panel } | { kind: 'skill' } | { kind: 'belt'; i: number };

const Y = PLAY_H;
export const BUTTONS: { r: Rect; hit: Hit; label: string }[] = [
  { r: { x: 150, y: Y + 10, w: 58, h: 26 }, hit: { kind: 'panel', panel: 'char' }, label: 'CHAR' },
  { r: { x: 432, y: Y + 10, w: 58, h: 26 }, hit: { kind: 'panel', panel: 'inv' }, label: 'INV' },
  { r: { x: 432, y: Y + 42, w: 58, h: 26 }, hit: { kind: 'panel', panel: 'spell' }, label: 'SPELLS' },
  { r: { x: 150, y: Y + 42, w: 58, h: 76 }, hit: { kind: 'skill' }, label: 'SKILL' },
];
for (let i = 0; i < 8; i++) BUTTONS.push({ r: { x: 214 + i * 27, y: Y + 10, w: 25, h: 26 }, hit: { kind: 'belt', i }, label: `${i + 1}` });

export function hitHud(x: number, y: number): Hit | null {
  for (const b of BUTTONS) if (x >= b.r.x && y >= b.r.y && x < b.r.x + b.r.w && y < b.r.y + b.r.h) return b.hit;
  return null;
}

function orb(g: CanvasRenderingContext2D, cx: number, cy: number, frac: number, col: string) {
  const r = 50;
  g.fillStyle = '#111'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  g.save(); g.beginPath(); g.arc(cx, cy, r - 3, 0, Math.PI * 2); g.clip();
  g.fillStyle = col; g.fillRect(cx - r, cy + r - 2 * r * frac, 2 * r, 2 * r * frac); g.restore();
  g.strokeStyle = '#8a7a52'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
}

export function drawHud(g: CanvasRenderingContext2D, game: Game) {
  g.fillStyle = '#2a241c'; g.fillRect(0, Y, VIEW_W, 128);
  g.strokeStyle = '#8a7a52'; g.lineWidth = 2; g.strokeRect(1, Y + 1, VIEW_W - 2, 126);
  const p = game.player;
  orb(g, 72, Y + 64, p.hp / p.maxHp, '#a01010');
  orb(g, VIEW_W - 72, Y + 64, game.mana / Math.max(1, game.maxMana), '#1830b0');
  g.font = '10px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const b of BUTTONS) {
    const on = (b.hit.kind === 'panel' && game.panel === b.hit.panel) || (b.hit.kind === 'skill' && game.skillArmed);
    g.fillStyle = on ? '#5a4a2a' : '#3a3226'; g.fillRect(b.r.x, b.r.y, b.r.w, b.r.h);
    g.strokeStyle = '#8a7a52'; g.lineWidth = 1; g.strokeRect(b.r.x + 0.5, b.r.y + 0.5, b.r.w - 1, b.r.h - 1);
    g.fillStyle = '#d8c89a';
    if (b.hit.kind === 'belt') {
      const it = game.belt[b.hit.i];
      if (it) { g.fillStyle = it === 'potion_healing' ? '#c02020' : '#2040d0'; g.beginPath(); g.arc(b.r.x + 12.5, b.r.y + 14, 7, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#9a8a62'; g.fillText(b.label, b.r.x + 5, b.r.y + 6);
    } else if (b.hit.kind === 'skill') {
      const sp = CLASSES[game.cls].startSpell;
      g.fillText(sp ? SPELLS[sp.spell].name : CLASSES[game.cls].skill, b.r.x + b.r.w / 2, b.r.y + b.r.h / 2);
    } else g.fillText(b.label, b.r.x + b.r.w / 2, b.r.y + b.r.h / 2);
  }
  // description box (D1's centre text area)
  g.fillStyle = '#15120d'; g.fillRect(214, Y + 42, 214, 76);
  g.fillStyle = '#d8c89a'; g.font = '12px serif';
  const line = game.msgT > 0 ? game.msg : `${CLASSES[game.cls].name}  Lvl ${game.clvl}  Exp ${game.exp}/${EXP_LEVELS[game.clvl]}`;
  g.fillText(line, 321, Y + 62);
  g.fillText(`Life ${Math.ceil(p.hp)}/${p.maxHp}   Mana ${Math.floor(game.mana)}/${game.maxMana}`, 321, Y + 84);
  g.fillText(`Gold ${game.gold}`, 321, Y + 104);
  if (game.panel !== 'none') drawPanel(g, game);
}

function drawPanel(g: CanvasRenderingContext2D, game: Game) {
  const left = game.panel === 'char';
  const x = left ? 0 : 320;
  g.fillStyle = 'rgba(20,16,10,0.94)'; g.fillRect(x, 0, 320, PLAY_H);
  g.strokeStyle = '#8a7a52'; g.strokeRect(x + 1, 1, 318, PLAY_H - 2);
  g.fillStyle = '#d8c89a'; g.textAlign = 'left'; g.font = '13px serif';
  const c = CLASSES[game.cls];
  const lines: string[] = game.panel === 'char'
    ? [c.name, `Level ${game.clvl}`, `Strength ${c.base.str}`, `Magic ${c.base.mag}`, `Dexterity ${c.base.dex}`, `Vitality ${c.base.vit}`, `Life ${Math.ceil(game.player.hp)}/${game.player.maxHp}`, `Mana ${Math.floor(game.mana)}/${game.maxMana}`]
    : game.panel === 'inv'
      ? ['Inventory', ...c.startItems.filter((i) => ITEMS[i].slot !== 'belt').map((i) => ITEMS[i].name), `Gold ${game.gold}`]
      : ['Spellbook', ...(c.startSpell ? [`${SPELLS[c.startSpell.spell].name} (slvl ${c.startSpell.level})`] : ['(no spells)']), `Skill: ${c.skill}`];
  lines.forEach((l, i) => g.fillText(l, x + 20, 30 + i * 22));
  g.textAlign = 'center';
}
