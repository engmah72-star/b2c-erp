/**
 * SERVICES · Barrel — مدخل موحّد لطبقة الوصول للبيانات. (STANDARDS §6)
 * الـ Views تستورد من هنا فقط — لا تلمس Firebase ولا clientActions مباشرة.
 */
import { watchAuth, signInWithGoogle, signOut } from './auth.service.js';
import { loadClient, saveProfile, loadPublicCard } from './profile.service.js';
import { loadOrders, invoiceOf, totalsOf } from './orders.service.js';
import { loadGallery, categoriesOf } from './gallery.service.js';
import { openThread, sendMessage, subscribeMessages } from './chat.service.js';

export const services = {
  auth:    { watchAuth, signInWithGoogle, signOut },
  profile: { loadClient, saveProfile, loadPublicCard },
  orders:  { loadOrders, invoiceOf, totalsOf },
  gallery: { loadGallery, categoriesOf },
  chat:    { openThread, sendMessage, subscribeMessages },
};
