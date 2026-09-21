import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  MATERIAL_UNITS,
  totalForQuantity,
  type FinishedSareeStatus,
  type MaterialUnit,
} from "@loom/shared";

import { Button } from "@/components/ui/button.js";
import { ConfirmDialog } from "@/components/ui/confirm-dialog.js";
import { Field, FormError, Input, Select } from "@/components/ui/field.js";
import { cn } from "@/lib/cn.js";
import { formatQuantity, parseQuantity } from "@/lib/quantity.js";
import { formatAmount, parseRupees } from "@/lib/rupees.js";
import { useSession } from "@/lib/session.js";
import {
  useCreateMaterial,
  useFinishedSarees,
  useMaterials,
  useRecordPurchase,
  useSetSaleStatus,
  type StockMaterial,
} from "@/lib/stock.js";
import { useApiErrorMessage } from "@/lib/useApiErrorMessage.js";

function AddMaterialForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const create = useCreateMaterial();
  const toMessage = useApiErrorMessage();
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<MaterialUnit>("KG");
  const [lowAt, setLowAt] = useState("");
  const [lowError, setLowError] = useState<string>();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    let lowStockAtMilli: number | undefined;
    if (lowAt.trim()) {
      const parsed = parseQuantity(lowAt);
      if (parsed === null) {
        setLowError(t("stock.errors.badQuantity"));
        return;
      }
      lowStockAtMilli = parsed;
    }
    setLowError(undefined);
    create.mutate(
      {
        name: name.trim(),
        unit,
        ...(lowStockAtMilli === undefined ? {} : { lowStockAtMilli }),
      },
      { onSuccess: onDone },
    );
  };

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200"
    >
      <FormError>{toMessage(create.error)}</FormError>
      <Field label={t("stock.name")}>
        {(props) => (
          <Input
            {...props}
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        )}
      </Field>
      <Field label={t("stock.unit")}>
        {(props) => (
          <Select
            {...props}
            value={unit}
            onChange={(event) => setUnit(event.target.value as MaterialUnit)}
          >
            {MATERIAL_UNITS.map((value) => (
              <option key={value} value={value}>
                {t(`unitName.${value}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field
        label={`${t("stock.lowStockAt")} (${t(`unitName.${unit}`)})`}
        hint={t("stock.lowStockHint")}
        error={lowError}
      >
        {(props) => (
          <Input
            {...props}
            type="number"
            inputMode="decimal"
            min={0}
            step="0.001"
            value={lowAt}
            onChange={(event) => setLowAt(event.target.value)}
          />
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

/**
 * Buying works in the owner's terms: how much, and the price per kg or per
 * bundle. The total is worked out as he types, the way the bill reads.
 */
function BuyDialog({
  material,
  onClose,
}: {
  material: StockMaterial;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const record = useRecordPurchase();
  const toMessage = useApiErrorMessage();
  const unitName = t(`unitName.${material.unit}`);

  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [supplier, setSupplier] = useState("");
  const [quantityError, setQuantityError] = useState<string>();
  const [priceError, setPriceError] = useState<string>();

  const quantityMilli = parseQuantity(quantity);
  const unitPricePaise = parseRupees(price);
  const totalPaise =
    quantityMilli !== null && unitPricePaise !== null
      ? totalForQuantity({ unitPricePaise, quantityMilli })
      : null;

  const confirm = () => {
    if (quantityMilli === null) {
      setQuantityError(t("stock.errors.badQuantity"));
      return;
    }
    setQuantityError(undefined);
    if (price.trim() && unitPricePaise === null) {
      setPriceError(t("passbook.errors.badAmount"));
      return;
    }
    setPriceError(undefined);

    record.mutate(
      {
        materialId: material.id,
        quantityMilli,
        ...(totalPaise === null ? {} : { costPaise: totalPaise }),
        ...(supplier.trim() ? { supplier: supplier.trim() } : {}),
      },
      { onSuccess: onClose },
    );
  };

  return (
    <ConfirmDialog
      open
      title={t("stock.buyTitle", { name: material.name })}
      confirmLabel={t("stock.buy")}
      cancelLabel={t("common.cancel")}
      busy={record.isPending}
      onConfirm={confirm}
      onCancel={onClose}
    >
      <div className="space-y-4">
        <FormError>{toMessage(record.error)}</FormError>
        <Field label={t("stock.quantity", { unit: unitName })} error={quantityError}>
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
        <Field
          label={t("stock.pricePerUnit", { unit: unitName })}
          hint={t("stock.pricePerUnitHint")}
          error={priceError}
        >
          {(props) => (
            <Input
              {...props}
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
          )}
        </Field>
        <div className="rounded-xl bg-slate-50 px-4 py-3">
          <p className="text-sm text-slate-500">{t("stock.total")}</p>
          <p className="text-xl font-semibold tabular-nums">
            {totalPaise === null ? t("stock.noPrice") : formatAmount(totalPaise)}
          </p>
        </div>
        <Field label={`${t("stock.supplier")} (${t("common.optional")})`}>
          {(props) => (
            <Input
              {...props}
              value={supplier}
              onChange={(event) => setSupplier(event.target.value)}
            />
          )}
        </Field>
      </div>
    </ConfirmDialog>
  );
}

function Materials() {
  const { t } = useTranslation();
  const { data: user } = useSession();
  const isOwner = user?.role === "OWNER" || user?.role === "SUPER_ADMIN";
  const materials = useMaterials();
  const [adding, setAdding] = useState(false);
  const [buying, setBuying] = useState<StockMaterial | null>(null);

  return (
    <div className="space-y-3">
      {isOwner && !adding ? (
        <Button size="sm" onClick={() => setAdding(true)}>
          {t("stock.addMaterial")}
        </Button>
      ) : null}
      {adding ? <AddMaterialForm onDone={() => setAdding(false)} /> : null}

      {materials.isPending ? (
        <p className="text-slate-500">{t("common.loading")}</p>
      ) : materials.data?.length === 0 && !adding ? (
        <p className="rounded-2xl bg-white p-6 text-center text-slate-500 ring-1 ring-slate-200">
          {t("stock.empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {materials.data?.map((material) => (
            <li
              key={material.id}
              className={cn(
                "flex items-center justify-between gap-4 rounded-2xl bg-white p-4 ring-1",
                material.isLow ? "ring-amber-300" : "ring-slate-200",
              )}
            >
              <div className="min-w-0 space-y-0.5">
                <p className="flex items-center gap-2 font-medium">
                  <span className="truncate">{material.name}</span>
                  {material.isLow ? (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      {t("stock.low")}
                    </span>
                  ) : null}
                </p>
                <p className="text-lg font-semibold tabular-nums">
                  {formatQuantity(material.onHandMilli, material.unit, t)}
                </p>
                <p className="text-sm text-slate-500">
                  {material.averageUnitPricePaise === null
                    ? t("stock.noPrice")
                    : t("stock.avgPrice", {
                        price: formatAmount(material.averageUnitPricePaise),
                        unit: t(`unitName.${material.unit}`),
                      })}
                  {material.valuePaise !== null && material.onHandMilli > 0
                    ? ` · ${t("stock.value", { amount: formatAmount(material.valuePaise) })}`
                    : ""}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setBuying(material)}>
                {t("stock.buy")}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {buying ? <BuyDialog material={buying} onClose={() => setBuying(null)} /> : null}
    </div>
  );
}

function FinishedSarees() {
  const { t, i18n } = useTranslation();
  const sarees = useFinishedSarees();
  const setStatus = useSetSaleStatus();
  const [filter, setFilter] = useState<FinishedSareeStatus | "ALL">("IN_STOCK");

  const shown = (sarees.data ?? []).filter(
    (saree) => filter === "ALL" || saree.saleStatus === filter,
  );

  const chips: { value: FinishedSareeStatus | "ALL"; label: string }[] = [
    { value: "IN_STOCK", label: t("finished.IN_STOCK") },
    { value: "SOLD", label: t("finished.SOLD") },
    { value: "ALL", label: t("finished.all") },
  ];

  return (
    <div className="space-y-3">
      <fieldset className="flex min-w-0 flex-wrap gap-2">
        {chips.map((chip) => (
          <button
            key={chip.value}
            type="button"
            aria-pressed={filter === chip.value}
            onClick={() => setFilter(chip.value)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition",
              filter === chip.value
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100",
            )}
          >
            {chip.label}
            {chip.value !== "ALL"
              ? ` (${(sarees.data ?? []).filter((saree) => saree.saleStatus === chip.value).length})`
              : ""}
          </button>
        ))}
      </fieldset>

      {sarees.isPending ? (
        <p className="text-slate-500">{t("common.loading")}</p>
      ) : shown.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-center text-slate-500 ring-1 ring-slate-200">
          {t("finished.empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((saree) => {
            const name = saree.label ?? saree.sareeType?.name;
            const loom = t("looms.label", { number: saree.loom.number });
            const total =
              saree.materialCostPaise !== null && saree.labourCostPaise !== null
                ? saree.materialCostPaise + saree.labourCostPaise
                : null;

            return (
              <li
                key={saree.id}
                className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {name ? `${name} · ${loom}` : loom}
                    </p>
                    <p className="truncate text-sm text-slate-500">
                      {saree.workers.map((worker) => worker.name).join(" · ")}
                    </p>
                    {saree.finishedAt ? (
                      <p className="text-xs text-slate-400">
                        {t("finished.finishedOn", {
                          date: new Date(saree.finishedAt).toLocaleDateString(
                            i18n.resolvedLanguage,
                            { day: "numeric", month: "short", year: "numeric" },
                          ),
                        })}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-3 py-1 text-xs font-medium",
                      saree.saleStatus === "SOLD"
                        ? "bg-slate-100 text-slate-600"
                        : "bg-emerald-50 text-emerald-700",
                    )}
                  >
                    {t(`finished.${saree.saleStatus ?? "IN_STOCK"}`)}
                  </span>
                </div>

                <dl className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <dt className="text-slate-500">{t("finished.materialCost")}</dt>
                    <dd className="font-medium tabular-nums">
                      {saree.materialCostPaise === null
                        ? t("finished.unknown")
                        : formatAmount(saree.materialCostPaise)}
                    </dd>
                  </div>
                  {saree.labourCostPaise !== null ? (
                    <>
                      <div>
                        <dt className="text-slate-500">{t("finished.labourCost")}</dt>
                        <dd className="font-medium tabular-nums">
                          {formatAmount(saree.labourCostPaise)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">{t("finished.totalCost")}</dt>
                        <dd className="font-semibold tabular-nums">
                          {total === null ? t("finished.unknown") : formatAmount(total)}
                        </dd>
                      </div>
                    </>
                  ) : null}
                </dl>

                <Button
                  size="sm"
                  variant="outline"
                  disabled={setStatus.isPending}
                  onClick={() =>
                    setStatus.mutate({
                      sareeJobId: saree.id,
                      status: saree.saleStatus === "SOLD" ? "IN_STOCK" : "SOLD",
                    })
                  }
                >
                  {saree.saleStatus === "SOLD"
                    ? t("finished.markInStock")
                    : t("finished.markSold")}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function Stock() {
  const { t } = useTranslation();
  const [section, setSection] = useState<"materials" | "finished">("materials");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t("stock.title")}</h1>

      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1" role="tablist">
        {(["materials", "finished"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={section === value}
            onClick={() => setSection(value)}
            className={cn(
              "rounded-lg py-2 text-sm font-medium transition",
              section === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-600",
            )}
          >
            {t(value === "materials" ? "stock.materials" : "stock.finished")}
          </button>
        ))}
      </div>

      {section === "materials" ? <Materials /> : <FinishedSarees />}
    </div>
  );
}
