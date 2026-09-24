import { updateDb, newId, nowIso } from "@/lib/db";
import { ok, fail, readBody, handleError } from "@/lib/api";
import { ImportInput } from "@/lib/schemas";
import { mapHeaders, parseCsv, parseDate, parseNumber } from "@/lib/csv";
import type { DailyMetric } from "@/lib/types";

/**
 * Import daily numbers from a CSV (our template or an Ads Manager export
 * broken down by day). Rows for the same campaign and day are summed, then
 * replace whatever was stored for that day.
 */
export async function POST(req: Request) {
  const body = await readBody(req, ImportInput);
  if (body.error) return body.error;
  const { csv, platform, objective, campaignId } = body.data;

  const rows = parseCsv(csv);
  if (rows.length < 2) return fail("الملف فارغ أو ما بيه غير سطر العناوين.");
  const cols = mapHeaders(rows[0]);
  if (cols.date === undefined) return fail("ما لگيت عمود التاريخ (date / day / التاريخ).");
  if (cols.spend === undefined) return fail("ما لگيت عمود الصرف (spend / amount spent / المبلغ المنفق).");
  if (cols.campaign === undefined && !campaignId) {
    return fail("ما لگيت عمود اسم الحملة. اختار الحملة من القائمة أو أضف عمود campaign.");
  }

  try {
    const result = await updateDb((db) => {
      if (campaignId && !db.campaigns.some((c) => c.id === campaignId)) {
        throw new Error("الحملة المختارة غير موجودة.");
      }
      const byName = new Map(db.campaigns.map((c) => [c.name.trim().toLowerCase(), c.id]));
      const created: string[] = [];
      const sums = new Map<string, DailyMetric>();
      let skipped = 0;

      for (const r of rows.slice(1)) {
        const date = parseDate(r[cols.date!]);
        if (!date) {
          skipped++;
          continue;
        }
        let cid = campaignId;
        if (cols.campaign !== undefined) {
          const name = (r[cols.campaign] ?? "").trim();
          if (!name) {
            skipped++;
            continue;
          }
          const key = name.toLowerCase();
          cid = byName.get(key);
          if (!cid) {
            cid = newId();
            db.campaigns.push({
              id: cid,
              name,
              platform,
              objective,
              status: "active",
              dailyBudget: 0,
              targetCpr: null,
              notes: "",
              createdAt: nowIso(),
            });
            byName.set(key, cid);
            created.push(name);
          }
        }
        const k = `${cid}|${date}`;
        const acc = sums.get(k) ?? {
          campaignId: cid!,
          date,
          spend: 0,
          impressions: 0,
          clicks: 0,
          results: 0,
          revenue: 0,
        };
        acc.spend += parseNumber(r[cols.spend!]);
        if (cols.impressions !== undefined) acc.impressions += parseNumber(r[cols.impressions]);
        if (cols.clicks !== undefined) acc.clicks += parseNumber(r[cols.clicks]);
        if (cols.results !== undefined) acc.results += parseNumber(r[cols.results]);
        if (cols.revenue !== undefined) acc.revenue += parseNumber(r[cols.revenue]);
        sums.set(k, acc);
      }

      db.metrics = db.metrics.filter((m) => !sums.has(`${m.campaignId}|${m.date}`));
      db.metrics.push(...sums.values());
      return { imported: sums.size, created, skipped };
    });
    return ok(result);
  } catch (err) {
    return handleError(err);
  }
}
