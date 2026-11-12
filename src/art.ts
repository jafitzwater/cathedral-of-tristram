// CC0 art store with zone-based lazy loading (Order 5).
// public/art/manifest.json (written by scripts/import-art.mjs) lists every atlas with its lazy group, decoded size and frames.
// The game asks for a set of groups per zone (wantedGroups); assets outside the set are released (ImageBitmap.close) before new
// ones are fetched, so resident decoded memory never exceeds the zone's sum. Until an atlas is decoded, callers get `false`
// and draw a fallback silhouette.
export interface Frame { id: string; x: number; y: number; w: number; h: number; ax: number; ay: number; ms?: number; slots?: [number, number]; cell?: [number, number]; eaves?: number; fp_m?: [number, number]; fp_tiles?: [number, number] }
export interface ArtAsset { key: string; group: string; type: 'atlas' | 'image'; file: string; w: number; h: number; mib: number; frames?: Frame[]; license: string; author: string; source: string }
export interface AnimInfo { n: number; ms: number; asset: string }
export interface ArtManifest { version: number; groups: Record<string, string[]>; anims: Record<string, { kind: string; height: number; actions: Record<string, AnimInfo> }>; assets: ArtAsset[] }
export interface Decoded { img: CanvasImageSource; close(): void }
export type Loader = (url: string, signal: AbortSignal) => Promise<Decoded>;

export const MIB = 1024 * 1024;
export const BUDGET_MIB = 32;
export type Zone = 'menu' | 'town' | 'cathedral' | 'butcher';
/** Art actor name for a game monster id (D1 variants share their family's sheet). */
export const MON_ART: Record<string, string> = { zombie: 'zombie', fallen: 'fallen', fallen_sword: 'fallen', skeleton: 'skeleton', skeleton_captain: 'skeleton', scavenger: 'scavenger', butcher: 'butcher' };
export const ROAMERS = ['zombie', 'fallen', 'skeleton', 'scavenger'];

/** The addendum's lazy groups. `engaged` is the one roamer type whose combat atlas may be resident. */
export function wantedGroups(zone: Zone, cls: string | null, engaged: string | null = null): string[] {
  const g = ['shared'];
  if (zone === 'menu' || !cls) return g;
  g.push(`hero-${cls}-town`);
  if (zone === 'town') g.push('town-tiles', 'town-buildings', 'town-npcs');
  else {
    g.push('dungeon-tiles', `hero-${cls}-combat`);
    if (zone === 'butcher') g.push('butcher');
    else { g.push('roamers'); if (engaged) g.push(`roamer-${engaged}-combat`); }
  }
  return g;
}
export function groupsMiB(m: ArtManifest, groups: string[]): number {
  const keys = new Set(groups.flatMap((g) => m.groups[g] ?? []));
  return m.assets.filter((a) => keys.has(a.key)).reduce((s, a) => s + a.w * a.h * 4, 0) / MIB;
}

interface Res { d: Decoded; bytes: number }
export class ArtStore {
  m: ArtManifest | null = null;
  private byKey = new Map<string, ArtAsset>();
  private frames = new Map<string, { f: Frame; key: string }>();
  private res = new Map<string, Res>();
  private pending = new Map<string, AbortController>();
  private want = new Set<string>();
  bytes = 0; peak = 0; loads = 0; releases = 0; errors = 0;
  constructor(private base: string, private loader: Loader) {}
  init(m: ArtManifest) {
    this.m = m;
    for (const a of m.assets) { this.byKey.set(a.key, a); for (const f of a.frames ?? []) this.frames.set(f.id, { f, key: a.key }); }
  }
  get mib() { return this.bytes / MIB; }
  get peakMib() { return this.peak / MIB; }
  residentKeys() { return [...this.res.keys()]; }
  /** Make exactly these groups resident: release everything else first, then fetch what is missing. */
  setGroups(groups: string[]): Promise<void> {
    if (!this.m) return Promise.resolve();
    const keys = new Set(groups.flatMap((g) => this.m!.groups[g] ?? []));
    if (keys.size === this.want.size && [...keys].every((k) => this.want.has(k))) return Promise.resolve();
    this.want = keys;
    for (const [k, ac] of this.pending) if (!keys.has(k)) { ac.abort(); this.pending.delete(k); }
    for (const [k, r] of this.res) if (!keys.has(k)) { r.d.close(); this.res.delete(k); this.bytes -= r.bytes; this.releases++; }
    const jobs: Promise<void>[] = [];
    for (const k of keys) if (!this.res.has(k) && !this.pending.has(k)) jobs.push(this.load(k));
    return Promise.all(jobs).then(() => undefined);
  }
  private async load(k: string) {
    const a = this.byKey.get(k)!, ac = new AbortController();
    this.pending.set(k, ac);
    try {
      const d = await this.loader(`${this.base}art/${a.file}`, ac.signal);
      const bytes = a.w * a.h * 4;
      this.bytes += bytes; this.peak = Math.max(this.peak, this.bytes);
      if (ac.signal.aborted || !this.want.has(k)) { d.close(); this.bytes -= bytes; return; }
      this.res.set(k, { d, bytes }); this.loads++;
    } catch { if (!ac.signal.aborted) this.errors++; }
    finally { if (this.pending.get(k) === ac) this.pending.delete(k); }
  }
  ready(key: string) { return this.res.has(key); }
  frame(id: string): { f: Frame; img: CanvasImageSource } | null {
    const e = this.frames.get(id); if (!e) return null;
    const r = this.res.get(e.key); return r ? { f: e.f, img: r.d.img } : null;
  }
  image(key: string): { a: ArtAsset; img: CanvasImageSource } | null {
    const r = this.res.get(key); return r ? { a: this.byKey.get(key)!, img: r.d.img } : null;
  }
  anim(actor: string, action: string): AnimInfo | null { return this.m?.anims[actor]?.actions[action] ?? null; }
}

/** Browser loader: decode to an ImageBitmap (closable, so release frees the pixels deterministically). */
const browserLoader: Loader = async (url, signal) => {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  const blob = await r.blob();
  if (typeof createImageBitmap === 'function') { const b = await createImageBitmap(blob); return { img: b, close: () => b.close() }; }
  const img = new Image(); const u = URL.createObjectURL(blob); img.src = u; await img.decode(); URL.revokeObjectURL(u);
  return { img, close: () => { img.src = ''; } };
};
export let art = new ArtStore('/', browserLoader);
export async function loadArt(base: string): Promise<ArtManifest | null> {
  art = new ArtStore(base, browserLoader);
  try {
    const r = await fetch(`${base}art/manifest.json`);
    if (!r.ok) return null;
    const m = (await r.json()) as ArtManifest;
    art.init(m); await art.setGroups(['shared']);
    return m;
  } catch { return null; }
}

export const hasFrame = (id: string) => !!art.frame(id);
export const hasImg = (key: string) => !!art.image(key);
/** Draw an atlas frame with its anchor at (x, y). Returns false when the fallback should be drawn. */
export function drawFrame(c: CanvasRenderingContext2D, id: string, x: number, y: number, scale = 1, flip = false): boolean {
  const e = art.frame(id); if (!e) return false;
  const { f, img } = e;
  if (flip) { c.save(); c.translate(Math.round(x), 0); c.scale(-1, 1); c.drawImage(img, f.x, f.y, f.w, f.h, -Math.round(f.ax * scale), Math.round(y - f.ay * scale), Math.round(f.w * scale), Math.round(f.h * scale)); c.restore(); return true; }
  c.drawImage(img, f.x, f.y, f.w, f.h, Math.round(x - f.ax * scale), Math.round(y - f.ay * scale), Math.round(f.w * scale), Math.round(f.h * scale));
  return true;
}
/**
 * Kenney dungeon pieces: draw a frame at its place in the 64x128 source cell. The cell's slab-bottom diamond (cell y 96..128)
 * lands on the game tile whose top tip is (sx, sy), so wall bases sit on the tile edges.
 */
export function drawCell(c: CanvasRenderingContext2D, id: string, sx: number, sy: number): boolean {
  const e = art.frame(id); if (!e || !e.f.cell) return false;
  const { f, img } = e;
  c.drawImage(img, f.x, f.y, f.w, f.h, Math.round(sx - 32 + f.cell![0]), Math.round(sy - 96 + f.cell![1]), f.w, f.h);
  return true;
}
/** Draw a frame fitted (aspect kept, centred) in a box. */
export function drawFrameBox(c: CanvasRenderingContext2D, id: string, x: number, y: number, w: number, h: number): boolean {
  const e = art.frame(id); if (!e) return false;
  const { f, img } = e, s = Math.min(w / f.w, h / f.h);
  const dw = f.w * s, dh = f.h * s;
  c.drawImage(img, f.x, f.y, f.w, f.h, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  return true;
}
export function drawImg(c: CanvasRenderingContext2D, key: string, x: number, y: number, w?: number, h?: number): boolean {
  const e = art.image(key); if (!e) return false;
  c.drawImage(e.img, x, y, w ?? e.a.w, h ?? e.a.h);
  return true;
}

/** D1 direction index (iso.ts DIRS: 0 S, 1 SW, 2 W, 3 NW, 4 N, 5 NE, 6 E, 7 SE) -> art facing name. */
/**
 * Order 9: art facing label per engine direction (DIRS index: S, SW, W, NW, N, NE, E, SE). The art's compass labels are
 * mirrored on screen: render_actor.py orbits the camera +yaw around a character facing -Y, so its 'e' frames face screen-left
 * and its 'se' frames face screen down-left (checked on the rendered sprites: Cain's beard, the heroes' chests). So screen
 * down-left (SW) uses 'se', left (W) uses 'e', and so on; S and N are unchanged.
 */
export const DIR_NAME = ['s', 'se', 'e', 'ne', 'n', 'nw', 'w', 'sw'] as const;
/** Render-rig yaw per art label (render_actor.py YAW) and the screen angle (degrees, 0 = right, y down) its frames face. */
export const ART_YAW: Record<string, number> = { s: 0, se: 45, e: 90, ne: 135, n: 180, nw: 225, w: 270, sw: 315 };
export function artScreenAngle(label: string, elevDeg = 30): number {
  const y = ART_YAW[label] * Math.PI / 180, a = Math.atan2(Math.cos(y) * Math.sin(elevDeg * Math.PI / 180), -Math.sin(y)) * 180 / Math.PI;
  return ((a % 360) + 360) % 360;
}
/**
 * Frame index for an action. Looping actions (idle, walk, talk) run at the manifest timings. Timed actions (attack, cast, hit)
 * are spread over the game's D1 duration (`progress` 0..1) so the hit lands on the same frame as the rules; death plays at the
 * manifest timing and holds its last frame.
 */
export function animIndex(info: AnimInfo, action: string, ms: number, progress?: number): number {
  if (progress !== undefined) return Math.min(info.n - 1, Math.max(0, Math.floor(progress * info.n)));
  const i = Math.floor(ms / info.ms);
  return action === 'death' ? Math.min(info.n - 1, i) : i % info.n;
}
/** Draw an actor frame with its feet at (x, y). Returns false when its atlas isn't resident. */
export function drawActor(c: CanvasRenderingContext2D, actor: string, action: string, dir: number, ms: number, x: number, y: number, progress?: number): boolean {
  const info = art.anim(actor, action); if (!info) return false;
  return drawFrame(c, `${actor}:${action}:${DIR_NAME[dir & 7]}:${animIndex(info, action, ms, progress)}`, x, y);
}
