"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Field, Input, Options, PageHeader, Select, Textarea, cx, type Tone } from "@/components/ui";
import { Icon } from "@/components/icons";
import { CopyButton, api, errorText, useToast } from "@/components/client";
import { POST_PLATFORM_LABELS, POST_STATUS_LABELS, POST_TYPE_LABELS } from "@/lib/labels";
import { addDays, todayLocal } from "@/lib/evaluate";
import type { Post, PostPlatform, PostStatus, PostType } from "@/lib/types";

type Tab = "posts" | "single" | "plan";
type Dialect = "iraqi" | "msa";

const STATUS_TONE: Record<PostStatus, Tone> = { draft: "neutral", ready: "keep", published: "scale" };

function fullText(caption: string, hashtags: string[]): string {
  return hashtags.length ? `${caption}\n\n${hashtags.map((h) => `#${h}`).join(" ")}` : caption;
}

export function ContentView({ posts }: { posts: Post[] }) {
  const [tab, setTab] = useState<Tab>(posts.length ? "posts" : "single");

  return (
    <>
      <PageHeader
        title="المحتوى"
        description="اكتب منشورات جاهزة لفيسبوك وإنستغرام وتيك توك وحالة الواتساب، أو سوّي خطة نشر كاملة للأسبوع."
      />
      <div className="mb-5 flex gap-1 rounded-lg bg-surface-2 p-1 sm:inline-flex" role="tablist">
        {(
          [
            ["single", "منشور جديد", "sparkles"],
            ["plan", "خطة أسبوعية", "calendar"],
            ["posts", `المنشورات (${posts.length})`, "pen"],
          ] as const
        ).map(([key, label, icon]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cx(
              "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium sm:flex-none",
              tab === key ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text",
            )}
          >
            <Icon name={icon} className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "single" ? <SinglePost onSaved={() => setTab("posts")} /> : null}
      {tab === "plan" ? <WeeklyPlan onDone={() => setTab("posts")} /> : null}
      {tab === "posts" ? <PostList posts={posts} onCreate={() => setTab("single")} /> : null}
    </>
  );
}

// ---------------------------------------------------------------------------

interface Generated {
  caption: string;
  hashtags: string[];
  imageIdea: string;
  bestTime: string;
}

function SinglePost({ onSaved }: { onSaved: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [platform, setPlatform] = useState<PostPlatform>("facebook");
  const [type, setType] = useState<PostType>("offer");
  const [dialect, setDialect] = useState<Dialect>("iraqi");
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Generated | null>(null);
  const [date, setDate] = useState(todayLocal());
  const [saving, setSaving] = useState(false);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      setResult(await api<Generated>("/api/posts/generate", { body: { platform, type, topic, dialect } }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <Card>
        <CardHeader title="شنو تريد تنشر؟" />
        <form
          className="space-y-4 p-4 sm:p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void generate();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="المنصة">
              <Select value={platform} onChange={(e) => setPlatform(e.target.value as PostPlatform)}>
                <Options labels={POST_PLATFORM_LABELS} />
              </Select>
            </Field>
            <Field label="نوع المنشور">
              <Select value={type} onChange={(e) => setType(e.target.value as PostType)}>
                <Options labels={POST_TYPE_LABELS} />
              </Select>
            </Field>
          </div>
          <Field label="التفاصيل" hint="كل ما تعطي تفاصيل أكثر (العرض، المدة، المنطقة، السعر) يطلع المنشور أدق.">
            <Textarea
              rows={4}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="مثلاً: توصيل مجاني لأول طلب من التطبيق لغاية نهاية الشهر، داخل بغداد"
            />
          </Field>
          <Field label="اللغة">
            <Select value={dialect} onChange={(e) => setDialect(e.target.value as Dialect)}>
              <option value="iraqi">لهجة عراقية</option>
              <option value="msa">فصحى مبسطة</option>
            </Select>
          </Field>
          <Button type="submit" variant="primary" icon="sparkles" loading={busy} className="w-full sm:w-auto">
            {result ? "اكتب نسخة ثانية" : "اكتب المنشور"}
          </Button>
          {error ? <Alert>{error}</Alert> : null}
        </form>
      </Card>

      <Card>
        <CardHeader title="المنشور" description={result ? "عدّل براحتك قبل الحفظ أو النسخ." : undefined} />
        {!result ? (
          <EmptyState icon="pen" title={busy ? "دا يكتب…" : "المنشور يطلع هنا"}>
            {busy ? "على النموذج المحلي ممكن ياخذ نص دقيقة." : null}
          </EmptyState>
        ) : (
          <div className="space-y-4 p-4 sm:p-5">
            <Textarea
              rows={9}
              value={result.caption}
              onChange={(e) => setResult({ ...result, caption: e.target.value })}
              className="text-[15px]"
            />
            <Field label="الهاشتاگات (افصل بينها بمسافة)">
              <Input
                value={result.hashtags.map((h) => `#${h}`).join(" ")}
                onChange={(e) =>
                  setResult({
                    ...result,
                    hashtags: e.target.value
                      .split(/\s+/)
                      .map((h) => h.replace(/^#+/, ""))
                      .filter(Boolean),
                  })
                }
              />
            </Field>
            {result.imageIdea ? (
              <div className="rounded-lg bg-surface-2 p-3 text-sm">
                <div className="mb-0.5 text-xs font-medium text-muted">فكرة الصورة أو الفيديو</div>
                {result.imageIdea}
              </div>
            ) : null}
            {result.bestTime ? (
              <p className="text-sm text-muted">
                <Icon name="calendar" className="me-1 inline size-4" />
                {result.bestTime}
              </p>
            ) : null}
            <div className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
              <CopyButton text={fullText(result.caption, result.hashtags)} size="md" label="نسخ المنشور" />
              <Field label="موعد النشر" className="w-40">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="ltr-nums text-start" />
              </Field>
              <Button
                variant="primary"
                icon="check"
                loading={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await api("/api/posts", {
                      body: { platform, type, topic, ...result, scheduledFor: date || null, status: "ready" },
                    });
                    toast("انحفظ المنشور");
                    setResult(null);
                    setTopic("");
                    router.refresh();
                    onSaved();
                  } catch (err) {
                    toast(errorText(err), "error");
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                احفظ بالمنشورات
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

function WeeklyPlan({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [startDate, setStartDate] = useState(addDays(todayLocal(), 1));
  const [days, setDays] = useState(7);
  const [platforms, setPlatforms] = useState<PostPlatform[]>(["facebook", "instagram"]);
  const [goals, setGoals] = useState("");
  const [dialect, setDialect] = useState<Dialect>("iraqi");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader
        title="خطة نشر"
        description="المساعد يكتب منشور لكل يوم وينزّله كمسودة بتاريخه، وأنت تراجع وتنشر."
      />
      <form
        className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!platforms.length) return setError("اختار منصة وحدة على الأقل.");
          setBusy(true);
          setError(null);
          try {
            const r = await api<{ posts: Post[] }>("/api/posts/plan", { body: { startDate, days, platforms, goals, dialect } });
            toast(`انكتبت ${r.posts.length} منشورات`);
            router.refresh();
            onDone();
          } catch (err) {
            setError(errorText(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="تبدي من">
            <Input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className="ltr-nums text-start" />
          </Field>
          <Field label="عدد الأيام">
            <Select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {[3, 5, 7, 10, 14].map((n) => (
                <option key={n} value={n}>
                  {n} أيام
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium">المنصات</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(POST_PLATFORM_LABELS) as PostPlatform[]).map((p) => {
              const on = platforms.includes(p);
              return (
                <label
                  key={p}
                  className={cx(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-sm",
                    on ? "border-accent bg-accent-soft text-accent" : "border-border-strong text-muted",
                  )}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={on}
                    onChange={() => setPlatforms(on ? platforms.filter((x) => x !== p) : [...platforms, p])}
                  />
                  {on ? <Icon name="check" className="size-4" /> : null}
                  {POST_PLATFORM_LABELS[p]}
                </label>
              );
            })}
          </div>
        </fieldset>
        <Field label="أهداف ومناسبات هذي الفترة" className="sm:col-span-2" hint="مثلاً: نريد نزيد تحميل التطبيق، عندنا عرض توصيل مجاني الخميس، نحتاج مناديب بالبصرة، مناسبة قريبة…">
          <Textarea rows={4} value={goals} onChange={(e) => setGoals(e.target.value)} />
        </Field>
        <Field label="اللغة">
          <Select value={dialect} onChange={(e) => setDialect(e.target.value as Dialect)}>
            <option value="iraqi">لهجة عراقية</option>
            <option value="msa">فصحى مبسطة</option>
          </Select>
        </Field>
        <div className="flex items-end">
          <Button type="submit" variant="primary" icon="sparkles" loading={busy} className="w-full sm:w-auto">
            {busy ? "دا يكتب الخطة…" : "سوّي الخطة"}
          </Button>
        </div>
        {busy ? (
          <p className="text-sm text-muted sm:col-span-2">خطة كاملة تاخذ وقت أطول، خصوصاً على النموذج المحلي. خلي الصفحة مفتوحة.</p>
        ) : null}
        {error ? (
          <div className="sm:col-span-2">
            <Alert>{error}</Alert>
          </div>
        ) : null}
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function PostList({ posts, onCreate }: { posts: Post[]; onCreate: () => void }) {
  const [status, setStatus] = useState<PostStatus | "all">("all");
  const today = todayLocal();

  const groups = useMemo(() => {
    const filtered = posts.filter((p) => status === "all" || p.status === status);
    const sorted = [...filtered].sort((a, b) => {
      if (a.scheduledFor && b.scheduledFor) return a.scheduledFor.localeCompare(b.scheduledFor);
      if (a.scheduledFor) return -1;
      if (b.scheduledFor) return 1;
      return b.createdAt.localeCompare(a.createdAt);
    });
    const map = new Map<string, Post[]>();
    for (const p of sorted) {
      const key = p.scheduledFor ?? "";
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    return [...map.entries()];
  }, [posts, status]);

  if (posts.length === 0) {
    return (
      <Card>
        <EmptyState icon="pen" title="ماكو منشورات محفوظة">
          <div className="mt-3">
            <Button variant="primary" icon="sparkles" onClick={onCreate}>
              اكتب أول منشور
            </Button>
          </div>
        </EmptyState>
      </Card>
    );
  }

  const dayLabel = (d: string) => {
    if (!d) return "بدون موعد";
    const name = new Date(`${d}T12:00:00`).toLocaleDateString("ar-IQ", { weekday: "long", day: "numeric", month: "long" });
    if (d === today) return `اليوم · ${name}`;
    if (d === addDays(today, 1)) return `باچر · ${name}`;
    return name;
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {(["all", "draft", "ready", "published"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={cx(
              "rounded-full border px-3 py-1 text-[13px]",
              status === s ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:bg-surface-2",
            )}
          >
            {s === "all" ? "الكل" : POST_STATUS_LABELS[s]}
          </button>
        ))}
      </div>
      <div className="space-y-6">
        {groups.map(([day, items]) => (
          <section key={day || "none"}>
            <h3 className={cx("mb-2 text-sm font-semibold", day && day < today ? "text-faint" : "text-muted")}>{dayLabel(day)}</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {items.map((p) => (
                <PostCard key={p.id} post={p} />
              ))}
            </div>
          </section>
        ))}
        {groups.length === 0 ? (
          <Card>
            <EmptyState icon="pen" title="ماكو منشورات بهذي الحالة" />
          </Card>
        ) : null}
      </div>
    </>
  );
}

function PostCard({ post: p }: { post: Post }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(p.caption);
  const [date, setDate] = useState(p.scheduledFor ?? "");

  async function patch(body: Partial<Post>, message?: string) {
    try {
      await api(`/api/posts/${p.id}`, { method: "PATCH", body });
      if (message) toast(message);
      router.refresh();
    } catch (err) {
      toast(errorText(err), "error");
    }
  }

  return (
    <Card className={cx(p.status === "published" && "opacity-75")}>
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="accent">{POST_PLATFORM_LABELS[p.platform]}</Badge>
          <Badge>{POST_TYPE_LABELS[p.type]}</Badge>
          <Badge tone={STATUS_TONE[p.status]}>{POST_STATUS_LABELS[p.status]}</Badge>
        </div>
        {p.topic ? <p className="text-xs text-muted">{p.topic}</p> : null}

        {editing ? (
          <div className="space-y-2">
            <Textarea rows={8} value={caption} onChange={(e) => setCaption(e.target.value)} />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="primary"
                onClick={async () => {
                  await patch({ caption }, "انحفظ التعديل");
                  setEditing(false);
                }}
              >
                حفظ
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setCaption(p.caption);
                  setEditing(false);
                }}
              >
                إلغاء
              </Button>
            </div>
          </div>
        ) : (
          <button onClick={() => setOpen(!open)} className="block w-full text-start">
            <p className={cx("whitespace-pre-wrap text-sm leading-relaxed", !open && "line-clamp-4")}>{p.caption}</p>
            {p.hashtags.length ? (
              <p className="mt-1.5 text-xs text-accent" dir="auto">
                {p.hashtags.map((h) => `#${h}`).join(" ")}
              </p>
            ) : null}
          </button>
        )}

        {open && p.imageIdea ? (
          <div className="rounded-lg bg-surface-2 p-2.5 text-[13px]">
            <span className="font-medium">الصورة: </span>
            {p.imageIdea}
          </div>
        ) : null}
        {open && p.bestTime ? <p className="text-[13px] text-muted">{p.bestTime}</p> : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <CopyButton text={fullText(p.caption, p.hashtags)} />
          {p.status !== "published" ? (
            <Button size="sm" icon="check" variant="primary" onClick={() => patch({ status: "published" }, "تمام، انعلّم كمنشور")}>
              نشرته
            </Button>
          ) : (
            <Button size="sm" onClick={() => patch({ status: "ready" })}>
              رجّعه جاهز
            </Button>
          )}
          <Button size="sm" variant="ghost" icon="pen" onClick={() => setEditing(true)} aria-label="تعديل النص" />
          <input
            type="date"
            aria-label="موعد النشر"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              void patch({ scheduledFor: e.target.value || null });
            }}
            className="ltr-nums h-8 rounded-lg border border-border-strong bg-surface px-2 text-[13px]"
          />
          <Button
            size="sm"
            variant="ghost"
            icon="trash"
            aria-label="حذف المنشور"
            className="ms-auto"
            onClick={async () => {
              if (!confirm("تحذف هذا المنشور؟")) return;
              try {
                await api(`/api/posts/${p.id}`, { method: "DELETE" });
                router.refresh();
              } catch (err) {
                toast(errorText(err), "error");
              }
            }}
          />
        </div>
      </div>
    </Card>
  );
}
