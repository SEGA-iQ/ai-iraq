import { readDb, updateDb, newId, nowIso } from "@/lib/db";
import { ok, readBody, handleError } from "@/lib/api";
import { MessageInput } from "@/lib/schemas";
import type { InboxMessage } from "@/lib/types";

export async function GET() {
  try {
    const db = await readDb();
    return ok({ messages: db.messages });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  const body = await readBody(req, MessageInput);
  if (body.error) return body.error;
  try {
    const message: InboxMessage = {
      id: newId(),
      ...body.data,
      receivedAt: nowIso(),
      status: "new",
      intent: null,
      urgency: null,
      draft: "",
      altDraft: "",
      internalNote: "",
      source: "manual",
      externalId: null,
    };
    await updateDb((db) => {
      db.messages.push(message);
    });
    return ok(message, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
