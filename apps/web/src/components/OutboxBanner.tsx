import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button.js";
import { discardEntry } from "@/lib/outbox.js";
import { useOutbox } from "@/lib/useOutbox.js";

/** Shows what has not reached the server yet, so nothing goes quietly missing. */
export function OutboxBanner() {
  const { t } = useTranslation();
  const entries = useOutbox();

  if (entries.length === 0) return null;

  const waiting = entries.filter((entry) => entry.status === "pending");
  const failed = entries.filter((entry) => entry.status === "failed");

  return (
    <div className="space-y-3">
      {waiting.length > 0 ? (
        <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <span className="size-2 shrink-0 animate-pulse rounded-full bg-amber-500" />
          {t("outbox.waiting", { count: waiting.length })}
        </p>
      ) : null}

      {failed.map((entry) => (
        <div
          key={entry.id}
          className="space-y-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200"
        >
          <p className="font-medium">
            {t("outbox.failed", { date: entry.weekStart, inches: entry.inches })}
          </p>
          <p>{entry.error}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void discardEntry(entry.id)}
          >
            {t("outbox.discard")}
          </Button>
        </div>
      ))}
    </div>
  );
}
