import { updateDb } from "@/lib/db";
import { ok, fail, readBody, handleError } from "@/lib/api";
import { MessagePatch } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await readBody(req, MessagePatch);
  if (body.error) return body.error;
  try {
    const updated = await updateDb((db) => {
      const m = db.messages.find((x) => x.id === id);
      if (!m) return null;
      Object.assign(m, body.data);
      return m;
    });
    return updated ? ok(updated) : fail("الرسالة غير موجودة.", 404);
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const found = await updateDb((db) => {
      const before = db.messages.length;
      db.messages = db.messages.filter((m) => m.id !== id);
      return db.messages.length !== before;
    });
    return found ? ok({ deleted: true }) : fail("الرسالة غير موجودة.", 404);
  } catch (err) {
    return handleError(err);
  }
}
