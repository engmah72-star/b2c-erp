/**
 * STATE LAYER · store — مخزن حالة صغير (pub/sub). لا UI · لا Firebase. (STANDARDS §6)
 * createStore(initial) → { get, set, subscribe }
 *   set(patch)  → دمج + إخطار المشتركين
 *   subscribe(fn) → يُرجع دالة إلغاء
 */
export function createStore(initial = {}) {
  let state = { ...initial };
  const subscribers = new Set();

  return {
    get(key) { return key ? state[key] : state; },
    set(patch) {
      state = { ...state, ...patch };
      subscribers.forEach((fn) => { try { fn(state); } catch (_) {} });
    },
    subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
  };
}

/** مخزن البوابة المشترك (هوية + بيانات العميل + التبويب النشط). */
export const store = createStore({ user: null, client: null, activeTab: 'home' });
