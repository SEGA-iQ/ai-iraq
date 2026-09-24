import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { Database } from "./types";
import { defaultSettings } from "./defaults";

// A single JSON file is plenty for one manager's workload and needs no setup.
// Writes go through a queue so concurrent requests never interleave, and each
// write lands atomically (tmp file + rename) so a crash can't corrupt the file.

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

function emptyDb(): Database {
  return {
    version: 1,
    settings: defaultSettings(),
    campaigns: [],
    metrics: [],
    messages: [],
    posts: [],
    analysis: null,
  };
}

/** Fill in fields added in later versions so old files keep working. */
function normalize(raw: Partial<Database>): Database {
  const base = emptyDb();
  const s = raw.settings ?? base.settings;
  return {
    version: 1,
    settings: {
      company: { ...base.settings.company, ...s.company },
      faq: Array.isArray(s.faq) ? s.faq : [],
      ai: { ...base.settings.ai, ...s.ai },
      rules: {
        ...base.settings.rules,
        ...s.rules,
        targetCpr: { ...base.settings.rules.targetCpr, ...s.rules?.targetCpr },
      },
    },
    campaigns: raw.campaigns ?? [],
    metrics: raw.metrics ?? [],
    messages: raw.messages ?? [],
    posts: raw.posts ?? [],
    analysis: raw.analysis ?? null,
  };
}

async function readFromDisk(): Promise<Database> {
  try {
    const text = await fs.readFile(DB_FILE, "utf8");
    return normalize(JSON.parse(text) as Partial<Database>);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyDb();
    throw err;
  }
}

async function writeToDisk(db: Database): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${DB_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(tmp, DB_FILE);
}

let queue: Promise<unknown> = Promise.resolve();

/** Read a consistent snapshot. */
export async function readDb(): Promise<Database> {
  await queue.catch(() => undefined);
  return readFromDisk();
}

/**
 * Apply a mutation atomically. The mutator edits the draft in place and may
 * return a value, which is passed back to the caller.
 */
export function updateDb<T>(mutator: (db: Database) => T | Promise<T>): Promise<T> {
  const run = queue.catch(() => undefined).then(async () => {
    const db = await readFromDisk();
    const result = await mutator(db);
    await writeToDisk(db);
    return result;
  });
  queue = run;
  return run;
}

export function newId(): string {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
