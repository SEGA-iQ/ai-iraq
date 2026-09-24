import { readDb, updateDb, newId, nowIso } from "@/lib/db";
import { ok, readBody, handleError } from "@/lib/api";
import { PlanInput } from "@/lib/schemas";
import { generatePlan } from "@/lib/assistant";
import { addDays } from "@/lib/evaluate";
import type { Post } from "@/lib/types";

export const maxDuration = 300;

/** Generates a multi-day plan and saves every post as a scheduled draft. */
export async function POST(req: Request) {
  const body = await readBody(req, PlanInput);
  if (body.error) return body.error;
  try {
    const db = await readDb();
    const plan = await generatePlan(db.settings, body.data);
    const createdAt = nowIso();
    const posts: Post[] = plan.map((p) => ({
      id: newId(),
      platform: p.platform,
      type: p.type,
      topic: p.topic,
      caption: p.caption,
      hashtags: p.hashtags,
      imageIdea: p.imageIdea,
      bestTime: p.bestTime,
      scheduledFor: addDays(body.data.startDate, p.day - 1),
      status: "draft",
      createdAt,
    }));
    await updateDb((d) => {
      d.posts.push(...posts);
    });
    return ok({ posts }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
