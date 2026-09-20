import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { currentWeekStart, toIsoDate } from "@loom/shared";

import { Button } from "@/components/ui/button.js";
import { Field, FormError, Input } from "@/components/ui/field.js";
import { submitEntry, type NewEntry, type SubmitResult } from "@/lib/outbox.js";
import { useApiErrorMessage } from "@/lib/useApiErrorMessage.js";
import { useOutbox } from "@/lib/useOutbox.js";

/**
 * The one screen a weaver uses at the loom. Two fields, big targets, and it
 * asks for this week's inches only, never a running total.
 *
 * Submitting goes through the outbox, so a loom with no signal still records
 * the week and sends it once there is a connection.
 */
export function WeeklyEntryForm({ sareeJobId }: { sareeJobId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toMessage = useApiErrorMessage();

  const [weekStart, setWeekStart] = useState(() => toIsoDate(currentWeekStart()));
  const [inches, setInches] = useState("");

  const submit = useMutation<SubmitResult, Error, NewEntry>({
    mutationFn: submitEntry,
    onSuccess: async (result) => {
      if (result.kind === "rejected") return;
      setInches("");
      await queryClient.invalidateQueries({ queryKey: ["my-saree-jobs"] });
    },
  });

  // Tied to the outbox rather than to the mutation result: once the entry has
  // actually gone, "saved on this phone" is no longer true and must not linger.
  const stillWaiting = useOutbox().some((entry) => entry.status === "pending");

  const result = submit.data;
  const overflow =
    result?.kind === "rejected" && result.error.code === "INCHES_EXCEED_LENGTH"
      ? result.error
      : null;

  const send = (allowOverflow: boolean) => {
    const value = Number(inches);
    if (!Number.isFinite(value) || value < 1) return;
    submit.mutate({
      sareeJobId,
      weekStart,
      inches: Math.trunc(value),
      allowOverflow,
    });
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    send(false);
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {overflow ? (
        <div className="space-y-3 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <p className="text-sm text-amber-900">{t("entry.confirmOverflow")}</p>
          <p className="text-sm text-amber-800">{overflow.message}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => send(true)}
            disabled={submit.isPending}
          >
            {t("entry.confirm")}
          </Button>
        </div>
      ) : result?.kind === "rejected" ? (
        <FormError>{toMessage(result.error)}</FormError>
      ) : result?.kind === "queued" && stillWaiting ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          {t("outbox.saved")}
        </p>
      ) : null}

      <Field label={t("entry.week")}>
        {(props) => (
          <Input
            {...props}
            type="date"
            required
            value={weekStart}
            onChange={(event) => setWeekStart(event.target.value)}
          />
        )}
      </Field>

      <Field label={t("entry.inches")} hint={t("entry.inchesHint")}>
        {(props) => (
          <Input
            {...props}
            type="number"
            inputMode="numeric"
            min={1}
            required
            value={inches}
            onChange={(event) => setInches(event.target.value)}
          />
        )}
      </Field>

      <Button type="submit" block size="lg" disabled={submit.isPending}>
        {submit.isPending ? t("common.loading") : t("entry.submit")}
      </Button>
    </form>
  );
}
