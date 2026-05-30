#!/usr/bin/env python3
"""
Consolidate exact-match inline styles in employee-profile view modules onto
existing shared.css utility classes (RULE U1 / C1.7). Byte-equivalent: any
non-tokenizable remainder is preserved in a separate style attribute.
"""
import re, glob

# full style value -> (utility classes, residual style kept inline)
MAPPING = {
    "color:var(--b)":      ("text-b", ""),
    "color:var(--y)":      ("text-y", ""),
    "color:var(--g)":      ("text-g", ""),
    "color:var(--r)":      ("text-r", ""),
    "color:var(--snow)":   ("text-snow", ""),
    "color:var(--dim2)":   ("text-muted", ""),
    "flex:1":              ("flex-1", ""),
    "flex:1;min-width:0":  ("flex-1 min-w-0", ""),
    "width:100%":          ("w-full", ""),
    "font-size:var(--fs-xs);color:var(--dim2)":               ("txt-meta-xs", ""),
    "font-size:var(--fs-xs);color:var(--dim2);margin-top:2px": ("txt-meta-xs", "margin-top:2px"),
    "font-size:var(--fs-xs);color:var(--dim2);margin-top:3px": ("txt-meta-xs", "margin-top:3px"),
    "font-size:var(--fs-xs);color:var(--dim2);margin-top:4px": ("txt-meta-xs", "margin-top:4px"),
    "font-size:var(--fs-xs);color:var(--dim2);margin-right:68px": ("txt-meta-xs", "margin-right:68px"),
    "font-size:var(--fs-sm);color:var(--dim2)":               ("txt-meta-sm", ""),
    "font-size:var(--fs-tiny);color:var(--dim2);font-weight:var(--fw-bold)": ("txt-meta-tiny", "font-weight:var(--fw-bold)"),
    "font-size:var(--fs-base);font-weight:var(--fw-medium);color:var(--dim2)": ("txt-meta-base", "font-weight:var(--fw-medium)"),
}

TAG_RE = re.compile(r'<[a-zA-Z][^>]*?>', re.S)
STYLE_RE = re.compile(r'\s+style="([^"]*)"')
CLASS_RE = re.compile(r'(\sclass=")([^"]*)(")')

def transform_tag(tag):
    # Guard: a real HTML opening tag never contains JS markers. This prevents
    # JS comparisons like `a<b` (inside <script>) from being mistaken for tags.
    if re.search(r'[`{};]', tag):
        return tag, 0
    m = STYLE_RE.search(tag)
    if not m:
        return tag, 0
    val = m.group(1).strip()
    if val not in MAPPING:
        return tag, 0
    util, residual = MAPPING[val]
    t = tag[:m.start()] + tag[m.end():]          # drop style attr
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
for f in sorted(glob.glob("features/employee-profile/views/*.js")):
    src = open(f, encoding="utf-8").read()
    out, c = process(src)
    if c:
        open(f, "w", encoding="utf-8").write(out)
        print(f"{f}: {c}"); total += c
print(f"TOTAL: {total}")
