"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, PageHeader, Select, Textarea, cx } from "@/components/ui";
import { Icon } from "@/components/icons";
import { CopyButton, api, errorText, useToast } from "@/components/client";
import { OBJECTIVE_LABELS } from "@/lib/labels";
import type { CampaignObjective, CompanyProfile, Settings } from "@/lib/types";

interface Env {
  hasClaudeKey: boolean;
  webhookConfigured: boolean;
  passwordProtected: boolean;
}

const COMPANY_FIELDS: { key: keyof CompanyProfile; label: string; placeholder?: string; long?: boolean; ltr?: boolean }[] = [
  { key: "name", label: "اسم الشركة" },
  { key: "phone", label: "رقم التواصل", ltr: true },
  { key: "cities", label: "المناطق اللي تغطونها", placeholder: "بغداد كلها، والتوصيل للمحافظات" },
  { key: "hours", label: "أوقات الدوام" },
  { key: "appName", label: "اسم التطبيق" },
  { key: "appLink", label: "رابط تحميل التطبيق", ltr: true },
  { key: "services", label: "الخدمات", long: true },
  {
    key: "pricing",
    label: "أسعار التوصيل",
    long: true,
    placeholder: "داخل بغداد 5,000 دينار، المحافظات 8,000 دينار، الإرجاع مجاني إذا الخطأ منّا…",
  },
  { key: "tone", label: "أسلوب الكلام مع الزبائن", long: true },
  { key: "extraInfo", label: "معلومات إضافية (سياسات، عروض حالية، شروط التجار…)", long: true },
];

export function SettingsView({ initial, env }: { initial: Settings; env: Env }) {
  const router = useRouter();
  const toast = useToast();
  const [s, setS] = useState<Settings>(initial);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => setOrigin(window.location.origin), []);

  const dirty = JSON.stringify(s) !== JSON.stringify(initial);
  const setCompany = (key: keyof CompanyProfile, value: string) => setS({ ...s, company: { ...s.company, [key]: value } });
  const setRule = <K extends keyof Settings["rules"]>(key: K, value: Settings["rules"][K]) =>
    setS({ ...s, rules: { ...s.rules, [key]: value } });

  async function save() {
    setSaving(true);
    try {
      const r = await api<{ settings: Settings }>("/api/settings", { method: "PUT", body: s });
      setS(r.settings);
      toast("انحفظت الإعدادات");
      router.refresh();
    } catch (err) {
      toast(errorText(err), "error");
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await api<{ reply: string; seconds: number }>("/api/settings/test-ai", { body: s.ai });
      setTestResult({ ok: true, text: `${r.reply} (خلال ${r.seconds} ثانية)` });
    } catch (err) {
      setTestResult({ ok: false, text: errorText(err) });
    } finally {
      setTesting(false);
    }
  }

  const num = (v: string) => (v === "" ? 0 : Number(v));
  const webhookUrl = origin ? `${origin}/api/webhooks/meta` : "/api/webhooks/meta";

  return (
    <>
      <PageHeader
        title="الإعدادات"
        description="كل ما تكون معلومات الشركة كاملة، تطلع الردود والمنشورات أدق وما يخترع المساعد معلومات."
        actions={
          <Button variant="primary" icon="check" loading={saving} disabled={!dirty} onClick={save}>
            حفظ الإعدادات
          </Button>
        }
      />

      <div className="space-y-6">
        <Card>
          <CardHeader title="معلومات الشركة" description="هذي المعلومات يعتمد عليها المساعد بالردود والمنشورات." />
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
            {COMPANY_FIELDS.map((f) => (
              <Field key={f.key} label={f.label} className={f.long ? "sm:col-span-2" : undefined}>
                {f.long ? (
                  <Textarea rows={3} value={s.company[f.key]} placeholder={f.placeholder} onChange={(e) => setCompany(f.key, e.target.value)} />
                ) : (
                  <Input
                    value={s.company[f.key]}
                    placeholder={f.placeholder}
                    className={f.ltr ? "ltr-nums text-start" : undefined}
                    onChange={(e) => setCompany(f.key, e.target.value)}
                  />
                )}
              </Field>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="أسئلة متكررة وأجوبتها"
            description="اكتب الأسئلة اللي تتكرر عليكم وجوابها المعتمد. المساعد يلتزم بيها بالردود."
            actions={
              <Button size="sm" icon="plus" onClick={() => setS({ ...s, faq: [...s.faq, { q: "", a: "" }] })}>
                سؤال
              </Button>
            }
          />
          <div className="space-y-3 p-4 sm:p-5">
            {s.faq.length === 0 ? (
              <p className="text-sm text-muted">مثلاً: &quot;شكد يوصل الطلب للمحافظات؟&quot; ← &quot;من يوم إلى يومين عمل&quot;.</p>
            ) : null}
            {s.faq.map((f, i) => (
              <div key={i} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1.5fr_auto] sm:items-start">
                <Input
                  placeholder="السؤال"
                  value={f.q}
                  onChange={(e) => setS({ ...s, faq: s.faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })}
                />
                <Textarea
                  rows={2}
                  placeholder="الجواب"
                  value={f.a}
                  onChange={(e) => setS({ ...s, faq: s.faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  icon="trash"
                  aria-label="حذف السؤال"
                  onClick={() => setS({ ...s, faq: s.faq.filter((_, j) => j !== i) })}
                />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="الذكاء الاصطناعي" description="اختار وين يشتغل المساعد: على نموذجك المحلي أو على Claude." />
          <div className="space-y-4 p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["local", "النموذج المحلي", "مجاني وبياناتك تبقى عندك. يحتاج Ollama أو LM Studio شغّال."],
                  ["claude", "Claude", "أدق بالعربي وبالتحليل. يحتاج مفتاح API ويكلف حسب الاستخدام."],
                ] as const
              ).map(([value, title, desc]) => (
                <label
                  key={value}
                  className={cx(
                    "flex cursor-pointer gap-3 rounded-lg border p-3",
                    s.ai.provider === value ? "border-accent bg-accent-soft" : "border-border-strong",
                  )}
                >
                  <input
                    type="radio"
                    name="provider"
                    className="mt-1 accent-[var(--color-accent)]"
                    checked={s.ai.provider === value}
                    onChange={() => setS({ ...s, ai: { ...s.ai, provider: value } })}
                  />
                  <span>
                    <span className="block font-medium">{title}</span>
                    <span className="block text-[13px] text-muted">{desc}</span>
                  </span>
                </label>
              ))}
            </div>

            {s.ai.provider === "local" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="عنوان الخادم المحلي" hint="Ollama: http://localhost:11434/v1 · LM Studio: http://localhost:1234/v1">
                  <Input dir="ltr" value={s.ai.localBaseUrl} onChange={(e) => setS({ ...s, ai: { ...s.ai, localBaseUrl: e.target.value } })} />
                </Field>
                <Field label="اسم النموذج" hint="نفس الاسم اللي يطلع بـ ollama list. النماذج اللي تدعم العربي زين: qwen2.5 أو أكبر.">
                  <Input dir="ltr" value={s.ai.localModel} onChange={(e) => setS({ ...s, ai: { ...s.ai, localModel: e.target.value } })} />
                </Field>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="نموذج Claude">
                  <Input dir="ltr" value={s.ai.claudeModel} onChange={(e) => setS({ ...s, ai: { ...s.ai, claudeModel: e.target.value } })} />
                </Field>
                <div className="self-end pb-2 text-sm">
                  {env.hasClaudeKey ? (
                    <Badge tone="scale">
                      <Icon name="check" className="size-3.5" />
                      مفتاح Claude موجود
                    </Badge>
                  ) : (
                    <span className="text-watch">
                      ضع <code dir="ltr">ANTHROPIC_API_KEY</code> بملف <code dir="ltr">.env.local</code> وأعد تشغيل التطبيق.
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button icon="sparkles" loading={testing} onClick={test}>
                جرّب الاتصال
              </Button>
              {dirty ? <span className="text-xs text-faint">التجربة تستخدم القيم الحالية حتى لو ما حفظتها.</span> : null}
            </div>
            {testResult ? (
              testResult.ok ? (
                <div className="flex items-start gap-2 rounded-lg bg-scale-soft px-3 py-2.5 text-sm text-scale">
                  <Icon name="check" className="mt-0.5 size-4 shrink-0" />
                  <span>{testResult.text}</span>
                </div>
              ) : (
                <Alert>{testResult.text}</Alert>
              )
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="قواعد الحكم على الحملات"
            description="هذي الأرقام تحدد متى الحملة تنحسب ناجحة أو خسرانة. عدّلها حسب هامش الربح مالتك."
          />
          <div className="space-y-5 p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="عملة حساب الإعلانات">
                <Select value={s.rules.currency} onChange={(e) => setRule("currency", e.target.value as "IQD" | "USD")}>
                  <option value="IQD">دينار عراقي</option>
                  <option value="USD">دولار</option>
                </Select>
              </Field>
              <Field label="فترة المقارنة (أيام)">
                <Input type="number" min={1} max={60} className="ltr-nums text-start" value={s.rules.windowDays} onChange={(e) => setRule("windowDays", num(e.target.value))} />
              </Field>
              <Field label="أقل نسبة نقر مقبولة %">
                <Input type="number" min={0} step="0.1" className="ltr-nums text-start" value={s.rules.minCtr} onChange={(e) => setRule("minCtr", num(e.target.value))} />
              </Field>
            </div>

            <div>
              <div className="mb-2 text-[13px] font-medium">الكلفة المستهدفة لكل نتيجة حسب هدف الحملة</div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {(Object.keys(OBJECTIVE_LABELS) as CampaignObjective[]).map((o) => (
                  <Field key={o} label={OBJECTIVE_LABELS[o]}>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      className="ltr-nums text-start"
                      value={s.rules.targetCpr[o]}
                      onChange={(e) => setRule("targetCpr", { ...s.rules.targetCpr, [o]: num(e.target.value) })}
                    />
                  </Field>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="أوقف إذا الكلفة أعلى من الهدف بـ" hint={`${s.rules.stopRatio}× = ${Math.round((s.rules.stopRatio - 1) * 100)}% فوق الهدف`}>
                <Input type="number" min={1} step="0.1" className="ltr-nums text-start" value={s.rules.stopRatio} onChange={(e) => setRule("stopRatio", num(e.target.value))} />
              </Field>
              <Field label="كبّر إذا الكلفة أقل من الهدف بـ" hint={`${s.rules.scaleRatio}× = ${Math.round((1 - s.rules.scaleRatio) * 100)}% تحت الهدف`}>
                <Input type="number" min={0.1} max={1} step="0.05" className="ltr-nums text-start" value={s.rules.scaleRatio} onChange={(e) => setRule("scaleRatio", num(e.target.value))} />
              </Field>
              <Field label="أقل عدد نتائج قبل التكبير">
                <Input type="number" min={1} className="ltr-nums text-start" value={s.rules.minResultsToScale} onChange={(e) => setRule("minResultsToScale", num(e.target.value))} />
              </Field>
              <Field label="أقل صرف قبل الحكم" hint="مضاعف الكلفة المستهدفة. 2 يعني لازم تصرف ضعف كلفة النتيجة قبل ما نحكم.">
                <Input type="number" min={0.1} step="0.5" className="ltr-nums text-start" value={s.rules.minSpendMultiplier} onChange={(e) => setRule("minSpendMultiplier", num(e.target.value))} />
              </Field>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="استقبال الرسائل تلقائياً (اختياري)" description="اربط تطبيق Meta حتى رسائل الواتساب والفيس والإنستا توصل هنا لحالها ويكون ردها جاهز." />
          <div className="space-y-3 p-4 text-sm sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted">رابط الـ Webhook:</span>
              <code dir="ltr" className="rounded bg-surface-2 px-2 py-1 text-xs">
                {webhookUrl}
              </code>
              <CopyButton text={webhookUrl} />
            </div>
            <p>
              الحالة:{" "}
              {env.webhookConfigured ? (
                <Badge tone="scale">مفعّل</Badge>
              ) : (
                <Badge tone="neutral">غير مفعّل</Badge>
              )}
            </p>
            <p className="text-muted">
              تحتاج تضع <code dir="ltr">META_VERIFY_TOKEN</code> و <code dir="ltr">META_APP_SECRET</code> بملف{" "}
              <code dir="ltr">.env.local</code>، ويكون التطبيق على رابط عام (https). التفاصيل بملف README.
            </p>
            {!env.passwordProtected ? (
              <p className="text-watch">
                إذا تفتح التطبيق على الإنترنت، ضع <code dir="ltr">APP_PASSWORD</code> حتى محد غيرك يگدر يدخل.
              </p>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="بيانات تجريبية" description="تضيف 4 حملات بأرقام أسبوعين و3 رسائل زبائن، حتى تشوف كل شي شلون يشتغل." />
          <div className="p-4 sm:p-5">
            <Button
              icon="download"
              loading={demoBusy}
              onClick={async () => {
                setDemoBusy(true);
                try {
                  await api("/api/settings/demo", { method: "POST" });
                  toast("انضافت البيانات التجريبية");
                  router.push("/campaigns");
                  router.refresh();
                } catch (err) {
                  toast(errorText(err), "error");
                } finally {
                  setDemoBusy(false);
                }
              }}
            >
              أضف بيانات تجريبية
            </Button>
          </div>
        </Card>

        {dirty ? (
          <div className="sticky bottom-20 z-30 flex items-center justify-between gap-3 rounded-xl border border-accent/40 bg-surface px-4 py-3 shadow-lg md:bottom-4">
            <span className="text-sm">عندك تغييرات ما محفوظة.</span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setS(initial)}>
                تراجع
              </Button>
              <Button variant="primary" icon="check" loading={saving} onClick={save}>
                حفظ
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
