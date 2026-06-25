/**
 * core/perf-monitor.js — lightweight performance monitoring
 *
 * Tracks Core Web Vitals, cache hit rates, page load timing,
 * and Firebase query performance. Data stored in-memory with
 * optional console report via window.__perfReport().
 */

const _metrics = {
  pageLoadStart: typeof performance !== 'undefined' ? performance.timeOrigin : Date.now(),
  navigation: {},
  vitals: {},
  cache: { hits: 0, misses: 0, l1: 0, l2: 0, l3: 0 },
  queries: { count: 0, totalMs: 0, slowest: null },
  renders: [],
};

function _observeVitals() {
  if (typeof PerformanceObserver === 'undefined') return;

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'largest-contentful-paint') {
          _metrics.vitals.lcp = Math.round(entry.startTime);
        }
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (_) {}

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!_metrics.vitals.fid) {
          _metrics.vitals.fid = Math.round(entry.processingStart - entry.startTime);
        }
      }
    }).observe({ type: 'first-input', buffered: true });
  } catch (_) {}

  try {
    let clsValue = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) clsValue += entry.value;
      }
      _metrics.vitals.cls = Math.round(clsValue * 1000) / 1000;
    }).observe({ type: 'layout-shift', buffered: true });
  } catch (_) {}
}

function _observeNavigation() {
  if (typeof performance === 'undefined') return;
  const done = () => {
    const nav = performance.getEntriesByType?.('navigation')?.[0];
    if (!nav) return;
    _metrics.navigation = {
      dns: Math.round(nav.domainLookupEnd - nav.domainLookupStart),
      tcp: Math.round(nav.connectEnd - nav.connectStart),
      ttfb: Math.round(nav.responseStart - nav.requestStart),
      domReady: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
      load: Math.round(nav.loadEventEnd - nav.startTime),
    };
  };
  if (document.readyState === 'complete') done();
  else window.addEventListener('load', () => setTimeout(done, 0), { once: true });
}

export function trackCacheHit(source) {
  _metrics.cache.hits++;
  if (source === 'memory') _metrics.cache.l1++;
  else if (source === 'cache') _metrics.cache.l2++;
}

export function trackCacheMiss() {
  _metrics.cache.misses++;
  _metrics.cache.l3++;
}

export function trackQuery(collection, durationMs) {
  _metrics.queries.count++;
  _metrics.queries.totalMs += durationMs;
  if (!_metrics.queries.slowest || durationMs > _metrics.queries.slowest.ms) {
    _metrics.queries.slowest = { collection, ms: Math.round(durationMs) };
  }
}

export function trackRender(name, durationMs) {
  if (_metrics.renders.length >= 50) _metrics.renders.shift();
  _metrics.renders.push({ name, ms: Math.round(durationMs), ts: Date.now() });
}

export function getMetrics() {
  const c = _metrics.cache;
  const total = c.hits + c.misses;
  return {
    ..._metrics,
    cache: {
      ...c,
      hitRate: total > 0 ? Math.round((c.hits / total) * 100) : 0,
    },
    queries: {
      ..._metrics.queries,
      avgMs: _metrics.queries.count > 0
        ? Math.round(_metrics.queries.totalMs / _metrics.queries.count)
        : 0,
    },
    uptime: Math.round((Date.now() - _metrics.pageLoadStart) / 1000),
  };
}

function _report() {
  const m = getMetrics();
  console.group('%c⚡ B2C Perf Report', 'color:#6366f1;font-weight:bold');
  console.log('Navigation:', m.navigation);
  console.log('Vitals:', m.vitals);
  console.log(`Cache: ${m.cache.hitRate}% hit rate (L1:${m.cache.l1} L2:${m.cache.l2} L3:${m.cache.l3})`);
  console.log(`Queries: ${m.queries.count} total, ${m.queries.avgMs}ms avg`, m.queries.slowest ? `slowest: ${m.queries.slowest.collection} ${m.queries.slowest.ms}ms` : '');
  if (m.renders.length) {
    const slow = m.renders.filter(r => r.ms > 100);
    if (slow.length) console.warn('Slow renders (>100ms):', slow);
  }
  console.log(`Uptime: ${m.uptime}s`);
  console.groupEnd();
  return m;
}

if (typeof window !== 'undefined') {
  _observeVitals();
  _observeNavigation();
  window.__perfReport = _report;
  window.__perfMetrics = getMetrics;
}
