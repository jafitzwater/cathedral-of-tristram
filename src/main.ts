// Order 4 entry: full-screen landscape canvas, Diablo Immortal-style multi-touch controls (floating joystick on the left
// half, press-and-hold ATTACK, tap buttons, tap-to-interact on objects), fixed D1 game rules underneath.
import { Game } from './game';
import { drawWorld, pickAt } from './render';
import { Hud } from './hud';
import { Screens, type Screen } from './screens';
import { UI, type Box } from './ui';
import { Audio } from './audio';
import { art, loadArt, wantedGroups } from './art';
import { ZoneTracker } from './zones';
import { view, worldZoom } from './iso';
import { joystickVector } from './controls';
import { T } from './levels/types';
import { TOWN_PORTAL_SPOT } from './levels/town';
import { TAP_SLOP, HOLD_MS } from './touch';
import { saveGame, loadGame, listHeroes, peekHero, deleteHero } from './save';
import creditsText from '../CREDITS.md?raw';
import { NAME_BOX, NAME_CANCEL, NAME_OK, cssRect, frontLayout, inputFontPx, isFormTarget } from './nameEntry';
import { CLASSES } from './data/classes';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const nameInput = document.getElementById('name') as HTMLInputElement;
const nameForm = document.getElementById('nameForm') as HTMLFormElement;
const nameOk = document.getElementById('nameOk') as HTMLButtonElement, nameCancel = document.getElementById('nameCancel') as HTMLButtonElement;
const safe = document.getElementById('safe') as HTMLDivElement;
const c = canvas.getContext('2d', { alpha: false })!;
const ui = new UI();
const opts = (() => { try { return JSON.parse(localStorage.getItem('cot.options') ?? '') as { music: number; sfx: number }; } catch { return { music: 7, sfx: 7 }; } })();
const audio = new Audio(opts.music, opts.sfx);
let artReady = false;
void loadArt(import.meta.env.BASE_URL).then(() => { artReady = true; });
// Order 5: zone-based lazy art groups (resident decoded memory <= 32 MiB). Loading screens wait for the destination's groups.
const zones = new ZoneTracker();
let artWait: Promise<void> | null = null, artDone = true, artWaitT = 0;
const needArt = (groups: string[]) => { artDone = false; artWaitT = 0; artWait = art.setGroups(groups).then(() => { artDone = true; }); };

let screen: Screen = 'title';
let game: Game | null = null;
let loadT = 0;
const go = (s: Screen) => { screen = s; scr.t = 0; audio.play('ui_click'); if (s === 'menu' || s === 'title') audio.play('music_title'); };
const startGame = (g: Game) => { game = g; hud.closeAll(); hud.menu = 'none'; screen = 'loading'; loadT = 0.6; audio.play(g.cur === 'town' ? 'music_town' : 'music_l1'); };
const hud = new Hud(() => game!, {
  save: () => { if (game) { (hud.stow(), saveGame(localStorage, game)); game.say('Game saved'); } },
  load: () => { if (game) { const g = loadGame(localStorage, game.hero.name); if (g) startGame(g); else game.say('No saved game'); } },
  newGame: () => { game = null; go('menu'); },
  quit: () => { if (game) (hud.stow(), saveGame(localStorage, game)); game = null; go('menu'); },
  setVolumes: (m, s) => { audio.setVolumes(m, s); localStorage.setItem('cot.options', JSON.stringify({ music: m, sfx: s })); },
  vol: () => [audio.musicVol, audio.sfxVol],
});
const scr = new Screens({
  go, heroes: () => listHeroes(localStorage), peek: (n) => peekHero(localStorage, n),
  load: (n) => { const g = loadGame(localStorage, n); if (g) startGame(g); },
  del: (n) => deleteHero(localStorage, n),
  create: (name, cls) => { const g = new Game(name, cls); saveGame(localStorage, g); startGame(g); },
  nameInput: () => nameInput, credits: creditsText,
  focusName: () => { placeName(); nameInput.focus({ preventScroll: true }); }, // synchronous, inside the tap: phones open the keyboard
});
// Order 8: Enter / Done submits the form (Android IMEs often send keyCode 229 on keydown, so rely on the form's submit)
nameForm.addEventListener('submit', (e) => { e.preventDefault(); if (screen === 'name') scr.submitName(); });
nameCancel.addEventListener('click', () => { if (screen === 'name') scr.cancelName(); });
nameInput.addEventListener('blur', () => { if (window.scrollX || window.scrollY) window.scrollTo(0, 0); }); // undo iOS's keyboard pan
/** Show/position the HTML name form over the canvas-drawn name box and buttons (or hide it off the name screen). */
let nameKey = '';
function placeName() {
  const on = screen === 'name';
  if (!on) { if (nameKey) { nameKey = ''; nameForm.classList.remove('on'); if (document.activeElement === nameInput) nameInput.blur(); } return; }
  const l = frontLayout(W, H, vv()), key = `${l.s},${l.ox},${l.oy},${scr.cls}`;
  if (key === nameKey) return;
  nameKey = key; nameForm.classList.add('on');
  nameInput.placeholder = CLASSES[scr.cls].name;
  for (const [el, b] of [[nameInput, NAME_BOX], [nameOk, NAME_OK], [nameCancel, NAME_CANCEL]] as const) {
    const r = cssRect(l, b); Object.assign(el.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  }
  nameInput.style.fontSize = `${inputFontPx(l.s)}px`;
}
const vv = () => window.visualViewport ? { width: visualViewport!.width, height: visualViewport!.height, offsetLeft: visualViewport!.offsetLeft, offsetTop: visualViewport!.offsetTop } : null;

// ---- full-screen sizing (no black bars), DPR-crisp backing store, safe-area insets ----
let W = 844, H = 390, dpr = 1;
const inset = { l: 0, r: 0, t: 0, b: 0 };
function fit() {
  W = window.innerWidth; H = window.innerHeight; dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
  const cs = getComputedStyle(safe);
  inset.l = parseFloat(cs.paddingLeft) || 0; inset.r = parseFloat(cs.paddingRight) || 0; inset.t = parseFloat(cs.paddingTop) || 0; inset.b = parseFloat(cs.paddingBottom) || 0;
  // Order 9: world zoom shows about D1's 640x352 play area (same area, the phone's aspect): on 844x390 that is ~698x323 world px.
  // The HUD and touch controls are drawn in css px, so they keep their size.
  // Order 10 U3: zoomed out 1.62x from that (between D1 and Diablo Immortal): the hero is ~72 px tall on 844x390; the HUD keeps its size.
  view.zoom = worldZoom(W, H); view.w = W / view.zoom; view.h = H / view.zoom;
  hud.lay = { W, H, dpr, inset: { ...inset } };
}
addEventListener('resize', fit); addEventListener('orientationchange', () => setTimeout(fit, 200)); fit();
// Order 8: the phone keyboard resizes (Android) or pans (iOS) the visual viewport; re-fit and keep the name box visible
window.visualViewport?.addEventListener('resize', () => { fit(); placeName(); });
window.visualViewport?.addEventListener('scroll', placeName);

// ---- browser behaviour: no zoom / scroll / long-press menu; fullscreen + landscape lock on first tap ----
// (never on the name form: its input needs the default focus, caret, selection and keyboard behaviour; Order 8)
for (const ev of ['contextmenu', 'gesturestart', 'dblclick', 'selectstart']) document.addEventListener(ev, (e) => { if (!isFormTarget(e.target)) e.preventDefault(); }, { passive: false });
document.addEventListener('touchmove', (e) => { if (!isFormTarget(e.target)) e.preventDefault(); }, { passive: false });
let wentFull = false;
function goFullscreen() {
  // Order 8: never while the name form is up: entering fullscreen / locking orientation resizes the page and drops focus
  if (wentFull || screen === 'name') return; wentFull = true;
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  const lock = () => { const o = window.screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }; o?.lock?.('landscape').catch(() => {}); };
  try {
    if (el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).then(lock).catch(lock);
    else { el.webkitRequestFullscreen?.(); lock(); }
  } catch { /* not allowed: ignore */ }
}
const buzz = (p: number | number[]) => { try { navigator.vibrate?.(p); } catch { /* unsupported */ } };

// ---- multi-touch input ----
interface Ptr { kind: 'joy' | 'press' | 'box' | 'world'; box?: Box | null; x0: number; y0: number; held: boolean; timer: number; scroll?: string; moved?: boolean; ly?: number; lx?: number }
const ptrs = new Map<number, Ptr>();
const css = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault(); audio.unlock(); goFullscreen();
  try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
  const p = css(e), b = ui.hit(p.x, p.y);
  const ptr: Ptr = { kind: 'box', box: b, x0: p.x, y0: p.y, held: false, timer: 0, lx: p.x, ly: p.y };
  hud.pointer = { x: p.x, y: p.y };
  const reg = ui.scrollAt(p.x, p.y); // U4: a touch inside a list can become a drag-scroll
  if (reg && !b?.down) { ptr.scroll = reg.key; hud.scrollStart(reg.key, e.timeStamp / 1000); }
  if (b?.down) { ptr.kind = 'press'; b.down(); }
  else if (!b && screen === 'game' && game && !game.dead && p.x < W / 2 && !hud.covers(p.x) && !hud.map) {
    ptr.kind = 'joy'; hud.joy = { ox: p.x, oy: p.y, tx: p.x, ty: p.y }; game.move = { x: 0, y: 0, mag: 0 };
  } else if (!b && screen === 'game') ptr.kind = 'world';
  if (ptr.kind === 'box' && b?.hold) ptr.timer = window.setTimeout(() => { if (ptr.moved) return; ptr.held = true; b.hold!(); buzz(10); }, HOLD_MS);
  ptrs.set(e.pointerId, ptr);
});
canvas.addEventListener('pointermove', (e) => {
  const ptr = ptrs.get(e.pointerId); if (!ptr) return;
  const p = css(e);
  if (ptr.kind === 'joy' && game && hud.joy) { hud.joy.tx = p.x; hud.joy.ty = p.y; game.move = joystickVector(hud.joy.ox, hud.joy.oy, p.x, p.y); }
  else if (ptr.kind === 'box') {
    hud.pointer = { x: p.x, y: p.y };
    if (ptr.held && hud.drag) { hud.moveDrag(p.x, p.y); return; } // U8: the item follows the finger
    if (!ptr.moved && Math.hypot(p.x - ptr.x0, p.y - ptr.y0) >= TAP_SLOP) { ptr.moved = true; clearTimeout(ptr.timer); } // U4: a drag is never a tap
    if (ptr.moved && ptr.scroll) hud.scrollDrag(ptr.scroll, p.x - (ptr.lx ?? p.x), p.y - (ptr.ly ?? p.y), e.timeStamp / 1000);
    ptr.lx = p.x; ptr.ly = p.y;
  }
});
const end = (e: PointerEvent, cancel: boolean) => {
  const ptr = ptrs.get(e.pointerId); if (!ptr) return;
  ptrs.delete(e.pointerId); clearTimeout(ptr.timer);
  const p = css(e);
  if (ptr.kind === 'joy') { if (game) game.move = null; hud.joy = null; return; }
  if (ptr.kind === 'press') { ptr.box?.up?.(); return; }
  if (ptr.scroll) hud.scrollEnd(ptr.scroll, e.timeStamp / 1000);
  if (ptr.held && hud.drag) { if (cancel) hud.drag = null; else hud.endDrag(p.x, p.y); return; } // U8 drop (cancel = snap back)
  if (cancel || ptr.held || ptr.moved) return;
  if (ptr.kind === 'box') { const b = ui.hit(p.x, p.y); if (b && b === ptr.box || b && ptr.box && b.tap === ptr.box.tap) b.tap?.(); else if (ptr.box && Math.hypot(p.x - ptr.x0, p.y - ptr.y0) < TAP_SLOP) ptr.box.tap?.(); return; }
  if (ptr.kind === 'world' && game && screen === 'game' && !hud.covers(p.x)) {
    // tap-to-interact: monsters (soft-lock + attack), NPCs, items, objects, doors. Floor taps do nothing (no tap-to-move).
    const t = pickAt(game, p.x / view.zoom, p.y / view.zoom);
    if (t.kind !== 'tile') game.tap(t);
    else { const tt = game.level.map.tiles[t.y * game.level.map.w + t.x]; const pp = game.portal && (game.cur === 'town' ? TOWN_PORTAL_SPOT : game.portal); if (tt === T.UP || tt === T.DOWN || (pp && pp.x === t.x && pp.y === t.y)) game.tap({ kind: 'stairs', x: t.x, y: t.y }); }
  }
};
canvas.addEventListener('pointerup', (e) => { e.preventDefault(); end(e, false); });
// a tap on the canvas must not move focus (compat mousedown would blur the name input the tap handler just focused)
canvas.addEventListener('mousedown', (e) => e.preventDefault());
canvas.addEventListener('pointercancel', (e) => end(e, true));
addEventListener('keydown', (e) => { if (e.key === 'Escape' && screen === 'game') hud.menu = hud.menu === 'none' ? 'main' : 'none'; });

// ---- frame loop (rAF, fixed-step-free: dt clamped like Order 3) + fps meter ----
let last = performance.now(), time = 0, frames = 0, fpsT = 0, fps = 0;
const fpsLog: number[] = [];
let workMs = 0;
const workLog: number[] = [];
function frame(now: number) {
  const w0 = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
  frames++; fpsT += dt; if (fpsT >= 1) { fps = frames / fpsT; fpsLog.push(Math.round(fps)); if (fpsLog.length > 120) fpsLog.shift(); frames = 0; fpsT = 0; }
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  ui.begin(c, dpr);
  if (screen === 'game' && game) {
    if (hud.menu === 'none' && !game.dialog) game.update(dt);
    if (artReady) void art.setGroups(zones.update(game, dt));
    if (game.pendingLevel) { needArt(wantedGroups(game.pendingLevel.to === 'town' ? 'town' : 'cathedral', game.hero.cls)); screen = 'loading'; loadT = 0.6; scr.t = 0; game.move = null; game.attackHeld = false; hud.joy = null; hud.attackDown = false; }
    for (const s of game.sfx) { audio.play(s); if (s === 'hit') buzz(15); else if (s === 'player_hit') buzz(40); else if (s === 'player_die') buzz([80, 50, 80]); }
    game.sfx.length = 0;
    c.setTransform(dpr * view.zoom, 0, 0, dpr * view.zoom, 0, 0);
    drawWorld(c, game, time);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    hud.draw(ui);
  } else {
    // front-end screens keep their D1 640x480 layout, centred over a full-screen backdrop
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    const { s, ox, oy } = frontLayout(W, H, vv());
    c.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
    if (screen === 'loading') {
      scr.draw(ui, 'loading', dt);
      loadT -= dt; artWaitT += dt;
      if (game && artReady && !artWait) needArt(zones.update(game, 0));
      if (loadT <= 0 && game && artReady && (artDone || artWaitT > 8)) { artWait = null; game.finishTravel(); for (const sf of game.sfx) audio.play(sf); game.sfx.length = 0; screen = 'game'; }
    } else { if (artReady && !game) void art.setGroups(zones.update(null, dt)); scr.draw(ui, screen, dt); }
  }
  placeName();
  workMs += performance.now() - w0;
  if (frames === 0 && fpsLog.length) { workLog.push(+(workMs / Math.max(1, fpsLog[fpsLog.length - 1])).toFixed(2)); workMs = 0; if (workLog.length > 120) workLog.shift(); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
if (location.search.includes('smoke')) (window as unknown as { __cot: unknown }).__cot = { get game() { return game; }, get screen() { return screen; }, get fps() { return fpsLog.slice(); }, get workMs() { return workLog.slice(); }, hud, view, ui, drawWorld: (cx: CanvasRenderingContext2D, t: number) => game && drawWorld(cx, game, t), size: () => [W, H, dpr], frame: (id: string) => art.frame(id), get art() { return { mib: art.mib, peak: art.peakMib, resident: art.residentKeys(), zone: zones.zone, engaged: zones.engaged, loads: art.loads, releases: art.releases, errors: art.errors }; } }; // read-only handle, only with ?smoke (headless smoke test)
