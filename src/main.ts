// Order 4 entry: full-screen landscape canvas, Diablo Immortal-style multi-touch controls (floating joystick on the left
// half, press-and-hold ATTACK, tap buttons, tap-to-interact on objects), fixed D1 game rules underneath.
import { Game } from './game';
import { drawWorld, pickAt } from './render';
import { Hud } from './hud';
import { Screens, type Screen } from './screens';
import { UI, type Box } from './ui';
import { Audio } from './audio';
import { loadArt } from './art';
import { VIEW_H, VIEW_W, view } from './iso';
import { joystickVector } from './controls';
import { saveGame, loadGame, listHeroes, peekHero, deleteHero } from './save';
import creditsText from '../CREDITS.md?raw';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const nameInput = document.getElementById('name') as HTMLInputElement;
const safe = document.getElementById('safe') as HTMLDivElement;
const c = canvas.getContext('2d', { alpha: false })!;
const ui = new UI();
const opts = (() => { try { return JSON.parse(localStorage.getItem('cot.options') ?? '') as { music: number; sfx: number }; } catch { return { music: 7, sfx: 7 }; } })();
const audio = new Audio(opts.music, opts.sfx);
void loadArt(import.meta.env.BASE_URL).then((assets) => { for (const a of assets) if (a.type === 'sfx' || a.type === 'music') audio.files[a.key] = `${import.meta.env.BASE_URL}art/${a.file}`; });

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

// ---- full-screen sizing (no black bars), DPR-crisp backing store, safe-area insets ----
let W = 844, H = 390, dpr = 1;
const inset = { l: 0, r: 0, t: 0, b: 0 };
function fit() {
  W = window.innerWidth; H = window.innerHeight; dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
  const cs = getComputedStyle(safe);
  inset.l = parseFloat(cs.paddingLeft) || 0; inset.r = parseFloat(cs.paddingRight) || 0; inset.t = parseFloat(cs.paddingTop) || 0; inset.b = parseFloat(cs.paddingBottom) || 0;
  // world zoom: D1's 352 px play-area height fills the screen height (Immortal-like close camera); width shows more
  view.zoom = Math.max(1, H / 352); view.w = W / view.zoom; view.h = H / view.zoom;
  hud.lay = { W, H, dpr, inset: { ...inset } };
}
addEventListener('resize', fit); addEventListener('orientationchange', () => setTimeout(fit, 200)); fit();

// ---- browser behaviour: no zoom / scroll / long-press menu; fullscreen + landscape lock on first tap ----
for (const ev of ['contextmenu', 'gesturestart', 'dblclick', 'selectstart']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
let wentFull = false;
function goFullscreen() {
  if (wentFull) return; wentFull = true;
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  const lock = () => { const o = window.screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }; o?.lock?.('landscape').catch(() => {}); };
  try {
    if (el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).then(lock).catch(lock);
    else { el.webkitRequestFullscreen?.(); lock(); }
  } catch { /* not allowed: ignore */ }
}
const buzz = (p: number | number[]) => { try { navigator.vibrate?.(p); } catch { /* unsupported */ } };

// ---- multi-touch input ----
interface Ptr { kind: 'joy' | 'press' | 'box' | 'world'; box?: Box | null; x0: number; y0: number; held: boolean; timer: number }
const ptrs = new Map<number, Ptr>();
const css = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault(); audio.unlock(); goFullscreen();
  try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
  const p = css(e), b = ui.hit(p.x, p.y);
  const ptr: Ptr = { kind: 'box', box: b, x0: p.x, y0: p.y, held: false, timer: 0 };
  if (b?.down) { ptr.kind = 'press'; b.down(); }
  else if (!b && screen === 'game' && game && !game.dead && p.x < W / 2 && !hud.covers(p.x) && !hud.map) {
    ptr.kind = 'joy'; hud.joy = { ox: p.x, oy: p.y, tx: p.x, ty: p.y }; game.move = { x: 0, y: 0, mag: 0 };
  } else if (!b && screen === 'game') ptr.kind = 'world';
  if (ptr.kind === 'box' && b?.hold) ptr.timer = window.setTimeout(() => { ptr.held = true; b.hold!(); buzz(10); }, 420);
  ptrs.set(e.pointerId, ptr);
});
canvas.addEventListener('pointermove', (e) => {
  const ptr = ptrs.get(e.pointerId); if (!ptr) return;
  const p = css(e);
  if (ptr.kind === 'joy' && game && hud.joy) { hud.joy.tx = p.x; hud.joy.ty = p.y; game.move = joystickVector(hud.joy.ox, hud.joy.oy, p.x, p.y); }
  else if (ptr.kind === 'box' && Math.hypot(p.x - ptr.x0, p.y - ptr.y0) > 14) clearTimeout(ptr.timer);
});
const end = (e: PointerEvent, cancel: boolean) => {
  const ptr = ptrs.get(e.pointerId); if (!ptr) return;
  ptrs.delete(e.pointerId); clearTimeout(ptr.timer);
  const p = css(e);
  if (ptr.kind === 'joy') { if (game) game.move = null; hud.joy = null; return; }
  if (ptr.kind === 'press') { ptr.box?.up?.(); return; }
  if (cancel || ptr.held) return;
  if (ptr.kind === 'box') { const b = ui.hit(p.x, p.y); if (b && b === ptr.box || b && ptr.box && b.tap === ptr.box.tap) b.tap?.(); else if (ptr.box && Math.hypot(p.x - ptr.x0, p.y - ptr.y0) < 14) ptr.box.tap?.(); return; }
  if (ptr.kind === 'world' && game && screen === 'game' && !hud.covers(p.x)) {
    // tap-to-interact: monsters (soft-lock + attack), NPCs, items, objects, doors. Floor taps do nothing (no tap-to-move).
    const t = pickAt(game, p.x / view.zoom, p.y / view.zoom);
    if (t.kind !== 'tile') game.tap(t);
  }
};
canvas.addEventListener('pointerup', (e) => { e.preventDefault(); end(e, false); });
canvas.addEventListener('pointercancel', (e) => end(e, true));
addEventListener('keydown', (e) => { if (e.key === 'Escape' && screen === 'game') hud.menu = hud.menu === 'none' ? 'main' : 'none'; });

// ---- frame loop (rAF, fixed-step-free: dt clamped like Order 3) + fps meter ----
let last = performance.now(), time = 0, frames = 0, fpsT = 0, fps = 0;
const fpsLog: number[] = [];
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
  frames++; fpsT += dt; if (fpsT >= 1) { fps = frames / fpsT; fpsLog.push(Math.round(fps)); if (fpsLog.length > 120) fpsLog.shift(); frames = 0; fpsT = 0; }
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  ui.begin(c, dpr);
  if (screen === 'game' && game) {
    if (hud.menu === 'none' && !game.dialog) game.update(dt);
    if (game.pendingLevel) { screen = 'loading'; loadT = 0.6; scr.t = 0; game.move = null; game.attackHeld = false; hud.joy = null; hud.attackDown = false; }
    for (const s of game.sfx) { audio.play(s); if (s === 'hit') buzz(15); else if (s === 'player_hit') buzz(40); else if (s === 'player_die') buzz([80, 50, 80]); }
    game.sfx.length = 0;
    c.setTransform(dpr * view.zoom, 0, 0, dpr * view.zoom, 0, 0);
    drawWorld(c, game, time);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    hud.draw(ui);
  } else {
    // front-end screens keep their D1 640x480 layout, centred over a full-screen backdrop
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    const s = Math.min(W / VIEW_W, H / VIEW_H), ox = (W - VIEW_W * s) / 2, oy = (H - VIEW_H * s) / 2;
    c.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
    if (screen === 'loading') {
      scr.draw(ui, 'loading', dt);
      loadT -= dt;
      if (loadT <= 0 && game) { game.finishTravel(); for (const sf of game.sfx) audio.play(sf); game.sfx.length = 0; screen = 'game'; }
    } else scr.draw(ui, screen, dt);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
if (location.search.includes('smoke')) (window as unknown as { __cot: unknown }).__cot = { get game() { return game; }, get screen() { return screen; }, get fps() { return fpsLog.slice(); }, hud, view }; // read-only handle, only with ?smoke (headless smoke test)
