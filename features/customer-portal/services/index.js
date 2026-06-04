/**
 * SERVICES · Barrel — مدخل موحّد لطبقة الوصول للبيانات. (STANDARDS §6)
 * الـ Views تستورد من هنا فقط — لا تلمس Firebase ولا clientActions مباشرة.
 */
import { watchAuth, signInWithGoogle, signOut } from './auth.service.js';
import {
  loadClient, saveProfile, loadPublicCard, addWork, removeWork,
  uploadMedia, removeMedia, saveServices, uploadServiceImage, usernameAvailable, loadSubscription,
} from './profile.service.js';
import { loadOrders, invoiceOf, totalsOf } from './orders.service.js';
import { loadGallery, categoriesOf } from './gallery.service.js';
import { openThread, sendMessage, subscribeMessages } from './chat.service.js';
import { approveDesign } from './approval.service.js';
import { createRequest } from './requests.service.js';
import { subscribeNotifications, markRead } from './notifications.service.js';

export const services = {
  auth:    { watchAuth, signInWithGoogle, signOut },
  approval: { approveDesign },
  requests: { createRequest },
  notifications: { subscribeNotifications, markRead },
  profile: {
    loadClient, saveProfile, loadPublicCard, addWork, removeWork,
    uploadMedia, removeMedia, saveServices, uploadServiceImage, usernameAvailable, loadSubscription,
  },
  orders:  { loadOrders, invoiceOf, totalsOf },
  gallery: { loadGallery, categoriesOf },
  chat:    { openThread, sendMessage, subscribeMessages },
};
