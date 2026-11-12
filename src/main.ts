import { Game } from './game';
import { drawWorld, pickAt } from './render';
import { Hud } from './hud';
import { Screens, type Screen } from './screens';
import { UI } from './ui';
import { Audio } from './audio';
import { loadArt } from './art';
import { PLAY_H, VIEW_H, VIEW_W } from './iso';
import { saveGame, loadGame, listHeroes, peekHero, deleteHero } from './save';
import creditsText from '../CREDITS.md?raw';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const nameInput = document.getElementById('name') as HTMLInputElement;
const c = canvas.getContext('2d')!;
canvas.width = VIEW_W; canvas.height = VIEW_H;
const ui = new UI();
const opts = (() => { try { return JSON.parse(localStorage.getItem('cot.options') ?? '') as { music: number; sfx: number }; } catch { return { music: 7, sfx: 7 }; } })();
const audio = new Audio(opts.music, opts.sfx);
void loadArt(import.meta.env.BASE_URL).then((assets) => { for (const a of assets) if (a.type !== 'image') audio.files[a.key] = `${import.meta.env.BASE_URL}art/${a.file}`; });

let screen: Screen = 'title';
let game: Game | null = null;
let loadT = 0;
const go = (s: Screen) => { screen = s; scr.t = 0; audio.play('ui_click'); if (s === 'menu' || s === 'title') audio.play('music_title'); };
const startGame = (g: Game) => { game = g; hud.closeAll(); hud.menu = 'none'; screen = 'loading'; loadT = 0.6; audio.play(g.cur === 'town' ? 'music_town' : 'music_l1'); };
const hud = new Hud(() => game!, {
  save: () => { if (game) { saveGame(localStorage, game); game.say('Game saved'); } },
  load: () => { if (game) { const g = loadGame(localStorage, game.hero.name); if (g) startGame(g); else game.say('No saved game'); } },
  newGame: () => { game = null; go('menu'); },
  quit: () => { if (game) saveGame(localStorage, game); game = null; go('menu'); },
  setVolumes: (m, s) => { audio.setVolumes(m, s); localStorage.setItem('cot.options', JSON.stringify({ music: m, sfx: s })); },
  vol: () => [audio.musicVol, audio.sfxVol],
});
const scr = new Screens({
  go, heroes: () => listHeroes(localStorage), peek: (n) => peekHero(localStorage, n),
  load: (n) => { const g = loadGame(localStorage, n); if (g) startGame(g); },
  del: (n) => deleteHero(localStorage, n),
  create: (name, cls) => { const g = new Game(name, cls); saveGame(localStorage, g); startGame(g); },
  nameInput: () => nameInput, credits: creditsText,
});
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') scr.submitName(); });

function fit() {
  const s = Math.min(innerWidth / VIEW_W, innerHeight / VIEW_H);
  canvas.style.width = `${VIEW_W * s}px`; canvas.style.height = `${VIEW_H * s}px`;
}
addEventListener('resize', fit); fit();

// Touch input: tap = D1 left click, hold (450 ms) = item/target info.
let downAt: { x: number; y: number; t: number; held: boolean } | null = null;
let holdTimer = 0;
const toView = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * VIEW_W, y: ((e.clientY - r.top) / r.height) * VIEW_H }; };
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault(); audio.unlock();
  const p = toView(e);
  downAt = { ...p, t: performance.now(), held: false };
  clearTimeout(holdTimer);
  holdTimer = window.setTimeout(() => { if (!downAt) return; const b = ui.hit(downAt.x, downAt.y); if (b?.hold) { downAt.held = true; b.hold(); } }, 450);
});
canvas.addEventListener('pointerup', (e) => {
  e.preventDefault(); clearTimeout(holdTimer);
  if (!downAt || downAt.held) { downAt = null; return; }
  const p = downAt; downAt = null;
  const b = ui.hit(p.x, p.y);
  if (b) { b.tap?.(); return; }
  if (screen === 'game' && game && p.y < PLAY_H) {
    if (hud.left !== 'none' && p.x < 320 || hud.right !== 'none' && p.x >= 320) return;
    const t = pickAt(game, p.x, p.y);
    if (hud.skillArmed) {
      const tx = t.kind === 'mon' ? t.m.tx : t.kind === 'tile' || t.kind === 'door' ? t.x : t.kind === 'item' ? t.g.x : t.kind === 'obj' ? t.o.x : t.npc.x;
      const ty = t.kind === 'mon' ? t.m.ty : t.kind === 'tile' || t.kind === 'door' ? t.y : t.kind === 'item' ? t.g.y : t.kind === 'obj' ? t.o.y : t.npc.y;
      game.castAt(tx, ty);
      return;
    }
    game.tap(t);
  }
});
canvas.addEventListener('pointercancel', () => { clearTimeout(holdTimer); downAt = null; });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && screen === 'game') hud.menu = hud.menu === 'none' ? 'main' : 'none'; });

let last = performance.now(), time = 0;
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
  ui.begin(c);
  if (screen === 'game' && game) {
    if (hud.menu === 'none' && !game.dialog) game.update(dt);
    if (game.pendingLevel) { screen = 'loading'; loadT = 0.6; scr.t = 0; }
    for (const s of game.sfx) audio.play(s); game.sfx.length = 0;
    drawWorld(c, game, time);
    hud.draw(ui);
  } else if (screen === 'loading') {
    scr.draw(ui, 'loading', dt);
    loadT -= dt;
    if (loadT <= 0 && game) { game.finishTravel(); for (const s of game.sfx) audio.play(s); game.sfx.length = 0; screen = 'game'; }
  } else scr.draw(ui, screen, dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
if (location.search.includes('smoke')) (window as unknown as { __cot: unknown }).__cot = { get game() { return game; }, get screen() { return screen; } }; // read-only handle, only with ?smoke (headless smoke test)
