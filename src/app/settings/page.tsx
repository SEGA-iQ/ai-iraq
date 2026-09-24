import { readDb } from "@/lib/db";
import { SettingsView } from "./view";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const db = await readDb();
  const env = {
    hasClaudeKey: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
    webhookConfigured: Boolean(process.env.META_VERIFY_TOKEN && process.env.META_APP_SECRET),
    passwordProtected: Boolean(process.env.APP_PASSWORD),
  };
  return <SettingsView initial={db.settings} env={env} />;
}
