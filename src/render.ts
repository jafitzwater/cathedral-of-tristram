// Canvas 2D isometric renderer. Placeholder art: flat diamonds and blocks.
import { PLAY_H, TILE_H, TILE_W, VIEW_W, tileToScreen, DIRS } from './iso';
import { MAP_H, MAP_W, WALL } from './map';
import type { Actor, Game } from './game';

export function camera(game: Game) {
  const s = tileToScreen(game.player.x, game.player.y);
  return { x: VIEW_W / 2 - s.x, y: PLAY_H / 2 - s.y - TILE_H / 2 };
}

function diamond(g: CanvasRenderingContext2D, x: number, y: number) {
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + TILE_W / 2, y + TILE_H / 2); g.lineTo(x, y + TILE_H); g.lineTo(x - TILE_W / 2, y + TILE_H / 2); g.closePath();
}

export function drawWorld(g: CanvasRenderingContext2D, game: Game) {
  g.fillStyle = '#000'; g.fillRect(0, 0, VIEW_W, PLAY_H);
  const cam = camera(game);
  g.save(); g.beginPath(); g.rect(0, 0, VIEW_W, PLAY_H); g.clip();
  const actors: Actor[] = [game.player, ...game.monsters.filter((m) => m.alive)];
  for (let s = 0; s < MAP_W + MAP_H - 1; s++) {
    for (let x = Math.max(0, s - MAP_H + 1); x <= Math.min(s, MAP_W - 1); x++) {
      const y = s - x;
      const p = tileToScreen(x, y);
      const sx = p.x + cam.x, sy = p.y + cam.y;
      if (sx < -TILE_W || sx > VIEW_W + TILE_W || sy < -TILE_H * 3 || sy > PLAY_H + TILE_H) continue;
      const wall = game.map[y * MAP_W + x] === WALL;
      if (wall) {
        g.fillStyle = '#4a4338'; diamond(g, sx, sy - 48); g.fill();
        g.fillStyle = '#2e2a23'; g.fillRect(sx - TILE_W / 2, sy - 48 + TILE_H / 2, TILE_W / 2, 48);
        g.fillStyle = '#3a352c'; g.fillRect(sx, sy - 48 + TILE_H / 2, TILE_W / 2, 48);
      } else {
        g.fillStyle = (x + y) % 2 ? '#3b3428' : '#352f24'; diamond(g, sx, sy); g.fill();
        g.strokeStyle = '#2a251c'; g.lineWidth = 1; g.stroke();
      }
    }
    for (const a of actors) if (Math.round(a.x + a.y) === s) drawActor(g, game, a, cam);
  }
  for (const b of game.bolts) {
    const p = tileToScreen(b.x, b.y);
    g.fillStyle = '#ff8a20'; g.beginPath(); g.arc(p.x + cam.x, p.y + cam.y + TILE_H / 2 - 20, 5, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

function drawActor(g: CanvasRenderingContext2D, game: Game, a: Actor, cam: { x: number; y: number }) {
  const p = tileToScreen(a.x, a.y);
  const x = p.x + cam.x, y = p.y + cam.y + TILE_H / 2;
  const isPlayer = a === game.player;
  g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.ellipse(x, y, 14, 7, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = a.flash > 0 ? '#fff' : isPlayer ? '#b89a5a' : game.target === a ? '#c04040' : '#6a8a4a';
  g.fillRect(x - 8, y - 40, 16, 38);
  g.beginPath(); g.arc(x, y - 46, 7, 0, Math.PI * 2); g.fill();
  // facing tick (8-direction)
  const d = DIRS[a.dir], f = tileToScreen(d.x, d.y), l = Math.hypot(f.x, f.y) || 1;
  g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y - 20); g.lineTo(x + (f.x / l) * 14, y - 20 + (f.y / l) * 14); g.stroke();
  if (!isPlayer) { g.fillStyle = '#300'; g.fillRect(x - 12, y - 60, 24, 3); g.fillStyle = '#d00'; g.fillRect(x - 12, y - 60, 24 * Math.max(0, a.hp / a.maxHp), 3); }
}
