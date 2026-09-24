import { updateDb } from "@/lib/db";
import { ok, fail, readBody, handleError } from "@/lib/api";
import { CampaignPatch } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await readBody(req, CampaignPatch);
  if (body.error) return body.error;
  try {
    const updated = await updateDb((db) => {
      const c = db.campaigns.find((x) => x.id === id);
      if (!c) return null;
      Object.assign(c, body.data);
      return c;
    });
    return updated ? ok(updated) : fail("الحملة غير موجودة.", 404);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const found = await updateDb((db) => {
      const before = db.campaigns.length;
      db.campaigns = db.campaigns.filter((c) => c.id !== id);
      db.metrics = db.metrics.filter((m) => m.campaignId !== id);
      return db.campaigns.length !== before;
    });
    return found ? ok({ deleted: true }) : fail("الحملة غير موجودة.", 404);
  } catch (err) {
    return handleError(err);
  }
}
