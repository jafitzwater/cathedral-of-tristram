#!/usr/bin/env python3
"""Order 19: feet anchors for the Phase B split atlases (tight per-frame crops, no shared render canvas).

The pack's anchor_px is the lowest opaque pixel (the planted foot), which slides under the body in a walk cycle (up to
11 px head jitter). Each frame is anchored on its hip line instead: x = median opaque column in the band 45-60% of the
actor's standing height above the ground, y = the frame bottom (the ground; checked: no weapon dips below the feet).
Death frames keep frame 0's hip x and follow the pack's foot anchor from there (the hips fall out of the band).
Usage: python3 scripts/actor-anchors.py <staging art dir> <out.json>"""
import glob, json, os, sys
import numpy as np
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
res = {}
for f in sorted(glob.glob(os.path.join(src, 'heroes', '*-*.json')) + sorted(glob.glob(os.path.join(src, 'npcs', '*-*.json')))):
    m = json.load(open(f))
    if not str(m.get('kind', '')).endswith('-atlas'): continue
    alpha = np.array(Image.open(os.path.join(src, m['atlas'])).convert('RGBA'))[:, :, 3] > 128
    H = m['target_standing_height_px']
    hip = {}
    def hip_x(fr):
        X, Y = fr['atlas_xy']; a = alpha[Y:Y + fr['h'], X:X + fr['w']]; h = a.shape[0]
        sub = a[max(0, int(h - 0.60 * H)):max(1, int(h - 0.45 * H))]
        return float(np.median(np.nonzero(sub)[1])) if sub.sum() >= 4 else None
    frames = {}
    for fr in m['frames']:
        k = f"{fr['action']}:{fr['dir']}:{fr['index']}"
        if fr['action'] == 'death' and fr['index'] > 0: continue
        x = hip_x(fr)
        frames[k] = [round(x * 2) / 2 if x is not None else fr['anchor_px'][0], float(fr['h'])]
    for fr in m['frames']:
        if fr['action'] != 'death' or fr['index'] == 0: continue
        f0 = next(q for q in m['frames'] if q['action'] == 'death' and q['dir'] == fr['dir'] and q['index'] == 0)
        x0 = frames[f"death:{fr['dir']}:0"][0]
        frames[f"death:{fr['dir']}:{fr['index']}"] = [round((x0 + fr['anchor_px'][0] - f0['anchor_px'][0]) * 2) / 2, float(fr['h'])]
    res[m['name']] = frames
json.dump(res, open(out, 'w'))
print(f'anchors for {len(res)} atlases -> {out}')
