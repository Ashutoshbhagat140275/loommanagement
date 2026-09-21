import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import {
  DEFAULT_SAREE_LENGTH_INCHES,
  formatPaise,
  fromRupees,
  paise,
} from "@loom/shared";

import { Button } from "@/components/ui/button.js";
import { Field, FormError, Input } from "@/components/ui/field.js";
import { useCreateSareeType, useSareeTypes } from "@/lib/production.js";
import { useApiErrorMessage } from "@/lib/useApiErrorMessage.js";

function rupeesToPaise(value: string): number | undefined {
  const text = value.trim();
  if (!text) return undefined;
  try {
    return fromRupees(text);
  } catch {
    return undefined;
  }
}

function AddSareeTypeForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const create = useCreateSareeType();
  const toMessage = useApiErrorMessage();

  const [name, setName] = useState("");
  const [lengthInches, setLengthInches] = useState(String(DEFAULT_SAREE_LENGTH_INCHES));
  const [wage, setWage] = useState("");
  const [ratePerInch, setRatePerInch] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const wagePaise = rupeesToPaise(wage);
    const ratePaise = rupeesToPaise(ratePerInch);

    create.mutate(
      {
        name: name.trim(),
        lengthInches: Number(lengthInches),
        ...(wagePaise === undefined ? {} : { defaultWagePaise: wagePaise }),
        ...(ratePaise === undefined ? {} : { defaultRatePerInchPaise: ratePaise }),
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

      <Field label={t("sareeTypes.name")}>
        {(props) => (
          <Input
            {...props}
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        )}
      </Field>

      <Field label={t("sareeTypes.length")}>
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

      <Field label={t("sareeTypes.wage")} hint={t("sareeTypes.amountHint")}>
        {(props) => (
          <Input
            {...props}
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={wage}
            onChange={(event) => setWage(event.target.value)}
          />
        )}
      </Field>

      <Field label={t("sareeTypes.ratePerInch")}>
        {(props) => (
          <Input
            {...props}
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={ratePerInch}
            onChange={(event) => setRatePerInch(event.target.value)}
          />
        )}
      </Field>

      <div className="flex gap-3">
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? t("common.loading") : t("common.save")}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}

export function SareeTypes() {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const sareeTypes = useSareeTypes();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/looms" className="text-sm text-slate-500 underline">
            {t("looms.title")}
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("sareeTypes.title")}
          </h1>
        </div>
        {!adding ? (
          <Button size="sm" onClick={() => setAdding(true)}>
            {t("sareeTypes.add")}
          </Button>
        ) : null}
      </div>

      {adding ? <AddSareeTypeForm onDone={() => setAdding(false)} /> : null}

      {sareeTypes.isPending ? (
        <p className="text-slate-500">{t("common.loading")}</p>
      ) : sareeTypes.data?.sareeTypes.length === 0 && !adding ? (
        <p className="rounded-2xl bg-white p-6 text-center text-slate-500 ring-1 ring-slate-200">
          {t("sareeTypes.empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {sareeTypes.data?.sareeTypes.map((sareeType) => (
            <li
              key={sareeType.id}
              className="flex items-center justify-between gap-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{sareeType.name}</p>
                <p className="text-sm text-slate-500">{sareeType.lengthInches} inch</p>
              </div>
              <p className="shrink-0 text-sm text-slate-600">
                {sareeType.defaultWagePaise !== null
                  ? formatPaise(paise(sareeType.defaultWagePaise))
                  : sareeType.defaultRatePerInchPaise !== null
                    ? `${formatPaise(paise(sareeType.defaultRatePerInchPaise))} / inch`
                    : "—"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
