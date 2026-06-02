/**
 * tests/_loaders/firebase-stub.mjs
 *
 * Stub بديل لوحدات Firebase المستوردة عبر https://www.gstatic.com/firebasejs/*
 * أثناء اختبارات Node. يسمح باستيراد الكود الحقيقي (orders.js وغيره) الذي يعيد
 * تصدير core/firebase-init.js — بدون شبكة وبدون تهيئة Firebase حقيقية.
 *
 * كل الدوال no-ops آمنة؛ الاختبارات تستهدف المنطق النقي (pure) فقط.
 */
export const initializeApp = () => ({});
export const getApp = () => ({});
export const getApps = () => [];
export const getAuth = () => ({});
export const onAuthStateChanged = () => () => {};
export const getStorage = () => ({});
export const getFirestore = () => ({});
export const initializeFirestore = () => ({});
export const persistentLocalCache = () => ({});
export const persistentMultipleTabManager = () => ({});

// Firestore data helpers (لِما تستورده طبقات أخرى مثل order-actions)
export const doc = () => ({});
export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
export const updateDoc = async () => {};
export const setDoc = async () => {};
export const addDoc = async () => ({ id: 'stub' });
export const deleteDoc = async () => {};
export const writeBatch = () => ({ update() {}, set() {}, delete() {}, commit: async () => {} });
export const runTransaction = async (_db, fn) => fn({ get: async () => ({ exists: () => false, data: () => ({}) }), update() {}, set() {} });
export const serverTimestamp = () => null;
export const collection = () => ({});
export const increment = (n) => n;
export const getDocs = async () => ({ docs: [], forEach() {} });
export const query = () => ({});
export const where = () => ({});
export const orderBy = () => ({});
export const limit = () => ({});
export const arrayUnion = (...a) => a;
export const arrayRemove = (...a) => a;
