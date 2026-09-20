import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";

import { flushOutbox, outboxTable, type OutboxEntry } from "./outbox.js";

/** Entries still waiting to be sent, kept live by Dexie. */
export function useOutbox(): OutboxEntry[] {
  return (
    useLiveQuery(async () => {
      const table = outboxTable();
      if (!table) return [];
      return table.orderBy("createdAt").toArray();
    }, []) ?? []
  );
}

const RETRY_INTERVAL_MS = 30_000;

/**
 * Keeps the outbox draining. Mounted once, near the top of the app.
 *
 * Tries on mount, whenever the browser says it is back online, and on a slow
 * timer, because "online" only means a network is attached, not that the
 * server can actually be reached.
 */
export function useOutboxSync(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;

    const flush = async () => {
      const { sent } = await flushOutbox();
      if (sent > 0 && !cancelled) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["my-saree-jobs"] }),
          queryClient.invalidateQueries({ queryKey: ["saree-jobs"] }),
          queryClient.invalidateQueries({ queryKey: ["production-entries"] }),
        ]);
      }
    };

    void flush();
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    const timer = window.setInterval(() => void flush(), RETRY_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      window.clearInterval(timer);
    };
  }, [queryClient]);
}
