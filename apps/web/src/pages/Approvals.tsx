import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button.js";
import { Field, FormError, Input } from "@/components/ui/field.js";
import {
  useApproveEntry,
  usePendingEntries,
  useRejectEntry,
  type ProductionEntry,
} from "@/lib/production.js";
import { useApiErrorMessage } from "@/lib/useApiErrorMessage.js";

function EntryCard({ entry }: { entry: ProductionEntry }) {
  const { t } = useTranslation();
  const approve = useApproveEntry();
  const reject = useRejectEntry();
  const toMessage = useApiErrorMessage();
  const [inches, setInches] = useState(String(entry.inches));

  const corrected = Number(inches) !== entry.inches;

  return (
    <li className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <FormError>{toMessage(approve.error ?? reject.error)}</FormError>

      <div>
        <p className="font-medium">
          {t("approvals.filedBy", { loom: entry.sareeJob.loom.number })}
        </p>
        <p className="text-sm text-slate-500">
          {entry.sareeJob.workers.map((worker) => worker.name).join(" · ")} ·{" "}
          {entry.weekStart}
        </p>
      </div>

      <Field label={t("approvals.correctedInches")}>
        {(props) => (
          <Input
            {...props}
            type="number"
            min={1}
            value={inches}
            onChange={(event) => setInches(event.target.value)}
          />
        )}
      </Field>

      <div className="flex gap-3">
        <Button
          size="sm"
          onClick={() =>
            approve.mutate({
              entryId: entry.id,
              ...(corrected ? { inches: Number(inches) } : {}),
            })
          }
          disabled={approve.isPending}
        >
          {t("approvals.approve")}
        </Button>
        <Button
          size="sm"
          variant="danger"
          onClick={() => reject.mutate(entry.id)}
          disabled={reject.isPending}
        >
          {t("approvals.reject")}
        </Button>
      </div>
    </li>
  );
}

export function Approvals() {
  const { t } = useTranslation();
  const pending = usePendingEntries();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t("approvals.title")}</h1>

      {pending.isPending ? (
        <p className="text-slate-500">{t("common.loading")}</p>
      ) : pending.data?.entries.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-center text-slate-500 ring-1 ring-slate-200">
          {t("approvals.empty")}
        </p>
      ) : (
        <ul className="space-y-3">
          {pending.data?.entries.map((entry) => (
            <EntryCard key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </div>
  );
}
