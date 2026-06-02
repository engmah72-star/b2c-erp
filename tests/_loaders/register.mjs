/**
 * tests/_loaders/register.mjs
 *
 * يسجّل resolve hook (hooks.mjs) قبل تشغيل اختبار يستورد كوداً يعتمد على
 * Firebase عبر https. استخدام:
 *   node --import ./tests/_loaders/register.mjs tests/<some>.test.mjs
 */
import { register } from 'node:module';
register(new URL('./hooks.mjs', import.meta.url));
