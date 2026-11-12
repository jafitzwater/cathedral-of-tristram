// Order 10 touch helpers (pure, unit-tested): finger-drag scrolling with momentum, tap/hold/drag thresholds.
/** A move of this many css px or more turns a touch into a drag: it cancels the tap and the hold (U4). */
export const TAP_SLOP = 8;
/** Press-and-hold time that lifts an item onto the finger (U8). A tap opens the item card at once on release (U9). */
export const HOLD_MS = 350;

/** One-axis scroller: drag moves the content with the finger; on release it keeps the finger's speed and slows down. */
export class Scroller {
  pos = 0; vel = 0; max = 0; dragging = false;
  private lastT = 0; private samples: { d: number; t: number }[] = [];
  static FRICTION = 4.5;  // 1/s exponential decay of the fling speed
  static MAX_VEL = 4000;  // units/s
  setMax(max: number) { this.max = Math.max(0, max); if (this.pos > this.max) this.pos = this.max; if (this.pos < 0) this.pos = 0; }
  start(t: number) { this.dragging = true; this.vel = 0; this.lastT = t; this.samples = []; }
  /** Finger moved by `delta` content units (positive = finger down/right: content follows, so pos decreases). */
  drag(delta: number, t: number) {
    this.pos = Math.max(0, Math.min(this.max, this.pos - delta));
    this.samples.push({ d: -delta, t }); this.lastT = t;
    while (this.samples.length && t - this.samples[0].t > 0.1) this.samples.shift();
  }
  release(t: number) {
    this.dragging = false;
    const s = this.samples.filter((q) => t - q.t <= 0.1);
    const span = s.length > 1 ? Math.max(1 / 120, s[s.length - 1].t - s[0].t) : 1 / 60;
    const sum = s.reduce((a, q) => a + q.d, 0);
    this.vel = s.length && t - this.lastT < 0.08 ? Math.max(-Scroller.MAX_VEL, Math.min(Scroller.MAX_VEL, sum / span)) : 0;
  }
  /** Advance the fling; returns true while it is still moving. */
  step(dt: number): boolean {
    if (this.dragging || this.vel === 0) return false;
    this.pos += this.vel * dt;
    this.vel *= Math.exp(-Scroller.FRICTION * dt);
    if (this.pos <= 0 || this.pos >= this.max) { this.pos = Math.max(0, Math.min(this.max, this.pos)); this.vel = 0; }
    if (Math.abs(this.vel) < 5) this.vel = 0;
    return this.vel !== 0;
  }
}
