"use client";

import { useState } from "react";
import { Button, Field, Input, Options, Select, Textarea } from "@/components/ui";
import { CAMPAIGN_STATUS_LABELS, OBJECTIVE_LABELS, PLATFORM_LABELS } from "@/lib/labels";
import { formatMoney } from "@/lib/evaluate";
import type { AdPlatform, Campaign, CampaignObjective, CampaignRules, CampaignStatus } from "@/lib/types";

export interface CampaignFormValues {
  name: string;
  platform: AdPlatform;
  objective: CampaignObjective;
  status: CampaignStatus;
  dailyBudget: number;
  targetCpr: number | null;
  notes: string;
}

export function CampaignForm({
  initial,
  rules,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Campaign;
  rules: CampaignRules;
  submitLabel: string;
  onSubmit: (values: CampaignFormValues) => Promise<void>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [platform, setPlatform] = useState<AdPlatform>(initial?.platform ?? "facebook");
  const [objective, setObjective] = useState<CampaignObjective>(initial?.objective ?? "orders");
  const [status, setStatus] = useState<CampaignStatus>(initial?.status ?? "active");
  const [dailyBudget, setDailyBudget] = useState(initial?.dailyBudget ? String(initial.dailyBudget) : "");
  const [targetCpr, setTargetCpr] = useState(initial?.targetCpr ? String(initial.targetCpr) : "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);

  return (
    <form
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          await onSubmit({
            name: name.trim(),
            platform,
            objective,
            status,
            dailyBudget: Number(dailyBudget) || 0,
            targetCpr: targetCpr ? Number(targetCpr) : null,
            notes,
          });
        } finally {
          setSaving(false);
        }
      }}
    >
      <Field label="اسم الحملة" className="sm:col-span-2 lg:col-span-1">
        <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: طلبات بغداد - فيديو" />
      </Field>
      <Field label="المنصة">
        <Select value={platform} onChange={(e) => setPlatform(e.target.value as AdPlatform)}>
          <Options labels={PLATFORM_LABELS} />
        </Select>
      </Field>
      <Field label="هدف الحملة">
        <Select value={objective} onChange={(e) => setObjective(e.target.value as CampaignObjective)}>
          <Options labels={OBJECTIVE_LABELS} />
        </Select>
      </Field>
      <Field label={`الميزانية اليومية (${rules.currency === "IQD" ? "دينار" : "دولار"})`}>
        <Input type="number" min={0} step="any" inputMode="decimal" className="ltr-nums text-start" value={dailyBudget} onChange={(e) => setDailyBudget(e.target.value)} />
      </Field>
      <Field
        label="الكلفة المستهدفة للنتيجة"
        hint={`اتركها فارغة حتى تستخدم الافتراضي: ${formatMoney(rules.targetCpr[objective], rules.currency)}`}
      >
        <Input type="number" min={0} step="any" inputMode="decimal" className="ltr-nums text-start" value={targetCpr} onChange={(e) => setTargetCpr(e.target.value)} />
      </Field>
      <Field label="الحالة">
        <Select value={status} onChange={(e) => setStatus(e.target.value as CampaignStatus)}>
          <Options labels={CAMPAIGN_STATUS_LABELS} />
        </Select>
      </Field>
      <Field label="ملاحظات (تساعد الذكاء الاصطناعي بالتحليل)" className="sm:col-span-2 lg:col-span-3">
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="مثلاً: الجمهور بغداد فقط، الإعلان فيديو 15 ثانية" />
      </Field>
      <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
        <Button type="submit" variant="primary" loading={saving}>
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel}>
            إلغاء
          </Button>
        ) : null}
      </div>
    </form>
  );
}
