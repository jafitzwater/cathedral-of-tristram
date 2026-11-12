// Imports CC0 art from /workspace/tristram-art (the art pipeline's output) into public/art/ and writes public/art/manifest.json.
// Only assets whose sidecar JSON declares a CC0 license are imported; everything else is listed as skipped with the reason.
// Usage: node scripts/import-art.mjs [srcDir]
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2] ?? '/workspace/tristram-art';
const OUT = path.resolve('public/art');
const isCC0 = (l) => typeof l === 'string' && /^CC0/i.test(l.trim());
const assets = [], skipped = [];
const rmOld = () => { for (const f of fs.existsSync(OUT) ? fs.readdirSync(OUT) : []) if (f !== 'manifest.json') fs.rmSync(path.join(OUT, f), { recursive: true }); };
const lic = (meta) => {
  const src = meta.sources ?? [];
  const l = meta.license ?? (src.length && src.every((s) => isCC0(s.license)) ? 'CC0 1.0' : undefined);
  return { license: l, author: meta.author ?? src.map((s) => s.author).filter(Boolean).join(', '), source: src.map((s) => s.url ?? s.pack).filter(Boolean).join(' | ') };
};
fs.mkdirSync(OUT, { recursive: true }); rmOld();
const copy = (rel) => { const to = path.join(OUT, rel.replace(/\//g, '-')); fs.copyFileSync(path.join(SRC, rel), to); return path.basename(to); };

// Atlases with frame lists: tiles/*.json, items/items.json, heroes/*.json, npcs/*.json
for (const dir of ['tiles', 'items', 'heroes', 'npcs', 'monsters']) {
  const d = path.join(SRC, dir);
  if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d).filter((x) => x.endsWith('.json'))) {
    const rel = `${dir}/${f}`, meta = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'));
    const L = lic(meta);
    if (!isCC0(L.license)) { skipped.push({ file: rel, reason: 'no CC0 license declared in sidecar' }); continue; }
    if (!meta.atlas || !fs.existsSync(path.join(d, meta.atlas))) { skipped.push({ file: rel, reason: 'atlas png missing' }); continue; }
    const frames = (meta.frames ?? []).map((fr) => {
      const [x, y] = fr.atlas_xy; const [w, h] = fr.size_wh ?? fr.size_px_wh ?? [fr.w, fr.h];
      const [ax, ay] = fr.anchor_px ?? fr.anchor_in_frame_px ?? [0, 0];
      const id = fr.id ?? `${meta.name}_${fr.action}_${fr.dir}_${fr.index}`;
      return { id, x, y, w, h, ax, ay, ...(fr.size_slots_wh ? { slots: fr.size_slots_wh } : {}) };
    });
    assets.push({ key: `${dir}/${path.basename(f, '.json')}`, type: 'atlas', file: copy(`${dir}/${meta.atlas}`), frames, ...L });
  }
}
// UI images described by ui/ui.json
const uiMetaP = path.join(SRC, 'ui/ui.json');
if (fs.existsSync(uiMetaP)) {
  const meta = JSON.parse(fs.readFileSync(uiMetaP, 'utf8')), L = lic(meta);
  // character/spellbook mockups have placeholder numbers painted in, so they are not usable as live backgrounds
  const BAKED = new Set(['panel-character.png', 'panel-spellbook.png']);
  for (const fe of meta.files ?? []) {
    if (BAKED.has(fe.file)) { skipped.push({ file: `ui/${fe.file}`, reason: 'mockup with baked-in stat values; not usable as a live panel' }); continue; }
    if (!isCC0(L.license)) { skipped.push({ file: `ui/${fe.file}`, reason: 'no CC0 license' }); continue; }
    assets.push({ key: `ui/${path.basename(fe.file, '.png')}`, type: 'image', file: copy(`ui/${fe.file}`), ...L });
  }
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ version: 1, generated: new Date().toISOString(), assets, skipped }, null, 1) + '\n');
console.log(`imported ${assets.length} assets, skipped ${skipped.length}`);
for (const s of skipped) console.log(`  skipped ${s.file}: ${s.reason}`);
