// Order 16 (staging): UI skin invariants — finger targets, transition time, the attack button, the save namespace.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { UI, MIN_HIT } from '../src/ui';
import { FADE_S } from '../src/hud';
import { SAVE_NS } from '../src/save';

assert.equal(MIN_HIT, 44, 'finger targets are at least 44 css px');
assert.ok(FADE_S > 0 && FADE_S <= 0.15, 'panels open and close in <= 150 ms');
// areaMin grows a small box around its centre to 44x44 css px whatever the transform (front-end scale 0.8125 at dpr 3)
const ui = new UI();
const k = 3, s = 0.8125;
ui.begin({ getTransform: () => ({ a: k * s, d: k * s, e: 10 * k, f: 20 * k }) } as unknown as CanvasRenderingContext2D, k);
ui.areaMin(100, 100, 30, 20, () => {});
const b = ui.boxes[0];
assert.ok(Math.abs(b.w - 44) < 1e-9 && Math.abs(b.h - 44) < 1e-9, `grown to 44x44 (${b.w}x${b.h})`);
assert.ok(Math.abs(b.x + b.w / 2 - (10 + 115 * s)) < 1e-9 && Math.abs(b.y + b.h / 2 - (20 + 110 * s)) < 1e-9, 'centred on the drawn box');
ui.areaMin(0, 0, 100, 80, () => {}); assert.ok(ui.boxes[1].w > 44 && ui.boxes[1].h > 44, 'big boxes keep their size');
// ATTACK is always ready: no cooldown sweep is ever drawn on it
const hud = fs.readFileSync('src/hud.ts', 'utf8');
const atk = hud.slice(hud.indexOf('    // ATTACK\n'), hud.indexOf('    // class skill\n'));
assert.ok(atk.length > 50 && !/sweep\(/.test(atk), 'no cooldown sweep on ATTACK');
// Order 19: production save key again (the staging .env is gone)
assert.equal(SAVE_NS, 'cot.');
assert.ok(!fs.existsSync('.env') || !/VITE_SAVE_NS/.test(fs.readFileSync('.env', 'utf8')), 'no staging save namespace');
console.log('ui: OK (44 px targets, <=150 ms transitions, ATTACK has no cooldown visual, production save key)');
