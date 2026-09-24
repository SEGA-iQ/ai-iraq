import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { AiSettings } from "./types";

// One entry point for every AI feature. Two providers:
//  - "local":  any OpenAI-compatible server (Ollama, LM Studio, vLLM, llama.cpp).
//  - "claude": Anthropic's API through the official SDK.
// Callers pass a zod schema; the result is always validated before use.

export class AiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiError";
  }
}

type Effort = "low" | "medium" | "high";

interface GenerateJsonOptions<T> {
  ai: AiSettings;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  effort?: Effort;
  maxTokens?: number;
}

const LOCAL_TIMEOUT_MS = 5 * 60 * 1000;

export async function generateJson<T>(opts: GenerateJsonOptions<T>): Promise<T> {
  if (opts.ai.provider === "claude") return claudeJson(opts);
  return localJson(opts);
}

/** Short round-trip to confirm the provider is reachable and answering. */
export async function testConnection(ai: AiSettings): Promise<string> {
  const schema = z.object({ reply: z.string() });
  const out = await generateJson({
    ai,
    system: "أنت مساعد مختصر.",
    prompt: 'رد بجملة وحدة قصيرة باللهجة العراقية تگول بيها إنك شغّال وجاهز. ضعها في الحقل "reply".',
    schema,
    effort: "low",
    maxTokens: 4000,
  });
  return out.reply;
}

// ---------------------------------------------------------------------------
// JSON schema helpers

/**
 * Enum that tolerates the small slips local models make ("Price", "driver job")
 * and falls back instead of failing the whole response. Renders as a plain enum.
 */
export function looseEnum<const T extends readonly [string, ...string[]]>(values: T, fallback: T[number]) {
  return z
    .preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase().replace(/[\s-]+/g, "_") : v), z.enum(values))
    .catch(fallback);
}

// Validation-only constraints are enforced by zod after parsing, so they are
// left out of the schema sent to the model.
const UNSUPPORTED_KEYS = new Set([
  "$schema",
  "default",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
]);

/** zod → JSON schema for structured outputs and local-model prompts. */
function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const raw = z.toJSONSchema(schema) as Record<string, unknown>;
  return stripKeys(raw, UNSUPPORTED_KEYS) as Record<string, unknown>;
}

function stripKeys(value: unknown, keys: Set<string>): unknown {
  if (Array.isArray(value)) return value.map((v) => stripKeys(v, keys));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (!keys.has(k)) out[k] = stripKeys(v, keys);
    }
    return out;
  }
  return value;
}

/**
 * Pull a JSON object out of free-form model output: drops reasoning tags that
 * some local models emit, strips code fences, then takes the outermost {...}.
 */
export function extractJson(text: string): unknown {
  let t = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object found");
  return JSON.parse(t.slice(start, end + 1));
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}

// ---------------------------------------------------------------------------
// Local model (OpenAI-compatible /chat/completions)

type LocalMessage = { role: "system" | "user" | "assistant"; content: string };

async function localChat(ai: AiSettings, messages: LocalMessage[], maxTokens: number): Promise<string> {
  const base = ai.localBaseUrl.replace(/\/+$/, "");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.LOCAL_AI_API_KEY) headers.authorization = `Bearer ${process.env.LOCAL_AI_API_KEY}`;

  let res: Response;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: ai.localModel,
        messages,
        temperature: 0.5,
        max_tokens: maxTokens,
        stream: false,
      }),
      signal: AbortSignal.timeout(LOCAL_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new AiError("النموذج المحلي تأخر كلش بالرد. جرّب نموذج أصغر أو تأكد إن الجهاز مو مشغول.");
    }
    throw new AiError(
      `ما گدرت أتصل بالنموذج المحلي على ${base}. تأكد إن Ollama أو LM Studio شغّال وإن العنوان صحيح بصفحة الإعدادات.`,
    );
  }

  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 300);
    if (res.status === 404) {
      throw new AiError(`الخادم المحلي ما لگى النموذج "${ai.localModel}" أو المسار غلط. (${res.status}) ${body}`);
    }
    throw new AiError(`النموذج المحلي رجّع خطأ ${res.status}: ${body}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new AiError("النموذج المحلي رجّع رد فارغ.");
  }
  return content;
}

async function localJson<T>(opts: GenerateJsonOptions<T>): Promise<T> {
  const schemaText = JSON.stringify(toJsonSchema(opts.schema));
  const maxTokens = opts.maxTokens ?? 4000;
  const messages: LocalMessage[] = [
    {
      role: "system",
      content: `${opts.system}\n\nأرجع الجواب ككائن JSON واحد فقط، بدون أي نص قبله أو بعده، ومطابق لهذا المخطط:\n${schemaText}`,
    },
    { role: "user", content: opts.prompt },
  ];

  const first = await localChat(opts.ai, messages, maxTokens);
  const parsed = tryParse(first, opts.schema);
  if (parsed.ok) return parsed.value;

  // Small local models sometimes slip on the format. One repair attempt.
  const repaired = await localChat(
    opts.ai,
    [
      ...messages,
      { role: "assistant", content: first },
      {
        role: "user",
        content: `الجواب السابق مو JSON صالح حسب المخطط (${parsed.error}). أعد كتابته كـ JSON صالح فقط بدون أي شرح.`,
      },
    ],
    maxTokens,
  );
  const second = tryParse(repaired, opts.schema);
  if (second.ok) return second.value;
  throw new AiError(`النموذج المحلي ما رجّع جواب بالصيغة المطلوبة. جرّب مرة ثانية أو استخدم نموذج أكبر. (${second.error})`);
}

function tryParse<T>(text: string, schema: z.ZodType<T>): { ok: true; value: T } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = extractJson(text);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "invalid JSON" };
  }
  const result = schema.safeParse(json);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, error: formatIssues(result.error) };
}

// ---------------------------------------------------------------------------
// Claude (Anthropic SDK)

let anthropic: Anthropic | null = null;
function claudeClient(): Anthropic {
  // Credentials resolve from the environment (ANTHROPIC_API_KEY or an `ant auth login` profile).
  anthropic ??= new Anthropic();
  return anthropic;
}

/** Server-side refusal fallbacks are offered on the Opus 5 / Fable 5 tier. */
function supportsDefaultFallbacks(model: string): boolean {
  return /^claude-(opus-5|fable-5|mythos-5)/.test(model);
}

async function claudeJson<T>(opts: GenerateJsonOptions<T>): Promise<T> {
  const model = opts.ai.claudeModel;
  const useFallbacks = supportsDefaultFallbacks(model);

  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await claudeClient().beta.messages.create({
      model,
      max_tokens: opts.maxTokens ?? 16000,
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }],
      output_config: {
        ...(model.includes("haiku") ? {} : { effort: opts.effort ?? "medium" }),
        format: { type: "json_schema", schema: toJsonSchema(opts.schema) },
      },
      ...(useFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
  } catch (err) {
    throw mapClaudeError(err);
  }

  if (response.stop_reason === "refusal") {
    throw new AiError("Claude اعتذر عن هذا الطلب. عدّل الصياغة وجرّب مرة ثانية.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new AiError("الجواب طلع أطول من الحد المسموح. قلّل كمية البيانات وجرّب مرة ثانية.");
  }

  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const parsed = tryParse(text, opts.schema);
  if (!parsed.ok) throw new AiError(`Claude رجّع جواب بصيغة غير متوقعة (${parsed.error}).`);
  return parsed.value;
}

function mapClaudeError(err: unknown): AiError {
  if (err instanceof Anthropic.AuthenticationError) {
    return new AiError("مفتاح Claude غير صحيح أو غير موجود. ضع ANTHROPIC_API_KEY بملف ‎.env.local وأعد تشغيل التطبيق.");
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return new AiError("حسابك ما عنده صلاحية على هذا النموذج. غيّر اسم النموذج بصفحة الإعدادات.");
  }
  if (err instanceof Anthropic.NotFoundError) {
    return new AiError("اسم نموذج Claude غير صحيح. راجع صفحة الإعدادات.");
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new AiError("وصلت حد الاستخدام المسموح مؤقتاً. انتظر دقيقة وجرّب مرة ثانية.");
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new AiError("ما گدرت أتصل بـ Claude. تأكد من الإنترنت.");
  }
  if (err instanceof Anthropic.APIError) {
    return new AiError(`خطأ من Claude (${err.status ?? "?"}): ${err.message}`);
  }
  if (err instanceof Error && /api[_ ]?key|apiKey|authToken/i.test(err.message)) {
    return new AiError("مفتاح Claude غير موجود. ضع ANTHROPIC_API_KEY بملف ‎.env.local وأعد تشغيل التطبيق.");
  }
  return new AiError(err instanceof Error ? err.message : "خطأ غير معروف من Claude.");
}
