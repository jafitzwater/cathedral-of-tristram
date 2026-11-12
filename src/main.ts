import { Game } from './game';
import { drawWorld, camera } from './render';
import { drawHud, hitHud } from './hud';
import { PLAY_H, VIEW_H, VIEW_W, pickTile } from './iso';
import type { ClassId } from './data/classes';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const g = canvas.getContext('2d')!;
canvas.width = VIEW_W; canvas.height = VIEW_H;

const q = new URLSearchParams(location.search).get('class');
const cls: ClassId = q === 'rogue' || q === 'sorcerer' ? q : 'warrior';
const game = new Game(cls);

function fit() {
  const s = Math.min(innerWidth / VIEW_W, innerHeight / VIEW_H);
  canvas.style.width = `${VIEW_W * s}px`; canvas.style.height = `${VIEW_H * s}px`;
}
addEventListener('resize', fit); fit();

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  const r = canvas.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * VIEW_W, y = ((e.clientY - r.top) / r.height) * VIEW_H;
  if (y >= PLAY_H) {
    const h = hitHud(x, y);
    if (!h) return;
    if (h.kind === 'panel') game.panel = game.panel === h.panel ? 'none' : h.panel;
    else if (h.kind === 'skill') game.skillArmed = !game.skillArmed;
    else game.useBelt(h.i);
    return;
  }
  if (game.panel !== 'none') { game.panel = 'none'; return; }
  const cam = camera(game);
  game.tapTile(pickTile(x - cam.x, y - cam.y));
});

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  game.update(dt);
  drawWorld(g, game);
  drawHud(g, game);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
