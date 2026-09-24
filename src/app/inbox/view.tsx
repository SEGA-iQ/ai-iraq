"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Options, PageHeader, Select, Textarea, cx, type Tone } from "@/components/ui";
import { Icon } from "@/components/icons";
import { CopyButton, api, errorText, useToast } from "@/components/client";
import { CHANNEL_LABELS, INTENT_LABELS, MESSAGE_STATUS_LABELS, URGENCY_LABELS } from "@/lib/labels";
import { timeAgo, waLink, waNumber } from "@/lib/format";
import type { Channel, InboxMessage, MessageStatus } from "@/lib/types";

type Filter = "open" | "replied" | "all";

const STATUS_TONE: Record<MessageStatus, Tone> = {
  new: "accent",
  drafted: "keep",
  replied: "neutral",
  follow_up: "watch",
};

const isOpen = (m: InboxMessage) => m.status !== "replied";

export function InboxView({ messages }: { messages: InboxMessage[] }) {
  const router = useRouter();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(messages.length === 0);
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);

  const visible = useMemo(
    () =>
      messages.filter((m) => (filter === "all" ? true : filter === "open" ? isOpen(m) : m.status === "replied")),
    [messages, filter],
  );
  const selected = messages.find((m) => m.id === selectedId) ?? null;
  const pending = messages.filter((m) => m.status === "new");
  const openCount = messages.filter(isOpen).length;

  async function draftAllNew() {
    const ids = pending.map((m) => m.id);
    setBatch({ done: 0, total: ids.length });
    let failed = 0;
    for (let i = 0; i < ids.length; i++) {
      try {
        await api(`/api/messages/${ids[i]}/draft`, { body: {} });
      } catch (err) {
        failed++;
        if (failed === 1) toast(errorText(err), "error");
      }
      setBatch({ done: i + 1, total: ids.length });
      router.refresh();
    }
    setBatch(null);
    if (!failed) toast("الردود جاهزة للمراجعة");
  }

  return (
    <>
      <PageHeader
        title="الرسائل"
        description="الصق رسالة الزبون من واتساب أو فيسبوك أو إنستغرام، والمساعد يكتب لك رد احترافي تراجعه وترسله."
        actions={
          <>
            <Button icon="plus" variant={showNew ? "primary" : "secondary"} onClick={() => setShowNew(!showNew)}>
              رسالة جديدة
            </Button>
            {pending.length ? (
              <Button icon="sparkles" variant="primary" loading={batch !== null} onClick={draftAllNew}>
                {batch ? `دا يكتب ${batch.done}/${batch.total}` : `ولّد ردود للجديدة (${pending.length})`}
              </Button>
            ) : null}
          </>
        }
      />

      {showNew ? (
        <NewMessageForm
          onCreated={(id) => {
            setShowNew(false);
            setFilter("open");
            setSelectedId(id);
          }}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Card className={cx("overflow-hidden", selected && "hidden lg:block")}>
          <div className="flex gap-1 border-b border-border p-2" role="tablist">
            {(
              [
                ["open", `تحتاج رد (${openCount})`],
                ["replied", "تم الرد"],
                ["all", "الكل"],
              ] as [Filter, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={filter === key}
                onClick={() => setFilter(key)}
                className={cx(
                  "flex-1 rounded-md px-2 py-1.5 text-[13px] font-medium",
                  filter === key ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {visible.length === 0 ? (
            <EmptyState icon="chat" title={filter === "open" ? "ماكو رسائل تنتظر رد" : "ماكو رسائل هنا"}>
              {messages.length === 0 ? "اضغط \"رسالة جديدة\" والصق أول رسالة." : null}
            </EmptyState>
          ) : (
            <ul className="max-h-[70vh] divide-y divide-border overflow-y-auto">
              {visible.map((m) => (
                <li key={m.id}>
                  <button
                    onClick={() => setSelectedId(m.id)}
                    className={cx(
                      "block w-full px-4 py-3 text-start transition-colors hover:bg-surface-2",
                      m.id === selectedId && "bg-accent-soft/60",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{m.customerName || m.customerHandle || "زبون"}</span>
                      {m.urgency === "high" ? <Badge tone="stop">عاجل</Badge> : null}
                      <span className="ms-auto shrink-0 text-xs text-faint">{timeAgo(m.receivedAt)}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[13px] text-muted">{m.text}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Badge>{CHANNEL_LABELS[m.channel]}</Badge>
                      <Badge tone={STATUS_TONE[m.status]}>{MESSAGE_STATUS_LABELS[m.status]}</Badge>
                      {m.intent ? <Badge>{INTENT_LABELS[m.intent]}</Badge> : null}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {selected ? (
          <MessageDetail key={selected.id} message={selected} onBack={() => setSelectedId(null)} />
        ) : (
          <Card className="hidden lg:block">
            <EmptyState icon="chat" title="اختار رسالة">
              الرد يطلع هنا، تعدله إذا تحتاج، تنسخه أو تفتحه بالواتساب مباشرة.
            </EmptyState>
          </Card>
        )}
      </div>
    </>
  );
}

function NewMessageForm({ onCreated }: { onCreated: (id: string) => void }) {
  const router = useRouter();
  const toast = useToast();
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [customerName, setCustomerName] = useState("");
  const [customerHandle, setCustomerHandle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<null | "save" | "draft">(null);

  async function submit(draft: boolean) {
    if (!text.trim()) return;
    setBusy(draft ? "draft" : "save");
    try {
      const created = await api<InboxMessage>("/api/messages", { body: { channel, customerName, customerHandle, text } });
      setText("");
      setCustomerName("");
      setCustomerHandle("");
      onCreated(created.id);
      router.refresh();
      if (draft) {
        try {
          await api(`/api/messages/${created.id}/draft`, { body: {} });
          router.refresh();
        } catch (err) {
          toast(errorText(err), "error");
        }
      }
    } catch (err) {
      toast(errorText(err), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="mb-4">
      <form
        className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(true);
        }}
      >
        <Field label="القناة">
          <Select value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
            <Options labels={CHANNEL_LABELS} />
          </Select>
        </Field>
        <Field label="اسم الزبون (اختياري)">
          <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
        </Field>
        <Field label={channel === "whatsapp" ? "رقم الهاتف (حتى تفتح الواتساب مباشرة)" : "الحساب (اختياري)"}>
          <Input
            value={customerHandle}
            onChange={(e) => setCustomerHandle(e.target.value)}
            inputMode={channel === "whatsapp" ? "tel" : "text"}
            className="ltr-nums text-start"
            placeholder={channel === "whatsapp" ? "07xxxxxxxxx" : ""}
          />
        </Field>
        <Field label="رسالة الزبون" className="sm:col-span-3">
          <Textarea required rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="الصق الرسالة هنا…" />
        </Field>
        <div className="flex flex-wrap gap-2 sm:col-span-3">
          <Button type="submit" variant="primary" icon="sparkles" loading={busy === "draft"} disabled={busy !== null || !text.trim()}>
            أضف واكتب الرد
          </Button>
          <Button onClick={() => submit(false)} loading={busy === "save"} disabled={busy !== null || !text.trim()}>
            أضف بس
          </Button>
        </div>
      </form>
    </Card>
  );
}

function MessageDetail({ message: m, onBack }: { message: InboxMessage; onBack: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [reply, setReply] = useState(m.draft);
  const [instruction, setInstruction] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<MessageStatus | "edit" | null>(null);

  // A fresh draft from the server replaces the editor text.
  useEffect(() => setReply(m.draft), [m.draft]);

  const phone = m.channel === "whatsapp" ? waNumber(m.customerHandle) : null;
  const dirty = reply !== m.draft;

  async function generate() {
    setDrafting(true);
    setError(null);
    try {
      await api(`/api/messages/${m.id}/draft`, { body: { instruction: instruction.trim() || undefined } });
      router.refresh();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setDrafting(false);
    }
  }

  async function save(status?: MessageStatus) {
    setSaving(status ?? "edit");
    try {
      await api(`/api/messages/${m.id}`, { method: "PATCH", body: { draft: reply, ...(status ? { status } : {}) } });
      if (status === "replied") toast("تمام، انحفظت كرسالة مردود عليها");
      else if (status === "follow_up") toast("انحطت بقائمة المتابعة");
      else toast("انحفظ الرد");
      router.refresh();
    } catch (err) {
      toast(errorText(err), "error");
    } finally {
      setSaving(null);
    }
  }

  return (
    <Card>
      <div className="flex items-start gap-3 border-b border-border px-4 py-3 sm:px-5">
        <Button size="sm" variant="ghost" icon="chevronRight" className="lg:hidden" onClick={onBack} aria-label="رجوع" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{m.customerName || "زبون"}</span>
            {m.customerHandle ? <span className="ltr-nums text-sm text-muted">{m.customerHandle}</span> : null}
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Badge>{CHANNEL_LABELS[m.channel]}</Badge>
            <Badge tone={STATUS_TONE[m.status]}>{MESSAGE_STATUS_LABELS[m.status]}</Badge>
            {m.intent ? <Badge tone="accent">{INTENT_LABELS[m.intent]}</Badge> : null}
            {m.urgency ? <Badge tone={m.urgency === "high" ? "stop" : "neutral"}>{URGENCY_LABELS[m.urgency]}</Badge> : null}
            <span className="text-xs text-faint">{timeAgo(m.receivedAt)}</span>
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          icon="trash"
          aria-label="حذف الرسالة"
          onClick={async () => {
            if (!confirm("تحذف هذي الرسالة؟")) return;
            try {
              await api(`/api/messages/${m.id}`, { method: "DELETE" });
              onBack();
              router.refresh();
            } catch (err) {
              toast(errorText(err), "error");
            }
          }}
        />
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-ss-sm bg-surface-2 px-4 py-3 text-[15px] leading-relaxed">
          {m.text}
        </div>

        {m.internalNote ? (
          <div className="flex items-start gap-2 rounded-lg bg-watch-soft px-3 py-2 text-sm text-watch">
            <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
            <span>
              <b>ملاحظة لك: </b>
              {m.internalNote}
            </span>
          </div>
        ) : null}

        {error ? <Alert>{error}</Alert> : null}

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[13px] font-medium">الرد</span>
            {drafting ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-accent">
                <Icon name="sparkles" className="size-3.5" />
                دا يكتب الرد…
              </span>
            ) : null}
          </div>
          <Textarea
            rows={5}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder={m.draft ? "" : "اضغط \"اكتب رد\" حتى يكتب المساعد رد، أو اكتب ردك هنا."}
            className="text-[15px]"
          />
        </div>

        {m.altDraft && m.altDraft !== reply ? (
          <div className="rounded-lg border border-border p-3 text-sm">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted">نسخة أقصر</span>
              <Button size="sm" variant="ghost" onClick={() => setReply(m.altDraft)}>
                استخدمها
              </Button>
            </div>
            <p className="whitespace-pre-wrap">{m.altDraft}</p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <CopyButton text={reply} size="md" label="نسخ الرد" />
          {phone ? (
            <a
              href={waLink(phone, reply)}
              target="_blank"
              rel="noreferrer"
              className={cx(
                "inline-flex h-10 items-center gap-1.5 rounded-lg border border-transparent bg-[#1f9d55] px-3.5 text-sm font-medium text-white hover:bg-[#188046]",
                !reply && "pointer-events-none opacity-55",
              )}
            >
              <Icon name="send" className="size-[18px]" />
              افتح بالواتساب
            </a>
          ) : null}
          <Button icon="check" variant="primary" loading={saving === "replied"} disabled={!reply} onClick={() => save("replied")}>
            تم الإرسال
          </Button>
          <Button loading={saving === "follow_up"} onClick={() => save("follow_up")}>
            تحتاج متابعة
          </Button>
          {dirty ? (
            <Button variant="ghost" loading={saving === "edit"} onClick={() => save()}>
              حفظ التعديل
            </Button>
          ) : null}
        </div>

        <div className="border-t border-border pt-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="توجيه اختياري: مثلاً خليه أرسمي، اذكر إن التوصيل مجاني اليوم…"
              className="flex-1"
            />
            <Button icon={m.draft ? "refresh" : "sparkles"} variant={m.draft ? "secondary" : "primary"} loading={drafting} onClick={generate}>
              {m.draft ? "اكتب رد جديد" : "اكتب رد"}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
