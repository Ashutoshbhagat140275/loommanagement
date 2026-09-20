import { useState } from "react";
import { useTranslation } from "react-i18next";
import { currentWeekStart, toIsoDate } from "@loom/shared";

import { Field, Input } from "@/components/ui/field.js";
import { useProductionReport } from "@/lib/production.js";

function weeksBack(count: number): string {
  const monday = currentWeekStart();
  monday.setUTCDate(monday.getUTCDate() - count * 7);
  return toIsoDate(monday);
}

/** A list with a bar per row, so an owner can see at a glance who is ahead. */
function Breakdown({
  title,
  rows,
}: {
  title: string;
  rows: { key: string; label: string; inches: number }[];
}) {
  const { t } = useTranslation();
  const most = Math.max(...rows.map((row) => row.inches), 1);

  if (rows.length === 0) return null;

  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <h2 className="font-medium">{title}</h2>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.key} className="space-y-1">
            <div className="flex items-baseline justify-between gap-4">
              <span className="truncate">{row.label}</span>
              <span className="shrink-0 text-sm text-slate-500">
                {t("reports.inches", { count: row.inches })}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-slate-900"
                style={{ width: `${Math.max((row.inches / most) * 100, 2)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Reports() {
  const { t } = useTranslation();
  const [from, setFrom] = useState(() => weeksBack(7));
  const [to, setTo] = useState(() => toIsoDate(currentWeekStart()));

  const report = useProductionReport(from, to);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t("reports.title")}</h1>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("reports.from")}>
          {(props) => (
            <Input
              {...props}
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          )}
        </Field>
        <Field label={t("reports.to")}>
          {(props) => (
            <Input
              {...props}
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          )}
        </Field>
      </div>

      {report.isPending ? (
        <p className="text-slate-500">{t("common.loading")}</p>
      ) : report.data && report.data.totalInches > 0 ? (
        <>
          <p className="rounded-2xl bg-white p-4 text-lg font-medium ring-1 ring-slate-200">
            {t("reports.total", { count: report.data.totalInches })}
          </p>

          <Breakdown
            title={t("reports.byWeek")}
            rows={report.data.byWeek.map((row) => ({
              key: row.weekStart,
              label: row.weekStart,
              inches: row.inches,
            }))}
          />
          <Breakdown
            title={t("reports.byLoom")}
            rows={report.data.byLoom.map((row) => ({
              key: row.loomId,
              label: t("looms.label", { number: row.number }),
              inches: row.inches,
            }))}
          />
          <Breakdown
            title={t("reports.byWorker")}
            rows={report.data.byWorker.map((row) => ({
              key: row.workerId,
              label: row.name,
              inches: row.inches,
            }))}
          />

          <p className="text-sm text-slate-500">{t("reports.note")}</p>
        </>
      ) : (
        <p className="rounded-2xl bg-white p-6 text-center text-slate-500 ring-1 ring-slate-200">
          {t("reports.empty")}
        </p>
      )}
    </div>
  );
}
