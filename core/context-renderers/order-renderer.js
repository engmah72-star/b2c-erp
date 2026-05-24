// ════════════════════════════════════════════════════════════════════
// Order Context Renderer
// ════════════════════════════════════════════════════════════════════
//
// يرسم تفاصيل order في الـ sidebar context drawer لما المستخدم
// يختار order من production.html (أو أي صفحة تنشر ctx لـ entity 'order').
//
// Reads only — لا writes. الـ actions تستدعي orderActions.* الموجودة
// (نفس الـ business logic، مش بنكرّر).
//
// Sections:
//   - Hero: orderId + clientName + stage badge
//   - بيانات الأوردر (collapsible، open by default)
//   - المنتجات (count badge)
//   - التصميمات (links)
//   - الدفعات
//   - التاريخ (timeline, آخر 10)
//
// API:
//   createOrderRenderer({id, container, setTitle}) → { dispose }
// ════════════════════════════════════════════════════════════════════

import { db } from '../firebase-init.js';
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export function createOrderRenderer({ id: orderId, container, setTitle }) {
  let unsubscribe = null;

  const fmtMoney = (n) => {
    const v = Number(n) || 0;
    return v.toLocaleString('ar-EG') + ' ج';
  };

  const fmtDate = (ts) => {
    if (!ts) return '—';
    try {
      const d = ts.toDate ? ts.toDate() : (ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts));
      return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (_) { return '—'; }
  };

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));

  const stageLabel = (s) => ({
    design: '🎨 تصميم',
    printing: '🖨️ طباعة',
    production: '🏭 تنفيذ',
    shipping: '🚚 شحن',
    archived: '📁 أرشيف',
    cancelled: '✖ ملغي',
  }[s] || s || '—');

  function renderLoading() {
    container.innerHTML = '<div class="sb-ctx-loading">جاري التحميل</div>';
  }

  function renderError(msg) {
    container.innerHTML = '<div class="sb-ctx-error">⚠ ' + esc(msg) + '</div>';
  }

  function renderOrder(order) {
    if (!order) {
      renderError('الأوردر غير موجود');
      return;
    }

    // Update drawer title لـ readable label
    if (setTitle) setTitle(order.orderId || orderId);

    const products = Array.isArray(order.products) ? order.products : [];
    const designFiles = [];
    if (order.designFileUrl) {
      designFiles.push({ url: order.designFileUrl, name: 'تصميم رئيسي', note: order.designFileNote });
    }
    if (Array.isArray(order.designFiles)) {
      for (const f of order.designFiles) {
        if (f && (f.url || f.fileUrl)) designFiles.push(f);
      }
    }
    if (order.printFinalUrl) {
      designFiles.push({ url: order.printFinalUrl, name: 'الطباعة النهائية' });
    }

    const timeline = Array.isArray(order.timeline) ? order.timeline : [];

    const total = Number(order.salePrice || order.total || order.totalAmount || 0);
    const paid = Number(order.paidAmount || order.paid || 0);
    const remaining = Number(order.remaining != null ? order.remaining : (total - paid));

    let html = '';

    // ── Hero ──
    html += '<div class="sb-ctx-section hero">';
    html += '<div class="sb-ctx-h">' + esc(order.orderId || orderId) + '</div>';
    html += '<div class="sb-ctx-sub">' + esc(order.clientName || '—') + '</div>';
    html += '<div class="sb-ctx-badge">' + esc(stageLabel(order.stage)) + '</div>';
    html += '</div>';

    // ── بيانات الأوردر ──
    html += '<details class="sb-ctx-coll" open>';
    html += '<summary>📋 بيانات الأوردر</summary>';
    html += '<div class="sb-ctx-rows">';
    html += '<div><span>التاريخ</span><b>' + esc(fmtDate(order.createdAt)) + '</b></div>';
    html += '<div><span>الإجمالي</span><b>' + fmtMoney(total) + '</b></div>';
    html += '<div><span>مدفوع</span><b class="g">' + fmtMoney(paid) + '</b></div>';
    if (remaining > 0) {
      html += '<div><span>متبقي</span><b class="r">' + fmtMoney(remaining) + '</b></div>';
    } else if (remaining < 0) {
      html += '<div><span>زيادة</span><b class="y">' + fmtMoney(Math.abs(remaining)) + '</b></div>';
    }
    if (order.shipMethod) {
      html += '<div><span>الشحن</span><b>' + esc(order.shipMethod) + '</b></div>';
    }
    if (order.assignedTo || order.assignedToName) {
      html += '<div><span>المسؤول</span><b>' + esc(order.assignedToName || order.assignedTo) + '</b></div>';
    }
    html += '</div>';
    html += '</details>';

    // ── المنتجات ──
    html += '<details class="sb-ctx-coll">';
    html += '<summary>📦 المنتجات (' + products.length + ')</summary>';
    html += '<div class="sb-ctx-list">';
    if (products.length === 0) {
      html += '<div class="sb-ctx-empty">لا توجد منتجات</div>';
    } else {
      for (const p of products) {
        const name = p.productName || p.name || p.title || 'منتج';
        const qty = p.quantity || p.qty || 0;
        const price = Number(p.totalPrice || p.salePrice || p.price || 0);
        html += '<div class="sb-ctx-item">';
        html += '<div class="sb-ctx-item-name">' + esc(name) + '</div>';
        html += '<div class="sb-ctx-item-meta">';
        if (qty) html += '× ' + esc(qty);
        if (price) html += (qty ? ' · ' : '') + fmtMoney(price);
        if (p.productStatus) html += (qty || price ? ' · ' : '') + esc(p.productStatus);
        html += '</div>';
        html += '</div>';
      }
    }
    html += '</div>';
    html += '</details>';

    // ── التصميمات ──
    html += '<details class="sb-ctx-coll">';
    html += '<summary>🎨 التصميمات (' + designFiles.length + ')</summary>';
    html += '<div class="sb-ctx-list">';
    if (designFiles.length === 0) {
      html += '<div class="sb-ctx-empty">لا توجد تصميمات مرفوعة</div>';
    } else {
      for (const f of designFiles) {
        const url = f.url || f.fileUrl || '#';
        const name = f.name || f.fileName || 'ملف';
        html += '<a class="sb-ctx-file" href="' + esc(url) + '" target="_blank" rel="noopener">';
        html += esc(name) + ' ↗';
        html += '</a>';
      }
    }
    html += '</div>';
    html += '</details>';

    // ── الدفعات (placeholder summary، بدون query إضافي) ──
    if (paid > 0 || remaining !== total) {
      html += '<details class="sb-ctx-coll">';
      html += '<summary>💰 الدفعات</summary>';
      html += '<div class="sb-ctx-rows">';
      html += '<div><span>إجمالي مدفوع</span><b class="g">' + fmtMoney(paid) + '</b></div>';
      html += '<div><span>متبقي</span><b' + (remaining > 0 ? ' class="r"' : '') + '>' + fmtMoney(remaining) + '</b></div>';
      if (order.shipSettled) {
        html += '<div><span>تسوية الشحن</span><b class="g">تمت</b></div>';
      }
      html += '</div>';
      html += '</details>';
    }

    // ── التاريخ (آخر 10، latest first) ──
    if (timeline.length > 0) {
      html += '<details class="sb-ctx-coll">';
      html += '<summary>📜 التاريخ (' + timeline.length + ')</summary>';
      html += '<div class="sb-ctx-list">';
      const recent = timeline.slice(-10).reverse();
      for (const e of recent) {
        const action = e.action || '—';
        const by = e.by || '';
        const dt = e.date || (e.createdAt ? fmtDate(e.createdAt) : '');
        html += '<div class="sb-ctx-time">';
        html += '<div class="sb-ctx-time-action">' + esc(action) + '</div>';
        if (by || dt) {
          html += '<div class="sb-ctx-time-meta">' + esc(by) + (by && dt ? ' · ' : '') + esc(dt) + '</div>';
        }
        html += '</div>';
      }
      html += '</div>';
      html += '</details>';
    }

    container.innerHTML = html;
  }

  function start() {
    if (!orderId) {
      renderError('orderId غير محدد');
      return;
    }
    renderLoading();
    try {
      const ref = doc(db, 'orders', orderId);
      unsubscribe = onSnapshot(ref, snap => {
        if (snap.exists()) {
          renderOrder({ ...snap.data(), _id: snap.id });
        } else {
          renderError('الأوردر غير موجود');
        }
      }, err => {
        console.warn('[order-renderer] snapshot error', err);
        renderError('فشل تحميل الأوردر');
      });
    } catch (e) {
      console.error('[order-renderer] init error', e);
      renderError('خطأ في الاتصال');
    }
  }

  function dispose() {
    if (unsubscribe) {
      try { unsubscribe(); } catch (_) {}
      unsubscribe = null;
    }
  }

  start();
  return { dispose };
}
