// Order 27 (Canon Order 25 reason 2): every Rogue sheet has 8 distinct, non-empty direction rows, and each side/diagonal row
// faces the way its label says on screen (label 'e' = engine W faces screen LEFT, 'w' faces right, 'se' = engine SW down-left...).
// Absolute facing comes from two cues the renders can't fake: the walk's planted foot slides backward under the in-place
// walk cycle, and each arrow sprite's tail (its anchor) sits behind its flight. The other actions are tied to those rows:
// idle, ready and the first death frames must look more like the walk row of their own label than like the walk row of the
// mirrored label (e <-> w, se <-> sw, ne <-> nw); attack, hit and cast likewise against the ready rows.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { DIR_NAME, type ArtManifest, type Frame } from '../src/art';
import { DIRS } from '../src/iso';

function readPng(file: string): { w: number; h: number; px: Uint8Array } {
  const b = fs.readFileSync(file); let o = 8, w = 0, h = 0; const idat: Buffer[] = [];
  while (o < b.length) {
    const len = b.readUInt32BE(o), type = b.toString('ascii', o + 4, o + 8), d = b.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); assert.ok(d[8] === 8 && d[9] === 6 && d[12] === 0, `${file}: 8-bit RGBA, not interlaced`); }
    if (type === 'IDAT') idat.push(d);
    o += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), px = new Uint8Array(w * h * 4), st = w * 4;
  for (let y = 0; y < h; y++) {
    const f = raw[y * (st + 1)], src = y * (st + 1) + 1;
    for (let x = 0; x < st; x++) {
      const a = x >= 4 ? px[y * st + x - 4] : 0, up = y ? px[(y - 1) * st + x] : 0, c = x >= 4 && y ? px[(y - 1) * st + x - 4] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
      px[y * st + x] = v & 255;
    }
  }
  return { w, h, px };
}
const m: ArtManifest = JSON.parse(fs.readFileSync('public/art/manifest.json', 'utf8'));
const png = new Map<string, ReturnType<typeof readPng>>(), byId = new Map<string, { f: Frame; file: string }>();
for (const a of m.assets.filter((x) => x.key.startsWith('heroes/rogue-'))) { png.set(a.file, readPng(`public/art/${a.file}`)); for (const f of a.frames!) byId.set(f.id, { f, file: a.file }); }
const get = (id: string) => { const e = byId.get(id); assert.ok(e, id); return e!; };
/** The frame on a fixed canvas with its feet anchor at (CX, CY): premultiplied RGB + alpha. */
const CW = 112, CH = 176, CX = 56, CY = 140;
function canvas(id: string) {
  const { f, file } = get(id), p = png.get(file)!, rgb = new Float32Array(CW * CH * 3), al = new Uint8Array(CW * CH);
  const ox = Math.round(CX - f.ax), oy = Math.round(CY - f.ay);
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
    const cx = ox + x, cy = oy + y; if (cx < 0 || cy < 0 || cx >= CW || cy >= CH) continue;
    const i = ((f.y + y) * p.w + f.x + x) * 4, a = p.px[i + 3] / 255, j = cy * CW + cx;
    rgb[j * 3] = p.px[i] * a; rgb[j * 3 + 1] = p.px[i + 1] * a; rgb[j * 3 + 2] = p.px[i + 2] * a; al[j] = p.px[i + 3];
  }
  return { rgb, al };
}
/** Normalized cross-correlation, best over +-4 px horizontal shifts. */
function ncc(a: Float32Array, b: Float32Array): number {
  let best = -1; const n = a.length, ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  for (let s = -4; s <= 4; s++) {
    let xy = 0, xx = 0, yy = 0;
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const xs = x - s; if (xs < 0 || xs >= CW) continue;
      for (let c = 0; c < 3; c++) { const u = a[(y * CW + x) * 3 + c] - ma, v = b[(y * CW + xs) * 3 + c] - mb; xy += u * v; xx += u * u; yy += v * v; }
    }
    best = Math.max(best, xy / Math.sqrt(xx * yy + 1e-9));
  }
  return best;
}
const median = (v: number[]) => [...v].sort((p, q) => p - q)[v.length >> 1];
const an = m.anims.rogue, ACTIONS = Object.keys(an.actions);
const MIRROR: Record<string, string> = { se: 'sw', sw: 'se', e: 'w', w: 'e', ne: 'nw', nw: 'ne' };
// screen x of each label's engine facing: <0 faces left
const screenX = (label: string) => { const d = DIRS[DIR_NAME.indexOf(label as typeof DIR_NAME[number])]; return d.x - d.y; };

// ---- 1. no empty frame, no two direction rows (nor any frame of two rows) pixel-identical (every Rogue action + the arrow sprites) ----
const hash = (id: string) => { const { al, rgb } = canvas(id); let h = 2166136261; for (let i = 0; i < al.length; i++) { h = Math.imul(h ^ al[i], 16777619); h = Math.imul(h ^ (rgb[i * 3] | 0), 16777619); } return h >>> 0; };
for (const act of [...ACTIONS, 'arrow']) {
  const rows = DIR_NAME.map((L) => {
    const ids = act === 'arrow' ? [`arrow:${L}`] : Array.from({ length: an.actions[act].n }, (_, i) => `rogue:${act}:${L}:${i}`);
    for (const id of ids) assert.ok(canvas(id).al.some((v) => v > 128), `${id} is empty`);
    return ids.map(hash);
  });
  for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) rows[i].forEach((h, k) => assert.notEqual(h, rows[j][k], `rogue ${act} frame ${k}: rows ${DIR_NAME[i]} and ${DIR_NAME[j]} are pixel-identical`));
  for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) assert.notEqual(rows[i].join(','), rows[j].join(','), `rogue ${act}: rows ${DIR_NAME[i]} and ${DIR_NAME[j]} are pixel-identical`);
}
// ---- 2. absolute facing: the walk's planted foot slides backward; the arrow's tail is behind its flight ----
const walkSlide: Record<string, number> = {};
for (const L of Object.keys(MIRROR)) {
  const xs = Array.from({ length: an.actions.walk.n }, (_, i) => {
    const { al } = canvas(`rogue:walk:${L}:${i}`); let b = 0; for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) if (al[y * CW + x] > 128) b = y;
    let s = 0, n = 0; for (let y = b - 2; y <= b; y++) for (let x = 0; x < CW; x++) if (al[y * CW + x] > 128) { s += x; n++; }
    return s / n;
  });
  const slide = median(xs.map((x, i) => xs[(i + 1) % xs.length] - x)); walkSlide[L] = slide;
  assert.ok(Math.sign(-slide) === Math.sign(screenX(L)) && Math.abs(slide) >= 1, `walk ${L}: the planted foot slides ${slide.toFixed(2)} px/frame, so the row faces screen ${slide > 0 ? 'left' : 'right'}`);
}
for (const L of DIR_NAME) {
  const { f } = get(`arrow:${L}`), d = DIRS[DIR_NAME.indexOf(L)], vx = (d.x - d.y) * 32, vy = (d.x + d.y) * 16;
  assert.ok((f.ax - f.w / 2) * vx + (f.ay - f.h / 2) * vy < 0, `arrow:${L}: the tail (anchor) is behind the flight direction`);
}
// ---- 3. every other action's side/diagonal rows face the same way as the walk (or the ready) row of their label ----
const rowCache = new Map<string, Float32Array[]>();
const rowOf = (act: string, L: string, n: number) => { const k = `${act}:${L}`; if (!rowCache.has(k)) rowCache.set(k, Array.from({ length: n }, (_, i) => canvas(`rogue:${act}:${L}:${i}`).rgb)); return rowCache.get(k)!; };
const report: string[] = [];
for (const [act, ref, frames] of [['idle', 'walk', 0], ['ready', 'walk', 0], ['death', 'walk', 3], ['attack', 'ready', 0], ['hit', 'ready', 0], ['cast', 'ready', 0]] as const) {
  const n = an.actions[act].n, use = frames || n, refN = an.actions[ref].n;
  for (const L of Object.keys(MIRROR)) {
    const own = rowOf(ref, L, refN), mir = rowOf(ref, MIRROR[L], refN);
    const d = Array.from({ length: use }, (_, i) => { const u = canvas(`rogue:${act}:${L}:${i}`).rgb; return Math.max(...own.map((w) => ncc(u, w))) - Math.max(...mir.map((w) => ncc(u, w))); });
    const md = median(d); report.push(`${act}:${L} ${md >= 0 ? '+' : ''}${md.toFixed(3)}`);
    assert.ok(md > 0, `rogue ${act} row '${L}' faces the wrong way: it matches the ${ref} row '${MIRROR[L]}' (screen ${screenX(MIRROR[L]) < 0 ? 'left' : 'right'}) better than '${L}' (median ${md.toFixed(3)})`);
  }
}
console.log(`rogue rows: OK (${ACTIONS.length} actions + arrows: 8 distinct non-empty rows; walk foot slide ${Object.entries(walkSlide).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' ')}; facing margins ${report.join(' ')})`);
