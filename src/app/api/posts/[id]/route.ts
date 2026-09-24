import { updateDb } from "@/lib/db";
import { ok, fail, readBody, handleError } from "@/lib/api";
import { PostPatch } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await readBody(req, PostPatch);
  if (body.error) return body.error;
  try {
    const updated = await updateDb((db) => {
      const p = db.posts.find((x) => x.id === id);
      if (!p) return null;
      Object.assign(p, body.data);
      return p;
    });
    return updated ? ok(updated) : fail("المنشور غير موجود.", 404);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const found = await updateDb((db) => {
      const before = db.posts.length;
      db.posts = db.posts.filter((p) => p.id !== id);
      return db.posts.length !== before;
    });
    return found ? ok({ deleted: true }) : fail("المنشور غير موجود.", 404);
  } catch (err) {
    return handleError(err);
  }
}
