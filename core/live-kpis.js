/**
 * core/live-kpis.js — reads pre-computed KPIs from aggregations/live_kpis
 *
 * Cloud Function (computeLiveKPIs) runs every 5 min and writes one doc
 * with pipeline counts, monthly revenue, financials — computed via
 * Firestore count()/sum() queries (zero doc reads).
 *
 * Dashboards subscribe here instead of pulling 5000+ orders to count locally.
 */

import { dataCache } from './data-cache.js';

let _kpis = null;
let _listeners = new Set();
let _subbed = false;

function _notify() {
  _listeners.forEach(fn => { try { fn(_kpis); } catch (_) {} });
}

export function subscribeKPIs(cb) {
  _listeners.add(cb);
  if (_kpis) cb(_kpis);

  if (!_subbed) {
    _subbed = true;
    dataCache.getDoc('aggregations', 'live_kpis', { maxAge: 5 * 60 * 1000 })
      .then(result => {
        if (result.data) {
          _kpis = result.data;
          _notify();
        }
      })
      .catch(() => {});
  }

  return () => _listeners.delete(cb);
}

export function getKPIs() {
  return _kpis;
}
