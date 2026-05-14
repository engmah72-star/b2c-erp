/**
 * Genkit AI flows for B2C ERP.
 *
 * Why per-request initialization?
 * The Google AI plugin reads its API key at plugin-construction time, so a
 * singleton genkit instance forces a single global key. We instead let the
 * caller pass their own key from the localStorage (same key used by
 * ai-engine.js on the client). This keeps secret management on the user's
 * device — nothing stored server-side.
 *
 * Why genkit vs the raw Google AI SDK?
 * Genkit gives us:
 *   - Zod-validated structured outputs (no parsing free text)
 *   - Built-in tracing/observability (visible in Cloud Logging)
 *   - A consistent surface for adding tools / RAG later
 *
 * For now we use ai.generate() with an output schema — no flows, no tools —
 * to keep the POC narrow.
 */

const { genkit, z } = require('genkit');
const { googleAI } = require('@genkit-ai/google-genai');
const { getFirestore } = require('firebase-admin/firestore');

// Schemas for the structured client analysis output
const PriorityEnum = z.enum(['high', 'medium', 'low']);

const RecommendedAction = z.object({
  priority: PriorityEnum.describe('high | medium | low'),
  action: z.string().describe('الإجراء المقترح (سطر واحد)'),
  reason: z.string().describe('السبب من البيانات الفعلية'),
});

const ClientAnalysisSchema = z.object({
  summary: z.string().describe('فقرة عربية مختصرة (3-5 أسطر) تلخّص حالة العميل'),
  churnRiskAssessment: z.string().describe('تقييم خطر الفقد بالعربية مع التبرير'),
  opportunities: z.array(z.string()).describe('فرص بيعية أو متابعة قابلة للتنفيذ — قائمة'),
  recommendedActions: z.array(RecommendedAction).describe('3-5 إجراءات مرتّبة حسب الأولوية'),
  predictedNextProduct: z.string().nullable().describe('المنتج المتوقع للطلب القادم (لو متاح)'),
});

/**
 * Fetches all the context Firestore data we want the LLM to see.
 * Kept compact — we only include the last 20 orders + recent followups
 * so the prompt stays well under context limits.
 */
async function buildClientContext(db, clientId) {
  const [clientSnap, segmentSnap, recSnap, ordersSnap, followupsSnap] = await Promise.all([
    db.doc(`clients/${clientId}`).get(),
    db.doc(`client_segments/${clientId}`).get(),
    db.doc(`product_recommendations/${clientId}`).get(),
    db.collection('orders').where('clientId', '==', clientId).get(),
    db.collection('client_followups').where('clientId', '==', clientId).get(),
  ]);

  const client = clientSnap.exists ? clientSnap.data() : null;
  if (!client) return null;

  const orders = ordersSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
    .slice(0, 20)
    .map(o => ({
      id: o.id,
      productName: o.productName || o.product || '',
      stage: o.stage,
      salePrice: Number(o.salePrice) || 0,
      totalPaid: Number(o.totalPaid || o.paid || o.deposit) || 0,
      paymentStatus: o.paymentStatus,
      createdAt: o.createdAt?.toDate?.()?.toISOString().slice(0, 10) || null,
      delivered: o.stage === 'archived',
    }));

  const followups = followupsSnap.docs
    .map(d => d.data())
    .filter(f => !f.isDeleted)
    .map(f => ({
      type: f.type,
      note: (f.note || '').slice(0, 120),
      nextActionDate: f.nextActionDate || null,
      nextActionDone: f.nextActionDone || false,
      createdAt: f.createdAt?.toDate?.()?.toISOString().slice(0, 10) || null,
    }))
    .slice(0, 10);

  const segment = segmentSnap.exists ? segmentSnap.data() : null;
  const recommendations = recSnap.exists ? recSnap.data() : null;

  return {
    client: {
      name: client.name,
      job: client.job,
      gov: client.gov || client.governorate,
      source: client.source,
      tags: client.tags || [],
      createdAt: client.createdAt?.toDate?.()?.toISOString().slice(0, 10) || null,
    },
    segment: segment ? {
      label: segment.segmentLabel,
      rfmCode: segment.rfmCode,
      churnRisk: segment.churnRisk,
      recencyDays: segment.recencyDays,
      orderCount: segment.orderCount,
      totalRevenue: segment.totalRevenue,
    } : null,
    recommendations: recommendations ? {
      basedOn: recommendations.basedOnProduct,
      products: (recommendations.recommendations || []).slice(0, 3).map(r => r.product),
    } : null,
    orders,
    followups,
  };
}

/**
 * Run the analysis. Caller passes their Gemini API key (same one the client
 * stores in localStorage for ai-engine.js).
 */
async function analyzeClient(apiKey, clientId) {
  const ai = genkit({
    plugins: [googleAI({ apiKey })],
  });

  const db = getFirestore();
  const ctx = await buildClientContext(db, clientId);
  if (!ctx) {
    return { error: 'client_not_found', message: 'العميل غير موجود في قاعدة البيانات' };
  }

  const result = await ai.generate({
    model: 'googleai/gemini-2.0-flash',
    output: { schema: ClientAnalysisSchema },
    prompt: [
      'أنت محلل مبيعات لشركة طباعة. لديك بيانات عميل من ERP عربي.',
      'حلّل الموقف وأعطِ توصيات قابلة للتنفيذ. كن محدداً، مبنياً على الأرقام، تجنّب العموميات.',
      '',
      'البيانات (JSON):',
      JSON.stringify(ctx, null, 2),
      '',
      'تذكير:',
      '- recencyDays = أيام منذ آخر طلب',
      '- churnRisk = درجة 0-100 (أعلى = أخطر)',
      '- segment.label = شريحة RFM (champion/loyal/at_risk/cant_lose/lost/...)',
      '- recommendations = منتجات يطلبها عملاء مشابهون بعد منتجاته',
      '',
      'أعطِ تحليلاً عربياً بصيغة JSON الـ schema المرفقة، بدون نص خارج الـ JSON.',
    ].join('\n'),
  });

  return result.output;
}

module.exports = { analyzeClient };
