#!/usr/bin/env python3
"""
Migrate exact-match inline styles to existing shared.css utility classes.
RULE U1 / C1.7 — visually 1:1 equivalent, no new tokens, no look change.
Only transforms style attributes whose FULL value exactly matches a mapping key.
"""
import re, sys, glob, os

MAPPING = {
    "color:var(--dim2)": "text-muted",
    "color:var(--r)": "text-r",
    "color:var(--g)": "text-g",
    "color:var(--y)": "text-y",
    "color:var(--b)": "text-b",
    "color:var(--p)": "text-p",
    "color:var(--c)": "text-c",
    "color:var(--o)": "text-o",
    "color:var(--snow)": "text-snow",
    "flex:1": "flex-1",
}

TAG_RE = re.compile(r'<[a-zA-Z][^>]*?>', re.S)
STYLE_RE = re.compile(r'\s+style="([^"]*)"')
CLASS_RE = re.compile(r'(\sclass=")([^"]*)(")')

def transform_tag(tag):
    m = STYLE_RE.search(tag)
    if not m:
        return tag, 0
    val = m.group(1).strip()
    if val not in MAPPING:
        return tag, 0
    util = MAPPING[val]
    # remove the style attribute
    new_tag = tag[:m.start()] + tag[m.end():]
    cm = CLASS_RE.search(new_tag)
    if cm:
        # merge into existing class (avoid duplicate)
        existing = cm.group(2).split()
        if util not in existing:
            merged = (cm.group(2) + " " + util).strip()
            new_tag = new_tag[:cm.start()] + cm.group(1) + merged + cm.group(3) + new_tag[cm.end():]
    else:
        # insert class attr right after the tag name
        nm = re.match(r'<[a-zA-Z][a-zA-Z0-9]*', new_tag)
        end = nm.end()
        new_tag = new_tag[:end] + ' class="' + util + '"' + new_tag[end:]
    return new_tag, 1

def process(text):
    count = [0]
    def repl(mo):
        new_tag, c = transform_tag(mo.group(0))
        count[0] += c
        return new_tag
    return TAG_RE.sub(repl, text), count[0]

def main():
    files = sorted(glob.glob("*.html"))
    total = 0
    for f in files:
        with open(f, encoding="utf-8") as fh:
            src = fh.read()
        out, c = process(src)
        if c:
            with open(f, "w", encoding="utf-8") as fh:
                fh.write(out)
            print(f"{f}: {c}")
            total += c
    print(f"TOTAL: {total}")

if __name__ == "__main__":
    main()
