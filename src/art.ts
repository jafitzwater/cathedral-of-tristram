// CC0 art loader. Reads public/art/manifest.json (written by scripts/import-art.mjs from /workspace/tristram-art/).
// Anything without art is drawn with code placeholders (see CREDITS.md "Missing art").
export interface Frame { id: string; x: number; y: number; w: number; h: number; ax: number; ay: number; slots?: [number, number] }
export interface ArtEntry { key: string; type: 'atlas' | 'image' | 'sfx' | 'music'; file: string; frames?: Frame[]; license: string; author: string; source: string }
interface Loaded { img: HTMLImageElement; f: Frame }
const frames: Record<string, Loaded> = {};
const imgs: Record<string, HTMLImageElement> = {};
export async function loadArt(base: string): Promise<ArtEntry[]> {
  try {
    const r = await fetch(`${base}art/manifest.json`);
    if (!r.ok) return [];
    const m = (await r.json()) as { assets: ArtEntry[] };
    for (const e of m.assets) {
      if (e.type !== 'atlas' && e.type !== 'image') continue;
      const img = new Image(); img.src = `${base}art/${e.file}`;
      if (e.type === 'image') imgs[e.key] = img;
      for (const f of e.frames ?? []) frames[f.id] = { img, f };
    }
    return m.assets;
  } catch { return []; }
}
const ready = (i?: HTMLImageElement) => !!i && i.complete && i.naturalWidth > 0;
export const hasFrame = (id: string) => ready(frames[id]?.img);
export const hasImg = (key: string) => ready(imgs[key]);
/** Draw an atlas frame with its anchor at (x, y). Returns false when the placeholder should be used. */
export function drawFrame(c: CanvasRenderingContext2D, id: string, x: number, y: number, scale = 1): boolean {
  const a = frames[id];
  if (!a || !ready(a.img)) return false;
  const { f } = a;
  c.drawImage(a.img, f.x, f.y, f.w, f.h, Math.round(x - f.ax * scale), Math.round(y - f.ay * scale), Math.round(f.w * scale), Math.round(f.h * scale));
  return true;
}
/** Draw a frame fitted (aspect kept, centred) in a box. */
export function drawFrameBox(c: CanvasRenderingContext2D, id: string, x: number, y: number, w: number, h: number): boolean {
  const a = frames[id];
  if (!a || !ready(a.img)) return false;
  const { f } = a, s = Math.min(w / f.w, h / f.h);
  const dw = f.w * s, dh = f.h * s;
  c.drawImage(a.img, f.x, f.y, f.w, f.h, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  return true;
}
export function drawImg(c: CanvasRenderingContext2D, key: string, x: number, y: number, w?: number, h?: number): boolean {
  const i = imgs[key];
  if (!ready(i)) return false;
  c.drawImage(i, x, y, w ?? i.naturalWidth, h ?? i.naturalHeight);
  return true;
}
/** Hero/NPC/monster sprite sheets: none are imported yet (no CC0 license in their sidecars), so this always falls back. */
export function drawArt(_c: CanvasRenderingContext2D, key: string, _x: number, _y: number, _dir = 0): boolean { return hasFrame(key) && false; }
