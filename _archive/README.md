# `_archive/` — quarantine for files marked dead

Files here have been identified by `DEAD_CODE_AUDIT.md` as unreferenced
in the active codebase. They are **not deleted yet** — kept here for a
~2-week validation window in case any forgotten path (cron, deep link,
external integration) breaks.

## What's here

| File | Why | Archived in |
|------|-----|---|
| `ml-dashboard.html` | Zero in-repo refs; experimental ML page | PR-4B |
| `ml-dashboard.css` | Orphan stylesheet for the above | PR-4B |
| `order-handoff-mockup.html` | Design mockup (purpose served) | PR-4B |
| `tenant-migration.html` | Multi-tenant work paused | PR-4B |
| `ai-anomalies.js` | AI experiment, never wired up | PR-4B |

## How to un-archive

If you discover one of these is actually needed:

```bash
git mv _archive/{file} .
# Then update sw.js / sidebar-config.js as appropriate to re-register it
```

## Deletion policy

After **2 weeks** without complaints, the contents may be permanently deleted via:

```bash
git rm _archive/*
```

The full history remains in git regardless — `git log --follow {file}` can resurrect.
