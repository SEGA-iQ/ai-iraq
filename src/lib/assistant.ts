import "server-only";
import { z } from "zod";
import { generateJson, looseEnum } from "./ai";
import { evaluateCampaign, formatMoney } from "./evaluate";
import {
  CHANNEL_LABELS,
  OBJECTIVE_LABELS,
  PLATFORM_LABELS,
  POST_PLATFORM_LABELS,
  POST_TYPE_LABELS,
  SIGNAL_LABELS,
} from "./labels";
import type { CampaignAnalysisResult, Database, InboxMessage, PostPlatform, PostType, Settings } from "./types";

// Prompts and output schemas for every AI feature. Prompts are in Arabic so
// local models stay in the target language.

function companyContext(settings: Settings): string {
  const c = settings.company;
  const lines = [
    c.name && `اسم الشركة: ${c.name}`,
    c.cities && `المناطق اللي نغطيها: ${c.cities}`,
    c.services && `الخدمات: ${c.services}`,
    c.pricing && `الأسعار: ${c.pricing}`,
    c.hours && `أوقات الدوام: ${c.hours}`,
    c.phone && `رقم التواصل: ${c.phone}`,
    c.appName && `التطبيق: ${c.appName}${c.appLink ? ` (رابط التحميل: ${c.appLink})` : ""}`,
    c.extraInfo && `معلومات إضافية: ${c.extraInfo}`,
  ].filter(Boolean);
  const faq = settings.faq
    .filter((f) => f.q.trim() && f.a.trim())
    .map((f) => `- س: ${f.q}\n  ج: ${f.a}`)
    .join("\n");
  return [
    "<company_info>",
    lines.length ? lines.join("\n") : "شركة توصيل (دليفري) عراقية.",
    faq ? `\nأسئلة متكررة وأجوبتها المعتمدة:\n${faq}` : "",
    "</company_info>",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Customer replies

const INTENTS = ["order", "price", "tracking", "complaint", "merchant", "driver_job", "app_support", "other"] as const;

export const ReplySchema = z.object({
  intent: looseEnum(INTENTS, "other"),
  urgency: looseEnum(["high", "normal", "low"] as const, "normal"),
  reply: z.string().min(1),
  altReply: z.string().catch(""),
  note: z.string().catch(""),
});
export type ReplyDraft = z.infer<typeof ReplySchema>;

export async function draftReply(db: Database, message: InboxMessage, instruction?: string): Promise<ReplyDraft> {
  const settings = db.settings;
  const history = db.messages
    .filter((m) => m.id !== message.id && m.customerHandle && m.customerHandle === message.customerHandle)
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
    .slice(-4)
    .map((m) => `- الزبون: ${m.text}${m.draft && m.status === "replied" ? `\n  ردنا: ${m.draft}` : ""}`)
    .join("\n");

  const system = `أنت موظف خدمة زبائن محترف بشركة توصيل (دليفري) عراقية. تكتب رد جاهز للإرسال على رسالة زبون.

${companyContext(settings)}

طريقة الرد:
- الأسلوب: ${settings.company.tone || "ودود ومحترم، لهجة عراقية بسيطة"}.
- اكتب باللهجة العراقية المهذبة إلا إذا الزبون كتب بالفصحى أو بالإنكليزي، فرد بنفس لغته.
- الرد قصير وواضح (سطر إلى أربع أسطر)، بدون مقدمات طويلة ولا تكرار.
- استخدم بس المعلومات الموجودة بمعلومات الشركة. إذا سأل عن شي مو موجود (سعر منطقة معينة، وقت وصول دقيق، حالة طلب) لا تخترع أرقام: اطلب التفاصيل اللازمة أو گول إنه راح نتأكد ونرجعله.
- إذا يريد يطلب توصيل: اطلب المعلومات الناقصة (منطقة الاستلام، منطقة التوصيل، رقم الهاتف، نوع الغرض).
- إذا شكوى: اعتذر بصدق بدون جدال، اطلب رقم الطلب أو رقم الهاتف، ووعده بمتابعة سريعة.
- إذا تاجر يريد يتعامل وياكم أو شخص يريد يشتغل مندوب: رحّب بيه واطلب المعلومات الأساسية.
- إيموجي وحد كحد أقصى، أو بدون.

الحقول المطلوبة:
- intent: نوع الرسالة (order طلب توصيل، price سؤال سعر، tracking وين طلبي، complaint شكوى، merchant تاجر، driver_job يريد يشتغل مندوب، app_support مشكلة بالتطبيق، other).
- urgency: high إذا شكوى أو طلب متأخر أو زبون زعلان، low إذا استفسار عام، وغيرها normal.
- reply: الرد الأساسي الجاهز للإرسال.
- altReply: نسخة ثانية أقصر بصياغة مختلفة.
- note: ملاحظة داخلية قصيرة للمدير إذا اكو شي لازم يتابعه (مثلاً: لازم نتأكد من سعر منطقة). اتركها فارغة إذا ماكو.`;

  const prompt = [
    `القناة: ${CHANNEL_LABELS[message.channel]}`,
    message.customerName && `اسم الزبون: ${message.customerName}`,
    history && `رسائل سابقة من نفس الزبون:\n${history}`,
    `<customer_message>\n${message.text}\n</customer_message>`,
    instruction && `توجيه إضافي من المدير لهذا الرد: ${instruction}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return generateJson({ ai: settings.ai, system, prompt, schema: ReplySchema, effort: "low", maxTokens: 8000 });
}

// ---------------------------------------------------------------------------
// Campaign analysis

const DECISIONS = ["stop", "watch", "keep", "scale"] as const;

export const AnalysisSchema = z.object({
  summary: z.string(),
  campaigns: z.array(
    z.object({
      id: z.string(),
      decision: looseEnum(DECISIONS, "watch"),
      reason: z.string(),
      nextSteps: z.array(z.string()).catch([]),
    }),
  ),
  budgetAdvice: z.string().catch(""),
});

export async function analyzeCampaigns(db: Database): Promise<CampaignAnalysisResult> {
  const { settings } = db;
  const rules = settings.rules;
  const active = db.campaigns.filter((c) => c.status === "active");
  if (active.length === 0) throw new Error("ماكو حملات شغّالة حتى أحللها.");

  const money = (v: number | null) => formatMoney(v, rules.currency);
  const blocks = active.map((c) => {
    const ev = evaluateCampaign(c, db.metrics, rules);
    const daily = db.metrics
      .filter((m) => m.campaignId === c.id && ev.windowStart && m.date >= ev.windowStart)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((m) => `${m.date}: صرف ${money(m.spend)}، ظهور ${m.impressions}، نقرات ${m.clicks}، نتائج ${m.results}`)
      .join("\n");
    return `<campaign id="${c.id}">
الاسم: ${c.name}
المنصة: ${PLATFORM_LABELS[c.platform]} | الهدف: ${OBJECTIVE_LABELS[c.objective]} | الميزانية اليومية: ${money(c.dailyBudget)}
الكلفة المستهدفة للنتيجة: ${money(ev.target)}
آخر ${rules.windowDays} أيام: صرف ${money(ev.recent.spend)}، نتائج ${ev.recent.results}، كلفة النتيجة ${money(ev.recent.cpr)}، نسبة النقر ${ev.recent.ctr?.toFixed(2) ?? "—"}%، كلفة الألف ظهور ${money(ev.recent.cpm)}${ev.recent.roas ? `، العائد ${ev.recent.roas.toFixed(2)}x` : ""}
الفترة اللي قبلها: صرف ${money(ev.previous.spend)}، نتائج ${ev.previous.results}، كلفة النتيجة ${money(ev.previous.cpr)}
حكم القواعد التلقائية: ${SIGNAL_LABELS[ev.signal]} (${ev.reasons.join(" ")})
${c.notes ? `ملاحظات المدير: ${c.notes}\n` : ""}الأرقام اليومية:
${daily || "لا توجد"}
</campaign>`;
  });

  const system = `أنت خبير إعلانات ممولة (ميتا وتيك توك وسناب) تشتغل ويه شركة توصيل عراقية. تقرأ أرقام الحملات وتگول للمدير بوضوح شنو يوقف، شنو يراقب، شنو يكمل، وشنو يكبّر.

${companyContext(settings)}

قواعد الحكم:
- stop: الكلفة أعلى بكثير من الهدف، أو صرف كافي بدون نتائج، أو أداء ينهار.
- watch: قريبة من الحد أو تسوء، أو نسبة النقر ضعيفة (الإعلان ما يجذب).
- keep: ضمن الهدف ومستقرة.
- scale: أقل من الهدف بوضوح وبنتائج كافية ومستقرة؛ الزيادة تدريجية 20% كل 2-3 أيام.
- حكم القواعد التلقائية مرجع، وتگدر تخالفه إذا الأرقام اليومية تبين غير شي، بس وضّح السبب.
- لا تخترع أرقام غير موجودة.

اكتب بالعربي البسيط (لهجة عراقية مفهومة)، جمل قصيرة ومباشرة.
- summary: خلاصة بثلاث أسطر كحد أقصى عن الوضع العام.
- campaigns: لكل حملة: id كما هو، decision، reason جملة أو جملتين بالأرقام، nextSteps من 1 إلى 3 خطوات عملية (مثلاً: غيّر الفيديو، ضيّق الجمهور على بغداد، انقل الميزانية للحملة الفلانية).
- budgetAdvice: نصيحة وحدة عن توزيع الميزانية بين الحملات.`;

  const prompt = `عملة الحساب: ${rules.currency === "IQD" ? "دينار عراقي" : "دولار"}\n\n${blocks.join("\n\n")}`;
  const analysis = await generateJson({
    ai: settings.ai,
    system,
    prompt,
    schema: AnalysisSchema,
    effort: "high",
    maxTokens: 16000,
  });
  // Drop any entries for ids the model invented.
  const ids = new Set(active.map((c) => c.id));
  analysis.campaigns = analysis.campaigns.filter((c) => ids.has(c.id));
  return analysis;
}

// ---------------------------------------------------------------------------
// Social posts

export type Dialect = "iraqi" | "msa";

const PostContentSchema = z.object({
  caption: z.string().min(1),
  hashtags: z.array(z.string()).catch([]),
  imageIdea: z.string().catch(""),
  bestTime: z.string().catch(""),
});
export type PostContent = z.infer<typeof PostContentSchema>;

function contentSystem(settings: Settings, dialect: Dialect): string {
  return `أنت مسؤول سوشل ميديا محترف لشركة توصيل (دليفري) عراقية. تكتب منشورات تجذب الناس وتجيب طلبات ومتابعين.

${companyContext(settings)}

قواعد الكتابة:
- اللغة: ${dialect === "iraqi" ? "لهجة عراقية قريبة من الناس وسهلة القراءة" : "عربية فصحى مبسطة"}.
- أول سطر لازم يشد الانتباه (سؤال، رقم، أو فائدة واضحة).
- جمل قصيرة، وفواصل أسطر حتى يكون سهل القراءة على الموبايل.
- نهاية المنشور بيها دعوة واضحة لفعل شي (اطلب هسه، راسلنا، حمّل التطبيق...) مع رقم التواصل أو رابط التطبيق إذا موجودين.
- لا تخترع أسعار أو خصومات مو مذكورة بالمعلومات أو بالطلب.
- 3 إيموجي كحد أقصى.
- hashtags: من 3 إلى 6 هاشتاگات مناسبة للعراق، بدون علامة # داخل النص.
- imageIdea: وصف قصير للصورة أو الفيديو المقترح (شنو يبين بيه، النص المكتوب على الصورة).
- bestTime: أفضل يوم ووقت للنشر للجمهور العراقي مع سبب مختصر.`;
}

function platformHint(platform: PostPlatform): string {
  switch (platform) {
    case "instagram":
      return "إنستغرام: نص متوسط الطول، يعتمد على الصورة، الهاشتاگات مهمة.";
    case "tiktok":
      return "تيك توك: الكابشن قصير جداً (سطر أو سطرين)، و imageIdea يكون فكرة فيديو قصير بمشاهد واضحة.";
    case "whatsapp_status":
      return "حالة واتساب: نص قصير جداً ومباشر، بدون هاشتاگات تقريباً.";
    default:
      return "فيسبوك: ممكن نص أطول شوية، مع دعوة واضحة للتواصل.";
  }
}

export async function generatePost(
  settings: Settings,
  input: { platform: PostPlatform; type: PostType; topic: string; dialect: Dialect },
): Promise<PostContent> {
  const prompt = `اكتب منشور واحد.
المنصة: ${POST_PLATFORM_LABELS[input.platform]} (${platformHint(input.platform)})
نوع المنشور: ${POST_TYPE_LABELS[input.type]}
<details>
${input.topic || "بدون تفاصيل إضافية، اختار فكرة مناسبة لنوع المنشور."}
</details>`;
  const out = await generateJson({
    ai: settings.ai,
    system: contentSystem(settings, input.dialect),
    prompt,
    schema: PostContentSchema,
    effort: "medium",
    maxTokens: 8000,
  });
  out.hashtags = cleanHashtags(out.hashtags);
  return out;
}

const PLATFORMS = ["facebook", "instagram", "tiktok", "whatsapp_status"] as const;
const TYPES = ["offer", "service", "hiring", "tips", "engagement", "occasion", "app"] as const;

const PlanSchema = z.object({
  posts: z.array(
    PostContentSchema.extend({
      day: z.number().int().catch(1),
      platform: looseEnum(PLATFORMS, "facebook"),
      type: looseEnum(TYPES, "service"),
      topic: z.string().catch(""),
    }),
  ),
});
export type PlanPost = z.infer<typeof PlanSchema>["posts"][number];

export async function generatePlan(
  settings: Settings,
  input: { days: number; platforms: PostPlatform[]; goals: string; dialect: Dialect; startDate: string },
): Promise<PlanPost[]> {
  const platforms = input.platforms.map((p) => `${p} (${POST_PLATFORM_LABELS[p]})`).join("، ");
  const prompt = `سوّي خطة نشر لمدة ${input.days} أيام تبدي من ${input.startDate}.
منشور واحد باليوم، ووزّع المنشورات على هذي المنصات: ${platforms}.
نوّع بأنواع المنشورات (عرض، تعريف بالخدمة، نصيحة، تفاعل، توظيف مناديب، الترويج للتطبيق) حسب الأهداف.
<goals>
${input.goals || "زيادة الطلبات والمتابعين."}
</goals>
لكل منشور: day (رقم اليوم من 1 إلى ${input.days})، platform، type، topic (فكرة المنشور بجملة)، caption كامل جاهز للنشر، hashtags، imageIdea، bestTime.`;
  const out = await generateJson({
    ai: settings.ai,
    system: contentSystem(settings, input.dialect),
    prompt,
    schema: PlanSchema,
    effort: "medium",
    maxTokens: 24000,
  });
  const allowed = new Set(input.platforms);
  return out.posts
    .filter((p) => p.day >= 1 && p.day <= input.days)
    .map((p) => ({
      ...p,
      platform: allowed.has(p.platform) ? p.platform : input.platforms[0],
      hashtags: cleanHashtags(p.hashtags),
    }));
}

function cleanHashtags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const tag = t.replace(/^#+/, "").trim().replace(/\s+/g, "_");
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
    }
  }
  return out.slice(0, 8);
}
