import { updateDb, newId, nowIso } from "@/lib/db";
import { ok, handleError } from "@/lib/api";
import { addDays, todayLocal } from "@/lib/evaluate";
import type { Campaign, CampaignObjective, AdPlatform, DailyMetric, InboxMessage } from "@/lib/types";

// Sample data so the manager can see every screen working before entering real numbers.
// Each campaign is shaped to land on a different recommendation.

interface Shape {
  name: string;
  platform: AdPlatform;
  objective: CampaignObjective;
  dailyBudget: number;
  impressions: number;
  ctr: number;
  resultsPerDay: number;
}

const SHAPES: Shape[] = [
  { name: "طلبات بغداد - فيديو المندوب", platform: "facebook", objective: "orders", dailyBudget: 25000, impressions: 20000, ctr: 2, resultsPerDay: 12 },
  { name: "تحميل التطبيق - ستوري", platform: "instagram", objective: "installs", dailyBudget: 15000, impressions: 18000, ctr: 1.1, resultsPerDay: 3 },
  { name: "رسائل واتساب - توصيل مجاني أول طلب", platform: "facebook", objective: "messages", dailyBudget: 10000, impressions: 30000, ctr: 0.5, resultsPerDay: 9 },
  { name: "توظيف مناديب - بغداد", platform: "tiktok", objective: "leads", dailyBudget: 8000, impressions: 15000, ctr: 1.2, resultsPerDay: 3.5 },
];

/** Deterministic wobble so charts look real but runs are repeatable. */
function wobble(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return 0.85 + (x - Math.floor(x)) * 0.3;
}

export async function POST() {
  try {
    const today = todayLocal();
    const result = await updateDb((db) => {
      const campaigns: Campaign[] = [];
      const metrics: DailyMetric[] = [];
      SHAPES.forEach((s, ci) => {
        const id = newId();
        campaigns.push({
          id,
          name: s.name,
          platform: s.platform,
          objective: s.objective,
          status: "active",
          dailyBudget: s.dailyBudget,
          targetCpr: null,
          notes: "بيانات تجريبية",
          createdAt: nowIso(),
        });
        for (let d = 14; d >= 1; d--) {
          const w = wobble(ci * 100 + d);
          const impressions = Math.round(s.impressions * w);
          const clicks = Math.round((impressions * s.ctr) / 100);
          metrics.push({
            campaignId: id,
            date: addDays(today, -d),
            spend: Math.round(s.dailyBudget * (0.9 + (w - 0.85) / 3)),
            impressions,
            clicks,
            results: Math.max(0, Math.round(s.resultsPerDay * w)),
            revenue: 0,
          });
        }
      });

      const base = {
        receivedAt: nowIso(),
        status: "new" as const,
        intent: null,
        urgency: null,
        draft: "",
        altDraft: "",
        internalNote: "",
        source: "manual" as const,
        externalId: null,
      };
      const messages: InboxMessage[] = [
        { ...base, id: newId(), channel: "whatsapp", customerName: "أبو علي", customerHandle: "9647701234567", text: "هلو اخي شكد التوصيل من الكرادة للمنصور؟ عندي طلبية ملابس" },
        { ...base, id: newId(), channel: "facebook", customerName: "زينب", customerHandle: "", text: "صارلي ساعتين انتظر الطلب وما وصل!! رقم الطلب 4521" },
        { ...base, id: newId(), channel: "instagram", customerName: "hassan.shop", customerHandle: "", text: "مرحبا عندي محل اكسسوارات بالبصرة اريد اتعامل وياكم بالتوصيل شنو الشروط؟" },
      ];

      db.campaigns.push(...campaigns);
      db.metrics.push(...metrics);
      db.messages.push(...messages);
      return { campaigns: campaigns.length, metrics: metrics.length, messages: messages.length };
    });
    return ok(result, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
