import "server-only";
import { readDb, updateDb } from "./db";
import { draftReply } from "./assistant";
import type { InboxMessage } from "./types";

/** Generate an AI reply for a stored message and save it on the message. */
export async function draftAndSave(id: string, instruction?: string): Promise<InboxMessage | null> {
  const db = await readDb();
  const message = db.messages.find((m) => m.id === id);
  if (!message) return null;

  const draft = await draftReply(db, message, instruction);

  return updateDb((d) => {
    const m = d.messages.find((x) => x.id === id);
    if (!m) return null;
    m.draft = draft.reply;
    m.altDraft = draft.altReply;
    m.intent = draft.intent;
    m.urgency = draft.urgency;
    if (draft.note) m.internalNote = draft.note;
    if (m.status === "new") m.status = "drafted";
    return m;
  });
}
