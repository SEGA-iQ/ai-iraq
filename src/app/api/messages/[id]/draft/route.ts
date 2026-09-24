import { ok, fail, readBody, handleError } from "@/lib/api";
import { DraftInput } from "@/lib/schemas";
import { draftAndSave } from "@/lib/messages";

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await readBody(req, DraftInput);
  if (body.error) return body.error;
  try {
    const message = await draftAndSave(id, body.data.instruction);
    return message ? ok(message) : fail("الرسالة غير موجودة.", 404);
  } catch (err) {
    return handleError(err);
  }
}
