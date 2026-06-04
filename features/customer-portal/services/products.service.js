/**
 * SERVICES · products — كتالوج منتجات الشركة للعميل (مصدر الحقيقة: products_v2).
 * يقرأ من المرآة العامة public_products (مشتقّة من products_v2 عبر Cloud Function)
 * — أسماء/أنواع فقط، بلا أسعار ولا تكلفة (RULE 8). فالعميل يطلب من منتجات الشركة
 * الفعلية لا من قائمة ثابتة. لا UI. (STANDARDS §6)
 */
import { firebase } from './firebase.js';

/** يحمّل كتالوج منتجات الشركة الفعّالة، مرتّبة. يُرجع [{ id, name, category, printType }]. */
export async function loadProducts() {
  const fb = await firebase();
  try {
    const snap = await fb.getDocs(
      fb.query(fb.collection(fb.db, 'public_products'), fb.where('active', '==', true), fb.limit(200)),
    );
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((p) => (p.name || '').trim())
      .sort((a, b) => ((a.order || 0) - (b.order || 0))
        || String(a.name).localeCompare(String(b.name), 'ar'));
  } catch (_) {
    return [];
  }
}
