import { useState, type FormEvent } from "react";
import { Link } from "react-router";
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
import { SareeMaterialPanel } from "@/components/SareeMaterialPanel.js";
import { Button } from "@/components/ui/button.js";
import { ConfirmDialog } from "@/components/ui/confirm-dialog.js";
import { Field, FormError, Input, Select } from "@/components/ui/field.js";
import { apiFetch } from "@/lib/api.js";
import { useShiftPreview } from "@/lib/passbook.js";
import { parseQuantity } from "@/lib/quantity.js";
import { formatAmount } from "@/lib/rupees.js";
import { useMaterials } from "@/lib/stock.js";
import {
  useCreateLoom,
  useFinishSareeJob,
  useLooms,
  useSareeJobs,
  useSareeTypes,
  useShiftWorker,
  useStartSareeJob,
  type Loom,
  type SareeJob,
} from "@/lib/production.js";
import { useApiErrorMessage } from "@/lib/useApiErrorMessage.js";

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
          <Select
            {...props}
            value={place}
            onChange={(event) => setPlace(event.target.value as LoomPlace)}
          >
            {LOOM_PLACES.map((value) => (
              <option key={value} value={value}>
                {t(`loomPlace.${value}`)}
              </option>
            ))}
          </Select>
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

  const sareeTypes = useSareeTypes();

  const [sareeTypeId, setSareeTypeId] = useState("");
  const [label, setLabel] = useState("");
  const [lengthInches, setLengthInches] = useState(String(DEFAULT_SAREE_LENGTH_INCHES));
  const [wageType, setWageType] = useState<WageType>("PER_SAREE");
  const [amount, setAmount] = useState("");
  const [workerIds, setWorkerIds] = useState<string[]>([]);
  const [amountError, setAmountError] = useState<string>();

  const store = useMaterials();
  const [materialLines, setMaterialLines] = useState<
    { key: number; materialId: string; quantity: string }[]
  >([]);
  const [materialError, setMaterialError] = useState<string>();

  const addMaterialLine = () =>
    setMaterialLines((lines) => [
      ...lines,
      { key: Date.now(), materialId: store.data?.[0]?.id ?? "", quantity: "" },
    ]);
  const updateMaterialLine = (
    key: number,
    change: { materialId?: string; quantity?: string },
  ) =>
    setMaterialLines((lines) =>
      lines.map((line) => (line.key === key ? { ...line, ...change } : line)),
    );
  const removeMaterialLine = (key: number) =>
    setMaterialLines((lines) => lines.filter((line) => line.key !== key));

  /**
   * Picking a type fills the fields in once. They stay editable, and whatever
   * is submitted is what the saree keeps: the template is a shortcut, never a
   * live link.
   */
  const pickSareeType = (id: string) => {
    setSareeTypeId(id);
    const picked = sareeTypes.data?.sareeTypes.find((type) => type.id === id);
    if (!picked) return;

    setLengthInches(String(picked.lengthInches));
    if (picked.defaultWagePaise !== null) {
      setWageType("PER_SAREE");
      setAmount(String(picked.defaultWagePaise / 100));
    } else if (picked.defaultRatePerInchPaise !== null) {
      setWageType("PER_INCH");
      setAmount(String(picked.defaultRatePerInchPaise / 100));
    }
  };

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
      setAmountError(t("passbook.errors.badAmount"));
      return;
    }
    setAmountError(undefined);

    const materials: { materialId: string; quantityMilli: number }[] = [];
    for (const line of materialLines) {
      const quantityMilli = parseQuantity(line.quantity);
      if (!line.materialId || quantityMilli === null) {
        setMaterialError(t("stock.errors.badQuantity"));
        return;
      }
      materials.push({ materialId: line.materialId, quantityMilli });
    }
    setMaterialError(undefined);

    start.mutate(
      {
        loomId: loom.id,
        lengthInches: Number(lengthInches),
        wageType,
        workerIds,
        materials,
        ...(sareeTypeId ? { sareeTypeId } : {}),
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

      {(sareeTypes.data?.sareeTypes.length ?? 0) > 0 ? (
        <Field
          label={`${t("sareeTypes.pick")} (${t("common.optional")})`}
          hint={sareeTypeId ? t("sareeTypes.copied") : undefined}
        >
          {(props) => (
            <Select
              {...props}
              value={sareeTypeId}
              onChange={(event) => pickSareeType(event.target.value)}
            >
              <option value="">{t("sareeTypes.pickNone")}</option>
              {sareeTypes.data?.sareeTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : null}

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
          <Select
            {...props}
            value={wageType}
            onChange={(event) => setWageType(event.target.value as WageType)}
          >
            {WAGE_TYPES.map((value) => (
              <option key={value} value={value}>
                {t(`wageType.${value}`)}
              </option>
            ))}
          </Select>
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

      {(store.data?.length ?? 0) > 0 ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">
            {t("material.startTitle")}
          </legend>
          <p className="text-sm text-slate-500">{t("material.startHint")}</p>
          {materialError ? (
            <p role="alert" className="text-sm text-red-600">
              {materialError}
            </p>
          ) : null}

          {materialLines.map((line) => {
            const picked = store.data?.find((item) => item.id === line.materialId);
            return (
              <div key={line.key} className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <Select
                    aria-label={t("material.which")}
                    value={line.materialId}
                    onChange={(event) =>
                      updateMaterialLine(line.key, { materialId: event.target.value })
                    }
                  >
                    {store.data?.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="w-28 shrink-0">
                  <Input
                    aria-label={t("stock.quantity", {
                      unit: picked ? t(`unitName.${picked.unit}`) : "",
                    })}
                    placeholder={picked ? t(`unitName.${picked.unit}`) : ""}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.001"
                    value={line.quantity}
                    onChange={(event) =>
                      updateMaterialLine(line.key, { quantity: event.target.value })
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t("material.remove")}
                  onClick={() => removeMaterialLine(line.key)}
                >
                  ×
                </Button>
              </div>
            );
          })}

          <Button type="button" variant="outline" size="sm" onClick={addMaterialLine}>
            {t("material.addLine")}
          </Button>
        </fieldset>
      ) : null}

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

/**
 * Takes a weaver off a half-done saree. The numbers shown come from the
 * server's preview, which runs the same code that saves the shift, so what the
 * owner agrees to is exactly what lands in the passbook.
 */
function ShiftWorkerDialog({
  job,
  open,
  onClose,
}: {
  job: SareeJob;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const shift = useShiftWorker();
  const toMessage = useApiErrorMessage();

  const [leavingId, setLeavingId] = useState(job.workers[0]?.id ?? "");
  const [replacementId, setReplacementId] = useState("");

  const workers = useQuery({
    queryKey: ["workers"],
    queryFn: () =>
      apiFetch<{ workers: { id: string; name: string; active: boolean }[] }>(
        "/api/workers",
      ),
  });

  const onThisSaree = new Set(job.workers.map((worker) => worker.id));
  const available = (workers.data?.workers ?? []).filter(
    (worker) => worker.active && !onThisSaree.has(worker.id),
  );

  const preview = useShiftPreview(job.id, leavingId, open);
  const numbers = preview.data;

  return (
    <ConfirmDialog
      open={open}
      title={t("shift.title")}
      confirmLabel={t("shift.confirm")}
      cancelLabel={t("common.cancel")}
      busy={shift.isPending}
      onCancel={onClose}
      onConfirm={() =>
        shift.mutate(
          {
            sareeJobId: job.id,
            workerId: leavingId,
            ...(replacementId ? { replacementWorkerId: replacementId } : {}),
          },
          { onSuccess: onClose },
        )
      }
    >
      <div className="space-y-4">
        <FormError>{toMessage(shift.error)}</FormError>

        <Field label={t("shift.who")}>
          {(props) => (
            <Select
              {...props}
              value={leavingId}
              onChange={(event) => setLeavingId(event.target.value)}
            >
              {job.workers.map((worker) => (
                <option key={worker.id} value={worker.id}>
                  {worker.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label={t("shift.replacement")}>
          {(props) => (
            <Select
              {...props}
              value={replacementId}
              onChange={(event) => setReplacementId(event.target.value)}
            >
              <option value="">{t("shift.replacementNone")}</option>
              {available.map((worker) => (
                <option key={worker.id} value={worker.id}>
                  {worker.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <div className="space-y-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {!numbers ? (
            <p>{preview.isError ? toMessage(preview.error) : t("common.loading")}</p>
          ) : (
            <>
              <p>
                {numbers.earnedPaise === null
                  ? t("shift.sharePerInch", { paid: formatAmount(numbers.paidPaise) })
                  : t("shift.share", {
                      done: numbers.inchesDone,
                      total: numbers.lengthInches,
                      share: formatAmount(numbers.sharePaise ?? 0),
                      earned: formatAmount(numbers.earnedPaise),
                      paid: formatAmount(numbers.paidPaise),
                    })}
              </p>
              <p className="font-medium">
                {numbers.carriedPaise > 0
                  ? t("shift.carryOwnerOwes", {
                      amount: formatAmount(numbers.carriedPaise),
                    })
                  : numbers.carriedPaise < 0
                    ? t("shift.carryWorkerOwes", {
                        amount: formatAmount(numbers.carriedPaise),
                      })
                    : t("shift.carryNone")}
              </p>
              {(numbers.unearnedPaise ?? 0) > 0 ? (
                <p>
                  {replacementId
                    ? t("shift.toReplacement", {
                        amount: formatAmount(numbers.unearnedPaise ?? 0),
                      })
                    : numbers.continuing.length > 0
                      ? t("shift.toContinuing", {
                          amount: formatAmount(numbers.unearnedPaise ?? 0),
                          names: numbers.continuing
                            .map((worker) => worker.name)
                            .join(", "),
                        })
                      : t("shift.toNobody", {
                          amount: formatAmount(numbers.unearnedPaise ?? 0),
                        })}
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </ConfirmDialog>
  );
}

function LoomCard({ loom, job }: { loom: Loom; job: SareeJob | undefined }) {
  const { t } = useTranslation();
  const finish = useFinishSareeJob();
  const [starting, setStarting] = useState(false);
  const [confirmingFinish, setConfirmingFinish] = useState(false);
  const [shifting, setShifting] = useState(false);
  const [showMaterial, setShowMaterial] = useState(false);

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
            {(job.label ?? job.sareeType?.name) ? (
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

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={finishSaree}
              disabled={finish.isPending}
            >
              {t("saree.finish")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-expanded={showMaterial}
              onClick={() => setShowMaterial((open) => !open)}
            >
              {t("material.button")}
            </Button>
            {job.workers.length > 0 ? (
              <Button size="sm" variant="ghost" onClick={() => setShifting(true)}>
                {t("shift.button")}
              </Button>
            ) : null}
          </div>

          {showMaterial ? (
            <SareeMaterialPanel sareeJobId={job.id} workers={job.workers} />
          ) : null}

          <ShiftWorkerDialog
            job={job}
            open={shifting}
            onClose={() => setShifting(false)}
          />

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("looms.title")}</h1>
        <div className="flex items-center gap-2">
          <Link
            to="/saree-types"
            className="rounded-xl px-3 py-2 text-sm font-medium text-slate-600 underline"
          >
            {t("sareeTypes.manage")}
          </Link>
          {!adding ? (
            <Button size="sm" onClick={() => setAdding(true)}>
              {t("looms.add")}
            </Button>
          ) : null}
        </div>
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
