"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, CardHeader, EmptyState, Field, Input, PageHeader, Stat, cx, type Tone } from "@/components/ui";
import { Icon } from "@/components/icons";
import { SignalBadge, SIGNAL_TONE } from "@/components/signal";
import { api, errorText, useToast } from "@/components/client";
import { formatMoney, formatNumber, todayLocal } from "@/lib/evaluate";
import { CAMPAIGN_STATUS_LABELS, OBJECTIVE_LABELS, OBJECTIVE_RESULT_LABELS, PLATFORM_LABELS, SIGNAL_LABELS } from "@/lib/labels";
import type { Campaign, CampaignEvaluation, CampaignRules, DailyMetric, Decision } from "@/lib/types";
import { CampaignForm } from "../campaign-form";

// Static class names so Tailwind can see them at build time.
const ACCENT_BORDER: Record<Tone, string> = {
  stop: "border-s-stop",
  watch: "border-s-watch",
  keep: "border-s-keep",
  scale: "border-s-scale",
  neutral: "border-s-border-strong",
  accent: "border-s-accent",
};

export function CampaignDetail({
  campaign,
  metrics,
  evaluation: ev,
  rules,
  ai,
  aiDate,
}: {
  campaign: Campaign;
  metrics: DailyMetric[];
  evaluation: CampaignEvaluation;
  rules: CampaignRules;
  ai: { decision: Decision; reason: string; nextSteps: string[] } | null;
  aiDate: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const money = (v: number | null) => formatMoney(v, rules.currency);
  const unit = OBJECTIVE_RESULT_LABELS[campaign.objective];

  return (
    <>
      <Link href="/campaigns" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <Icon name="chevronRight" className="size-4" />
        كل الحملات
      </Link>
      <PageHeader
        title={campaign.name}
        description={`${PLATFORM_LABELS[campaign.platform]} · ${OBJECTIVE_LABELS[campaign.objective]} · ${CAMPAIGN_STATUS_LABELS[campaign.status]} · ميزانية يومية ${money(campaign.dailyBudget)}`}
        actions={
          <>
            <Button icon="pen" onClick={() => setEditing(!editing)}>
              تعديل
            </Button>
            <Button
              icon="trash"
              variant="danger"
              onClick={async () => {
                if (!confirm(`تريد تحذف حملة "${campaign.name}" وكل أرقامها؟`)) return;
                try {
                  await api(`/api/campaigns/${campaign.id}`, { method: "DELETE" });
                  toast("انحذفت الحملة");
                  router.push("/campaigns");
                  router.refresh();
                } catch (err) {
                  toast(errorText(err), "error");
                }
              }}
            >
              حذف
            </Button>
          </>
        }
      />

      {editing ? (
        <Card className="mb-6">
          <CardHeader title="تعديل الحملة" />
          <div className="p-4 sm:p-5">
            <CampaignForm
              initial={campaign}
              rules={rules}
              submitLabel="حفظ"
              onCancel={() => setEditing(false)}
              onSubmit={async (values) => {
                try {
                  await api(`/api/campaigns/${campaign.id}`, { method: "PATCH", body: values });
                  toast("انحفظت التعديلات");
                  setEditing(false);
                  router.refresh();
                } catch (err) {
                  toast(errorText(err), "error");
                }
              }}
            />
          </div>
        </Card>
      ) : null}

      <Card className={cx("mb-6 border-s-4", ACCENT_BORDER[SIGNAL_TONE[ev.signal]])}>
        <div className="space-y-2 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted">التوصية:</span>
            <SignalBadge signal={ev.signal} />
            {ev.windowStart ? (
              <span className="ltr-nums text-xs text-faint">
                {ev.windowStart} → {ev.windowEnd}
              </span>
            ) : null}
          </div>
          <p className="font-medium">{ev.action}</p>
          <ul className="list-disc space-y-0.5 ps-5 text-sm text-muted">
            {ev.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
          {ai ? (
            <div className="mt-3 rounded-lg bg-accent-soft p-3 text-sm">
              <div className="mb-1 flex items-center gap-2 font-medium text-accent">
                <Icon name="sparkles" className="size-4" />
                رأي الذكاء الاصطناعي: {SIGNAL_LABELS[ai.decision]}
                {aiDate ? (
                  <span className="text-xs font-normal text-muted">
                    ({new Date(aiDate).toLocaleDateString("ar-IQ")})
                  </span>
                ) : null}
              </div>
              <p>{ai.reason}</p>
              {ai.nextSteps.length ? (
                <ul className="mt-1.5 list-disc space-y-0.5 ps-5">
                  {ai.nextSteps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`الصرف (آخر ${rules.windowDays} أيام)`} value={<span className="ltr-nums">{money(ev.recent.spend)}</span>} hint={`قبلها: ${money(ev.previous.spend)}`} />
        <Stat label="النتائج" value={<span className="ltr-nums">{formatNumber(ev.recent.results)}</span>} hint={`قبلها: ${formatNumber(ev.previous.results)} ${unit}`} />
        <Stat
          label={`كلفة ال${unit}`}
          value={<span className="ltr-nums">{money(ev.recent.cpr)}</span>}
          hint={`الهدف ${money(ev.target)} · قبلها ${money(ev.previous.cpr)}`}
          tone={ev.recent.cpr === null ? undefined : ev.recent.cpr > ev.target * rules.stopRatio ? "stop" : ev.recent.cpr > ev.target ? "watch" : "scale"}
        />
        <Stat
          label="نسبة النقر"
          value={<span className="ltr-nums">{ev.recent.ctr !== null ? `${formatNumber(ev.recent.ctr, 2)}%` : "—"}</span>}
          hint={`كلفة الألف ظهور ${money(ev.recent.cpm)}`}
          tone={ev.recent.ctr !== null && ev.recent.ctr < rules.minCtr ? "watch" : undefined}
        />
      </div>

      <MetricEntry campaignId={campaign.id} currency={rules.currency} />

      <Card>
        <CardHeader title="الأرقام اليومية" description={`كلفة ال${unit} ملوّنة حسب الهدف: أخضر ضمن الهدف، أصفر أعلى، أحمر أعلى بكثير.`} />
        {metrics.length === 0 ? (
          <EmptyState icon="calendar" title="ماكو أرقام مسجّلة">
            سجّل أرقام كل يوم من الفورم فوق، أو استورد ملف من صفحة الحملات.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th className="px-4 py-2.5 text-start font-medium">التاريخ</th>
                  <th className="px-3 py-2.5 text-start font-medium">الصرف</th>
                  <th className="px-3 py-2.5 text-start font-medium">الظهور</th>
                  <th className="px-3 py-2.5 text-start font-medium">النقرات</th>
                  <th className="px-3 py-2.5 text-start font-medium">نسبة النقر</th>
                  <th className="px-3 py-2.5 text-start font-medium">النتائج</th>
                  <th className="px-3 py-2.5 text-start font-medium">كلفة النتيجة</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {metrics.map((m) => {
                  const cpr = m.results > 0 ? m.spend / m.results : null;
                  const tone =
                    cpr === null
                      ? m.spend > 0
                        ? "text-stop"
                        : "text-muted"
                      : cpr > ev.target * rules.stopRatio
                        ? "text-stop"
                        : cpr > ev.target
                          ? "text-watch"
                          : "text-scale";
                  return (
                    <tr key={m.date} className="hover:bg-surface-2">
                      <td className="px-4 py-2 font-medium">
                        <span className="ltr-nums">{m.date}</span>
                      </td>
                      <td className="px-3 py-2"><span className="ltr-nums">{money(m.spend)}</span></td>
                      <td className="px-3 py-2"><span className="ltr-nums">{formatNumber(m.impressions)}</span></td>
                      <td className="px-3 py-2"><span className="ltr-nums">{formatNumber(m.clicks)}</span></td>
                      <td className="px-3 py-2">
                        <span className="ltr-nums">{m.impressions ? `${formatNumber((m.clicks / m.impressions) * 100, 2)}%` : "—"}</span>
                      </td>
                      <td className="px-3 py-2"><span className="ltr-nums">{formatNumber(m.results)}</span></td>
                      <td className={cx("px-3 py-2 font-semibold", tone)}>
                        <span className="ltr-nums">{cpr === null ? (m.spend > 0 ? "بدون نتائج" : "—") : money(cpr)}</span>
                      </td>
                      <td className="px-3 py-2 text-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          icon="trash"
                          aria-label={`حذف أرقام ${m.date}`}
                          onClick={async () => {
                            if (!confirm(`تحذف أرقام يوم ${m.date}؟`)) return;
                            try {
                              await api(`/api/campaigns/${campaign.id}/metrics?date=${m.date}`, { method: "DELETE" });
                              router.refresh();
                            } catch (err) {
                              toast(errorText(err), "error");
                            }
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function MetricEntry({ campaignId, currency }: { campaignId: string; currency: CampaignRules["currency"] }) {
  const router = useRouter();
  const toast = useToast();
  const [date, setDate] = useState(todayLocal());
  const [spend, setSpend] = useState("");
  const [impressions, setImpressions] = useState("");
  const [clicks, setClicks] = useState("");
  const [results, setResults] = useState("");
  const [revenue, setRevenue] = useState("");
  const [saving, setSaving] = useState(false);

  const num = (label: string, value: string, set: (v: string) => void, required = false) => (
    <Field label={label}>
      <Input
        type="number"
        min={0}
        step="any"
        inputMode="decimal"
        required={required}
        className="ltr-nums text-start"
        value={value}
        onChange={(e) => set(e.target.value)}
      />
    </Field>
  );

  return (
    <Card className="mb-6">
      <CardHeader title="سجّل أرقام يوم" description="إذا اليوم مسجّل من قبل، الأرقام الجديدة تحل محله." />
      <form
        className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 sm:p-5 lg:grid-cols-7 lg:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          try {
            await api(`/api/campaigns/${campaignId}/metrics`, {
              body: {
                date,
                spend: Number(spend) || 0,
                impressions: Number(impressions) || 0,
                clicks: Number(clicks) || 0,
                results: Number(results) || 0,
                revenue: Number(revenue) || 0,
              },
            });
            toast(`انحفظت أرقام ${date}`);
            setSpend("");
            setImpressions("");
            setClicks("");
            setResults("");
            setRevenue("");
            router.refresh();
          } catch (err) {
            toast(errorText(err), "error");
          } finally {
            setSaving(false);
          }
        }}
      >
        <Field label="التاريخ">
          <Input type="date" required className="ltr-nums text-start" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {num(`الصرف (${currency === "IQD" ? "دينار" : "دولار"})`, spend, setSpend, true)}
        {num("الظهور", impressions, setImpressions)}
        {num("النقرات", clicks, setClicks)}
        {num("النتائج", results, setResults)}
        {num("المبيعات (اختياري)", revenue, setRevenue)}
        <Button type="submit" variant="primary" icon="check" loading={saving} className="col-span-2 sm:col-span-1">
          حفظ
        </Button>
      </form>
    </Card>
  );
}
