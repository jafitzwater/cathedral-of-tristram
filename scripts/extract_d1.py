# Extract D1 v1.09 numeric tables from a local devilution checkout (Source/*.cpp) into src/data/gen/*.json.
# Usage: python3 scripts/extract_d1.py /path/to/devilution/Source
import json, re, sys, os
src = sys.argv[1]; out = os.path.join(os.path.dirname(__file__), '..', 'src', 'data', 'gen'); os.makedirs(out, exist_ok=True)

def nohellfire(text):
    res, stack = [], []  # stack of (is_hellfire_block, in_else)
    for line in text.split('\n'):
        s = line.strip()
        if s.startswith('#if'):
            stack.append(['HELLFIRE' in s and not s.startswith('#ifndef'), False, s.startswith('#ifndef') and 'HELLFIRE' in s]); continue
        if s.startswith('#else') and stack: stack[-1][1] = True; continue
        if s.startswith('#endif') and stack: stack.pop(); continue
        skip = False
        for hf, el, ndef in stack:
            if hf and not el: skip = True
            if ndef and el: skip = True
        if not skip: res.append(line)
    return '\n'.join(res)

def rows(text, start, end):
    i = text.index(start); j = text.index(end, i)
    body = text[i:j]
    return [r for r in re.findall(r'\{([^{}]*?(?:\{[^{}]*\}[^{}]*?)*)\}\s*,', body.split('{', 1)[1])]

def fields(r):
    r = re.sub(r'/\*.*?\*/', '', r)
    parts, depth, cur = [], 0, ''
    for ch in r:
        if ch == '{': depth += 1
        if ch == '}': depth -= 1
        if ch == ',' and depth == 0: parts.append(cur.strip()); cur = ''
        else: cur += ch
    if cur.strip(): parts.append(cur.strip())
    return parts

def val(x):
    x = x.strip()
    if x.startswith('"'): return x.strip('"')
    if x in ('NULL',): return None
    if x == 'TRUE': return True
    if x == 'FALSE': return False
    try: return int(x, 0)
    except ValueError: return [p.strip() for p in x.split('|')] if '|' in x else x

itemdat = nohellfire(open(os.path.join(src, 'itemdat.cpp')).read())
keys = 'iRnd iClass iLoc iCurs itype iItemId iName iSName iMinMLvl iDurability iMinDam iMaxDam iMinAC iMaxAC iMinStr iMinMag iMinDex iFlags iMiscId iSpell iUsable iValue iMaxValue'.split()
items = []
for r in rows(itemdat, 'AllItemsList[]', '};'):
    f = [val(x) for x in fields(r)]
    if len(f) == len(keys): items.append(dict(zip(keys, f)))
pk = 'name power p1 p2 minlvl itype goe double ok minval maxval mult'.split()
def affixes(name):
    out = []
    for r in rows(itemdat, name, '};'):
        f = [val(x) for x in fields(r)]
        if len(f) == len(pk) and f[0]:
            d = dict(zip(pk, f)); d['itype'] = d['itype'] if isinstance(d['itype'], list) else [d['itype']]; out.append(d)
    return out
uk = 'name itype qlvl numpl value'.split()
json.dump({'items': items, 'prefixes': affixes('PL_Prefix[]'), 'suffixes': affixes('PL_Suffix[]')}, open(os.path.join(out, 'itemdat.json'), 'w'), indent=0)
print(len(items), 'items')

spelldat = nohellfire(open(os.path.join(src, 'spelldat.cpp')).read())
sk = 'id mana type name skill bookLvl staffLvl targeted town minMag sfx missiles manaAdj minMana staffMin staffMax bookCost staffCost'.split()
spells = []
for r in rows(spelldat, 'spelldata[]', '};'):
    f = [val(x) for x in fields(r)]
    if len(f) == len(sk) and f[3]: d = dict(zip(sk, f)); d.pop('missiles'); d.pop('sfx'); spells.append(d)
json.dump(spells, open(os.path.join(out, 'spelldat.json'), 'w'), indent=0)
monstdat = nohellfire(open(os.path.join(src, 'monstdat.cpp')).read())
mk = 'width image file gtype sndfile snd_special has_trans trans frames rate name minDlvl maxDlvl mlvl minHp maxHp ai flags int hit afnum minDam maxDam hit2 afnum2 minDam2 maxDam2 ac mclass mres mres2 treasure selflag exp'.split()
mons = []
for r in rows(monstdat, 'monsterdata[]', '};'):
    f = [val(x) for x in fields(r)]
    if len(f) == len(mk): d = dict(zip(mk, f)); mons.append({k: d[k] for k in 'name minDlvl maxDlvl mlvl minHp maxHp ai int hit minDam maxDam ac mclass mres treasure exp frames rate'.split()})
json.dump(mons, open(os.path.join(out, 'monstdat.json'), 'w'), indent=0)
print(len(spells), 'spells', len(mons), 'monsters')
