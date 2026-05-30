#!/usr/bin/env python3
"""
Phase-2a button standardization: fold the well-defined "soft-tinted rectangular"
inline buttons onto the canonical .btn color variants (RULE U1.4 / C1.7).
Curated exact-full-style mapping only — special buttons (icon/circular/gradient/
full-width/dynamic/neutral-snow) are intentionally left for later (visual QA).
Functional attrs (onclick/id) preserved; display:none kept as residual style.
"""
import re, glob

# exact full style value -> (utility classes, residual style preserved inline)
MAPPING = {
 "padding:8px 14px;border-radius:8px;border:1px solid rgba(167,139,250,.4);background:rgba(167,139,250,.15);color:var(--p);cursor:pointer;font-family:inherit;font-size:var(--fs-base);font-weight:var(--fw-extra)": ("btn btn-p",""),
 "padding:8px 14px;border-radius:8px;border:1px solid rgba(0,217,126,.4);background:rgba(0,217,126,.12);color:var(--g);cursor:pointer;font-family:inherit;font-size:var(--fs-base);font-weight:var(--fw-extra)": ("btn btn-g",""),
 "padding:8px 14px;border-radius:8px;border:1px solid rgba(0,217,126,.4);background:rgba(0,217,126,.15);color:var(--g);cursor:pointer;font-family:inherit;font-size:var(--fs-base);font-weight:var(--fw-extra)": ("btn btn-g",""),
 "padding:8px 14px;border-radius:8px;border:1px solid rgba(255,170,0,.4);background:rgba(255,170,0,.15);color:var(--y);cursor:pointer;font-family:inherit;font-size:var(--fs-base);font-weight:var(--fw-extra)": ("btn btn-y",""),
 "padding:8px 18px;background:rgba(255,170,0,.15);border:1px solid rgba(255,170,0,.4);border-radius:8px;color:var(--y);font-weight:var(--fw-extra);font-size:var(--fs-base);cursor:pointer;font-family:inherit;": ("btn btn-y",""),
 "padding:8px 14px;border-radius:8px;border:1px solid rgba(59,158,255,.5);background:rgba(59,158,255,.15);color:var(--b-bright);cursor:pointer;font-weight:var(--fw-bold);font-size:var(--fs-base)": ("btn btn-b",""),
 "padding:8px 14px;border-radius:8px;border:1px solid rgba(0,217,126,.3);background:rgba(0,217,126,.12);color:var(--g);font-size:var(--fs-base);font-weight:var(--fw-extra);cursor:pointer;font-family:inherit;display:none": ("btn btn-g","display:none"),
 "display:none;padding:6px 12px;border-radius:8px;border:1px solid rgba(255,61,110,.3);background:rgba(255,61,110,.12);color:var(--r);font-size:var(--fs-sm);font-weight:var(--fw-extra);cursor:pointer;font-family:inherit;white-space:nowrap": ("btn btn-r btn-sm","display:none"),
 "display:none;padding:6px 12px;border-radius:8px;border:1px solid rgba(255,170,0,.3);background:rgba(255,170,0,.12);color:var(--y);font-size:var(--fs-sm);font-weight:var(--fw-extra);cursor:pointer;font-family:inherit;white-space:nowrap": ("btn btn-y btn-sm","display:none"),
}

TAG_RE = re.compile(r'<button[^>]*?>', re.S)
STYLE_RE = re.compile(r'\s+style="([^"]*)"')
CLASS_RE = re.compile(r'(\sclass=")([^"]*)(")')

def transform_tag(tag):
    if re.search(r'[`{}]', tag):
        return tag, 0
    m = STYLE_RE.search(tag)
    if not m:
        return tag, 0
    val = m.group(1).strip()
    if val not in MAPPING:
        return tag, 0
    util, residual = MAPPING[val]
    t = tag[:m.start()] + tag[m.end():]
    cm = CLASS_RE.search(t)
    if cm:
        existing = cm.group(2).split()
        add = [c for c in util.split() if c not in existing]
        merged = (cm.group(2) + (" " + " ".join(add) if add else "")).strip()
        t = t[:cm.start()] + cm.group(1) + merged + cm.group(3) + t[cm.end():]
        insert_at = cm.start() + len(cm.group(1) + merged + cm.group(3))
    else:
        nm = re.match(r'<button', t)
        ins = ' class="' + util + '"'
        t = t[:nm.end()] + ins + t[nm.end():]
        insert_at = nm.end() + len(ins)
    if residual:
        t = t[:insert_at] + ' style="' + residual + '"' + t[insert_at:]
    return t, 1

def process(text):
    n=[0]
    def repl(mo):
        nt,c=transform_tag(mo.group(0)); n[0]+=c; return nt
    return TAG_RE.sub(repl, text), n[0]

total=0
for f in sorted(glob.glob("*.html")):
    src=open(f,encoding="utf-8").read()
    out,c=process(src)
    if c:
        open(f,"w",encoding="utf-8").write(out); print(f"{f}: {c}"); total+=c
print(f"TOTAL: {total}")
