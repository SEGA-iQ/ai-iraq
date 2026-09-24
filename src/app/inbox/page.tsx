import { readDb } from "@/lib/db";
import { InboxView } from "./view";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const db = await readDb();
  const messages = [...db.messages].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  return <InboxView messages={messages} />;
}
