import { readDb, updateDb, newId, nowIso } from "@/lib/db";
import { ok, readBody, handleError } from "@/lib/api";
import { CampaignInput } from "@/lib/schemas";
import { evaluateCampaign } from "@/lib/evaluate";
import type { Campaign } from "@/lib/types";

export async function GET() {
  try {
    const db = await readDb();
    const evaluations = db.campaigns.map((c) => evaluateCampaign(c, db.metrics, db.settings.rules));
    return ok({ campaigns: db.campaigns, evaluations });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  const body = await readBody(req, CampaignInput);
  if (body.error) return body.error;
  try {
    const campaign: Campaign = { id: newId(), createdAt: nowIso(), ...body.data };
    await updateDb((db) => {
      db.campaigns.push(campaign);
    });
    return ok(campaign, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
