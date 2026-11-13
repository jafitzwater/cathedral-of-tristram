// Immediate-mode touch UI: widgets register hit boxes while drawing; taps are routed to the top-most box.
// Order 16 (staging): the widgets draw the stone / iron / gold skin (hudSkin.ts) in Cinzel and IM Fell; buttons and menu
// entries get finger-sized (>= 44 css px) hit boxes and a pressed state from the fingers currently down.
import { BODY_FONT, HUD_FONT, skinButton, skinPanel } from './hudSkin';
/** Minimum finger target, css px. */
export const MIN_HIT = 44;
export interface Box { x: number; y: number; w: number; h: number; tap?: () => void; hold?: () => void; down?: () => void; up?: () => void }
export interface Region { x: number; y: number; w: number; h: number; key: string; start: number; end: number }
export class UI {
  boxes: Box[] = [];
  /** Order 10 U4: finger-drag scroll regions (css px); boxes registered inside a region scroll with it. */
  regions: Region[] = [];
  private open: Region | null = null;
  c!: CanvasRenderingContext2D;
  dpr = 1; // backing px per css px; boxes are stored in css px whatever transform is active
  /** Fingers currently down (css px), set by main.ts each frame: widgets under one draw pressed. */
  fingers: { x: number; y: number }[] = [];
  begin(c: CanvasRenderingContext2D, dpr = 1) { this.c = c; this.boxes = []; this.regions = []; this.open = null; this.dpr = dpr; }
  hit(x: number, y: number): Box | null {
    for (let i = this.boxes.length - 1; i >= 0; i--) { const b = this.boxes[i]; if (x >= b.x && y >= b.y && x < b.x + b.w && y < b.y + b.h) return b; }
    return null;
  }
  /** Index of a box in draw order (-1 if none). */
  indexOf(b: Box | null) { return b ? this.boxes.indexOf(b) : -1; }
  beginScroll(x: number, y: number, w: number, h: number, key: string) { this.open = { ...this.css(x, y, w, h), key, start: this.boxes.length, end: -1 }; this.regions.push(this.open); }
  endScroll() { if (this.open) { this.open.end = this.boxes.length; this.open = null; } }
  /** The scroll region under a touch, unless something drawn after the region (a popup) covers that point. */
  scrollAt(x: number, y: number): Region | null {
    const b = this.hit(x, y), bi = this.indexOf(b);
    for (let i = this.regions.length - 1; i >= 0; i--) {
      const r = this.regions[i];
      if (x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h && (bi < 0 || bi < r.end)) return r;
    }
    return null;
  }
  private css(x: number, y: number, w: number, h: number) {
    const m = this.c.getTransform(), k = this.dpr;
    return { x: (m.a * x + m.e) / k, y: (m.d * y + m.f) / k, w: (m.a * w) / k, h: (m.d * h) / k };
  }
  area(x: number, y: number, w: number, h: number, tap?: () => void, hold?: () => void) { this.boxes.push({ ...this.css(x, y, w, h), tap, hold }); }
  /** Press-and-hold control (ATTACK): down on touch, up on release. Box is padded for fat fingers. */
  press(x: number, y: number, w: number, h: number, down: () => void, up: () => void) { this.boxes.push({ ...this.css(x, y, w, h), down, up }); }
  /** Blocks taps from falling through to the world under a panel. */
  block(x: number, y: number, w: number, h: number) { this.boxes.push({ ...this.css(x, y, w, h), tap: () => {} }); }
  panel(x: number, y: number, w: number, h: number, title?: string) {
    skinPanel(this.c, x, y, w, h, title);
    this.block(x, y, w, h);
  }
  /** True when a finger is down inside this rect (drawing coordinates). */
  pressed(x: number, y: number, w: number, h: number) {
    if (!this.fingers.length) return false;
    const r = this.css(x, y, w, h);
    return this.fingers.some((f) => f.x >= r.x && f.y >= r.y && f.x < r.x + r.w && f.y < r.y + r.h);
  }
  /** A tap area grown (around its centre) to at least MIN_HIT css px each way. */
  areaMin(x: number, y: number, w: number, h: number, tap?: () => void, hold?: () => void, min = MIN_HIT) {
    const r = this.css(x, y, w, h), gw = Math.max(0, min - r.w) / 2, gh = Math.max(0, min - r.h) / 2;
    this.boxes.push({ x: r.x - gw, y: r.y - gh, w: r.w + 2 * gw, h: r.h + 2 * gh, tap, hold });
  }
  text(s: string, x: number, y: number, o: { size?: number; color?: string; align?: CanvasTextAlign; bold?: boolean; head?: boolean } = {}) {
    const c = this.c, size = o.size ?? 12;
    c.font = font(size, o.head ?? (!!o.bold || size >= 15), !!o.bold); c.textAlign = o.align ?? 'left'; c.textBaseline = 'middle';
    c.fillStyle = o.color ?? '#d8c89a'; c.fillText(s, x, y);
  }
  button(label: string, x: number, y: number, w: number, h: number, tap: () => void, o: { on?: boolean; disabled?: boolean; size?: number; hold?: () => void; danger?: boolean } = {}) {
    const pr = !o.disabled && this.pressed(x, y, w, h);
    skinButton(this.c, label, x, y, w, h, { on: o.on, disabled: o.disabled, pressed: pr, size: o.size, danger: o.danger });
    if (!o.disabled) this.areaMin(x, y, w, h, tap, o.hold);
  }
  /** D1 menu-style list entry (gold Cinzel, centred); `hit` = tap height in drawing units (>= MIN_HIT css when it fits). */
  menuItem(label: string, x: number, y: number, w: number, tap: () => void, o: { size?: number; color?: string; hit?: number } = {}) {
    const hh = o.hit ?? 24, pr = this.pressed(x, y - hh / 2, w, hh), c = this.c;
    if (pr) { c.save(); c.shadowColor = 'rgba(255,170,70,0.9)'; c.shadowBlur = 12; }
    this.text(label, x + w / 2, y, { align: 'center', size: o.size ?? 16, color: pr ? '#fff0c0' : o.color ?? '#d8b860', head: true });
    if (pr) c.restore();
    this.area(x, y - hh / 2, w, hh, tap);
  }
  wrap(s: string, x: number, y: number, w: number, lh = 15, o: { size?: number; color?: string; align?: CanvasTextAlign } = {}): number {
    const c = this.c; c.font = font(o.size ?? 12, false, false);
    const words = s.split(' '); let line = ''; let yy = y;
    for (const wd of words) {
      const t = line ? `${line} ${wd}` : wd;
      if (c.measureText(t).width > w && line) { this.text(line, o.align === 'center' ? x + w / 2 : x, yy, o); line = wd; yy += lh; } else line = t;
    }
    if (line) { this.text(line, o.align === 'center' ? x + w / 2 : x, yy, o); yy += lh; }
    return yy;
  }
}

function font(size: number, head: boolean, bold: boolean) { return head ? `${bold ? 700 : 600} ${size}px ${HUD_FONT}` : `${bold ? 'bold ' : ''}${size}px ${BODY_FONT}`; }
