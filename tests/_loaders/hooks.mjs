/**
 * tests/_loaders/hooks.mjs — ESM resolve hook
 *
 * يحوّل أي استيراد من https://www.gstatic.com/firebasejs/* إلى firebase-stub.mjs
 * المحلي، فيتمكّن Node من استيراد الكود الحقيقي بدون شبكة.
 */
const STUB = new URL('./firebase-stub.mjs', import.meta.url).href;

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('https://www.gstatic.com/firebasejs/')) {
    return { url: STUB, shortCircuit: true };
  }
  return next(specifier, context);
}
