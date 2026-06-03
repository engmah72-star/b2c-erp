/**
 * VIEWS · login — بوابة الدخول (Google). تركيب + نداء Service فقط. (STANDARDS §6)
 */
import { Button, Card } from '../components/index.js';

export function create(ctx) {
  const { services, shell } = ctx;
  let busy = false;

  function html() {
    const body = `
      <div class="cp-text-c cp-stack">
        <div class="cp-placeholder__icon" aria-hidden="true">🎨</div>
        <div class="cp-title">بوابة العميل</div>
        <p class="cp-muted">تابِع طلباتك · اعتمِد تصاميمك · شارِك كارتك الرقمي</p>
        ${Button({ label: 'الدخول بحساب Google', icon: '🔓', variant: 'primary', action: 'login', loading: busy })}
      </div>`;
    return `<div class="cp-stack cp-stack--lg">${Card({ body })}</div>`;
  }

  return {
    async mount() { return html(); },
    async onAction(a) {
      if (a !== 'login' || busy) return;
      busy = true; ctx.repaint(html());
      const res = await services.auth.signInWithGoogle();
      if (!res.ok) {
        busy = false; ctx.repaint(html());
        shell.notify('تعذّر الدخول، حاول مجدداً', 'danger');
      }
      // النجاح: مراقب الـ auth في الإقلاع ينقل تلقائياً للرئيسية.
    },
  };
}
