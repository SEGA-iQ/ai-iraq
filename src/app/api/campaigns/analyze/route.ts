import { readDb, updateDb, nowIso } from "@/lib/db";
import { ok, handleError } from "@/lib/api";
import { analyzeCampaigns } from "@/lib/assistant";
import type { SavedAnalysis } from "@/lib/types";

export const maxDuration = 300;

export async function POST() {
  try {
    const db = await readDb();
    const result = await analyzeCampaigns(db);
    const saved: SavedAnalysis = { createdAt: nowIso(), provider: db.settings.ai.provider, result };
    await updateDb((d) => {
      d.analysis = saved;
    });
    return ok(saved);
  } catch (err) {
    return handleError(err);
  }
}
