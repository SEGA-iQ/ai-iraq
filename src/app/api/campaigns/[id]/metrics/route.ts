import { updateDb } from "@/lib/db";
import { ok, fail, readBody, handleError } from "@/lib/api";
import { MetricInput, isoDate } from "@/lib/schemas";
import type { DailyMetric } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

/** Add or replace one day's numbers for a campaign. */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await readBody(req, MetricInput);
  if (body.error) return body.error;
  try {
    const saved = await updateDb((db) => {
      if (!db.campaigns.some((c) => c.id === id)) return null;
      const row: DailyMetric = { campaignId: id, ...body.data };
      db.metrics = db.metrics.filter((m) => !(m.campaignId === id && m.date === row.date));
      db.metrics.push(row);
      return row;
    });
    return saved ? ok(saved, { status: 201 }) : fail("الحملة غير موجودة.", 404);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  const date = new URL(req.url).searchParams.get("date") ?? "";
  if (!isoDate.safeParse(date).success) return fail("التاريخ غير صحيح.");
  try {
    await updateDb((db) => {
      db.metrics = db.metrics.filter((m) => !(m.campaignId === id && m.date === date));
    });
    return ok({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}
