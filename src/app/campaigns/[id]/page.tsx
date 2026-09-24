import { notFound } from "next/navigation";
import { readDb } from "@/lib/db";
import { evaluateCampaign } from "@/lib/evaluate";
import { CampaignDetail } from "./detail";

export const dynamic = "force-dynamic";

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await readDb();
  const campaign = db.campaigns.find((c) => c.id === id);
  if (!campaign) notFound();
  const metrics = db.metrics.filter((m) => m.campaignId === id).sort((a, b) => b.date.localeCompare(a.date));
  const evaluation = evaluateCampaign(campaign, db.metrics, db.settings.rules);
  const ai = db.analysis?.result.campaigns.find((c) => c.id === id) ?? null;
  return (
    <CampaignDetail
      campaign={campaign}
      metrics={metrics}
      evaluation={evaluation}
      rules={db.settings.rules}
      ai={ai}
      aiDate={db.analysis?.createdAt ?? null}
    />
  );
}
