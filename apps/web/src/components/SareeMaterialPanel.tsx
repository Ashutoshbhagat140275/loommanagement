import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { REIMBURSEMENT_METHODS, type ReimbursementMethod } from "@loom/shared";

import { Button } from "@/components/ui/button.js";
import { Field, FormError, Input, Select } from "@/components/ui/field.js";
import { cn } from "@/lib/cn.js";
import { formatQuantity, parseQuantity } from "@/lib/quantity.js";
import { formatAmount, parseRupees } from "@/lib/rupees.js";
import { useSession } from "@/lib/session.js";
import {
  useGiveMaterial,
  useMaterials,
  useReturnMaterial,
  useSareeMaterials,
  useWeaverBought,
} from "@/lib/stock.js";
import { useApiErrorMessage } from "@/lib/useApiErrorMessage.js";

type Action = "give" | "return" | "weaverBought";

/**
 * Material for one saree: what it has had, what that cost, and one form for
 * the three things that happen to it at the loom.
 */
export function SareeMaterialPanel({
  sareeJobId,
  workers,
}: {
  sareeJobId: string;
  workers: { id: string; name: string }[];
}) {
  const { t } = useTranslation();
  const toMessage = useApiErrorMessage();
  const { data: user } = useSession();
  const isOwner = user?.role === "OWNER" || user?.role === "SUPER_ADMIN";

  const onSaree = useSareeMaterials(sareeJobId);
  const inStore = useMaterials();
  const give = useGiveMaterial(sareeJobId);
  const giveBack = useReturnMaterial(sareeJobId);
  const bought = useWeaverBought(sareeJobId);

  // Paying a weaver back is money, which is the owner's alone.
  const actions: Action[] = isOwner ? ["give", "return", "weaverBought"] : ["give", "return"];

  const [action, setAction] = useState<Action>("give");
  const [materialId, setMaterialId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [paid, setPaid] = useState("");
  const [workerId, setWorkerId] = useState(workers[0]?.id ?? "");
  const [reimbursement, setReimbursement] = useState<ReimbursementMethod>("CASH_NOW");
  const [fieldError, setFieldError] = useState<string>();

  const mutation = action === "give" ? give : action === "return" ? giveBack : bought;

  const rows = onSaree.data?.materials ?? [];
  const store = inStore.data ?? [];

  // Only what could actually be returned is offered for returning.
  const choices =
    action === "return"
      ? rows
          .filter((row) => row.returnableMilli > 0)
          .map((row) => ({ id: row.materialId, name: row.name, unit: row.unit }))
      : store.map((material) => ({ id: material.id, name: material.name, unit: material.unit }));

  const chosenId = choices.some((choice) => choice.id === materialId)
    ? materialId
    : (choices[0]?.id ?? "");
  const chosen = choices.find((choice) => choice.id === chosenId);

  const hint = (() => {
    if (!chosen) return undefined;
    if (action === "give") {
      const material = store.find((item) => item.id === chosen.id);
      return material
        ? t("material.inStock", { amount: formatQuantity(material.onHandMilli, material.unit, t) })
        : undefined;
    }
    if (action === "return") {
      const row = rows.find((item) => item.materialId === chosen.id);
      return row
        ? t("material.returnable", { amount: formatQuantity(row.returnableMilli, row.unit, t) })
        : undefined;
    }
    return undefined;
  })();

  const reset = () => {
    setQuantity("");
    setPaid("");
    setFieldError(undefined);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const quantityMilli = parseQuantity(quantity);
    if (!chosen || quantityMilli === null) {
      setFieldError(t("stock.errors.badQuantity"));
      return;
    }

    if (action === "weaverBought") {
      const costPaise = parseRupees(paid);
      if (costPaise === null || costPaise <= 0) {
        setFieldError(t("passbook.errors.badAmount"));
        return;
      }
      setFieldError(undefined);
      bought.mutate(
        { materialId: chosen.id, quantityMilli, costPaise, workerId, reimbursement },
        { onSuccess: reset },
      );
      return;
    }

    setFieldError(undefined);
    (action === "give" ? give : giveBack).mutate(
      { materialId: chosen.id, quantityMilli },
      { onSuccess: reset },
    );
  };

  return (
    <div className="space-y-4 border-t border-slate-200 pt-4">
      <h3 className="font-medium">{t("material.title")}</h3>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">{t("material.none")}</p>
      ) : (
        <div className="space-y-2">
          <ul className="divide-y divide-slate-100 text-sm">
            {rows.map((row) => (
              <li key={row.materialId} className="flex items-start justify-between gap-4 py-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{row.name}</p>
                  <p className="text-slate-500">
                    {t("material.onLoom")}: {formatQuantity(row.returnableMilli, row.unit, t)}
                    {row.boughtByWeaverMilli > 0
                      ? ` · ${t("material.boughtByWeaver")}: ${formatQuantity(row.boughtByWeaverMilli, row.unit, t)}`
                      : ""}
                  </p>
                </div>
                <p className="shrink-0 tabular-nums">
                  {row.costPaise === null ? "—" : formatAmount(row.costPaise)}
                </p>
              </li>
            ))}
          </ul>
          <p className="flex justify-between gap-4 text-sm">
            <span className="text-slate-500">{t("material.cost")}</span>
            <span className="font-semibold tabular-nums">
              {onSaree.data?.totalCostPaise === null
                ? t("material.costUnknown")
                : formatAmount(onSaree.data?.totalCostPaise ?? 0)}
            </span>
          </p>
        </div>
      )}

      {store.length === 0 ? (
        <p className="text-sm text-slate-500">{t("material.noMaterials")}</p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <FormError>{toMessage(mutation.error)}</FormError>

          <div className="flex flex-wrap gap-2" role="group" aria-label={t("material.action")}>
            {actions.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={action === value}
                onClick={() => {
                  setAction(value);
                  setFieldError(undefined);
                  mutation.reset();
                }}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition",
                  action === value
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100",
                )}
              >
                {t(`material.${value}`)}
              </button>
            ))}
          </div>

          {choices.length === 0 ? (
            <p className="text-sm text-slate-500">{t("material.none")}</p>
          ) : (
            <>
              <Field label={t("material.which")} hint={hint}>
                {(props) => (
                  <Select
                    {...props}
                    value={chosenId}
                    onChange={(event) => setMaterialId(event.target.value)}
                  >
                    {choices.map((choice) => (
                      <option key={choice.id} value={choice.id}>
                        {choice.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field
                label={t("stock.quantity", {
                  unit: chosen ? t(`unitName.${chosen.unit}`) : "",
                })}
                error={action === "weaverBought" ? undefined : fieldError}
              >
                {(props) => (
                  <Input
                    {...props}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.001"
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                  />
                )}
              </Field>

              {action === "weaverBought" ? (
                <>
                  <Field label={t("material.paid")} error={fieldError}>
                    {(props) => (
                      <Input
                        {...props}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        value={paid}
                        onChange={(event) => setPaid(event.target.value)}
                      />
                    )}
                  </Field>

                  {workers.length > 1 ? (
                    <Field label={t("material.whoPaid")}>
                      {(props) => (
                        <Select
                          {...props}
                          value={workerId}
                          onChange={(event) => setWorkerId(event.target.value)}
                        >
                          {workers.map((worker) => (
                            <option key={worker.id} value={worker.id}>
                              {worker.name}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                  ) : null}

                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium text-slate-700">
                      {t("material.payBack")}
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      {REIMBURSEMENT_METHODS.map((method) => (
                        <label
                          key={method}
                          className={cn(
                            "flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm ring-1",
                            reimbursement === method
                              ? "bg-slate-900 text-white ring-slate-900"
                              : "bg-white text-slate-700 ring-slate-200",
                          )}
                        >
                          <input
                            type="radio"
                            name={`reimburse-${sareeJobId}`}
                            value={method}
                            checked={reimbursement === method}
                            onChange={() => setReimbursement(method)}
                            className="sr-only"
                          />
                          {t(`material.${method}`)}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </>
              ) : null}

              <Button type="submit" size="sm" disabled={mutation.isPending}>
                {mutation.isPending ? t("common.loading") : t("material.save")}
              </Button>
            </>
          )}
        </form>
      )}
    </div>
  );
}
