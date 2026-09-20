import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { WAGE_TYPES, phoneSchema, type WageType } from "@loom/shared";

import { Button } from "@/components/ui/button.js";
import { Field, FormError, Input } from "@/components/ui/field.js";
import { apiFetch, apiPost } from "@/lib/api.js";
import { useApiErrorMessage } from "@/lib/useApiErrorMessage.js";

type Worker = {
  id: string;
  name: string;
  phone: string | null;
  wageType: WageType;
  trusted: boolean;
  active: boolean;
  userId: string | null;
};

const emptyForm = { name: "", phone: "", pin: "", wageType: "PER_SAREE" as WageType };

function AddWorkerForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toMessage = useApiErrorMessage();
  const [form, setForm] = useState(emptyForm);
  const [phoneError, setPhoneError] = useState<string>();

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiPost("/api/workers", payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workers"] });
      setForm(emptyForm);
      onDone();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();

    let phone: string | undefined;
    if (form.phone.trim()) {
      const parsed = phoneSchema.safeParse(form.phone);
      if (!parsed.success) {
        setPhoneError(parsed.error.issues[0]?.message);
        return;
      }
      phone = parsed.data;
    }
    setPhoneError(undefined);

    create.mutate({
      name: form.name.trim(),
      wageType: form.wageType,
      trusted: false,
      ...(phone ? { phone } : {}),
      ...(form.pin.trim() ? { pin: form.pin.trim() } : {}),
    });
  };

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200"
    >
      <FormError>{toMessage(create.error)}</FormError>

      <Field label={t("workers.name")}>
        {(props) => (
          <Input
            {...props}
            required
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        )}
      </Field>

      <Field label={`${t("workers.phone")} (${t("common.optional")})`} error={phoneError}>
        {(props) => (
          <Input
            {...props}
            type="tel"
            inputMode="numeric"
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
          />
        )}
      </Field>

      <Field label={t("workers.wageType")}>
        {(props) => (
          <select
            {...props}
            value={form.wageType}
            onChange={(event) =>
              setForm({ ...form, wageType: event.target.value as WageType })
            }
            className="h-12 w-full rounded-xl bg-white px-4 text-base ring-1 ring-slate-300 focus:ring-2 focus:ring-slate-900 focus:outline-none"
          >
            {WAGE_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`wageType.${type}`)}
              </option>
            ))}
          </select>
        )}
      </Field>

      <Field label={t("workers.pin")} hint={t("workers.pinHint")}>
        {(props) => (
          <Input
            {...props}
            inputMode="numeric"
            value={form.pin}
            onChange={(event) => setForm({ ...form, pin: event.target.value })}
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

export function Workers() {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);

  const workers = useQuery({
    queryKey: ["workers"],
    queryFn: () => apiFetch<{ workers: Worker[] }>("/api/workers"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("workers.title")}</h1>
        {!adding ? (
          <Button size="sm" onClick={() => setAdding(true)}>
            {t("workers.add")}
          </Button>
        ) : null}
      </div>

      {adding ? <AddWorkerForm onDone={() => setAdding(false)} /> : null}

      {workers.isPending ? (
        <p className="text-slate-500">{t("common.loading")}</p>
      ) : workers.data?.workers.length === 0 && !adding ? (
        <p className="rounded-2xl bg-white p-6 text-center text-slate-500 ring-1 ring-slate-200">
          {t("workers.empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {workers.data?.workers.map((worker) => (
            <li
              key={worker.id}
              className="flex items-center justify-between gap-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{worker.name}</p>
                <p className="truncate text-sm text-slate-500">
                  {t(`wageType.${worker.wageType}`)}
                  {worker.phone ? ` · ${worker.phone}` : ""}
                </p>
              </div>
              <span
                className={
                  worker.userId
                    ? "shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
                    : "shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500"
                }
              >
                {worker.userId ? t("workers.hasLogin") : t("workers.noLogin")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
