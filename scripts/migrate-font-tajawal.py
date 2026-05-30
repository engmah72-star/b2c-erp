#!/usr/bin/env python3
"""
Swap the system font to Tajawal (RULE U1.3). Two operations:
  1) Google Fonts <link>: IBM Plex Sans Arabic -> Tajawal (supported weights).
  2) Inline font-family literals 'IBM Plex Sans Arabic' -> 'Tajawal','IBM Plex
     Sans Arabic' (Tajawal first, IBM Plex kept as graceful fallback).
shared.css excluded — it uses the central --font-ar token instead.
Idempotent: a literal already prefixed with Tajawal is left untouched.
"""
import re, glob

LINK_RE = re.compile(r'family=IBM\+Plex\+Sans\+Arabic:wght@[0-9;]+')
LINK_NEW = 'family=Tajawal:wght@400;500;700;800;900'
LIT_RE = re.compile(r"(?<!Tajawal',)'IBM Plex Sans Arabic'")
LIT_NEW = "'Tajawal','IBM Plex Sans Arabic'"

tl = tlit = 0
for f in sorted(glob.glob("*.html")) + sorted(glob.glob("*.css")):
    if f == "shared.css":
        continue
    t = open(f, encoding="utf-8").read()
    t, nL = LINK_RE.subn(LINK_NEW, t)
    t, nLit = LIT_RE.subn(LIT_NEW, t)
    if nL or nLit:
        open(f, "w", encoding="utf-8").write(t)
        print(f"{f}: links={nL} literals={nLit}")
        tl += nL; tlit += nLit
print(f"TOTAL links={tl} literals={tlit}")
