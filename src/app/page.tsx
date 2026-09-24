import Link from "next/link";
import { readDb } from "@/lib/db";
import { SIGNAL_PRIORITY, addDays, evaluateCampaign, formatMoney, todayLocal } from "@/lib/evaluate";
import { CHANNEL_LABELS, INTENT_LABELS, POST_PLATFORM_LABELS } from "@/lib/labels";
import { timeAgo } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui";
import { SignalBadge } from "@/components/signal";
import { Icon, type IconName } from "@/components/icons";

export const dynamic = "force-dynamic";

function SeeAll({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline">
      {label}
      <Icon name="chevronLeft" className="size-4" />
    </Link>
  );
}

function SetupStep({ done, href, icon, title, text }: { done: boolean; href: string; icon: IconName; title: string; text: string }) {
  return (
    <Link href={href} className="flex items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-surface-2">
      <div className={done ? "rounded-full bg-scale-soft p-2 text-scale" : "rounded-full bg-accent-soft p-2 text-accent"}>
        <Icon name={done ? "check" : icon} className="size-4" />
      </div>
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-[13px] text-muted">{text}</div>
      </div>
    </Link>
  );
}

export default async function Dashboard() {
  const db = await readDb();
  const { rules, company } = db.settings;
  const today = todayLocal();

  const evaluations = db.campaigns
    .map((c) => ({ c, ev: evaluateCampaign(c, db.metrics, rules) }))
    .filter(({ ev }) => ev.signal !== "inactive")
    .sort((a, b) => SIGNAL_PRIORITY[a.ev.signal] - SIGNAL_PRIORITY[b.ev.signal] || b.ev.recent.spend - a.ev.recent.spend);
  const needDecision = evaluations.filter(({ ev }) => ev.signal === "stop" || ev.signal === "watch" || ev.signal === "scale");
  const spend = evaluations.reduce((s, { ev }) => s + ev.recent.spend, 0);
  const results = evaluations.reduce((s, { ev }) => s + ev.recent.results, 0);

  const openMessages = db.messages
    .filter((m) => m.status !== "replied")
    .sort((a, b) => (a.urgency === "high" ? 0 : 1) - (b.urgency === "high" ? 0 : 1) || b.receivedAt.localeCompare(a.receivedAt));
  const urgent = openMessages.filter((m) => m.urgency === "high").length;

  const weekEnd = addDays(today, 6);
  const upcoming = db.posts
    .filter((p) => p.status !== "published" && p.scheduledFor && p.scheduledFor >= today && p.scheduledFor <= weekEnd)
    .sort((a, b) => a.scheduledFor!.localeCompare(b.scheduledFor!));
  const overdue = db.posts.filter((p) => p.status !== "published" && p.scheduledFor && p.scheduledFor < today).length;

  const isNew = db.campaigns.length === 0 && db.messages.length === 0 && db.posts.length === 0;
  const dateLabel = new Date().toLocaleDateString("ar-IQ", { weekday: "long", day: "numeric", month: "long" });

  return (
    <>
      <PageHeader title={company.name ? `أهلاً، ${company.name}` : "أهلاً بيك"} description={`${dateLabel} · هذا اللي يحتاج انتباهك اليوم.`} />

      {isNew ? (
        <Card className="mb-6">
          <CardHeader title="ابدي من هنا" description="ثلاث خطوات وتصير جاهز." />
          <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
            <SetupStep
              done={Boolean(company.name && company.pricing)}
              href="/settings"
              icon="sliders"
              title="1. معلومات الشركة"
              text="الاسم، الأسعار، المناطق. عليها تنبني الردود."
            />
            <SetupStep done={false} href="/settings" icon="sparkles" title="2. اربط النموذج" text="نموذجك المحلي أو Claude، واضغط جرّب الاتصال." />
            <SetupStep done={false} href="/settings" icon="download" title="3. جرّب بالبيانات التجريبية" text="أو أضف حملاتك ورسائلك الحقيقية مباشرة." />
          </div>
        </Card>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="حملات تحتاج قرار"
          value={needDecision.length}
          tone={needDecision.some(({ ev }) => ev.signal === "stop") ? "stop" : needDecision.length ? "watch" : undefined}
          hint={`من ${evaluations.length} حملة فعّالة`}
        />
        <Stat
          label={`الصرف آخر ${rules.windowDays} أيام`}
          value={<span className="ltr-nums">{formatMoney(spend, rules.currency)}</span>}
          hint={results ? `${results.toLocaleString("en-US")} نتيجة` : undefined}
        />
        <Stat label="رسائل تنتظر رد" value={openMessages.length} tone={urgent ? "stop" : undefined} hint={urgent ? `${urgent} عاجلة` : undefined} />
        <Stat
          label="منشورات هذا الأسبوع"
          value={upcoming.length}
          tone={overdue ? "watch" : undefined}
          hint={overdue ? `${overdue} فات موعدها` : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader title="قرارات الحملات" actions={<SeeAll href="/campaigns" label="كل الحملات" />} />
          {evaluations.length === 0 ? (
            <EmptyState icon="megaphone" title="ماكو حملات فعّالة">
              أضف حملاتك وسجّل أرقامها حتى يگلك شنو توقف وشنو تكبّر.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {evaluations.slice(0, 6).map(({ c, ev }) => (
                <li key={c.id}>
                  <Link href={`/campaigns/${c.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-2 sm:px-5">
                    <div className="w-20 shrink-0 pt-0.5">
                      <SignalBadge signal={ev.signal} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{c.name}</div>
                      <div className="text-[13px] text-muted">{ev.action}</div>
                    </div>
                    <div className="ltr-nums hidden shrink-0 text-end text-sm sm:block">
                      <div className="font-semibold">{formatMoney(ev.recent.cpr, rules.currency)}</div>
                      <div className="text-xs text-faint">الهدف {formatMoney(ev.target, rules.currency)}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="رسائل تنتظر" actions={<SeeAll href="/inbox" label="صندوق الرسائل" />} />
          {openMessages.length === 0 ? (
            <EmptyState icon="chat" title="كل الرسائل مردود عليها" />
          ) : (
            <ul className="divide-y divide-border">
              {openMessages.slice(0, 5).map((m) => (
                <li key={m.id} className="px-4 py-3 sm:px-5">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{m.customerName || m.customerHandle || "زبون"}</span>
                    {m.urgency === "high" ? <Badge tone="stop">عاجل</Badge> : null}
                    <span className="ms-auto shrink-0 text-xs text-faint">{timeAgo(m.receivedAt)}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-[13px] text-muted">{m.text}</p>
                  <div className="mt-1 flex gap-1.5">
                    <Badge>{CHANNEL_LABELS[m.channel]}</Badge>
                    {m.intent ? <Badge>{INTENT_LABELS[m.intent]}</Badge> : null}
                    {m.draft ? <Badge tone="keep">الرد جاهز</Badge> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="المنشورات الجاية" actions={<SeeAll href="/content" label="المحتوى" />} />
          {upcoming.length === 0 ? (
            <EmptyState icon="calendar" title="ماكو منشورات مجدولة هذا الأسبوع">
              <Link href="/content" className="text-accent underline">
                سوّي خطة أسبوعية
              </Link>{" "}
              بضغطة وحدة.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {upcoming.slice(0, 5).map((p) => (
                <li key={p.id} className="px-4 py-3 sm:px-5">
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <span className="font-medium text-text">
                      {p.scheduledFor === today
                        ? "اليوم"
                        : new Date(`${p.scheduledFor}T12:00:00`).toLocaleDateString("ar-IQ", { weekday: "long" })}
                    </span>
                    <Badge tone="accent">{POST_PLATFORM_LABELS[p.platform]}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[13px]">{p.caption}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
