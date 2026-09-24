"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Button, cx } from "./ui";
import { Icon } from "./icons";

// ---------------------------------------------------------------------------
// Fetch helper: JSON in, JSON out, server error text surfaced as Error.message.

export async function api<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const hasBody = init?.body !== undefined;
  const res = await fetch(url, {
    method: init?.method ?? (hasBody ? "POST" : "GET"),
    headers: hasBody ? { "content-type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(init!.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || `صار خطأ (${res.status})`);
  return data as T;
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : "صار خطأ غير متوقع.";
}

// ---------------------------------------------------------------------------
// Toasts

type ToastTone = "ok" | "error";
interface ToastItem {
  id: number;
  text: string;
  tone: ToastTone;
}

const ToastContext = createContext<(text: string, tone?: ToastTone) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, tone: ToastTone = "ok") => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev.slice(-2), { id, text, tone }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), tone === "error" ? 7000 : 2800);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6">
        {items.map((t) => (
          <div
            key={t.id}
            className={cx(
              "pointer-events-auto flex max-w-md items-start gap-2 rounded-lg px-4 py-2.5 text-sm shadow-lg",
              t.tone === "ok" ? "bg-text text-bg" : "bg-stop text-white",
            )}
          >
            <Icon name={t.tone === "ok" ? "check" : "alert"} className="mt-0.5 size-4 shrink-0" />
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

// ---------------------------------------------------------------------------
// Clipboard (falls back for plain-http LAN access, where navigator.clipboard is absent)

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}

export function CopyButton({ text, label = "نسخ", size = "sm" }: { text: string; label?: string; size?: "sm" | "md" }) {
  const toast = useToast();
  const [done, setDone] = useState(false);
  return (
    <Button
      size={size}
      icon={done ? "check" : "copy"}
      disabled={!text}
      onClick={async () => {
        const ok = await copyText(text);
        if (ok) {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
          toast("تم النسخ");
        } else {
          toast("ما گدرت أنسخ. حدد النص وانسخه يدوياً.", "error");
        }
      }}
    >
      {done ? "تم" : label}
    </Button>
  );
}
