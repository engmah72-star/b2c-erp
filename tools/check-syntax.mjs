#!/usr/bin/env node
// tools/check-syntax.mjs
// ─────────────────────────────────────────────────────────────────────
// JS syntax gate. Parses every JavaScript module in the repo (standalone
// .js/.mjs that use import/export, plus every inline <script type="module">
// in .html) with `node --check`, in MODULE mode. Classic scripts (no
// import/export) are checked in script mode.
//
// Catches errors that never reach runtime tests — e.g. a duplicate top-level
// `function` declaration in a page's module scope (the renderPermissions
// collision that broke employee-profile.html). No deps, no network.
//
// Usage: node tools/check-syntax.mjs   (exit 1 on any syntax error)
// ─────────────────────────────────────────────────────────────────────

import { readdirSync, readFileSync, writeFileSync, mkdtempSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['node_modules', '.git', '.github', 'docs', 'dist', 'build', 'vendor', 'coverage']);
const TMP = mkdtempSync(join(tmpdir(), 'syntax-'));

// top-level import/export ⇒ treat as an ES module.
const MODULE_RE = /^[\t ]*(import|export)[\s{*'"]/m;
// inline module scripts (skip external `src=` tags — no inline body).
const SCRIPT_RE = /<script\b([^>]*)\btype=["']module["']([^>]*)>([\s\S]*?)<\/script>/gi;

let checked = 0;
const failures = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full);
    else if (st.isFile()) checkFile(full);
  }
}

function rel(p) { return p.startsWith(ROOT) ? p.slice(ROOT.length + 1) : p; }

// Run `node --check` on a snippet written to a temp module file.
function checkModuleSource(label, source) {
  const tmp = join(TMP, 'm' + (checked++) + '.mjs');
  writeFileSync(tmp, source);
  try {
    execFileSync(process.execPath, ['--check', tmp], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    const msg = (e.stderr ? e.stderr.toString() : e.message)
      .split('\n').filter(Boolean).slice(0, 4).join('\n    ');
    failures.push(`✗ ${label}\n    ${msg}`);
  }
}

// Check a real file in script mode (classic, non-module .js).
function checkScriptFile(file) {
  checked++;
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    const msg = (e.stderr ? e.stderr.toString() : e.message)
      .split('\n').filter(Boolean).slice(0, 4).join('\n    ');
    failures.push(`✗ ${rel(file)}\n    ${msg}`);
  }
}

function checkFile(file) {
  const ext = extname(file);
  if (ext === '.mjs') {
    checkModuleSource(rel(file), readFileSync(file, 'utf8'));
  } else if (ext === '.js') {
    const src = readFileSync(file, 'utf8');
    if (MODULE_RE.test(src)) checkModuleSource(rel(file), src);
    else checkScriptFile(file);
  } else if (ext === '.html') {
    const html = readFileSync(file, 'utf8');
    let m, i = 0;
    while ((m = SCRIPT_RE.exec(html)) !== null) {
      const attrs = m[1] + ' ' + m[2];
      if (/\bsrc=/.test(attrs)) continue;           // external module, no inline body
      const body = m[3];
      if (!body.trim()) continue;
      checkModuleSource(`${rel(file)} › inline module #${++i}`, body);
    }
  }
}

walk(ROOT);

console.log(`🔎 checked ${checked} module(s)/script(s)`);
if (failures.length) {
  console.error(`\n❌ ${failures.length} syntax error(s):\n`);
  console.error(failures.join('\n\n'));
  process.exit(1);
}
console.log('✅ no syntax errors');
