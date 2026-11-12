// Immediate-mode touch UI: widgets register hit boxes while drawing; taps are routed to the top-most box.
export interface Box { x: number; y: number; w: number; h: number; tap?: () => void; hold?: () => void; down?: () => void; up?: () => void }
export class UI {
  boxes: Box[] = [];
  c!: CanvasRenderingContext2D;
  dpr = 1; // backing px per css px; boxes are stored in css px whatever transform is active
  begin(c: CanvasRenderingContext2D, dpr = 1) { this.c = c; this.boxes = []; this.dpr = dpr; }
  hit(x: number, y: number): Box | null {
    for (let i = this.boxes.length - 1; i >= 0; i--) { const b = this.boxes[i]; if (x >= b.x && y >= b.y && x < b.x + b.w && y < b.y + b.h) return b; }
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
  panel(x: number, y: number, w: number, h: number) {
    const c = this.c;
    c.fillStyle = 'rgba(18,14,9,0.95)'; c.fillRect(x, y, w, h);
    c.strokeStyle = '#8a7a52'; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, w - 2, h - 2);
    this.block(x, y, w, h);
  }
  text(s: string, x: number, y: number, o: { size?: number; color?: string; align?: CanvasTextAlign; bold?: boolean } = {}) {
    const c = this.c;
    c.font = `${o.bold ? 'bold ' : ''}${o.size ?? 12}px serif`; c.textAlign = o.align ?? 'left'; c.textBaseline = 'middle';
    c.fillStyle = o.color ?? '#d8c89a'; c.fillText(s, x, y);
  }
  button(label: string, x: number, y: number, w: number, h: number, tap: () => void, o: { on?: boolean; disabled?: boolean; size?: number; hold?: () => void } = {}) {
    const c = this.c;
    c.fillStyle = o.on ? '#5a4a2a' : '#3a3226'; c.fillRect(x, y, w, h);
    c.strokeStyle = o.disabled ? '#4a4232' : '#8a7a52'; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    this.text(label, x + w / 2, y + h / 2 + 1, { align: 'center', size: o.size ?? 11, color: o.disabled ? '#6a6050' : '#e8d8a8' });
    if (!o.disabled) this.area(x, y, w, h, tap, o.hold);
  }
  /** D1 menu-style list entry (gold text, centred). */
  menuItem(label: string, x: number, y: number, w: number, tap: () => void, o: { size?: number; color?: string } = {}) {
    this.text(label, x + w / 2, y, { align: 'center', size: o.size ?? 16, color: o.color ?? '#d8b860' });
    this.area(x, y - 12, w, 24, tap);
  }
  wrap(s: string, x: number, y: number, w: number, lh = 15, o: { size?: number; color?: string; align?: CanvasTextAlign } = {}): number {
    const c = this.c; c.font = `${o.size ?? 12}px serif`;
    const words = s.split(' '); let line = ''; let yy = y;
    for (const wd of words) {
      const t = line ? `${line} ${wd}` : wd;
      if (c.measureText(t).width > w && line) { this.text(line, o.align === 'center' ? x + w / 2 : x, yy, o); line = wd; yy += lh; } else line = t;
    }
    if (line) { this.text(line, o.align === 'center' ? x + w / 2 : x, yy, o); yy += lh; }
    return yy;
  }
}
