/**
 * Action Bus contract (Phase 3) — sidebar/FAB → workspace action intents.
 *
 * Locks the dispatch ⇄ ACK round-trip so the "coming soon" toast only
 * appears for pages that haven't been ported, while ACK'd actions resolve
 * true (the page handled it inline). No breakage for legacy pages.
 *
 * Run: node tests/runtime-action-bus.test.mjs
 */
import assert from 'node:assert';

// ── stub window/document BEFORE importing the module ──
let _msgHandler = null;
globalThis.window = {
  addEventListener(type, fn) { if (type === 'message') _msgHandler = fn; },
};
let _frames = [];
globalThis.document = {
  querySelectorAll(sel) { return sel === '.rt-workspace-frame' ? _frames : []; },
};

const bus = await import('../core/runtime-shell/action-bus.js');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log('✓ ' + name); passed++; }
  catch (e) { console.log('✗ ' + name + '\n    ' + e.message); failed++; }
}
function makeFrame() {
  const sent = [];
  return { sent, contentWindow: { postMessage: (m) => sent.push(m) } };
}

await test('dispatch with no frames → resolves false (no workspace yet)', async () => {
  bus._reset(); _frames = [];
  assert.strictEqual(await bus.dispatch('clients', 'openAddClient'), false);
});

await test('dispatch posts intent to frames + resolves true on ACK', async () => {
  bus._reset(); bus.init();
  const f = makeFrame(); _frames = [f];
  const p = bus.dispatch('clients', 'openAddClient', { label: 'عميل جديد' });
  assert.strictEqual(f.sent.length, 1, 'message posted to the frame');
  const msg = f.sent[0];
  assert.strictEqual(msg.type, 'b2c:runtime-action');
  assert.strictEqual(msg.domain, 'clients');
  assert.strictEqual(msg.action, 'openAddClient');
  assert.deepStrictEqual(msg.payload, { label: 'عميل جديد' });
  assert.ok(msg.nonce, 'carries a nonce');
  // simulate the page acknowledging
  _msgHandler({ data: { type: 'b2c:runtime-action-ack', nonce: msg.nonce } });
  assert.strictEqual(await p, true);
});

await test('dispatch resolves false when nobody ACKs (timeout fallback)', async () => {
  bus._reset(); bus.init();
  _frames = [makeFrame()];
  assert.strictEqual(await bus.dispatch('clients', 'openAddClient'), false);
});

await test('ACK with unknown nonce is ignored (no throw)', async () => {
  bus._reset(); bus.init();
  _msgHandler({ data: { type: 'b2c:runtime-action-ack', nonce: 'ghost' } });
  assert.ok(true);
});

await test('dispatch without an action id → false', async () => {
  bus._reset();
  _frames = [makeFrame()];
  assert.strictEqual(await bus.dispatch('clients', ''), false);
});

await test('domain is forwarded so the right page can filter', async () => {
  bus._reset(); bus.init();
  const f = makeFrame(); _frames = [f];
  bus.dispatch('design', 'openUploadDesign');
  assert.strictEqual(f.sent[0].domain, 'design');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
