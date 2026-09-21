import Dexie, { type EntityTable } from "dexie";

import { ApiError, apiPost } from "./api.js";

/**
 * Entries a weaver has filed that have not reached the server yet.
 *
 * A weaver stands at a loom with no signal, types the week's inches and walks
 * away. The entry is written here first and sent later, so the record is never
 * lost to a dead bar of reception.
 *
 * Only production entries go through here. Payments are made by the owner,
 * who has internet, and queueing those offline could leave two different
 * balances for one weaver.
 */
export type OutboxEntry = {
  /** Also sent as clientId, so a retry cannot file the same week twice. */
  id: string;
  sareeJobId: string;
  weekStart: string;
  inches: number;
  allowOverflow: boolean;
  createdAt: number;
  /** "pending" is still worth retrying; "failed" needs the weaver to look. */
  status: "pending" | "failed";
  error?: string;
};

type LoomDatabase = Dexie & {
  outbox: EntityTable<OutboxEntry, "id">;
};

function openDatabase(): LoomDatabase | null {
  try {
    const database = new Dexie("loom") as LoomDatabase;
    database.version(1).stores({ outbox: "id, status, createdAt" });
    return database;
  } catch {
    // Private windows and blocked site data have no IndexedDB. The app still
    // works, it just cannot hold anything back for later.
    return null;
  }
}

const database = openDatabase();

export type SubmitResult =
  { kind: "sent" } | { kind: "queued" } | { kind: "rejected"; error: ApiError };

export type NewEntry = {
  sareeJobId: string;
  weekStart: string;
  inches: number;
  allowOverflow: boolean;
};

function send(entry: Pick<OutboxEntry, keyof NewEntry | "id">) {
  return apiPost(`/api/saree-jobs/${entry.sareeJobId}/entries`, {
    clientId: entry.id,
    weekStart: entry.weekStart,
    inches: entry.inches,
    allowOverflow: entry.allowOverflow,
  });
}

/** True when retrying could plausibly work: the request never got an answer. */
function isWorthRetrying(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  return error.status === 0 || error.status >= 500 || error.status === 429;
}

export async function submitEntry(input: NewEntry): Promise<SubmitResult> {
  const entry: OutboxEntry = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    status: "pending",
  };

  // Write it down before trying to send, so closing the app mid-request
  // cannot lose it.
  await database?.outbox.put(entry).catch(() => undefined);

  try {
    await send(entry);
    await database?.outbox.delete(entry.id).catch(() => undefined);
    return { kind: "sent" };
  } catch (error) {
    if (isWorthRetrying(error)) return { kind: "queued" };

    // The server said no for a reason retrying will not change, and the
    // weaver is standing right here, so hand it back instead of queueing it.
    await database?.outbox.delete(entry.id).catch(() => undefined);
    return {
      kind: "rejected",
      error:
        error instanceof ApiError
          ? error
          : new ApiError(0, "OFFLINE", "Could not reach the server"),
    };
  }
}

let flushing = false;

/**
 * Try to send everything waiting. Stops at the first entry that fails for a
 * reason worth retrying, because that means the network is still down and the
 * rest would fail the same way.
 */
export async function flushOutbox(): Promise<{ sent: number }> {
  if (!database || flushing) return { sent: 0 };
  flushing = true;

  let sent = 0;
  try {
    const waiting = await database.outbox
      .where("status")
      .equals("pending")
      .sortBy("createdAt");

    for (const entry of waiting) {
      try {
        await send(entry);
        await database.outbox.delete(entry.id);
        sent += 1;
      } catch (error) {
        if (isWorthRetrying(error)) break;

        await database.outbox.update(entry.id, {
          status: "failed",
          error: error instanceof ApiError ? error.message : "Could not send",
        });
      }
    }
  } finally {
    flushing = false;
  }

  return { sent };
}

export async function discardEntry(id: string): Promise<void> {
  await database?.outbox.delete(id).catch(() => undefined);
}

export function outboxTable(): LoomDatabase["outbox"] | null {
  return database?.outbox ?? null;
}
