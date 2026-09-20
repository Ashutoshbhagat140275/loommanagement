import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  DEFAULT_SAREE_LENGTH_INCHES,
  LOOM_PLACES,
  WAGE_TYPES,
  formatPaise,
  fromRupees,
  paise,
  type LoomPlace,
  type WageType,
} from "@loom/shared";

import { ProgressBar } from "@/components/ProgressBar.js";
import { Button } from "@/components/ui/button.js";
import { ConfirmDialog } from "@/components/ui/confirm-dialog.js";
import { Field, FormError, Input } from "@/components/ui/field.js";
import { apiFetch } from "@/lib/api.js";
import {
  useCreateLoom,
  useFinishSareeJob,
  useLooms,
  useSareeJobs,
  useStartSareeJob,
  type Loom,
  type SareeJob,
} from "@/lib/production.js";
import { useApiErrorMessage } from "@/lib/useApiErrorMessage.js";

const selectClass =
  "h-12 w-full rounded-xl bg-white px-4 text-base ring-1 ring-slate-300 focus:ring-2 focus:ring-slate-900 focus:outline-none";

function AddLoomForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const create = useCreateLoom();
  const toMessage = useApiErrorMessage();
  const [number, setNumber] = useState("");
  const [place, setPlace] = useState<LoomPlace>("IN_FACTORY");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate({ number: number.trim(), place }, { onSuccess: onDone });
  };

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200"
    >
      <FormError>{toMessage(create.error)}</FormError>

      <Field label={t("looms.number")}>
        {(props) => (
          <Input
            {...props}
            required
            value={number}
            onChange={(event) => setNumber(event.target.value)}
          />
        )}
      </Field>

      <Field label={t("looms.place")}>
        {(props) => (
          <select
            {...props}
            className={selectClass}
            value={place}
            onChange={(event) => setPlace(event.target.value as LoomPlace)}
          >
            {LOOM_PLACES.map((value) => (
              <option key={value} value={value}>
                {t(`loomPlace.${value}`)}
              </option>
            ))}
          </select>
        )}
      </Field>

      <div className="flex gap-3">
        <Button type="submit" disabled={create.isPending}>
          {t("common.save")}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}

function StartSareeForm({ loom, onDone }: { loom: Loom; onDone: () => void }) {
  const { t } = useTranslation();
  const start = useStartSareeJob();
  const toMessage = useApiErrorMessage();

  const workers = useQuery({
    queryKey: ["workers"],
    queryFn: () =>
      apiFetch<{ workers: { id: string; name: string; active: boolean }[] }>(
        "/api/workers",
      ),
  });

  const [label, setLabel] = useState("");
  const [lengthInches, setLengthInches] = useState(String(DEFAULT_SAREE_LENGTH_INCHES));
  const [wageType, setWageType] = useState<WageType>("PER_SAREE");
  const [amount, setAmount] = useState("");
  const [workerIds, setWorkerIds] = useState<string[]>([]);
  const [amountError, setAmountError] = useState<string>();

  const toggleWorker = (id: string) =>
    setWorkerIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : current.length >= 2
          ? current
          : [...current, id],
    );

  const submit = (event: FormEvent) => {
    event.preventDefault();

    let amountPaise: number;
    try {
      amountPaise = fromRupees(amount.trim());
    } catch {
      setAmountError(t("auth.errors.invalidCredentials"));
      return;
    }
    setAmountError(undefined);

    start.mutate(
      {
        loomId: loom.id,
        lengthInches: Number(lengthInches),
        wageType,
        workerIds,
        ...(label.trim() ? { label: label.trim() } : {}),
        ...(wageType === "PER_SAREE"
          ? { wagePaise: amountPaise }
          : { ratePerInchPaise: amountPaise }),
      },
      { onSuccess: onDone },
    );
  };

  const activeWorkers = workers.data?.workers.filter((worker) => worker.active) ?? [];

  return (
    <form onSubmit={submit} className="mt-4 space-y-4 border-t border-slate-200 pt-4">
      <FormError>{toMessage(start.error)}</FormError>

      <Field label={`${t("saree.label")} (${t("common.optional")})`}>
        {(props) => (
          <Input
            {...props}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        )}
      </Field>

      <Field label={t("saree.length")}>
        {(props) => (
          <Input
            {...props}
            type="number"
            min={1}
            required
            value={lengthInches}
            onChange={(event) => setLengthInches(event.target.value)}
          />
        )}
      </Field>

      <Field label={t("saree.wageType")}>
        {(props) => (
          <select
            {...props}
            className={selectClass}
            value={wageType}
            onChange={(event) => setWageType(event.target.value as WageType)}
          >
            {WAGE_TYPES.map((value) => (
              <option key={value} value={value}>
                {t(`wageType.${value}`)}
              </option>
            ))}
          </select>
        )}
      </Field>

      <Field
        label={wageType === "PER_SAREE" ? t("saree.wage") : t("saree.ratePerInch")}
        error={amountError}
      >
        {(props) => (
          <Input
            {...props}
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            required
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        )}
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-700">
          {t("saree.weavers")}
        </legend>
        <p className="text-sm text-slate-500">{t("saree.weaversHint")}</p>
        <div className="flex flex-wrap gap-2">
          {activeWorkers.map((worker) => {
            const picked = workerIds.includes(worker.id);
            return (
              <button
                key={worker.id}
                type="button"
                onClick={() => toggleWorker(worker.id)}
                aria-pressed={picked}
                className={
                  picked
                    ? "rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                    : "rounded-xl bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300"
                }
              >
                {worker.name}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex gap-3">
        <Button type="submit" disabled={start.isPending || workerIds.length === 0}>
          {t("saree.start")}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}

function LoomCard({ loom, job }: { loom: Loom; job: SareeJob | undefined }) {
  const { t } = useTranslation();
  const finish = useFinishSareeJob();
  const [starting, setStarting] = useState(false);
  const [confirmingFinish, setConfirmingFinish] = useState(false);

  const remaining = job ? job.lengthInches - job.inchesDone : 0;

  const finishSaree = () => {
    if (!job) return;
    // Finishing a saree that still has inches left is nearly always a misclick,
    // so ask. A saree that has reached its length just ends.
    if (remaining > 0) setConfirmingFinish(true);
    else finish.mutate(job.id);
  };

  return (
    <li className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium">{t("looms.label", { number: loom.number })}</p>
          <p className="text-sm text-slate-500">
            {t(`loomPlace.${loom.place}`)} · {t(`loomStatus.${loom.status}`)}
          </p>
        </div>
        {!job && !starting ? (
          <Button size="sm" variant="outline" onClick={() => setStarting(true)}>
            {t("looms.startSaree")}
          </Button>
        ) : null}
      </div>

      {job ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            {job.label ?? job.sareeType?.name ? (
              <p className="font-medium">{job.label ?? job.sareeType?.name}</p>
            ) : (
              <span />
            )}
            <p className="text-sm text-slate-500">
              {job.wageType === "PER_SAREE"
                ? formatPaise(paise(job.wagePaise ?? 0))
                : `${formatPaise(paise(job.ratePerInchPaise ?? 0))} / inch`}
            </p>
          </div>

          <ProgressBar
            done={job.inchesDone}
            total={job.lengthInches}
            label={t("saree.progress", {
              done: job.inchesDone,
              total: job.lengthInches,
            })}
          />

          <p className="text-sm text-slate-600">
            {job.workers.map((worker) => worker.name).join(" · ")}
          </p>

          <Button
            size="sm"
            variant="outline"
            onClick={finishSaree}
            disabled={finish.isPending}
          >
            {t("saree.finish")}
          </Button>

          <ConfirmDialog
            open={confirmingFinish}
            title={t("saree.finishConfirmTitle")}
            confirmLabel={t("saree.finishConfirm")}
            cancelLabel={t("common.cancel")}
            tone="danger"
            busy={finish.isPending}
            onCancel={() => setConfirmingFinish(false)}
            onConfirm={() =>
              finish.mutate(job.id, { onSuccess: () => setConfirmingFinish(false) })
            }
          >
            {t("saree.finishConfirmBody", {
              done: job.inchesDone,
              total: job.lengthInches,
              remaining,
            })}
          </ConfirmDialog>
        </div>
      ) : starting ? (
        <StartSareeForm loom={loom} onDone={() => setStarting(false)} />
      ) : (
        <p className="mt-3 text-sm text-slate-500">{t("looms.idle")}</p>
      )}
    </li>
  );
}

export function Looms() {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const looms = useLooms();
  const jobs = useSareeJobs("RUNNING");

  const jobByLoom = new Map(
    (jobs.data?.sareeJobs ?? []).map((job) => [job.loom.id, job]),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("looms.title")}</h1>
        {!adding ? (
          <Button size="sm" onClick={() => setAdding(true)}>
            {t("looms.add")}
          </Button>
        ) : null}
      </div>

      {adding ? <AddLoomForm onDone={() => setAdding(false)} /> : null}

      {looms.isPending ? (
        <p className="text-slate-500">{t("common.loading")}</p>
      ) : looms.data?.looms.length === 0 && !adding ? (
        <p className="rounded-2xl bg-white p-6 text-center text-slate-500 ring-1 ring-slate-200">
          {t("looms.empty")}
        </p>
      ) : (
        <ul className="space-y-3">
          {looms.data?.looms.map((loom) => (
            <LoomCard key={loom.id} loom={loom} job={jobByLoom.get(loom.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}
