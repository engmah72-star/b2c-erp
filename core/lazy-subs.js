/**
 * core/lazy-subs.js — Staggered subscription loading
 *
 * Instead of firing all Firestore subscriptions at once (connection storm),
 * this utility lets pages declare subscriptions with priorities and fires
 * them in waves: critical data first, secondary after first render.
 *
 * Usage:
 *   import { staggerSubs } from './core/lazy-subs.js';
 *
 *   staggerSubs([
 *     { priority: 0, fn: () => dataCache.subscribe(ordersSpec, cb) },
 *     { priority: 0, fn: () => dataCache.subscribe(clientsSpec, cb) },
 *     { priority: 1, fn: () => dataCache.subscribe(walletsSpec, cb) },
 *     { priority: 2, fn: () => dataCache.subscribe(convsSpec, cb) },
 *   ]);
 *
 *   Priority 0: fires immediately (critical path data)
 *   Priority 1: fires after first paint (~100ms idle callback)
 *   Priority 2: fires after 1s (non-essential data)
 */

const DELAYS = [0, 100, 1000];

export function staggerSubs(subs) {
  const groups = new Map();
  for (const s of subs) {
    const p = Math.min(s.priority || 0, DELAYS.length - 1);
    if (!groups.has(p)) groups.set(p, []);
    groups.get(p).push(s.fn);
  }

  for (const [priority, fns] of groups) {
    if (priority === 0) {
      fns.forEach(fn => fn());
    } else {
      const delay = DELAYS[priority];
      if (typeof requestIdleCallback === 'function' && priority === 1) {
        requestIdleCallback(() => fns.forEach(fn => fn()), { timeout: delay + 200 });
      } else {
        setTimeout(() => fns.forEach(fn => fn()), delay);
      }
    }
  }
}

export function deferUntilVisible(el, fn) {
  if (!('IntersectionObserver' in window)) { fn(); return; }
  const obs = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      obs.disconnect();
      fn();
    }
  }, { rootMargin: '200px' });
  obs.observe(el);
}
