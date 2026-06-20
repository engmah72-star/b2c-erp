/**
 * core/collection-registry.js — سجل مركزي لحالة البيانات
 *
 * يتتبع كل collection محمّل: حالته (idle/loading/synced/stale/error)،
 * آخر مزامنة، عدد الوثائق، عدد المشتركين. يمنع إعادة الجلب غير الضرورية
 * ويُعلم الصفحات بما تم تحميله وما يحتاج تحديث.
 *
 * المبدأ: لا يملك بيانات — يملك metadata فقط. البيانات في data-cache.js.
 */

// ═══════════════════════════════════════
// حالات البيانات
// ═══════════════════════════════════════
export const DATA_STATE = Object.freeze({
  IDLE:     'idle',
  LOADING:  'loading',
  SYNCED:   'synced',
  STALE:    'stale',
  ERROR:    'error',
});

// ═══════════════════════════════════════
// سجل الـ Collection
// ═══════════════════════════════════════
const _registry = new Map();
const _stateListeners = new Map();

/**
 * @typedef {Object} CollectionMeta
 * @property {string} name
 * @property {string} state — DATA_STATE
 * @property {number} lastSyncAt — timestamp آخر مزامنة ناجحة
 * @property {number} docCount — عدد الوثائق المحمّلة
 * @property {number} subscriberCount — عدد المشتركين النشطين
 * @property {number} lastAccessAt — آخر وصول
 * @property {string|null} lastError — آخر خطأ
 * @property {number} syncCount — عدد مرات المزامنة
 * @property {number} estimatedSizeKB — حجم تقريبي بالكيلوبايت
 */

function _defaultMeta(name) {
  return {
    name,
    state: DATA_STATE.IDLE,
    lastSyncAt: 0,
    docCount: 0,
    subscriberCount: 0,
    lastAccessAt: 0,
    lastError: null,
    syncCount: 0,
    estimatedSizeKB: 0,
  };
}

function _notifyStateChange(collectionName, meta) {
  const listeners = _stateListeners.get(collectionName);
  if (listeners) {
    for (const fn of listeners) {
      try { fn(meta); } catch (_) {}
    }
  }
  const globalListeners = _stateListeners.get('*');
  if (globalListeners) {
    for (const fn of globalListeners) {
      try { fn(meta); } catch (_) {}
    }
  }
}

export const collectionRegistry = {

  /**
   * تسجيل أو تحديث حالة collection
   */
  update(collectionName, patch) {
    let meta = _registry.get(collectionName) || _defaultMeta(collectionName);
    meta = { ...meta, ...patch };
    _registry.set(collectionName, meta);
    _notifyStateChange(collectionName, meta);
    return meta;
  },

  /**
   * تسجيل بدء تحميل
   */
  markLoading(collectionName) {
    return this.update(collectionName, { state: DATA_STATE.LOADING });
  },

  /**
   * تسجيل نجاح المزامنة
   */
  markSynced(collectionName, docCount, estimatedSizeKB = 0) {
    return this.update(collectionName, {
      state: DATA_STATE.SYNCED,
      lastSyncAt: Date.now(),
      docCount,
      estimatedSizeKB,
      lastError: null,
      syncCount: (this.get(collectionName)?.syncCount || 0) + 1,
    });
  },

  /**
   * تسجيل حالة stale
   */
  markStale(collectionName) {
    return this.update(collectionName, { state: DATA_STATE.STALE });
  },

  /**
   * تسجيل خطأ
   */
  markError(collectionName, error) {
    return this.update(collectionName, {
      state: DATA_STATE.ERROR,
      lastError: typeof error === 'string' ? error : error?.message || 'unknown',
    });
  },

  /**
   * تسجيل وصول للبيانات
   */
  touch(collectionName) {
    const meta = _registry.get(collectionName);
    if (meta) meta.lastAccessAt = Date.now();
  },

  /**
   * زيادة/نقصان المشتركين
   */
  addSubscriber(collectionName) {
    const meta = _registry.get(collectionName) || _defaultMeta(collectionName);
    meta.subscriberCount++;
    _registry.set(collectionName, meta);
  },

  removeSubscriber(collectionName) {
    const meta = _registry.get(collectionName);
    if (meta && meta.subscriberCount > 0) meta.subscriberCount--;
  },

  /**
   * جلب metadata لـ collection
   */
  get(collectionName) {
    return _registry.get(collectionName) || null;
  },

  /**
   * جلب كل الـ collections المسجّلة
   */
  getAll() {
    return Array.from(_registry.values());
  },

  /**
   * هل الـ collection محمّل ومزامَن؟
   */
  isSynced(collectionName) {
    const meta = _registry.get(collectionName);
    return meta?.state === DATA_STATE.SYNCED;
  },

  /**
   * هل الـ collection يحتاج تحديث؟
   */
  needsRefresh(collectionName, maxAge) {
    const meta = _registry.get(collectionName);
    if (!meta || meta.state === DATA_STATE.IDLE) return true;
    if (meta.state === DATA_STATE.STALE || meta.state === DATA_STATE.ERROR) return true;
    if (maxAge && meta.lastSyncAt && (Date.now() - meta.lastSyncAt) > maxAge) return true;
    return false;
  },

  /**
   * الاشتراك في تغييرات حالة collection
   * collectionName = '*' للاشتراك في كل التغييرات
   */
  onStateChange(collectionName, callback) {
    if (!_stateListeners.has(collectionName)) {
      _stateListeners.set(collectionName, new Set());
    }
    _stateListeners.get(collectionName).add(callback);
    return () => {
      const set = _stateListeners.get(collectionName);
      if (set) set.delete(callback);
    };
  },

  /**
   * ملخص حالة النظام — للمراقبة
   */
  getSummary() {
    const all = this.getAll();
    return {
      totalCollections: all.length,
      synced: all.filter(m => m.state === DATA_STATE.SYNCED).length,
      loading: all.filter(m => m.state === DATA_STATE.LOADING).length,
      stale: all.filter(m => m.state === DATA_STATE.STALE).length,
      errors: all.filter(m => m.state === DATA_STATE.ERROR).length,
      totalDocs: all.reduce((sum, m) => sum + m.docCount, 0),
      totalSizeKB: all.reduce((sum, m) => sum + m.estimatedSizeKB, 0),
      totalSubscribers: all.reduce((sum, m) => sum + m.subscriberCount, 0),
      collections: all.map(m => ({
        name: m.name,
        state: m.state,
        docs: m.docCount,
        subs: m.subscriberCount,
        lastSync: m.lastSyncAt ? new Date(m.lastSyncAt).toLocaleTimeString('ar-EG') : '—',
      })),
    };
  },

  /**
   * مسح السجل بالكامل
   */
  clear() {
    _registry.clear();
    _stateListeners.clear();
  },
};

if (typeof window !== 'undefined') {
  window.__collectionRegistry = collectionRegistry;
}
