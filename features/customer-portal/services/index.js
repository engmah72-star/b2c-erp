/**
 * SERVICES · Barrel — مدخل موحّد لطبقة الوصول للبيانات. (STANDARDS §6)
 * الـ Views تستورد من هنا فقط — لا تلمس Firebase ولا clientActions مباشرة.
 */
import { watchAuth, signInWithGoogle, signOut } from './auth.service.js';
import {
  loadClient, saveProfile, loadPublicCard, addWork, removeWork,
  uploadMedia, removeMedia, saveServices, uploadServiceImage, usernameAvailable, loadSubscription,
} from './profile.service.js';
import { loadOrders, loadRequests, invoiceOf, totalsOf } from './orders.service.js';
import { loadGallery, categoriesOf } from './gallery.service.js';
import { openThread, sendMessage, sendAttachment, subscribeMessages } from './chat.service.js';
import { approveDesign } from './approval.service.js';
import { createRequest } from './requests.service.js';
import { loadProducts } from './products.service.js';
import { loadOpenNeeds, postNeed, respondNeed, closeNeed } from './needs.service.js';
import { subscribeNotifications, markRead } from './notifications.service.js';

export const services = {
  auth:    { watchAuth, signInWithGoogle, signOut },
  approval: { approveDesign },
  requests: { createRequest },
  products: { loadProducts },
  needs: { loadOpenNeeds, postNeed, respondNeed, closeNeed },
  notifications: { subscribeNotifications, markRead },
  profile: {
    loadClient, saveProfile, loadPublicCard, addWork, removeWork,
    uploadMedia, removeMedia, saveServices, uploadServiceImage, usernameAvailable, loadSubscription,
  },
  orders:  { loadOrders, loadRequests, invoiceOf, totalsOf },
  gallery: { loadGallery, categoriesOf },
  chat:    { openThread, sendMessage, sendAttachment, subscribeMessages },
};
