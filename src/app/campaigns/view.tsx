"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Alert, Button, Card, CardHeader, EmptyState, Field, Options, PageHeader, Select, Textarea, cx } from "@/components/ui";
import { Icon } from "@/components/icons";
import { SignalBadge } from "@/components/signal";
import { api, errorText, useToast } from "@/components/client";
import { SIGNAL_PRIORITY, formatMoney, formatNumber } from "@/lib/evaluate";
import { OBJECTIVE_LABELS, OBJECTIVE_RESULT_LABELS, PLATFORM_LABELS, SIGNAL_LABELS } from "@/lib/labels";
import type { AdPlatform, Campaign, CampaignEvaluation, CampaignObjective, CampaignRules, SavedAnalysis, Signal } from "@/lib/types";
import { CampaignForm } from "./campaign-form";

type Panel = null | "new" | "import";

export function CampaignsView({
  campaigns,
  evaluations,
  rules,
  analysis,
}: {
  campaigns: Campaign[];
  evaluations: CampaignEvaluation[];
  rules: CampaignRules;
  analysis: SavedAnalysis | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [panel, setPanel] = useState<Panel>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const evalById = useMemo(() => new Map(evaluations.map((e) => [e.campaignId, e])), [evaluations]);
  const aiById = useMemo(() => new Map((analysis?.result.campaigns ?? []).map((c) => [c.id, c])), [analysis]);

  const sorted = useMemo(
    () =>
      [...campaigns].sort((a, b) => {
        const ea = evalById.get(a.id)!;
        const eb = evalById.get(b.id)!;
        return SIGNAL_PRIORITY[ea.signal] - SIGNAL_PRIORITY[eb.signal] || eb.recent.spend - ea.recent.spend;
      }),
    [campaigns, evalById],
  );

  const counts = useMemo(() => {
    const c: Partial<Record<Signal, number>> = {};
    for (const e of evaluations) c[e.signal] = (c[e.signal] ?? 0) + 1;
    return c;
  }, [evaluations]);

  const totalSpend = evaluations.reduce((s, e) => s + (e.signal === "inactive" ? 0 : e.recent.spend), 0);
  const hasActive = campaigns.some((c) => c.status === "active");

  async function runAnalysis() {
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      await api("/api/campaigns/analyze", { method: "POST" });
      toast("خلص التحليل");
      router.refresh();
    } catch (err) {
      setAnalysisError(errorText(err));
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <>
      <PageHeader
        title="الحملات الإعلانية"
        description={`كل حملة تنقارن آخر ${rules.windowDays} أيام منها بالفترة اللي قبلها، وتطلع توصية: توقفها، تراقبها، تكمل، أو تكبّرها.`}
        actions={
          <>
            <Button icon="plus" variant={panel === "new" ? "primary" : "secondary"} onClick={() => setPanel(panel === "new" ? null : "new")}>
              حملة جديدة
            </Button>
            <Button icon="upload" variant={panel === "import" ? "primary" : "secondary"} onClick={() => setPanel(panel === "import" ? null : "import")}>
              استيراد أرقام
            </Button>
            <Button icon="sparkles" variant="primary" loading={analyzing} disabled={!hasActive} onClick={runAnalysis}>
              {analyzing ? "دا يحلل…" : "حلل بالذكاء الاصطناعي"}
            </Button>
          </>
        }
      />

      {panel === "new" ? (
        <Card className="mb-6">
          <CardHeader title="حملة جديدة" />
          <div className="p-4 sm:p-5">
            <CampaignForm
              rules={rules}
              submitLabel="أضف الحملة"
              onCancel={() => setPanel(null)}
              onSubmit={async (values) => {
                try {
                  await api("/api/campaigns", { body: values });
                  toast("انضافت الحملة");
                  setPanel(null);
                  router.refresh();
                } catch (err) {
                  toast(errorText(err), "error");
                }
              }}
            />
          </div>
        </Card>
      ) : null}

      {panel === "import" ? <ImportPanel campaigns={campaigns} onDone={() => setPanel(null)} /> : null}

      {analyzing ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-accent-soft px-3 py-2.5 text-sm text-accent">
          <Icon name="sparkles" className="size-4" />
          دا يقرأ أرقام كل الحملات ويكتب التوصيات. على النموذج المحلي ممكن ياخذ دقيقة أو دقيقتين.
        </div>
      ) : null}
      {analysisError ? (
        <div className="mb-4">
          <Alert>{analysisError}</Alert>
        </div>
      ) : null}

      {campaigns.length === 0 ? (
        <Card>
          <EmptyState icon="megaphone" title="ماكو حملات بعد">
            أضف حملة وسجّل أرقامها اليومية، أو استورد ملف من مدير الإعلانات. تگدر تجرب بالبيانات التجريبية من{" "}
            <Link href="/settings" className="text-accent underline">
              الإعدادات
            </Link>
            .
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            {(["stop", "watch", "scale", "keep", "learning"] as Signal[]).map((s) =>
              counts[s] ? (
                <span key={s} className="inline-flex items-center gap-1.5">
                  <SignalBadge signal={s} />
                  <span className="text-muted">{counts[s]}</span>
                </span>
              ) : null,
            )}
            <span className="ms-auto text-muted">
              صرف آخر {rules.windowDays} أيام: <span className="ltr-nums font-semibold text-text">{formatMoney(totalSpend, rules.currency)}</span>
            </span>
          </div>

          {analysis ? <AnalysisCard analysis={analysis} campaigns={campaigns} /> : null}

          <Card>
            <div className="hidden grid-cols-[minmax(0,2.2fr)_repeat(5,minmax(0,1fr))] gap-3 border-b border-border px-5 py-2.5 text-xs font-medium text-muted lg:grid">
              <div>الحملة</div>
              <div>التوصية</div>
              <div>الصرف</div>
              <div>النتائج</div>
              <div>كلفة النتيجة / الهدف</div>
              <div>نسبة النقر</div>
            </div>
            <ul className="divide-y divide-border">
              {sorted.map((c) => (
                <CampaignRow key={c.id} campaign={c} ev={evalById.get(c.id)!} rules={rules} ai={aiById.get(c.id)} />
              ))}
            </ul>
          </Card>
        </>
      )}
    </>
  );
}

function CampaignRow({
  campaign,
  ev,
  rules,
  ai,
}: {
  campaign: Campaign;
  ev: CampaignEvaluation;
  rules: CampaignRules;
  ai?: SavedAnalysis["result"]["campaigns"][number];
}) {
  const money = (v: number | null) => formatMoney(v, rules.currency);
  const ratio = ev.recent.cpr !== null ? ev.recent.cpr / ev.target : null;
  const cprTone =
    ratio === null ? "text-muted" : ratio > rules.stopRatio ? "text-stop" : ratio > 1 ? "text-watch" : "text-scale";

  return (
    <li>
      <Link href={`/campaigns/${campaign.id}`} className="block px-4 py-3.5 transition-colors hover:bg-surface-2 sm:px-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,2.2fr)_repeat(5,minmax(0,1fr))] lg:items-center">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium">{campaign.name}</span>
              <span className="lg:hidden">
                <SignalBadge signal={ev.signal} />
              </span>
            </div>
            <div className="mt-0.5 text-xs text-muted">
              {PLATFORM_LABELS[campaign.platform]} · {OBJECTIVE_LABELS[campaign.objective]}
            </div>
          </div>
          <div className="hidden lg:block">
            <SignalBadge signal={ev.signal} />
          </div>
          <div className="grid grid-cols-4 gap-2 text-sm lg:contents">
            <Metric label="الصرف" value={money(ev.recent.spend)} />
            <Metric label="النتائج" value={`${formatNumber(ev.recent.results)} ${OBJECTIVE_RESULT_LABELS[campaign.objective]}`} />
            <Metric
              label="كلفة النتيجة"
              value={
                <span className="inline-flex items-center gap-1">
                  <span className={cx("font-semibold", cprTone)}>{money(ev.recent.cpr)}</span>
                  {ev.cprChange !== null && Math.abs(ev.cprChange) >= 5 ? (
                    <span
                      className={cx("inline-flex items-center text-xs", ev.cprChange > 0 ? "text-stop" : "text-scale")}
                      title="التغيّر عن الفترة السابقة"
                    >
                      <Icon name={ev.cprChange > 0 ? "up" : "down"} className="size-3" />
                      {Math.round(Math.abs(ev.cprChange))}%
                    </span>
                  ) : null}
                </span>
              }
              sub={`الهدف ${money(ev.target)}`}
            />
            <Metric label="نسبة النقر" value={ev.recent.ctr !== null ? `${formatNumber(ev.recent.ctr, 2)}%` : "—"} />
          </div>
        </div>
        <p className="mt-2 text-[13px] text-muted">
          <span className="font-medium text-text">{SIGNAL_LABELS[ev.signal]}: </span>
          {ev.action}
        </p>
        {ai ? (
          <p className="mt-1.5 flex items-start gap-1.5 text-[13px]">
            <Icon name="sparkles" className="mt-0.5 size-3.5 shrink-0 text-accent" />
            <span>
              <span className="font-medium">رأي الذكاء الاصطناعي ({SIGNAL_LABELS[ai.decision]}): </span>
              <span className="text-muted">{ai.reason}</span>
            </span>
          </p>
        ) : null}
      </Link>
    </li>
  );
}

function Metric({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-faint lg:hidden">{label}</div>
      <div className="ltr-nums truncate text-start">{value}</div>
      {sub ? <div className="ltr-nums truncate text-start text-[11px] text-faint">{sub}</div> : null}
    </div>
  );
}

function AnalysisCard({ analysis, campaigns }: { analysis: SavedAnalysis; campaigns: Campaign[] }) {
  const [open, setOpen] = useState(true);
  const names = new Map(campaigns.map((c) => [c.id, c.name]));
  const when = new Date(analysis.createdAt).toLocaleString("ar-IQ", { dateStyle: "medium", timeStyle: "short" });

  return (
    <Card className="mb-4 border-accent/40">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Icon name="sparkles" className="size-4 text-accent" />
            تحليل الذكاء الاصطناعي
          </span>
        }
        description={`آخر تحليل: ${when} · ${analysis.provider === "claude" ? "Claude" : "النموذج المحلي"}`}
        actions={
          <Button size="sm" variant="ghost" onClick={() => setOpen(!open)}>
            {open ? "إخفاء" : "إظهار"}
          </Button>
        }
      />
      {open ? (
        <div className="space-y-4 p-4 text-sm leading-relaxed sm:p-5">
          <p className="whitespace-pre-line">{analysis.result.summary}</p>
          {analysis.result.budgetAdvice ? (
            <div className="rounded-lg bg-accent-soft px-3 py-2.5">
              <span className="font-medium text-accent">توزيع الميزانية: </span>
              {analysis.result.budgetAdvice}
            </div>
          ) : null}
          <ul className="grid gap-3 md:grid-cols-2">
            {analysis.result.campaigns.map((c) => (
              <li key={c.id} className="rounded-lg border border-border p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{names.get(c.id) ?? "حملة محذوفة"}</span>
                  <SignalBadge signal={c.decision} />
                </div>
                <p className="text-muted">{c.reason}</p>
                {c.nextSteps.length ? (
                  <ul className="mt-2 list-disc space-y-0.5 ps-5">
                    {c.nextSteps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

const TEMPLATE = "campaign,date,spend,impressions,clicks,results,revenue\nطلبات بغداد,2025-01-01,25000,20000,400,12,0\n";

function ImportPanel({ campaigns, onDone }: { campaigns: Campaign[]; onDone: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [platform, setPlatform] = useState<AdPlatform>("facebook");
  const [objective, setObjective] = useState<CampaignObjective>("orders");
  const [campaignId, setCampaignId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Card className="mb-6">
      <CardHeader
        title="استيراد الأرقام من ملف"
        description="يقبل ملف CSV من مدير إعلانات ميتا أو تيك توك، أو القالب الجاهز."
        actions={
          <a
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border-strong px-2.5 text-[13px] font-medium hover:bg-surface-2"
            href={`data:text/csv;charset=utf-8,${encodeURIComponent("﻿" + TEMPLATE)}`}
            download="campaigns-template.csv"
          >
            <Icon name="download" className="size-4" />
            تحميل القالب
          </a>
        }
      />
      <div className="space-y-4 p-4 sm:p-5">
        <div className="rounded-lg bg-surface-2 px-3 py-2.5 text-[13px] leading-relaxed text-muted">
          من مدير إعلانات ميتا: اختار الحملات ← <b>التقارير</b> ← <b>التقسيم حسب الوقت: اليوم</b> ← صدّر CSV. لازم يكون بيه أعمدة
          اسم الحملة، اليوم، المبلغ المنفق، والنتائج. إذا نفس اليوم موجود من قبل، الأرقام الجديدة تحل محله.
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="الملف">
            <label className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border-strong px-3 text-sm text-muted hover:bg-surface-2">
              <Icon name="upload" className="size-4" />
              <span className="truncate">{fileName || "اختار ملف CSV"}</span>
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setFileName(f.name);
                  setCsv(await f.text());
                }}
              />
            </label>
          </Field>
          <Field label="منصة الحملات الجديدة">
            <Select value={platform} onChange={(e) => setPlatform(e.target.value as AdPlatform)}>
              <Options labels={PLATFORM_LABELS} />
            </Select>
          </Field>
          <Field label="هدف الحملات الجديدة">
            <Select value={objective} onChange={(e) => setObjective(e.target.value as CampaignObjective)}>
              <Options labels={OBJECTIVE_LABELS} />
            </Select>
          </Field>
        </div>

        <Field label="أو الصق محتوى الملف هنا">
          <Textarea
            rows={4}
            dir="ltr"
            className="font-mono text-xs"
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value);
              setFileName("");
            }}
            placeholder={TEMPLATE}
          />
        </Field>

        <Field label="إذا الملف لحملة وحدة وما بيه عمود اسم الحملة">
          <Select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
            <option value="">حسب عمود اسم الحملة بالملف</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        {error ? <Alert>{error}</Alert> : null}

        <div className="flex gap-2">
          <Button
            variant="primary"
            icon="upload"
            loading={busy}
            disabled={!csv.trim()}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const r = await api<{ imported: number; created: string[]; skipped: number }>("/api/campaigns/import", {
                  body: { csv, platform, objective, campaignId: campaignId || undefined },
                });
                const parts = [`انستوردت أرقام ${r.imported} يوم`];
                if (r.created.length) parts.push(`وانضافت ${r.created.length} حملة جديدة`);
                if (r.skipped) parts.push(`(تم تجاهل ${r.skipped} سطر بدون تاريخ)`);
                toast(parts.join(" "));
                onDone();
                router.refresh();
              } catch (err) {
                setError(errorText(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            استورد
          </Button>
          <Button variant="ghost" onClick={onDone}>
            إلغاء
          </Button>
        </div>
      </div>
    </Card>
  );
}

