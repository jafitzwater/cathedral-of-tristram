// Order 8: the hero-name entry is a real, visible HTML <input> (plus OK/Cancel buttons) laid over the D1 name box, so the
// phone keyboard opens: iOS Safari and Android Chrome only raise it for a visible input focused inside a user gesture.
import { VIEW_H, VIEW_W } from './iso';

/** The name box and buttons in the front-end's 640x480 layout (drawn by screens.ts, overlaid by the HTML form). */
export const NAME_BOX = { x: 170, y: 200, w: 300, h: 44 };
export const NAME_OK = { x: 200, y: 300, w: 110, h: 34 };
export const NAME_CANCEL = { x: 330, y: 300, w: 110, h: 34 };
export const NAME_MAX = 15;

export interface VV { width: number; height: number; offsetLeft: number; offsetTop: number }
/**
 * Front-end screen transform. With the keyboard up, iOS shrinks only the visual viewport (and pans it), Android shrinks the
 * window: either way the 640x480 screen is fitted into the visible area so the name box stays above the keyboard.
 */
export function frontLayout(W: number, H: number, vv?: VV | null) {
  const vw = vv && vv.width > 0 ? Math.min(W, vv.width) : W, vh = vv && vv.height > 0 ? Math.min(H, vv.height) : H;
  const ol = vv ? vv.offsetLeft : 0, ot = vv ? vv.offsetTop : 0;
  const s = Math.min(vw / VIEW_W, vh / VIEW_H);
  return { s, ox: ol + (vw - VIEW_W * s) / 2, oy: ot + (vh - VIEW_H * s) / 2 };
}
/** CSS px rect of a 640x480-layout box. */
export function cssRect(l: { s: number; ox: number; oy: number }, b: { x: number; y: number; w: number; h: number }) {
  return { left: l.ox + b.x * l.s, top: l.oy + b.y * l.s, width: b.w * l.s, height: b.h * l.s };
}
/** Input font: the canvas text size scaled, but never under 16 px (iOS zooms the page into smaller inputs). */
export const inputFontPx = (s: number) => Math.max(16, Math.round(20 * s));

export const cleanName = (raw: string) => raw.trim().replace(/[^A-Za-z0-9 _-]/g, '').replace(/\s+/g, ' ').slice(0, NAME_MAX).trim();
/**
 * The hero name to create, or an error. A blank name falls back to the class name ("Warrior", then "Warrior 2"...), so a
 * player is never stuck on this screen; a typed name that already exists is an error (D1 refuses duplicates).
 */
export function resolveName(raw: string, className: string, existing: string[]): { name: string } | { err: string } {
  const n = cleanName(raw);
  if (n) return existing.includes(n) ? { err: 'A hero with that name already exists' } : { name: n };
  for (let i = 1; ; i++) { const d = i === 1 ? className : `${className} ${i}`; if (!existing.includes(d)) return { name: d }; }
}
/** Events whose browser default must survive on the form (focus, caret, selection, the keyboard). */
export const isFormTarget = (t: EventTarget | null) => !!(t && (t as Element).closest?.('#nameForm'));
