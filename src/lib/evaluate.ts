// Rule-based campaign scoring. Pure functions: no I/O, safe on client and server.
import type { Campaign, CampaignEvaluation, CampaignRules, DailyMetric, Signal, Totals } from "./types";
import { OBJECTIVE_RESULT_LABELS } from "./labels";

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function todayLocal(): string {
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 10);
}

export function sumMetrics(rows: DailyMetric[]): Totals {
  const t = rows.reduce(
    (acc, r) => {
      acc.spend += r.spend;
      acc.impressions += r.impressions;
      acc.clicks += r.clicks;
      acc.results += r.results;
      acc.revenue += r.revenue;
      return acc;
    },
    { spend: 0, impressions: 0, clicks: 0, results: 0, revenue: 0 },
  );
  return {
    ...t,
    ctr: t.impressions > 0 ? (t.clicks / t.impressions) * 100 : null,
    cpc: t.clicks > 0 ? t.spend / t.clicks : null,
    cpm: t.impressions > 0 ? (t.spend / t.impressions) * 1000 : null,
    cpr: t.results > 0 ? t.spend / t.results : null,
    roas: t.spend > 0 && t.revenue > 0 ? t.revenue / t.spend : null,
    days: new Set(rows.map((r) => r.date)).size,
  };
}

export function formatMoney(value: number | null, currency: CampaignRules["currency"]): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (currency === "USD") return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return `${Math.round(value).toLocaleString("en-US")} د.ع`;
}

export function formatNumber(value: number | null, digits = 0): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function targetFor(campaign: Campaign, rules: CampaignRules): number {
  return campaign.targetCpr && campaign.targetCpr > 0 ? campaign.targetCpr : rules.targetCpr[campaign.objective];
}

/**
 * Compare the last `windowDays` of data against the window before it and
 * decide what to do. The window ends on the campaign's latest recorded day,
 * so a campaign whose numbers were entered yesterday is still judged fairly.
 */
export function evaluateCampaign(
  campaign: Campaign,
  allMetrics: DailyMetric[],
  rules: CampaignRules,
): CampaignEvaluation {
  const rows = allMetrics.filter((m) => m.campaignId === campaign.id);
  const target = targetFor(campaign, rules);
  const money = (v: number | null) => formatMoney(v, rules.currency);
  const unit = OBJECTIVE_RESULT_LABELS[campaign.objective];

  const latest = rows.reduce<string | null>((max, r) => (max === null || r.date > max ? r.date : max), null);
  const windowEnd = latest;
  const windowStart = latest ? addDays(latest, -(rules.windowDays - 1)) : null;
  const prevEnd = windowStart ? addDays(windowStart, -1) : null;
  const prevStart = prevEnd ? addDays(prevEnd, -(rules.windowDays - 1)) : null;

  const recent = sumMetrics(rows.filter((r) => windowStart && r.date >= windowStart && r.date <= windowEnd!));
  const previous = sumMetrics(rows.filter((r) => prevStart && r.date >= prevStart && r.date <= prevEnd!));
  const cprChange =
    recent.cpr !== null && previous.cpr !== null && previous.cpr > 0
      ? ((recent.cpr - previous.cpr) / previous.cpr) * 100
      : null;

  const base = { campaignId: campaign.id, target, windowStart, windowEnd, recent, previous, cprChange };
  const result = (signal: Signal, reasons: string[], action: string): CampaignEvaluation => ({
    ...base,
    signal,
    reasons,
    action,
  });

  if (campaign.status !== "active") {
    return result("inactive", ["الحملة مو شغّالة حالياً."], "لا شي مطلوب.");
  }
  if (recent.spend <= 0) {
    return result("no_data", ["ماكو أرقام مسجّلة لهذي الحملة."], "سجّل أرقام اليوم أو استورد ملف من مدير الإعلانات.");
  }

  const minSpend = target * rules.minSpendMultiplier;

  if (recent.results === 0) {
    if (recent.spend >= minSpend) {
      return result(
        "stop",
        [`صرفت ${money(recent.spend)} خلال ${recent.days} يوم بدون ولا ${unit}.`],
        "أوقف الحملة، وغيّر الإعلان (الصورة/الفيديو والنص) أو الجمهور قبل ما تعيد تشغيلها.",
      );
    }
    return result(
      "learning",
      [`صرفت ${money(recent.spend)} لحد الآن، والحد الأدنى للحكم ${money(minSpend)}.`],
      "خليها تكمل لحد ما توصل الحد الأدنى للصرف، وبعدين نحكم عليها.",
    );
  }

  const cpr = recent.cpr!;
  const ratio = cpr / target;
  const reasons: string[] = [
    `كلفة ${unit} الواحد ${money(cpr)} والهدف ${money(target)} (${Math.round(ratio * 100)}% من الهدف).`,
  ];

  if (recent.spend < minSpend) {
    reasons.push(`الصرف ${money(recent.spend)} بعده أقل من الحد الأدنى للحكم ${money(minSpend)}.`);
    return result("learning", reasons, "بعدها مبكّرة. خليها تكمل كم يوم وراجعها.");
  }

  if (ratio > rules.stopRatio) {
    return result(
      "stop",
      reasons,
      "الكلفة عالية كلش. أوقفها، أو نزّل الميزانية للنص وجرّب إعلان جديد بنفس الجمهور.",
    );
  }

  const worsening = cprChange !== null && cprChange > 30;
  const weakCtr = recent.ctr !== null && recent.ctr < rules.minCtr;
  if (worsening) reasons.push(`الكلفة زادت ${Math.round(cprChange!)}% عن الفترة اللي قبلها.`);
  if (weakCtr) {
    reasons.push(`نسبة النقر ${formatNumber(recent.ctr, 2)}% أقل من ${rules.minCtr}%، يعني الإعلان ما يجذب.`);
  }

  if (ratio <= rules.scaleRatio && recent.results >= rules.minResultsToScale && !worsening) {
    reasons.push(`جابت ${formatNumber(recent.results)} ${unit} بكلفة أقل من الهدف.`);
    return result(
      "scale",
      reasons,
      "زيد الميزانية 20% كل 2 إلى 3 أيام وراقب الكلفة. لا تضاعفها مرة وحدة حتى ما تخرب الأداء.",
    );
  }

  if (ratio > 1 || worsening || weakCtr) {
    const action = weakCtr
      ? "جرّب صورة أو فيديو جديد ونص أقوى بأول سطر، وخلي الميزانية مثل ما هي."
      : "لا تزيد الميزانية. راقبها يومين؛ إذا ما تحسنت أوقفها أو غيّر الإعلان.";
    return result("watch", reasons, action);
  }

  return result("keep", reasons, "الحملة ضمن الهدف. خليها تكمل بنفس الميزانية.");
}

export const SIGNAL_PRIORITY: Record<Signal, number> = {
  stop: 0,
  watch: 1,
  scale: 2,
  keep: 3,
  learning: 4,
  no_data: 5,
  inactive: 6,
};
