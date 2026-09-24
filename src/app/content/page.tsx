import { readDb } from "@/lib/db";
import { ContentView } from "./view";

export const dynamic = "force-dynamic";

export default async function ContentPage() {
  const db = await readDb();
  return <ContentView posts={db.posts} />;
}
