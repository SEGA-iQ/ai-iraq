import { z } from "zod";
import { readDb } from "@/lib/db";
import { ok, readBody, handleError } from "@/lib/api";
import { testConnection } from "@/lib/ai";

export const maxDuration = 300;

// Lets the settings page test values before saving them.
const Body = z.object({
  provider: z.enum(["local", "claude"]).optional(),
  localBaseUrl: z.string().trim().url().optional(),
  localModel: z.string().trim().min(1).optional(),
  claudeModel: z.string().trim().min(1).optional(),
});

export async function POST(req: Request) {
  const body = await readBody(req, Body);
  if (body.error) return body.error;
  try {
    const db = await readDb();
    const ai = { ...db.settings.ai, ...body.data };
    const started = Date.now();
    const reply = await testConnection(ai);
    return ok({ reply, provider: ai.provider, seconds: Math.round((Date.now() - started) / 100) / 10 });
  } catch (err) {
    return handleError(err);
  }
}
