// UI sample (Order 15 scope change): self-made canvas skin for the in-game HUD — carved-stone / wrought-iron frames,
// glassy life and mana globes with a slosh and shine, a slim XP bar, metal-rimmed round sockets with an inner bevel, a
// pressed state (scale + glow), a cooldown sweep, and a translucent rune-ring joystick with a gripped thumb.
// Everything is drawn with Canvas 2D (no image assets); the only file is the OFL Cinzel font (public/fonts).
export const HUD_FONT = '"Cinzel", "Times New Roman", serif';
/** Readable body face (OFL IM Fell English, local subset) for descriptions, dialogue and item lines. */
export const BODY_FONT = '"IM Fell English", Georgia, "Times New Roman", serif';
const TAU = Math.PI * 2;
let stoneTex: CanvasPattern | null | undefined;
/** 64x64 stone noise tile, built once (self-made, ~16 KB in memory). */
function stone(c: CanvasRenderingContext2D): CanvasPattern | null {
  if (stoneTex !== undefined) return stoneTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const x = cv.getContext('2d'); if (!x) return (stoneTex = null);
  x.fillStyle = '#1c1812'; x.fillRect(0, 0, 64, 64);
  let s = 1234567; const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 900; i++) { const v = rnd(); x.fillStyle = v < 0.5 ? `rgba(0,0,0,${0.15 + rnd() * 0.25})` : `rgba(120,104,80,${0.05 + rnd() * 0.12})`; x.fillRect(Math.floor(rnd() * 64), Math.floor(rnd() * 64), 1 + Math.floor(rnd() * 2), 1); }
  x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 1;
  for (let i = 0; i < 5; i++) { x.beginPath(); let px = rnd() * 64, py = rnd() * 64; x.moveTo(px, py); for (let k = 0; k < 4; k++) { px += (rnd() - 0.5) * 14; py += (rnd() - 0.5) * 14; x.lineTo(px, py); } x.stroke(); }
  return (stoneTex = c.createPattern(cv, 'repeat'));
}
function rrect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { c.beginPath(); c.roundRect(x, y, w, h, r); }
/** Carved-stone plate in a wrought-iron border with a thin gold inner line and corner rivets. */
function ironFrameRaw(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, o: { r?: number; alpha?: number; rivets?: boolean } = {}) {
  const r = o.r ?? 6; c.save(); c.globalAlpha *= o.alpha ?? 1;
  c.shadowColor = 'rgba(0,0,0,0.7)'; c.shadowBlur = 6; c.shadowOffsetY = 2;
  rrect(c, x, y, w, h, r); c.fillStyle = '#16120d'; c.fill(); c.shadowColor = 'transparent';
  const p = stone(c); if (p) { c.fillStyle = p; c.globalAlpha *= 0.9; c.fill(); c.globalAlpha /= 0.9; }
  const sh = c.createLinearGradient(0, y, 0, y + h); sh.addColorStop(0, 'rgba(255,240,200,0.07)'); sh.addColorStop(0.5, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.35)');
  c.fillStyle = sh; c.fill();
  const ir = c.createLinearGradient(0, y, 0, y + h); ir.addColorStop(0, '#6e6a64'); ir.addColorStop(0.45, '#2a2825'); ir.addColorStop(1, '#4a4640');
  c.strokeStyle = ir; c.lineWidth = 3; rrect(c, x + 1.5, y + 1.5, w - 3, h - 3, r); c.stroke();
  c.strokeStyle = 'rgba(200,160,80,0.55)'; c.lineWidth = 1; rrect(c, x + 4, y + 4, w - 8, h - 8, Math.max(1, r - 3)); c.stroke();
  if (o.rivets !== false) for (const [px, py] of [[x + 5, y + 5], [x + w - 5, y + 5], [x + 5, y + h - 5], [x + w - 5, y + h - 5]]) {
    const g = c.createRadialGradient(px - 0.7, py - 0.7, 0.2, px, py, 2.4); g.addColorStop(0, '#e8dcc0'); g.addColorStop(0.5, '#8a8070'); g.addColorStop(1, '#2a2620');
    c.fillStyle = g; c.beginPath(); c.arc(px, py, 2.2, 0, TAU); c.fill();
  }
  c.restore();
}
/** Glassy liquid globe (D1 red / blue): dark socket, sloshing liquid surface, depth shading, specular shine, iron rim. */
export function glassOrb(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, f: number, hue: 'life' | 'mana' | 'shield', t: number) {
  f = Math.max(0, Math.min(1, f));
  const col = { life: ['#ff5a3a', '#b01010', '#3a0404'], mana: ['#6a8cff', '#1a3ac8', '#060c3a'], shield: ['#c090ff', '#6030b0', '#1a0838'] }[hue];
  c.save();
  // socket
  c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.fillStyle = '#07060a'; c.fill();
  c.save(); c.beginPath(); c.arc(cx, cy, r - 1, 0, TAU); c.clip();
  if (f > 0) {
    const top = cy + r - 2 * r * f, amp = f > 0.02 && f < 0.98 ? 1.6 : 0;
    c.beginPath(); c.moveTo(cx - r, top);
    for (let i = 0; i <= 12; i++) { const px = cx - r + (2 * r * i) / 12; c.lineTo(px, top + Math.sin(t * 2.2 + i * 0.75) * amp + Math.sin(t * 1.3 - i * 0.4) * amp * 0.6); }
    c.lineTo(cx + r, cy + r); c.lineTo(cx - r, cy + r); c.closePath();
    const lg = c.createRadialGradient(cx - r * 0.3, cy - r * 0.2, r * 0.1, cx, cy, r * 1.05); lg.addColorStop(0, col[0]); lg.addColorStop(0.55, col[1]); lg.addColorStop(1, col[2]);
    c.fillStyle = lg; c.fill();
    // surface glint
    if (amp) { c.strokeStyle = 'rgba(255,255,255,0.28)'; c.lineWidth = 1; c.beginPath(); for (let i = 2; i <= 10; i++) { const px = cx - r + (2 * r * i) / 12, py = top + Math.sin(t * 2.2 + i * 0.75) * amp + Math.sin(t * 1.3 - i * 0.4) * amp * 0.6; if (i === 2) c.moveTo(px, py); else c.lineTo(px, py); } c.stroke(); }
    // rising motes
    c.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 0; i < 4; i++) { const ph = (t * 0.25 + i * 0.27) % 1, py = cy + r - ph * 2 * r * f; if (py > top + 2) { c.beginPath(); c.arc(cx + Math.sin(i * 2.1 + t) * r * 0.5, py, 0.9, 0, TAU); c.fill(); } }
  }
  // glass depth: dark edge vignette
  const vg = c.createRadialGradient(cx, cy, r * 0.55, cx, cy, r); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  c.fillStyle = vg; c.fillRect(cx - r, cy - r, 2 * r, 2 * r);
  // specular shine (slow drift)
  const sx = cx - r * 0.35 + Math.sin(t * 0.6) * r * 0.04, sy = cy - r * 0.42;
  const sp = c.createRadialGradient(sx, sy, 0, sx, sy, r * 0.5); sp.addColorStop(0, 'rgba(255,255,255,0.55)'); sp.addColorStop(0.4, 'rgba(255,255,255,0.12)'); sp.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = sp; c.beginPath(); c.ellipse(sx, sy, r * 0.45, r * 0.3, -0.5, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 1.2; c.beginPath(); c.arc(cx, cy, r * 0.8, Math.PI * 0.6, Math.PI * 0.95); c.stroke();
  c.restore();
  // iron rim + gold line
  const rg = c.createLinearGradient(cx, cy - r, cx, cy + r); rg.addColorStop(0, '#8a857c'); rg.addColorStop(0.5, '#2c2a26'); rg.addColorStop(1, '#5a554c');
  c.strokeStyle = rg; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, r + 0.5, 0, TAU); c.stroke();
  c.strokeStyle = 'rgba(214,170,80,0.7)'; c.lineWidth = 1; c.beginPath(); c.arc(cx, cy, r + 2.5, 0, TAU); c.stroke();
  c.restore();
}
/** Slim XP bar: inset groove, gold fill with a sheen, tick every 10 %. */
export function xpBar(c: CanvasRenderingContext2D, x: number, y: number, w: number, f: number) {
  f = Math.max(0, Math.min(1, f)); const h = 4;
  c.save();
  rrect(c, x - 1, y - 1, w + 2, h + 2, 3); c.fillStyle = '#050403'; c.fill(); c.strokeStyle = 'rgba(160,130,70,0.6)'; c.lineWidth = 1; c.stroke();
  if (f > 0) { const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#ffe7a0'); g.addColorStop(0.5, '#d8a038'); g.addColorStop(1, '#7a5010'); c.fillStyle = g; rrect(c, x, y, Math.max(2, w * f), h, 2); c.fill(); }
  c.fillStyle = 'rgba(0,0,0,0.55)'; for (let i = 1; i < 10; i++) c.fillRect(Math.round(x + (w * i) / 10), y, 1, h);
  c.restore();
}
export interface SocketOpts { pressed?: boolean; rim?: 'iron' | 'gold'; tint?: string; glow?: string; dim?: boolean }
/** Round metal-rimmed socket with an inner bevel. Pressed: scaled to 94 % with a glow. Returns the drawn radius. */
export function socket(c: CanvasRenderingContext2D, x: number, y: number, r: number, o: SocketOpts = {}): number {
  const rr = o.pressed ? r * 0.94 : r, ri = rr - Math.max(3, rr * 0.12);
  const key = `sock|${r}|${o.rim ?? 'iron'}|${o.tint ?? ''}|${o.pressed ? 1 : 0}|${o.glow ?? ''}|${o.dim ? 1 : 0}`;
  cached(c, key, x - r, y - r, 2 * r, 2 * r, 14, (g) => socketRaw(g, r, r, r, o));
  return ri;
}
function socketRaw(c: CanvasRenderingContext2D, x: number, y: number, r: number, o: SocketOpts = {}): number {
  const rr = o.pressed ? r * 0.94 : r; c.save();
  if (o.pressed) { c.shadowColor = o.glow ?? 'rgba(255,150,60,0.9)'; c.shadowBlur = 16; }
  else { c.shadowColor = 'rgba(0,0,0,0.75)'; c.shadowBlur = 6; c.shadowOffsetY = 2; }
  // outer metal rim
  const gold = o.rim === 'gold';
  const rg = c.createLinearGradient(x - rr, y - rr, x + rr, y + rr);
  if (gold) { rg.addColorStop(0, '#f4d690'); rg.addColorStop(0.35, '#a87a30'); rg.addColorStop(0.65, '#5a3c12'); rg.addColorStop(1, '#c8a050'); }
  else { rg.addColorStop(0, '#a49e94'); rg.addColorStop(0.4, '#55514a'); rg.addColorStop(0.7, '#25231f'); rg.addColorStop(1, '#6a655c'); }
  c.fillStyle = rg; c.beginPath(); c.arc(x, y, rr, 0, TAU); c.fill(); c.shadowColor = 'transparent';
  // inner well with bevel (dark top-left lip, light bottom-right lip)
  const ri = rr - Math.max(3, rr * 0.12);
  const bv = c.createLinearGradient(x - ri, y - ri, x + ri, y + ri); bv.addColorStop(0, 'rgba(0,0,0,0.85)'); bv.addColorStop(1, 'rgba(255,230,180,0.35)');
  c.fillStyle = bv; c.beginPath(); c.arc(x, y, ri + 1, 0, TAU); c.fill();
  const ig = c.createRadialGradient(x, y - ri * 0.35, ri * 0.1, x, y, ri);
  const tint = o.tint ?? '#2a2219';
  ig.addColorStop(0, shade(tint, 1.35)); ig.addColorStop(0.7, tint); ig.addColorStop(1, shade(tint, 0.4));
  c.fillStyle = ig; c.beginPath(); c.arc(x, y, ri - 0.5, 0, TAU); c.fill();
  // glass gleam
  const gl = c.createLinearGradient(0, y - ri, 0, y); gl.addColorStop(0, 'rgba(255,255,255,0.16)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = gl; c.beginPath(); c.ellipse(x, y - ri * 0.45, ri * 0.75, ri * 0.45, 0, 0, TAU); c.fill();
  if (o.pressed) { c.strokeStyle = o.glow ?? 'rgba(255,170,80,0.9)'; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, ri - 1, 0, TAU); c.stroke(); }
  if (o.dim) { c.fillStyle = 'rgba(0,0,0,0.45)'; c.beginPath(); c.arc(x, y, ri, 0, TAU); c.fill(); }
  c.restore();
  return ri;
}
/** Clockwise cooldown / recovery sweep over a socket's well, with a bright leading edge. f = remaining fraction. */
export function sweep(c: CanvasRenderingContext2D, x: number, y: number, r: number, f: number, col = 'rgba(0,0,0,0.62)') {
  if (f <= 0) return; f = Math.min(1, f);
  const a0 = -Math.PI / 2, a1 = a0 + TAU * f;
  c.save(); c.fillStyle = col; c.beginPath(); c.moveTo(x, y); c.arc(x, y, r, a0, a1); c.closePath(); c.fill();
  if (f < 1) { c.strokeStyle = 'rgba(255,220,150,0.85)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a1) * r, y + Math.sin(a1) * r); c.stroke(); }
  c.restore();
}
// Elder-Futhark-like rune strokes (self-made line glyphs, unit box -1..1).
const RUNES: number[][][] = [
  [[0, -1, 0, 1], [0, -0.4, 0.6, -0.9], [0, 0.1, 0.6, -0.4]],            // fehu
  [[-0.5, 1, -0.5, -1], [-0.5, -1, 0.5, -0.3], [0.5, -0.3, 0.5, 1]],     // uruz
  [[0, -1, 0, 1], [0, -0.5, 0.5, 0], [0.5, 0, 0, 0.5]],                  // thurisaz
  [[0, -1, 0, 1], [0, -0.6, 0.5, -1], [0, -0.6, -0.5, -1]],              // algiz
  [[-0.5, -1, 0.5, 0], [0.5, 0, -0.5, 1]],                               // kenaz
  [[-0.5, -1, 0.5, 1], [0.5, -1, -0.5, 1]],                              // gebo
  [[-0.4, -1, -0.4, 1], [0.4, -1, 0.4, 1], [-0.4, -0.4, 0.4, 0.4]],      // hagalaz
  [[0, -1, 0, 1], [-0.5, -0.3, 0.5, 0.3]],                               // naudiz
];
/** Translucent rune ring (base) with a gripped thumb (knob). */
export function runeJoystick(c: CanvasRenderingContext2D, ox: number, oy: number, R: number, kx: number, ky: number, active: boolean, t: number) {
  c.save();
  const a = active ? 1 : 0.45;
  c.globalAlpha = a;
  // ring body
  const bg = c.createRadialGradient(ox, oy, R * 0.55, ox, oy, R + 8); bg.addColorStop(0, 'rgba(20,14,10,0.10)'); bg.addColorStop(0.8, 'rgba(20,14,10,0.38)'); bg.addColorStop(1, 'rgba(20,14,10,0)');
  c.fillStyle = bg; c.beginPath(); c.arc(ox, oy, R + 8, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(120,110,96,0.75)'; c.lineWidth = 3; c.beginPath(); c.arc(ox, oy, R, 0, TAU); c.stroke();
  c.strokeStyle = 'rgba(214,170,80,0.55)'; c.lineWidth = 1; c.beginPath(); c.arc(ox, oy, R - 11, 0, TAU); c.stroke(); c.beginPath(); c.arc(ox, oy, R + 2.5, 0, TAU); c.stroke();
  // runes (slowly glowing when held)
  const n = RUNES.length, rr = R - 5.5;
  c.lineCap = 'round'; c.lineWidth = 1.3;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * TAU - Math.PI / 2, gx = ox + Math.cos(ang) * rr, gy = oy + Math.sin(ang) * rr;
    const glow = active ? 0.55 + 0.45 * Math.sin(t * 3 + i) : 0.5;
    c.strokeStyle = `rgba(232,190,110,${0.35 + 0.5 * glow})`;
    c.save(); c.translate(gx, gy); c.rotate(ang + Math.PI / 2); c.scale(4.2, 4.2); c.lineWidth = 1.6 / 4.2;
    c.beginPath(); for (const [x1, y1, x2, y2] of RUNES[i]) { c.moveTo(x1, y1); c.lineTo(x2, y2); } c.stroke(); c.restore();
  }
  // direction arc toward the thumb
  if (active && Math.hypot(kx - ox, ky - oy) > 4) { const d = Math.atan2(ky - oy, kx - ox); c.strokeStyle = 'rgba(255,190,90,0.9)'; c.lineWidth = 3; c.beginPath(); c.arc(ox, oy, R, d - 0.45, d + 0.45); c.stroke(); }
  // thumb: domed iron with a knurled grip
  c.globalAlpha = active ? 0.95 : 0.6;
  const kr = 24;
  c.shadowColor = 'rgba(0,0,0,0.7)'; c.shadowBlur = 8; c.shadowOffsetY = 3;
  const kg = c.createRadialGradient(kx - kr * 0.35, ky - kr * 0.4, 2, kx, ky, kr); kg.addColorStop(0, '#9a9286'); kg.addColorStop(0.6, '#4a453e'); kg.addColorStop(1, '#1e1c18');
  c.fillStyle = kg; c.beginPath(); c.arc(kx, ky, kr, 0, TAU); c.fill(); c.shadowColor = 'transparent';
  c.strokeStyle = 'rgba(214,170,80,0.8)'; c.lineWidth = 1.2; c.beginPath(); c.arc(kx, ky, kr - 1, 0, TAU); c.stroke();
  c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1; for (let i = 0; i < 18; i++) { const an = (i / 18) * TAU; c.beginPath(); c.moveTo(kx + Math.cos(an) * (kr - 5), ky + Math.sin(an) * (kr - 5)); c.lineTo(kx + Math.cos(an) * (kr - 2), ky + Math.sin(an) * (kr - 2)); c.stroke(); }
  const pad = c.createRadialGradient(kx - 3, ky - 4, 1, kx, ky, kr * 0.62); pad.addColorStop(0, '#5a5248'); pad.addColorStop(1, '#24211c');
  c.fillStyle = pad; c.beginPath(); c.arc(kx, ky, kr * 0.62, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 1; for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(kx - 7, ky + i * 3.2); c.lineTo(kx + 7, ky + i * 3.2); c.stroke(); }
  c.restore();
}
/** HUD text in Cinzel with a dark outline so it stays legible over the world. */
export function hudText(c: CanvasRenderingContext2D, s: string, x: number, y: number, o: { size?: number; color?: string; align?: CanvasTextAlign; weight?: number } = {}) {
  c.save(); c.font = `${o.weight ?? 700} ${o.size ?? 11}px ${HUD_FONT}`; c.textAlign = o.align ?? 'left'; c.textBaseline = 'middle';
  c.lineJoin = 'round'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.strokeText(s, x, y);
  c.fillStyle = o.color ?? '#e8d8a8'; c.fillText(s, x, y); c.restore();
}
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16), f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Order 16 (staging): cached sprites, the menu skin (panels, wells, rarity slots, buttons, tooltips) on the same look.
// ---------------------------------------------------------------------------------------------------------------------
const sprites = new Map<string, HTMLCanvasElement>();
let cacheHits = 0, cacheMiss = 0;
export const skinCache = { get size() { return sprites.size; }, get hits() { return cacheHits; }, get misses() { return cacheMiss; } };
/** Draw a static graphic through a bitmap cache keyed by (key, size, device scale); blitted on whole device pixels. */
export function cached(c: CanvasRenderingContext2D, key: string, x: number, y: number, w: number, h: number, pad: number, draw: (g: CanvasRenderingContext2D) => void) {
  const m = c.getTransform(), k = Math.round(Math.hypot(m.a, m.b) * 100) / 100;
  if (typeof document === 'undefined' || k <= 0) { c.save(); c.translate(x, y); draw(c); c.restore(); return; }
  const id = `${key}|${w}|${h}|${k}`;
  let cv = sprites.get(id);
  if (!cv) {
    cacheMiss++;
    cv = document.createElement('canvas'); cv.width = Math.ceil((w + 2 * pad) * k); cv.height = Math.ceil((h + 2 * pad) * k);
    const g = cv.getContext('2d')!; g.scale(k, k); g.translate(pad, pad); draw(g);
    sprites.set(id, cv); if (sprites.size > 220) sprites.delete(sprites.keys().next().value!);
  } else cacheHits++;
  const dx = Math.round(m.a * (x - pad) + m.e), dy = Math.round(m.d * (y - pad) + m.f);
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(cv, dx, dy); c.restore();
}
/** Carved-stone plate in a wrought-iron border (cached unless it is panel-sized). */
export function ironFrame(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, o: { r?: number; alpha?: number; rivets?: boolean } = {}) {
  if (w * h > 30000 || o.alpha !== undefined) { ironFrameRaw(c, x, y, w, h, o); return; }
  cached(c, `iron|${o.r ?? 6}|${o.rivets === false ? 0 : 1}`, x, y, w, h, 8, (g) => ironFrameRaw(g, 0, 0, w, h, o));
}
const GOLD = '#d8b058', GOLD_HI = '#f4d690', BLOOD = '#8a1a10';
/** Menu panel: iron border, dark leather-and-stone field, gold inner trim, gold corner brackets, optional title plaque. */
export function skinPanel(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, title?: string) {
  c.save();
  ironFrameRaw(c, x, y, w, h, { r: 7 });
  // leather warmth over the stone
  const lg = c.createRadialGradient(x + w / 2, y + h * 0.4, 10, x + w / 2, y + h / 2, Math.max(w, h) * 0.75);
  lg.addColorStop(0, 'rgba(70,40,22,0.35)'); lg.addColorStop(1, 'rgba(0,0,0,0.35)');
  c.fillStyle = lg; c.beginPath(); c.roundRect(x + 5, y + 5, w - 10, h - 10, 4); c.fill();
  // gold corner brackets
  c.strokeStyle = GOLD; c.lineWidth = 1.4; c.lineCap = 'square';
  const b = 14;
  for (const [cx, cy, sx, sy] of [[x + 8, y + 8, 1, 1], [x + w - 8, y + 8, -1, 1], [x + 8, y + h - 8, 1, -1], [x + w - 8, y + h - 8, -1, -1]]) {
    c.beginPath(); c.moveTo(cx, cy + sy * b); c.lineTo(cx, cy); c.lineTo(cx + sx * b, cy); c.stroke();
    c.fillStyle = GOLD_HI; c.beginPath(); c.arc(cx + sx * 3.5, cy + sy * 3.5, 1.3, 0, TAU); c.fill();
  }
  if (title) titleBar(c, x + 10, y + 8, w - 20, title);
  c.restore();
}
/** Title plaque: blood-red band between gold rules, Cinzel caps. */
export function titleBar(c: CanvasRenderingContext2D, x: number, y: number, w: number, title: string, size = 13) {
  const h = 22;
  const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#4a0e08'); g.addColorStop(0.5, BLOOD); g.addColorStop(1, '#3a0a06');
  c.fillStyle = g; c.fillRect(x + 6, y, w - 12, h);
  c.strokeStyle = GOLD; c.lineWidth = 1;
  c.beginPath(); c.moveTo(x, y + 0.5); c.lineTo(x + w, y + 0.5); c.moveTo(x, y + h - 0.5); c.lineTo(x + w, y + h - 0.5); c.stroke();
  for (const ex of [x, x + w]) { c.fillStyle = GOLD; c.beginPath(); c.moveTo(ex, y + h / 2 - 4); c.lineTo(ex + (ex === x ? 6 : -6), y + h / 2); c.lineTo(ex, y + h / 2 + 4); c.closePath(); c.fill(); }
  hudText(c, title.toUpperCase(), x + w / 2, y + h / 2 + 1, { align: 'center', size, color: GOLD_HI });
}
/** Gold divider rule with a small lozenge in the middle. */
export function divider(c: CanvasRenderingContext2D, x: number, y: number, w: number) {
  const g = c.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, 'rgba(216,176,88,0)'); g.addColorStop(0.5, 'rgba(216,176,88,0.8)'); g.addColorStop(1, 'rgba(216,176,88,0)');
  c.fillStyle = g; c.fillRect(x, y, w, 1);
  c.fillStyle = GOLD; c.beginPath(); c.moveTo(x + w / 2, y - 3); c.lineTo(x + w / 2 + 4, y + 0.5); c.lineTo(x + w / 2, y + 4); c.lineTo(x + w / 2 - 4, y + 0.5); c.closePath(); c.fill();
}
/** Recessed stone well (value boxes, empty slots): dark inset with a bevel lip and a thin iron edge. */
export function well(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, o: { border?: string; glow?: string; fill?: string } = {}) {
  c.save();
  c.fillStyle = o.fill ?? '#0b0907'; c.fillRect(x, y, w, h);
  const ig = c.createLinearGradient(x, y, x, y + h); ig.addColorStop(0, 'rgba(0,0,0,0.7)'); ig.addColorStop(0.25, 'rgba(0,0,0,0)'); ig.addColorStop(1, 'rgba(120,96,60,0.12)');
  c.fillStyle = ig; c.fillRect(x, y, w, h);
  c.strokeStyle = 'rgba(0,0,0,0.9)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x + 0.5, y + h - 0.5); c.lineTo(x + 0.5, y + 0.5); c.lineTo(x + w - 0.5, y + 0.5); c.stroke();
  c.strokeStyle = 'rgba(170,140,90,0.35)'; c.beginPath(); c.moveTo(x + w - 0.5, y + 0.5); c.lineTo(x + w - 0.5, y + h - 0.5); c.lineTo(x + 0.5, y + h - 0.5); c.stroke();
  if (o.border) { if (o.glow) { c.shadowColor = o.glow; c.shadowBlur = 6; } c.strokeStyle = o.border; c.lineWidth = 1.5; c.strokeRect(x + 1.25, y + 1.25, w - 2.5, h - 2.5); }
  c.restore();
}
/** D1 rarity border colours: white normal, blue magic, gold unique; null = no item. */
export function rarityColor(it: { magical: number; identified: boolean; itype: string } | null): string | null {
  if (!it) return null;
  return it.itype === 'ITYPE_GOLD' ? '#e8c040' : it.magical === 2 && it.identified ? '#d8a840' : it.magical ? '#6a8aff' : '#c8c8c0';
}
/** Item slot: a well with the item's rarity border (and a soft glow for magic and unique). */
export function itemSlot(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, it: { magical: number; identified: boolean; itype: string } | null, o: { sel?: boolean; bad?: boolean } = {}) {
  const col = rarityColor(it);
  well(c, x, y, w, h, { border: o.sel ? '#f4d690' : col ?? undefined, glow: o.sel ? 'rgba(244,214,144,0.8)' : it && it.magical ? col ?? undefined : undefined, fill: o.bad ? '#2a0806' : undefined });
}
/** Iron button with a bevel and Cinzel label; on = gold-lit, pressed = sunk + glow, disabled = dim. */
export function skinButton(c: CanvasRenderingContext2D, label: string, x: number, y: number, w: number, h: number, o: { on?: boolean; disabled?: boolean; pressed?: boolean; size?: number; danger?: boolean } = {}) {
  const key = `btn|${o.on ? 1 : 0}|${o.disabled ? 1 : 0}|${o.pressed ? 1 : 0}|${o.danger ? 1 : 0}`;
  cached(c, key, x, y, w, h, 8, (g) => {
    const r = Math.min(6, h / 4);
    if (o.pressed) { g.shadowColor = 'rgba(255,160,70,0.85)'; g.shadowBlur = 10; } else { g.shadowColor = 'rgba(0,0,0,0.7)'; g.shadowBlur = 4; g.shadowOffsetY = 1.5; }
    const rim = g.createLinearGradient(0, 0, 0, h); rim.addColorStop(0, o.on ? GOLD_HI : '#8e887e'); rim.addColorStop(0.5, o.on ? '#8a6420' : '#3a3732'); rim.addColorStop(1, o.on ? '#c89a48' : '#5e5950');
    g.fillStyle = rim; g.beginPath(); g.roundRect(0, 0, w, h, r); g.fill(); g.shadowColor = 'transparent';
    const face = g.createLinearGradient(0, 2, 0, h - 2);
    const top = o.danger ? '#5a1810' : o.on ? '#4a3418' : '#2e2a24', bot = o.danger ? '#2a0806' : o.on ? '#22160a' : '#14120f';
    face.addColorStop(0, o.pressed ? bot : top); face.addColorStop(1, o.pressed ? top : bot);
    g.fillStyle = face; g.beginPath(); g.roundRect(2, 2, w - 4, h - 4, Math.max(1, r - 2)); g.fill();
    g.strokeStyle = 'rgba(255,235,190,0.12)'; g.lineWidth = 1; g.beginPath(); g.moveTo(4, 2.5); g.lineTo(w - 4, 2.5); g.stroke();
    if (o.disabled) { g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.roundRect(0, 0, w, h, r); g.fill(); }
  });
  const sz = o.size ?? Math.min(13, Math.max(9, h * 0.38));
  hudText(c, label, x + w / 2, y + h / 2 + 1 + (o.pressed ? 0.5 : 0), { align: 'center', size: sz, color: o.disabled ? '#6a6050' : o.on ? '#fff0c0' : '#e8d8a8' });
}
/** Close button: a small iron socket with a blood-red well and a gold X. */
export function closeButton(c: CanvasRenderingContext2D, x: number, y: number, pressed = false) {
  cached(c, `close|${pressed ? 1 : 0}`, x, y, 30, 30, 10, (g) => {
    socketRaw(g, 15, 15, 15, { rim: 'iron', tint: '#5a1610', pressed, glow: 'rgba(255,90,40,0.9)' });
    g.strokeStyle = GOLD_HI; g.lineWidth = 2.4; g.lineCap = 'round'; g.beginPath(); g.moveTo(10, 10); g.lineTo(20, 20); g.moveTo(20, 10); g.lineTo(10, 20); g.stroke();
  });
}
/** Up / down arrow drawn as a path (no glyph needed). */
export function arrow(c: CanvasRenderingContext2D, x: number, y: number, up: boolean, col = GOLD_HI) {
  c.fillStyle = col; c.beginPath(); if (up) { c.moveTo(x - 5, y + 3); c.lineTo(x + 5, y + 3); c.lineTo(x, y - 4); } else { c.moveTo(x - 5, y - 3); c.lineTo(x + 5, y - 3); c.lineTo(x, y + 4); } c.closePath(); c.fill();
}
/** Body text in IM Fell (or Cinzel for headers) with no outline, for use on panels. */
export function bodyFont(size: number, head = false, bold = false) { return `${head ? (bold ? 700 : 600) : bold ? 'bold ' : ''}${head ? ' ' : ''}${size}px ${head ? HUD_FONT : BODY_FONT}`.replace(/^ +/, ''); }
