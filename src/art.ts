// CC0 art loader. Reads public/art/manifest.json (written by scripts/import-art.mjs from /workspace/tristram-art/).
// Entry: { key, file, type: "image"|"sfx"|"music", license, author, source, frameW?, frameH?, dirs?, frames? }.
// Anything without an entry is drawn with code placeholders (see CREDITS.md "Missing art").
export interface ArtEntry { key: string; file: string; type: 'image' | 'sfx' | 'music'; license: string; author: string; source: string; frameW?: number; frameH?: number; dirs?: number; frames?: number }
export const images: Record<string, { img: HTMLImageElement; e: ArtEntry }> = {};
export async function loadArt(base: string): Promise<ArtEntry[]> {
  try {
    const r = await fetch(`${base}art/manifest.json`);
    if (!r.ok) return [];
    const m = (await r.json()) as { assets: ArtEntry[] };
    for (const e of m.assets) if (e.type === 'image') {
      const img = new Image(); img.src = `${base}art/${e.file}`;
      images[e.key] = { img, e };
    }
    return m.assets;
  } catch { return []; }
}
/** Draw an art frame if loaded, returns false when the placeholder should be used. */
export function drawArt(g: CanvasRenderingContext2D, key: string, x: number, y: number, dir = 0, frame = 0): boolean {
  const a = images[key];
  if (!a || !a.img.complete || !a.img.naturalWidth) return false;
  const fw = a.e.frameW ?? a.img.naturalWidth, fh = a.e.frameH ?? a.img.naturalHeight;
  const fr = a.e.frames ? frame % a.e.frames : 0;
  g.drawImage(a.img, fr * fw, (a.e.dirs ? dir % a.e.dirs : 0) * fh, fw, fh, Math.round(x - fw / 2), Math.round(y - fh), fw, fh);
  return true;
}
