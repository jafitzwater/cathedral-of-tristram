// Imports the final CC0 art from /workspace/tristram-art (not review/) into public/art/ and writes public/art/manifest.json.
// Only files whose sidecar JSON declares a CC0 license (or all-CC0 sources) are imported; anything else is listed as skipped.
// Lazy-load groups follow the art manifest (manifest.md "Lazy groups"); the game loads/release them per zone (src/art.ts).
// Usage: node scripts/import-art.mjs [srcDir]
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2] ?? '/workspace/tristram-art';
const OUT = path.resolve('public/art');
const isCC0 = (l) => typeof l === 'string' && /^CC0/i.test(l.trim());
const assets = [], skipped = [], anims = {};
const MIB = 1024 * 1024;
const lic = (meta) => {
  const src = meta.sources ?? [];
  const l = meta.license ?? (src.length && src.every((s) => isCC0(s.license)) ? 'CC0 1.0' : undefined);
  return { license: l, author: [...new Set(src.map((s) => s.author).filter(Boolean))].join(', '), source: [...new Set(src.map((s) => s.url ?? s.pack).filter(Boolean))].join(' | ') };
};
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const copy = (rel) => { const to = path.join(OUT, rel.replace(/\//g, '-')); fs.copyFileSync(path.join(SRC, rel), to); return path.basename(to); };
const readJ = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const mib = (w, h) => +(w * h * 4 / MIB).toFixed(3);

// ---- tiles + items (Order 2c split): dungeon tiles load only in the dungeon, town tiles only in town; items stay shared ----
const TILE_GROUP = { 'tiles/town-floors.json': 'town-tiles', 'tiles/plants.json': 'town-tiles', 'tiles/cath-floors.json': 'dungeon-tiles', 'tiles/walls-props.json': 'dungeon-tiles', 'items/items.json': 'shared' };
for (const [f, group] of Object.entries(TILE_GROUP)) {
  const meta = readJ(path.join(SRC, f)), L = lic(meta), dir = path.dirname(f);
  if (!isCC0(L.license)) { skipped.push({ file: f, reason: 'no CC0 license declared' }); continue; }
  const [w, h] = meta.size_wh;
  const frames = meta.frames.map((fr) => {
    const [x, y] = fr.atlas_xy; const [fw, fh] = fr.size_wh ?? fr.size_px_wh;
    const [ax, ay] = fr.anchor_in_frame_px ?? fr.anchor_px ?? [0, 0];
    return { id: fr.id, x, y, w: fw, h: fh, ax, ay, ...(fr.size_slots_wh ? { slots: fr.size_slots_wh } : {}), ...(fr.trim_xy && fr.src_scaled_wh ? { cell: fr.trim_xy } : {}) };
  });
  assets.push({ key: f.replace('.json', ''), group, type: 'atlas', file: copy(`${dir}/${meta.atlas}`), w, h, mib: mib(w, h), frames, ...L });
}
// ---- town buildings + set dressing (Order 2c): town-only group. buildings.json carries no license field, so the license comes
// from the art folder's CREDITS.md, which declares every file CC0 1.0 and names the sources (Quaternius Medieval Village Pack +
// self-made). The import refuses the atlas if that statement or the source line is missing.
{
  const credits = fs.readFileSync(path.join(SRC, 'CREDITS.md'), 'utf8');
  const meta = readJ(path.join(SRC, 'town/buildings.json')), layout = readJ(path.join(SRC, 'town/layout.json'));
  const ok = /All art in `\/workspace\/tristram-art` is licensed \*\*CC0 1\.0/.test(credits) && /Medieval Village Pack/.test(credits) && /Adria's low round thatched hut/.test(credits);
  if (!ok) skipped.push({ file: 'town/buildings.png', reason: 'CC0 not confirmed by CREDITS.md' });
  else {
    const [w, h] = meta.size_wh;
    // roof/base split row: the art's eaves row when it has one; the tavern's split reports eaves_z 0, so use 45% of its height
    const eavesY = (fr) => { const b = meta.buildings[fr.building]; const z = b.occluder_split.eaves_z_m;
      return z > 0 ? fr.eaves_px[1] : Math.round(fr.anchor_in_frame_px[1] - 0.45 * fr.height_m * meta.scale.vert_px_per_m); };
    const frames = meta.frames.map((fr) => ({ id: fr.id, x: fr.atlas_xy[0], y: fr.atlas_xy[1], w: fr.size_wh[0], h: fr.size_wh[1], ax: fr.anchor_in_frame_px[0], ay: fr.anchor_in_frame_px[1], eaves: eavesY(fr), fp_m: fr.footprint_m, fp_tiles: fr.footprint_tiles }));
    assets.push({ key: 'town/buildings', group: 'town-buildings', type: 'atlas', file: copy('town/buildings.png'), w, h, mib: mib(w, h), frames, license: 'CC0 1.0',
      author: 'Quaternius (Medieval Village Pack), Project Tristram sprite director (self-made)', source: 'https://quaternius.com | /workspace/tristram-art/CREDITS.md' });
    fs.writeFileSync(path.join(OUT, 'town-layout.json'), JSON.stringify({ placements: layout.placements, d1_towner_reference: layout.d1_towner_reference }) + '\n');
  }
}
{
  const meta = readJ(path.join(SRC, 'ui/ui.json')), L = lic(meta);
  // bottom-panel.png is D1's 640x128 control panel; Order 4 replaced it with the full-screen touch HUD, so it is not shipped.
  for (const fe of meta.files) {
    if (fe.file === 'bottom-panel.png') { skipped.push({ file: 'ui/bottom-panel.png', reason: 'not used: Order 4 touch HUD replaces the D1 bottom panel' }); continue; }
    if (!isCC0(L.license)) { skipped.push({ file: `ui/${fe.file}`, reason: 'no CC0 license' }); continue; }
    const [w, h] = fe.size_wh;
    assets.push({ key: `ui/${path.basename(fe.file, '.png')}`, group: 'shared', type: 'image', file: copy(`ui/${fe.file}`), w, h, mib: mib(w, h), ...L });
  }
}

// ---- actors: heroes, npcs, monsters (split atlases listed by each actor's group json) ----
const DIRS = ['s', 'se', 'e', 'ne', 'n', 'nw', 'w', 'sw'];
for (const dir of ['heroes', 'npcs', 'monsters']) {
  for (const gf of fs.readdirSync(path.join(SRC, dir)).filter((x) => x.endsWith('.json'))) {
    const gm = readJ(path.join(SRC, dir, gf));
    if (!gm.groups) continue; // split atlas json, handled through its group json
    const actor = gm.name;
    const metas = Object.entries(gm.groups).map(([gname, g]) => [gname, g, readJ(path.join(SRC, dir, g.json))]);
    // Feet anchor: anchor_px x is in the scaled render canvas and y is in the crop (= frame) box. The manifest defines the anchor
    // from the standing frame, so each facing's root is the idle frame 0 anchor; every frame of that facing is placed relative to it
    // (walk/attack frames keep the body still instead of following the moving contact band).
    const root = {};
    for (const [, , m] of metas) for (const fr of m.frames) if (fr.action === 'idle' && fr.index === 0) root[fr.dir] = [fr.anchor_px[0], fr.crop_in_scaled[1] + fr.anchor_px[1]];
    anims[actor] = { kind: gm.kind, height: gm.target_standing_height_px, actions: {} };
    for (const [gname, g, m] of metas) {
      const L = lic(m), rel = `${dir}/${g.json}`;
      if (!isCC0(L.license)) { skipped.push({ file: rel, reason: 'no CC0 license declared' }); continue; }
      const key = `${dir}/${path.basename(g.json, '.json')}`;
      const group = dir === 'heroes' ? `hero-${actor}-${gname}` : dir === 'npcs' ? 'town-npcs' : actor === 'butcher' ? 'butcher' : gname === 'idle_walk' ? 'roamers' : `roamer-${actor}-combat`;
      const frames = m.frames.map((fr) => {
        const [x, y] = fr.atlas_xy, [cx, cy] = fr.crop_in_scaled, r = root[fr.dir];
        if (!r) throw new Error(`${rel}: no idle frame for facing ${fr.dir}`);
        return { id: `${actor}:${fr.action}:${fr.dir}:${fr.index}`, x, y, w: fr.w, h: fr.h, ax: +(r[0] - cx).toFixed(2), ay: +(r[1] - cy).toFixed(2), ms: fr.duration_ms };
      });
      for (const fr of m.frames) {
        const a = (anims[actor].actions[fr.action] ??= { n: 0, ms: fr.duration_ms, asset: key });
        if (fr.dir === 's') a.n = Math.max(a.n, fr.index + 1);
      }
      for (const d of DIRS) if (!m.frames.some((fr) => fr.dir === d)) throw new Error(`${rel}: missing facing ${d}`);
      const [w, h] = m.size_wh;
      assets.push({ key, group, type: 'atlas', file: copy(`${dir}/${m.atlas}`), w, h, mib: mib(w, h), frames, ...L });
    }
  }
}
const groups = {};
for (const a of assets) (groups[a.group] ??= []).push(a.key);
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ version: 2, generated: new Date().toISOString(), groups, anims, assets, skipped }) + '\n');
const tot = (g) => groups[g].reduce((s, k) => s + assets.find((a) => a.key === k).mib, 0).toFixed(3);
console.log(`imported ${assets.length} assets in ${Object.keys(groups).length} groups, skipped ${skipped.length}`);
for (const g of Object.keys(groups)) console.log(`  ${g}: ${tot(g)} MiB (${groups[g].length})`);
for (const s of skipped) console.log(`  skipped ${s.file}: ${s.reason}`);
