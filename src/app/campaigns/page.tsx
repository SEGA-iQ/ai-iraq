import { readDb } from "@/lib/db";
import { evaluateCampaign } from "@/lib/evaluate";
import { CampaignsView } from "./view";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const db = await readDb();
  const evaluations = db.campaigns.map((c) => evaluateCampaign(c, db.metrics, db.settings.rules));
  return (
    <CampaignsView
      campaigns={db.campaigns}
      evaluations={evaluations}
      rules={db.settings.rules}
      analysis={db.analysis}
    />
  );
}
