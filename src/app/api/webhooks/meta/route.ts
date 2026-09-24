import { after } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { updateDb, newId, nowIso } from "@/lib/db";
import { draftAndSave } from "@/lib/messages";
import type { Channel, InboxMessage } from "@/lib/types";

// Receives WhatsApp Cloud API, Messenger and Instagram messages from a Meta app,
// stores them in the inbox, and drafts a reply in the background.
// Replies are still reviewed and sent by a person; nothing is sent automatically.

export const maxDuration = 300;

/** Meta's subscription handshake. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const verifyToken = process.env.META_VERIFY_TOKEN;
  if (
    verifyToken &&
    url.searchParams.get("hub.mode") === "subscribe" &&
    url.searchParams.get("hub.verify_token") === verifyToken
  ) {
    return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

function validSignature(raw: string, header: string | null, secret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(raw, "utf8").digest("hex"));
  const given = Buffer.from(header.slice(7));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

interface Incoming {
  channel: Channel;
  externalId: string;
  handle: string;
  name: string;
  text: string;
  at: string;
}

type Json = Record<string, unknown>;
const arr = (v: unknown): Json[] => (Array.isArray(v) ? (v as Json[]) : []);
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

function toIso(ts: unknown): string {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return nowIso();
  // WhatsApp sends seconds, Messenger/Instagram send milliseconds.
  return new Date(n < 1e12 ? n * 1000 : n).toISOString();
}

function extract(payload: Json): Incoming[] {
  const out: Incoming[] = [];
  const object = str(payload.object);

  for (const entry of arr(payload.entry)) {
    if (object === "whatsapp_business_account") {
      for (const change of arr(entry.changes)) {
        const value = obj(change.value);
        const names = new Map(arr(value.contacts).map((c) => [str(c.wa_id), str(obj(c.profile).name)]));
        for (const m of arr(value.messages)) {
          const text =
            str(obj(m.text).body) ||
            str(obj(m.button).text) ||
            str(obj(obj(m.interactive).button_reply).title) ||
            (str(m.type) && str(m.type) !== "text" ? `[${str(m.type)}]` : "");
          if (!text) continue;
          const from = str(m.from);
          out.push({ channel: "whatsapp", externalId: str(m.id), handle: from, name: names.get(from) ?? "", text, at: toIso(m.timestamp) });
        }
      }
    } else if (object === "page" || object === "instagram") {
      for (const ev of arr(entry.messaging)) {
        const message = obj(ev.message);
        if (message.is_echo) continue; // our own outgoing messages
        const text = str(message.text) || (arr(message.attachments).length ? "[مرفق]" : "");
        if (!text) continue;
        out.push({
          channel: object === "page" ? "facebook" : "instagram",
          externalId: str(message.mid),
          handle: str(obj(ev.sender).id),
          name: "",
          text,
          at: toIso(ev.timestamp),
        });
      }
    }
  }
  return out;
}

export async function POST(req: Request) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return new Response("Webhook not configured", { status: 503 });

  const raw = await req.text();
  if (!validSignature(raw, req.headers.get("x-hub-signature-256"), secret)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: Json;
  try {
    payload = obj(JSON.parse(raw));
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const incoming = extract(payload);
  const created = await updateDb((db) => {
    const seen = new Set(db.messages.map((m) => m.externalId).filter(Boolean));
    const added: InboxMessage[] = [];
    for (const m of incoming) {
      if (m.externalId && seen.has(m.externalId)) continue;
      const msg: InboxMessage = {
        id: newId(),
        channel: m.channel,
        customerName: m.name,
        customerHandle: m.handle,
        text: m.text,
        receivedAt: m.at,
        status: "new",
        intent: null,
        urgency: null,
        draft: "",
        altDraft: "",
        internalNote: "",
        source: "webhook",
        externalId: m.externalId || null,
      };
      db.messages.push(msg);
      if (m.externalId) seen.add(m.externalId);
      added.push(msg);
    }
    return added;
  });

  // Meta expects a fast 200; drafting can take a while on a local model.
  if (created.length) {
    after(async () => {
      for (const m of created) {
        try {
          await draftAndSave(m.id);
        } catch (err) {
          console.error("auto-draft failed", m.id, err);
        }
      }
    });
  }

  return new Response("EVENT_RECEIVED", { status: 200 });
}
