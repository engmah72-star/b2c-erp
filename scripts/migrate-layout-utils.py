#!/usr/bin/env python3
"""
Phase-1 system-wide standardization: fold byte-equal layout/align inline
styles onto existing shared.css utilities (RULE U1 / C1.7). Zero visual
change. Hardened against JS comparisons (see transform_tag guard).
"""
import re, glob

# full style value -> (utility classes, residual style kept inline)
MAPPING = {
    "flex:1;min-width:0": ("flex-1 min-w-0", ""),
    "width:100%":         ("w-full", ""),
    "text-align:center":  ("text-center", ""),
    "text-align:left":    ("text-left", ""),
    "text-align:right":   ("text-right", ""),
    "cursor:pointer":     ("cursor-pointer", ""),
}

TAG_RE = re.compile(r'<[a-zA-Z][^>]*?>', re.S)
STYLE_RE = re.compile(r'\s+style="([^"]*)"')
CLASS_RE = re.compile(r'(\sclass=")([^"]*)(")')

def transform_tag(tag):
    # Guard: a real HTML opening tag never contains JS markers. Prevents JS
    # comparisons like `a<b` (inside <script>) being mistaken for tags.
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
        nm = re.match(r'<[a-zA-Z][a-zA-Z0-9]*', t)
        ins = ' class="' + util + '"'
        t = t[:nm.end()] + ins + t[nm.end():]
        insert_at = nm.end() + len(ins)
    if residual:
        t = t[:insert_at] + ' style="' + residual + '"' + t[insert_at:]
    return t, 1

def process(text):
    n = [0]
    def repl(mo):
        nt, c = transform_tag(mo.group(0)); n[0] += c; return nt
    return TAG_RE.sub(repl, text), n[0]

total = 0
for f in sorted(glob.glob("*.html")) + sorted(glob.glob("features/**/*.js", recursive=True)):
    src = open(f, encoding="utf-8").read()
    out, c = process(src)
    if c:
        open(f, "w", encoding="utf-8").write(out)
        print(f"{f}: {c}"); total += c
print(f"TOTAL: {total}")
