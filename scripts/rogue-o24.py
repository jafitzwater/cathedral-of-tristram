#!/usr/bin/env python3
"""Order 24: the Rogue's walk + attack (Order 23b, /workspace/tristram-work/o23) as trimmed atlases with hip-line anchors.

Source: the 256x384 EEVEE frames in <o23>/raw (the 88x132 sheets are Lanczos copies of them with a per-facing dy shift).
Scale: one camera scale for every facing, chosen so the S-facing standing frame (attack 0) is 88 px sole-to-crown on screen,
the same convention as the shipped Phase B idles (S 88 px; the other facings read taller from the 30 deg camera).
(The 88x132 sheets put an 88 px *ortho* body in the cell, which is ~74 px on screen after the 30 deg foreshortening.)
Rows: meta.json facings S, SW, W, NW, N, NE, E, SE. The o23 rig turns the other way from the Phase B rig (its yaw 90 'W' row
faces screen right), so each row is stored under the same-named art label: row 'W' -> label 'w' = engine E (DIR_NAME[6]),
row 'SW' -> 'sw' = engine SE, ... (checked against the shipped walk: label 'e' = engine W faces screen left; arrow.png agrees).
Anchors (Order 19 hip line): x = median opaque column in the band 45-60% of the standing height above the ground,
y = frame bottom (lowest opaque row = the planted foot). Attack frames keep one x per facing (meta hip_px, the bow arm
crosses the band on some frames); walk frames use each frame's own hip x.
Nock: <o23>/nock_offsets.json (nock - hip at attack frame 8, 88-cell px) -> px relative to the feet anchor at this scale.
Arrow: <o23>/raw/arrow_<F>_00.png scaled the same, anchored on its tail (the nock end) so it leaves the string.
Order 27: with the Order 26 dir as a third argument every Rogue animation comes from the new rig (no Phase B frames):
idle (town), ready (dungeon idle), hit, cast, death from <o26>/raw, the attack from <o26>/raw where 26b re-rendered a facing
(SE, E) else <o23>/raw, the paler arrow and nock offsets from <o26>. Same camera, scale, label mapping and hip anchors. The
non-walk actions are anchored at one point per facing (meta hip x, the ground = lowest opaque row of the action's frame 0, where she stands):
the camera and root are fixed for them, so the body (and the death fall) moves exactly as rendered.
Usage: python3 scripts/rogue-o24.py <o23 dir> <out dir> [<o26 dir>]
  -> out/heroes-rogue-walk.png, heroes-rogue-attack.png (+ heroes-rogue-idle.png, heroes-rogue-combat.png), rogue-o24.json"""
import json, os, sys
import numpy as np
from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]
NEW = sys.argv[3] if len(sys.argv) > 3 else None   # Order 26 dir (Order 27 import)
os.makedirs(OUT, exist_ok=True)
meta = json.load(open(os.path.join(SRC, 'meta.json')))
meta26 = json.load(open(os.path.join(NEW, 'meta.json'))) if NEW else None
if meta26: assert meta26['camera'] == meta['camera'] and meta26['anchors']['hip_px'] == meta['anchors']['hip_px'] and meta26['cell'] == meta['cell']
nock = json.load(open(os.path.join(NEW or SRC, 'nock_offsets.json')))
nock = {f: v['offset_px'] for f, v in nock.items()}
FAC = meta['camera']['facings']
assert FAC == ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'], FAC
DIR_NAME = ['s', 'se', 'e', 'ne', 'n', 'nw', 'w', 'sw']  # src/art.ts: engine dir i -> art label
ENG_DIRS = [(1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1), (1, 0)]  # src/iso.ts DIRS (tile space)
NW, NA = meta['walk']['frames'], meta['attack']['frames']
assert (NW, meta['walk']['fps'], NA, meta['attack']['fps'], meta['attack']['release_frame']) == (8, 12, 16, 20, 8)
CW, CH = meta['cell']
RAW = os.path.join(SRC, 'raw')
RAW26 = os.path.join(NEW, 'raw') if NEW else None
SRC_USED = {}
def ld(n):
    p = os.path.join(RAW26, n) if RAW26 and os.path.exists(os.path.join(RAW26, n)) and not n.startswith('walk_') else os.path.join(RAW, n)
    SRC_USED[n] = p
    return Image.open(p).convert('RGBA')
RW, RH = ld('attack_S_00.png').size
if NEW: assert not os.path.exists(os.path.join(RAW26, 'attack_S_00.png')), 'scale reference row changed'
ACTS = [('walk', NW, round(1000 / meta['walk']['fps'])), ('attack', NA, 1000 // meta['attack']['fps'])]
if meta26: ACTS += [(k, meta26[k]['frames'], round(1000 / meta26[k]['fps'])) for k in ('idle', 'ready', 'hit', 'cast', 'death')]
a0 = np.array(ld('attack_S_00.png'))[:, :, 3] > 128
ys = np.nonzero(a0)[0]
S = 88 / (ys.max() - ys.min() + 1)           # raw -> screen px
H = 88
SW_, SH_ = round(RW * S), round(RH * S)
K = SW_ / CW                                  # 88-cell px -> screen px
print(f'scale {S:.4f} (raw {RW}x{RH} -> {SW_}x{SH_}), cell->screen {K:.4f}')

def scaled(name):
    return ld(name).resize((SW_, SH_), Image.Resampling.LANCZOS)

def trim(im):
    a = np.array(im)[:, :, 3]
    ys, xs = np.nonzero(a > 8)
    x0, y0 = int(xs.min()), int(ys.min())
    return im.crop((x0, y0, int(xs.max()) + 1, int(ys.max()) + 1)), x0, y0

def ground_and_hip(im):
    a = np.array(im)[:, :, 3] > 128
    ys = np.nonzero(a)[0]; g = int(ys.max()) + 1
    band = a[int(g - 0.60 * H):int(g - 0.45 * H)]
    return g, float(np.median(np.nonzero(band)[1]))

# the 88-cell dy shift per facing (find it by matching the sheet cell to the Lanczos copy of the raw frame)
sheet = np.array(Image.open(os.path.join(NEW or SRC, 'rogue_attack.png')).convert('RGBA'))[:, :, 3].astype(float)
DY = {}
for r, f in enumerate(FAC):
    ref = np.array(ld(f'attack_{f}_08.png').resize((CW, CH), Image.Resampling.LANCZOS))[:, :, 3].astype(float)
    cell = sheet[r * CH:(r + 1) * CH, 8 * CW:9 * CW]
    DY[f] = int(min(range(-20, 21), key=lambda d: np.abs(np.roll(ref, d, 0) - cell).sum()))

frames, cells = [], []
nocks, arrows = {}, {}
for r, f in enumerate(FAC):
    L = f.lower()
    hx_cell, hy_cell = meta['anchors']['hip_px'][f]
    hip_x_scr = hx_cell * K                    # x is not shifted in the cell
    for kind, n, ms in ACTS:
        G = ground_and_hip(scaled(f'{kind}_{f}_00.png'))[0]   # this action's ground row for this facing (frame 0 stands)
        for i in range(n):
            im = scaled(f'{kind}_{f}_{i:02d}.png')
            g, hx = ground_and_hip(im)
            if kind == 'walk': ax, ay = round(hx * 2) / 2, g
            elif kind == 'attack' and not meta26: ax, ay = hip_x_scr, g
            else: ax, ay = hip_x_scr, G
            t, ox, oy = trim(im)
            cells.append(t)
            frames.append({'id': f'rogue:{kind}:{L}:{i}', 'ax': round(float(ax - ox), 2), 'ay': int(ay - oy), 'ms': ms, '_img': len(cells) - 1})
            if kind == 'attack' and i == 8:
                # nock in screen px relative to the feet anchor: (hip + offset) in the raw camera, minus (anchor x, ground)
                nx = (hx_cell + nock[f][0]) * K
                ny = (hy_cell + nock[f][1] - DY[f]) * K
                nocks[L] = [round(float(nx - ax), 1), round(float(ny - ay), 1)]
    if not meta26:
        # Order 24: ready = attack frame 0 (the new rig's own stance; the Phase B ready is a different costume)
        f0 = next(fr for fr in frames if fr['id'] == f'rogue:attack:{L}:0')
        frames.append({**f0, 'id': f'rogue:ready:{L}:0', 'ms': 120})
    # arrow sprite for this facing, anchored on its tail (the end opposite the flight direction on screen)
    im = scaled(f'arrow_{f}_00.png')
    t, ox, oy = trim(im)
    a = np.array(t)[:, :, 3] > 100
    yy, xx = np.nonzero(a)
    dx, dy = ENG_DIRS[DIR_NAME.index(L)]
    vx, vy = (dx - dy) * 32, (dx + dy) * 16; l = (vx * vx + vy * vy) ** 0.5; vx, vy = vx / l, vy / l
    pr = xx * vx + yy * vy; sel = pr <= pr.min() + 1.5
    cells.append(t)
    frames.append({'id': f'arrow:{L}', 'ax': round(float(xx[sel].mean()), 1), 'ay': round(float(yy[sel].mean()), 1), '_img': len(cells) - 1})

# shelf pack (tallest first), 1 px padding
order = sorted(range(len(cells)), key=lambda i: -cells[i].size[1])
def pack(width):
    x = y = rowh = 0; pos = {}
    for i in order:
        w, h = cells[i].size
        if x + w > width: x, y, rowh = 0, y + rowh + 1, 0
        pos[i] = (x, y); x += w + 1; rowh = max(rowh, h)
    return pos, y + rowh
def best(idx_filter):
    global order
    keep = [i for i in sorted(range(len(cells)), key=lambda i: -cells[i].size[1]) if idx_filter(i)]
    order = keep
    return min(((w,) + pack(w) for w in range(256, 4097, 16) if pack(w)[1] <= 4096), key=lambda t: t[0] * t[2])

out = {'scale': S, 'cell_to_screen': K, 'dy': DY, 'nock': nocks, 'assets': {}}
act = lambda fr: fr['id'].split(':')[1] if fr['id'].startswith('rogue:') else 'arrow'
PARTS = [('walk', lambda fr: act(fr) == 'walk'), ('attack', lambda fr: act(fr) in ('attack', 'arrow') or (not meta26 and act(fr) == 'ready'))]
if meta26: PARTS += [('idle', lambda fr: act(fr) == 'idle'), ('combat', lambda fr: act(fr) in ('ready', 'hit', 'cast', 'death'))]
for name, pred in PARTS:
    sel = {fr['_img'] for fr in frames if pred(fr)}
    w, pos, h = best(lambda i: i in sel)
    atlas = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    for i in sel: atlas.paste(cells[i], pos[i])
    fn = f'heroes-rogue-{name}.png'
    atlas.save(os.path.join(OUT, fn), optimize=True)
    fl = []
    for fr in frames:
        if not pred(fr): continue
        x, y = pos[fr['_img']]; cw, ch = cells[fr['_img']].size
        e = {'id': fr['id'], 'x': x, 'y': y, 'w': cw, 'h': ch, 'ax': fr['ax'], 'ay': fr['ay']}
        if 'ms' in fr: e['ms'] = fr['ms']
        fl.append(e)
    out['assets'][name] = {'file': fn, 'w': w, 'h': h, 'mib': round(w * h * 4 / 1048576, 3), 'frames': fl}
    print(f'{fn}: {w}x{h} = {w * h * 4 / 1048576:.3f} MiB, {len(fl)} frames')
print('dy', DY); print('nock', nocks)
out['sources'] = sorted({os.path.dirname(os.path.dirname(p)) for p in SRC_USED.values()})
out['from_o26'] = sorted({n.rsplit('_', 1)[0] for n, p in SRC_USED.items() if RAW26 and p.startswith(RAW26)})
print('from o26:', out['from_o26'])
json.dump(out, open(os.path.join(OUT, 'rogue-o24.json'), 'w'), indent=1)
