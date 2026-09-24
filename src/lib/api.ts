import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AiError } from "./ai";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Parse and validate a JSON body; returns a ready error response on failure. */
export async function readBody<T>(
  req: Request,
  schema: z.ZodType<T>,
): Promise<{ data: T; error?: never } | { data?: never; error: NextResponse }> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return { error: fail("البيانات المرسلة مو JSON صالح.") };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: fail(`بيانات غير صحيحة: ${issue.path.join(".") || "الطلب"} (${issue.message})`) };
  }
  return { data: parsed.data };
}

/** Convert thrown errors to JSON. AI errors carry user-facing Arabic messages. */
export function handleError(err: unknown) {
  if (err instanceof AiError) return fail(err.message, 502);
  console.error(err);
  return fail(err instanceof Error ? err.message : "صار خطأ غير متوقع.", 500);
}
