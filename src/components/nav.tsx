"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";
import { cx } from "./ui";

const ITEMS: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "الرئيسية", icon: "home" },
  { href: "/campaigns", label: "الحملات", icon: "megaphone" },
  { href: "/inbox", label: "الرسائل", icon: "chat" },
  { href: "/content", label: "المحتوى", icon: "pen" },
  { href: "/settings", label: "الإعدادات", icon: "sliders" },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function SideNav() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-e border-border bg-surface md:flex">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="grid size-9 place-items-center rounded-lg bg-accent text-accent-fg">
          <Icon name="sparkles" className="size-5" />
        </div>
        <div>
          <div className="font-bold leading-tight">مساعد الدليفري</div>
          <div className="text-xs text-muted">حملات · رسائل · محتوى</div>
        </div>
      </div>
      <nav className="flex flex-col gap-1 px-3">
        {ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-text",
              )}
            >
              <Icon name={item.icon} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
      {ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
              active ? "text-accent" : "text-muted",
            )}
          >
            <Icon name={item.icon} className="size-[22px]" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
