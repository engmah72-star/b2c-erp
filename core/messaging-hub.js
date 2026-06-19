/**
 * core/messaging-hub.js
 * ━━━ MESSAGING HUB ENGINE — المحرك المركزي لمنصة التواصل ━━━
 * Pure · No I/O · No DOM · No Firestore
 */

// ══════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════

export const CONV_CATEGORIES = Object.freeze({
  ORDERS: 'orders',
  TEAMS: 'teams',
  CLIENTS: 'clients',
  DIRECT: 'direct',
  PRIORITY: 'priority',
  ALL: 'all',
});

export const PRIORITY_LEVELS = Object.freeze({
  URGENT: 'urgent',
  HIGH: 'high',
  NORMAL: 'normal',
  LOW: 'low',
});

export const ACTIVITY_TYPES = Object.freeze({
  MESSAGE: 'message',
  ORDER_UPDATE: 'order_update',
  DESIGN_UPLOAD: 'design_upload',
  APPROVAL: 'approval',
  PAYMENT: 'payment',
  STAGE_CHANGE: 'stage_change',
  MENTION: 'mention',
  ACTION_ITEM: 'action_item',
  SYSTEM: 'system',
});

export const ACTION_ITEM_STATUS = Object.freeze({
  PENDING: 'pending',
  DONE: 'done',
  DISMISSED: 'dismissed',
});

export const WORKSPACE_TABS = Object.freeze([
  { id: 'all', label: 'الكل', ico: '💬', filter: null },
  { id: 'priority', label: 'الأولوية', ico: '🔴', filter: 'priority' },
  { id: 'orders', label: 'الأوردرات', ico: '📦', filter: 'orders' },
  { id: 'teams', label: 'الفرق', ico: '👥', filter: 'teams' },
  { id: 'clients', label: 'العملاء', ico: '🤝', filter: 'clients' },
  { id: 'direct', label: 'المباشر', ico: '💭', filter: 'direct' },
]);

// Quick actions available from within a conversation context
export const QUICK_ACTIONS = Object.freeze({
  ORDER_THREAD: [
    { id: 'view_order', label: 'عرض الأوردر', ico: '📦', action: 'navigate', target: 'order' },
    { id: 'view_client', label: 'عرض العميل', ico: '👤', action: 'navigate', target: 'client' },
    { id: 'add_note', label: 'إضافة ملاحظة', ico: '📝', action: 'compose', type: 'note' },
    { id: 'share_file', label: 'مشاركة ملف', ico: '📎', action: 'attach' },
    { id: 'create_action', label: 'إنشاء مهمة', ico: '✅', action: 'action_item' },
  ],
  CHANNEL: [
    { id: 'share_order', label: 'مشاركة أوردر', ico: '📦', action: 'order_share' },
    { id: 'create_action', label: 'إنشاء مهمة', ico: '✅', action: 'action_item' },
    { id: 'share_file', label: 'مشاركة ملف', ico: '📎', action: 'attach' },
  ],
  DM: [
    { id: 'share_order', label: 'مشاركة أوردر', ico: '📦', action: 'order_share' },
    { id: 'create_action', label: 'إنشاء مهمة', ico: '✅', action: 'action_item' },
    { id: 'share_file', label: 'مشاركة ملف', ico: '📎', action: 'attach' },
    { id: 'view_profile', label: 'عرض الملف الشخصي', ico: '👤', action: 'navigate', target: 'profile' },
  ],
  CLIENT_THREAD: [
    { id: 'view_order', label: 'عرض الأوردر', ico: '📦', action: 'navigate', target: 'order' },
    { id: 'view_client', label: 'عرض العميل', ico: '👤', action: 'navigate', target: 'client' },
    { id: 'send_proof', label: 'إرسال البروفة', ico: '📐', action: 'send_proof' },
    { id: 'create_action', label: 'إنشاء مهمة', ico: '✅', action: 'action_item' },
  ],
});

// ══════════════════════════════════════════
// CATEGORIZATION
// ══════════════════════════════════════════

/**
 * Derive the category of a conversation from its type/mode/flags.
 * @param {Object} conv
 * @returns {string} one of CONV_CATEGORIES values
 */
export function categorizeConversation(conv) {
  if (!conv) return CONV_CATEGORIES.ALL;
  if (conv.priority === PRIORITY_LEVELS.URGENT || conv.priority === PRIORITY_LEVELS.HIGH) {
    return CONV_CATEGORIES.PRIORITY;
  }
  if (conv.type === 'order_thread') {
    return conv.isClientThread ? CONV_CATEGORIES.CLIENTS : CONV_CATEGORIES.ORDERS;
  }
  if (conv.type === 'channel') return CONV_CATEGORIES.TEAMS;
  if (conv.type === 'dm') return CONV_CATEGORIES.DIRECT;
  return CONV_CATEGORIES.ALL;
}

/**
 * Filter conversations by category tab.
 * @param {Array} conversations
 * @param {string} category - one of CONV_CATEGORIES
 * @param {string} currentUid
 * @returns {Array} filtered conversations
 */
export function filterByCategory(conversations, category, currentUid) {
  if (!category || category === CONV_CATEGORIES.ALL) return conversations;
  if (category === CONV_CATEGORIES.PRIORITY) {
    return conversations.filter(c =>
      c.priority === PRIORITY_LEVELS.URGENT ||
      c.priority === PRIORITY_LEVELS.HIGH ||
      (c.unreadCount?.[currentUid] || 0) > 5 ||
      c._hasMention
    );
  }
  return conversations.filter(c => categorizeConversation(c) === category);
}

/**
 * Count conversations per category (for tab badges).
 * @returns {Object} { all, priority, orders, teams, clients, direct }
 */
export function countByCategory(conversations, currentUid) {
  const counts = {};
  for (const tab of WORKSPACE_TABS) {
    counts[tab.id] = filterByCategory(conversations, tab.id, currentUid)
      .filter(c => !(c.archivedBy || []).includes(currentUid))
      .length;
  }
  return counts;
}

// ══════════════════════════════════════════
// PRIORITY SCORING
// ══════════════════════════════════════════

/**
 * Compute a priority score for sorting conversations.
 * Higher = more urgent. Factors: manual priority, unread count,
 * recency, mentions, order deadline proximity.
 *
 * @param {Object} conv
 * @param {string} currentUid
 * @param {number} [nowMs] - current time in ms (for testability)
 * @returns {number} priority score (0-1000)
 */
export function computePriorityScore(conv, currentUid, nowMs = Date.now()) {
  let score = 0;
  // Manual priority
  if (conv.priority === PRIORITY_LEVELS.URGENT) score += 400;
  else if (conv.priority === PRIORITY_LEVELS.HIGH) score += 200;
  // Unread messages
  const unread = conv.unreadCount?.[currentUid] || 0;
  score += Math.min(unread * 15, 150);
  // Mentions
  if (conv._hasMention) score += 100;
  // Recency (last message within 30 min = +100, within 2h = +50, etc.)
  const lastMs = (conv.lastMessageAt?.seconds || 0) * 1000;
  const ageMin = (nowMs - lastMs) / 60000;
  if (ageMin < 30) score += 100;
  else if (ageMin < 120) score += 50;
  else if (ageMin < 480) score += 20;
  // Order deadline proximity (if order_thread with deadline)
  if (conv.orderRef?.deadline) {
    const dl = new Date(conv.orderRef.deadline).getTime();
    const hoursLeft = (dl - nowMs) / 3600000;
    if (hoursLeft < 0) score += 150; // overdue
    else if (hoursLeft < 24) score += 100;
    else if (hoursLeft < 72) score += 50;
  }
  return Math.min(score, 1000);
}

/**
 * Sort conversations by priority score (descending), then by lastMessageAt.
 */
export function sortByPriority(conversations, currentUid) {
  return conversations.slice().sort((a, b) => {
    const sa = computePriorityScore(a, currentUid);
    const sb = computePriorityScore(b, currentUid);
    if (sb !== sa) return sb - sa;
    return (b.lastMessageAt?.seconds || 0) - (a.lastMessageAt?.seconds || 0);
  });
}

// ══════════════════════════════════════════
// CONTEXT RESOLUTION
// ══════════════════════════════════════════

/**
 * Build a context object for the context panel given a conversation.
 * Returns structured data the view layer can render.
 *
 * @param {Object} conv - the conversation
 * @param {Object} opts
 * @param {Array}  opts.allUsers
 * @param {Array}  opts.allOrders
 * @param {string} opts.currentUid
 * @returns {Object|null} context object or null if no rich context
 */
export function resolveContext(conv, { allUsers = [], allOrders = [], currentUid } = {}) {
  if (!conv) return null;

  const ctx = {
    type: conv.type,
    category: categorizeConversation(conv),
    participants: [],
    order: null,
    client: null,
    quickActions: [],
    stats: { messageCount: 0, participantCount: 0 },
  };

  // Resolve participants
  ctx.participants = (conv.participants || []).map(uid => {
    const u = allUsers.find(x => x._id === uid);
    return {
      uid,
      name: u?.name || conv.dmNames?.[uid] || 'مستخدم',
      role: u?.role || '',
      isOnline: false, // caller fills from presenceMap
      isCurrent: uid === currentUid,
    };
  });
  ctx.stats.participantCount = ctx.participants.length;

  // Resolve order context
  if (conv.type === 'order_thread' && (conv.orderId || conv.orderRef?.orderId)) {
    const orderId = conv.orderId || conv.orderRef?.orderId;
    const order = allOrders.find(o => o._id === orderId || o.orderId === orderId);
    if (order) {
      ctx.order = {
        id: order._id || order.orderId,
        code: order.orderCode || (order.orderId || '').slice(-6),
        clientName: order.clientName || '',
        stage: order.stage || '',
        salePrice: order.salePrice || 0,
        deadline: order.deadline || order.stageDeadline?.current || '',
        products: (order.products || []).map(p => ({
          name: p.name || p.productName || '',
          status: p.productStatus || '',
          qty: p.qty || 1,
        })),
        designStage: order.designStage || '',
        shippingMethod: order.shippingMethod || '',
        assignees: {
          designer: order.designerId || '',
          production: order.productionAgent || '',
          shipping: order.shippingOfficerId || '',
        },
      };
    } else if (conv.orderRef) {
      ctx.order = {
        id: conv.orderRef.orderId,
        code: conv.orderRef.orderCode || (conv.orderRef.orderId || '').slice(-6),
        clientName: conv.orderRef.clientName || '',
        stage: conv.orderRef.stage || '',
      };
    }
  }

  // Quick actions based on conversation type
  if (conv.isClientThread) {
    ctx.quickActions = QUICK_ACTIONS.CLIENT_THREAD;
  } else if (conv.type === 'order_thread') {
    ctx.quickActions = QUICK_ACTIONS.ORDER_THREAD;
  } else if (conv.type === 'channel') {
    ctx.quickActions = QUICK_ACTIONS.CHANNEL;
  } else if (conv.type === 'dm') {
    ctx.quickActions = QUICK_ACTIONS.DM;
  }

  return ctx;
}

// ══════════════════════════════════════════
// ACTION ITEMS
// ══════════════════════════════════════════

/**
 * Parse a message text for potential action items.
 * Detects patterns like "يجب" (must), "لازم" (need to), "مطلوب" (required),
 * TODO-like markers, and @mention + verb patterns.
 *
 * @param {string} text
 * @param {Array} mentions - array of mentioned UIDs
 * @returns {Object|null} { text, assigneeUids, detected: true } or null
 */
export function detectActionItem(text, mentions = []) {
  if (!text) return null;
  const patterns = [
    /(?:يجب|لازم|مطلوب|ضروري|محتاج|عايز)\s+(.{10,})/,
    /(?:TODO|FIXME|ACTION|مهمة|تنفيذ)[\s:]+(.{5,})/i,
    /(?:⚠️|🔴|❗|‼️)\s*(.{10,})/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      return {
        text: m[1].trim().slice(0, 200),
        assigneeUids: mentions.length ? mentions : [],
        detected: true,
      };
    }
  }
  return null;
}

/**
 * Build an action item document spec (for the caller to write to Firestore).
 */
export function buildActionItem({
  text, convId, messageId,
  createdBy, createdByName,
  assigneeId = '', assigneeName = '',
  dueDate = null,
}) {
  return {
    text: (text || '').slice(0, 500),
    convId,
    messageId: messageId || '',
    createdBy,
    createdByName: createdByName || '',
    assigneeId,
    assigneeName: assigneeName || '',
    dueDate: dueDate || null,
    status: ACTION_ITEM_STATUS.PENDING,
    // createdAt: serverTimestamp() — caller adds
    // completedAt: null — set when done
  };
}

/**
 * Filter and sort action items for display.
 */
export function sortActionItems(items) {
  const statusOrder = { pending: 0, done: 1, dismissed: 2 };
  return items.slice().sort((a, b) => {
    const sa = statusOrder[a.status] ?? 1;
    const sb = statusOrder[b.status] ?? 1;
    if (sa !== sb) return sa - sb;
    // Within same status, pending: by dueDate (soonest first), then createdAt
    if (a.dueDate && b.dueDate) return new Date(a.dueDate) - new Date(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
  });
}

// ══════════════════════════════════════════
// ACTIVITY FEED
// ══════════════════════════════════════════

/**
 * Build an activity item from a conversation event.
 * Pure transform — caller feeds raw data.
 */
export function buildActivityItem({ type, title, subtitle, ico, ts, convId, orderId, userId }) {
  return {
    type: type || ACTIVITY_TYPES.MESSAGE,
    title: title || '',
    subtitle: subtitle || '',
    ico: ico || '💬',
    ts: ts || null,
    convId: convId || '',
    orderId: orderId || '',
    userId: userId || '',
  };
}

/**
 * Merge and sort activity items from multiple sources.
 * @param {Array[]} ...sources - arrays of activity items
 * @returns {Array} merged, sorted by timestamp descending, capped at limit
 */
export function mergeActivityFeeds(sources, limit = 50) {
  const all = sources.flat().filter(Boolean);
  all.sort((a, b) => {
    const ta = a.ts?.seconds || a.ts?.getTime?.() / 1000 || 0;
    const tb = b.ts?.seconds || b.ts?.getTime?.() / 1000 || 0;
    return tb - ta;
  });
  return all.slice(0, limit);
}

// ══════════════════════════════════════════
// CONVERSATION STATS
// ══════════════════════════════════════════

/**
 * Compute summary stats for the workspace header.
 */
export function computeWorkspaceStats(conversations, currentUid) {
  let totalUnread = 0;
  let urgentCount = 0;
  let mentionCount = 0;
  for (const c of conversations) {
    const ur = c.unreadCount?.[currentUid] || 0;
    totalUnread += ur;
    if (c.priority === PRIORITY_LEVELS.URGENT || c.priority === PRIORITY_LEVELS.HIGH) urgentCount++;
    if (c._hasMention) mentionCount++;
  }
  return { totalUnread, urgentCount, mentionCount, conversationCount: conversations.length };
}

// ══════════════════════════════════════════
// STAGE DISPLAY HELPERS (for context panel)
// ══════════════════════════════════════════

const STAGE_LABELS = {
  new: 'جديد', design: 'تصميم', approval: 'اعتماد', print: 'طباعة',
  production: 'تنفيذ', quality: 'جودة', shipping: 'شحن', delivered: 'تم التسليم',
  archived: 'مؤرشف', cancelled: 'ملغي',
};
const STAGE_COLORS = {
  new: '#3b82f6', design: '#8b5cf6', approval: '#f59e0b', print: '#06b6d4',
  production: '#10b981', quality: '#6366f1', shipping: '#f97316', delivered: '#22c55e',
  archived: '#6b7280', cancelled: '#ef4444',
};

export function stageLabel(stage) { return STAGE_LABELS[stage] || stage || '—'; }
export function stageColor(stage) { return STAGE_COLORS[stage] || '#6b7280'; }

/**
 * Format a price value for display.
 */
export function fmtPrice(v) {
  const n = Number(v) || 0;
  return n.toLocaleString('ar-EG') + ' ج.م';
}
