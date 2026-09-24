import { readDb, updateDb } from "@/lib/db";
import { ok, readBody, handleError } from "@/lib/api";
import { SettingsInput } from "@/lib/schemas";

function envStatus() {
  return {
    hasClaudeKey: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
    webhookConfigured: Boolean(process.env.META_VERIFY_TOKEN && process.env.META_APP_SECRET),
  };
}

export async function GET() {
  try {
    const db = await readDb();
    return ok({ settings: db.settings, env: envStatus() });
  } catch (err) {
    return handleError(err);
  }
}

export async function PUT(req: Request) {
  const body = await readBody(req, SettingsInput);
  if (body.error) return body.error;
  const patch = body.data;
  try {
    const settings = await updateDb((db) => {
      const s = db.settings;
      if (patch.company) Object.assign(s.company, patch.company);
      if (patch.faq) s.faq = patch.faq.filter((f) => f.q.trim() || f.a.trim());
      if (patch.ai) Object.assign(s.ai, patch.ai);
      if (patch.rules) {
        const { targetCpr, ...rest } = patch.rules;
        Object.assign(s.rules, rest);
        if (targetCpr) Object.assign(s.rules.targetCpr, targetCpr);
      }
      return s;
    });
    return ok({ settings, env: envStatus() });
  } catch (err) {
    return handleError(err);
  }
}
