import { readDb, updateDb, newId, nowIso } from "@/lib/db";
import { ok, readBody, handleError } from "@/lib/api";
import { PostInput } from "@/lib/schemas";
import type { Post } from "@/lib/types";

export async function GET() {
  try {
    const db = await readDb();
    return ok({ posts: db.posts });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  const body = await readBody(req, PostInput);
  if (body.error) return body.error;
  try {
    const post: Post = { id: newId(), createdAt: nowIso(), ...body.data };
    await updateDb((db) => {
      db.posts.push(post);
    });
    return ok(post, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
