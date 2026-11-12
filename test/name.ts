// Order 8: hero-name entry — name rules (blank falls back to the class), the HTML overlay geometry and the keyboard viewport.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { NAME_BOX, NAME_CANCEL, NAME_OK, cleanName, cssRect, frontLayout, inputFontPx, resolveName } from '../src/nameEntry';

// names
assert.deepEqual(resolveName('  Aidan ', 'Warrior', []), { name: 'Aidan' });
assert.deepEqual(resolveName('', 'Warrior', []), { name: 'Warrior' }, 'blank -> class name');
assert.deepEqual(resolveName('   ', 'Rogue', []), { name: 'Rogue' });
assert.deepEqual(resolveName('<>!!', 'Sorcerer', []), { name: 'Sorcerer' }, 'only invalid chars counts as blank');
assert.deepEqual(resolveName('', 'Warrior', ['Warrior', 'Warrior 2']), { name: 'Warrior 3' }, 'blank never collides');
assert.ok('err' in resolveName('Aidan', 'Warrior', ['Aidan']), 'typed duplicate refused');
assert.equal(cleanName('A very long hero name here'), 'A very long her');
assert.equal(cleanName('a  b'), 'a b');
// layout: without a keyboard = the canvas' centred 640x480 fit; overlay rects land on the drawn boxes
for (const [W, H] of [[844, 390], [932, 430], [390, 844]]) {
  const l = frontLayout(W, H, { width: W, height: H, offsetLeft: 0, offsetTop: 0 }), l0 = frontLayout(W, H, null);
  assert.deepEqual(l, l0);
  const s = Math.min(W / 640, H / 480); assert.equal(l.s, s); assert.equal(l.ox, (W - 640 * s) / 2); assert.equal(l.oy, (H - 480 * s) / 2);
  const r = cssRect(l, NAME_BOX); assert.ok(r.left >= 0 && r.top >= 0 && r.left + r.width <= W && r.top + r.height <= H);
  const ok = cssRect(l, NAME_OK), ca = cssRect(l, NAME_CANCEL); assert.ok(ok.left + ok.width <= ca.left, 'OK left of Cancel');
}
// iOS keyboard: visual viewport shrinks + pans; everything must sit inside the visible part
const W = 844, H = 390, vv = { width: 844, height: 190, offsetLeft: 0, offsetTop: 120 };
const l = frontLayout(W, H, vv);
for (const b of [NAME_BOX, NAME_OK, NAME_CANCEL]) { const r = cssRect(l, b); assert.ok(r.top >= vv.offsetTop && r.top + r.height <= vv.offsetTop + vv.height + 1e-9, 'inside the visual viewport'); }
assert.equal(inputFontPx(0.5), 16, 'never under 16 px (iOS focus zoom)');
assert.equal(inputFontPx(2), 40);
// the HTML: a real visible input with the attributes the phones need, above the canvas, not offscreen or transparent
const html = fs.readFileSync('index.html', 'utf8');
const inp = html.match(/<input id="name"[^>]*>/)![0];
for (const a of ['type="text"', 'maxlength="15"', 'autocapitalize="words"', 'autocomplete="off"', 'enterkeyhint="done"']) assert.ok(inp.includes(a), a);
assert.ok(!/style=/.test(inp) && !/left:\s*-\d/.test(html) && !/#name\s*{[^}]*opacity:\s*0/.test(html), 'not offscreen / invisible');
assert.ok(/<form id="nameForm"[\s\S]*<button id="nameOk" type="submit"[\s\S]*<button id="nameCancel" type="button"/.test(html), 'Enter/Done submits; Cancel does not');
assert.ok(/#nameForm \{[^}]*z-index: 20/.test(html) && /#name \{[^}]*user-select: text/.test(html), 'above canvas; selectable on iOS');
const main = fs.readFileSync('src/main.ts', 'utf8'), scr = fs.readFileSync('src/screens.ts', 'utf8');
assert.ok(!/setTimeout\([^)]*focus/.test(scr + main), 'no deferred focus (not a user gesture on phones)');
assert.ok(/this\.h\.go\('name'\); this\.h\.focusName\(\)/.test(scr), 'focused synchronously in the OK tap');
console.log('name: OK');
