import { readDb } from "@/lib/db";
import { ok, readBody, handleError } from "@/lib/api";
import { PostGenerateInput } from "@/lib/schemas";
import { generatePost } from "@/lib/assistant";

export const maxDuration = 300;

/** Returns a generated post without saving it; the page saves what the user keeps. */
export async function POST(req: Request) {
  const body = await readBody(req, PostGenerateInput);
  if (body.error) return body.error;
  try {
    const db = await readDb();
    return ok(await generatePost(db.settings, body.data));
  } catch (err) {
    return handleError(err);
  }
}
