import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { currentWeekStart, toIsoDate } from "@loom/shared";

import { Button } from "@/components/ui/button.js";
import { Field, FormError, Input } from "@/components/ui/field.js";
import { ApiError } from "@/lib/api.js";
import { useFileWeeklyEntry } from "@/lib/production.js";
import { useApiErrorMessage } from "@/lib/useApiErrorMessage.js";

/**
 * The one screen a weaver uses at the loom. Two fields, big targets, and it
 * asks for this week's inches only, never a running total.
 */
export function WeeklyEntryForm({
  sareeJobId,
  onRecorded,
}: {
  sareeJobId: string;
  onRecorded?: () => void;
}) {
  const { t } = useTranslation();
  const file = useFileWeeklyEntry();
  const toMessage = useApiErrorMessage();

  const [weekStart, setWeekStart] = useState(() => toIsoDate(currentWeekStart()));
  const [inches, setInches] = useState("");

  const needsOverflowConfirmation =
    file.error instanceof ApiError && file.error.code === "INCHES_EXCEED_LENGTH";

  const send = (allowOverflow: boolean) => {
    const value = Number(inches);
    if (!Number.isFinite(value) || value < 1) return;
    file.mutate(
      { sareeJobId, weekStart, inches: Math.trunc(value), allowOverflow },
      {
        onSuccess: () => {
          setInches("");
          onRecorded?.();
        },
      },
    );
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    send(false);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {needsOverflowConfirmation ? (
        <div className="space-y-3 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <p className="text-sm text-amber-900">{t("entry.confirmOverflow")}</p>
          <p className="text-sm text-amber-800">{file.error?.message}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => send(true)}
            disabled={file.isPending}
          >
            {t("entry.confirm")}
          </Button>
        </div>
      ) : (
        <FormError>{toMessage(file.error)}</FormError>
      )}

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

      <Button type="submit" block size="lg" disabled={file.isPending}>
        {file.isPending ? t("common.loading") : t("entry.submit")}
      </Button>
    </form>
  );
}
