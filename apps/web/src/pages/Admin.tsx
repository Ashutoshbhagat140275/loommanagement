import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button.js";
import { ConfirmDialog } from "@/components/ui/confirm-dialog.js";
import { FormError } from "@/components/ui/field.js";
import { apiFetch, apiPost } from "@/lib/api.js";
import { cn } from "@/lib/cn.js";
import { useApiErrorMessage } from "@/lib/useApiErrorMessage.js";

type AdminFactory = {
  id: string;
  name: string;
  phone: string | null;
  plan: "FREE";
  suspendedAt: string | null;
  createdAt: string;
  owner: { name: string; email: string | null } | null;
  workers: number;
  looms: number;
  runningSarees: number;
  lastActiveAt: string | null;
};

/**
 * Every factory on the app, for the super admin. Counts and dates only: the
 * super admin never sees a factory's wages or passbooks.
 */
export function Admin() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const toMessage = useApiErrorMessage();
  const [pausing, setPausing] = useState<AdminFactory | null>(null);

  const factories = useQuery({
    queryKey: ["admin-factories"],
    queryFn: () =>
      apiFetch<{ factories: AdminFactory[] }>("/api/admin/factories").then(
        (result) => result.factories,
      ),
  });

  const setPaused = useMutation({
    mutationFn: (input: { id: string; pause: boolean }) =>
      apiPost(`/api/admin/factories/${input.id}/${input.pause ? "suspend" : "resume"}`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-factories"] }),
  });

  const date = (value: string | null) =>
    value
      ? new Date(value).toLocaleDateString(i18n.resolvedLanguage, {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : t("admin.never");

  const list = factories.data ?? [];
  const active = list.filter((factory) => !factory.suspendedAt).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("admin.title")}</h1>
        <p className="text-sm text-slate-500">
          {t("admin.counts", { count: list.length, active })}
        </p>
      </div>

      <FormError>{toMessage(setPaused.error ?? factories.error)}</FormError>

      {factories.isPending ? (
        <p className="text-slate-500">{t("common.loading")}</p>
      ) : list.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-center text-slate-500 ring-1 ring-slate-200">
          {t("admin.empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((factory) => (
            <li
              key={factory.id}
              className={cn(
                "space-y-3 rounded-2xl bg-white p-4 ring-1",
                factory.suspendedAt ? "ring-amber-300" : "ring-slate-200",
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">{factory.name}</p>
                  <p className="truncate text-sm text-slate-500">
                    {factory.owner
                      ? `${factory.owner.name}${factory.owner.email ? ` · ${factory.owner.email}` : ""}`
                      : "—"}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1 text-xs font-medium",
                    factory.suspendedAt
                      ? "bg-amber-100 text-amber-800"
                      : "bg-emerald-50 text-emerald-700",
                  )}
                >
                  {factory.suspendedAt ? t("admin.paused") : t(`admin.plan.${factory.plan}`)}
                </span>
              </div>

              <dl className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <dt className="text-slate-500">{t("nav.looms")}</dt>
                  <dd className="font-medium tabular-nums">{factory.looms}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">{t("nav.workers")}</dt>
                  <dd className="font-medium tabular-nums">{factory.workers}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">{t("admin.running")}</dt>
                  <dd className="font-medium tabular-nums">{factory.runningSarees}</dd>
                </div>
              </dl>

              <p className="text-xs text-slate-500">
                {t("admin.joined", { date: date(factory.createdAt) })} ·{" "}
                {t("admin.lastActive", { date: date(factory.lastActiveAt) })}
              </p>

              {factory.suspendedAt ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={setPaused.isPending}
                  onClick={() => setPaused.mutate({ id: factory.id, pause: false })}
                >
                  {t("admin.resume")}
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setPausing(factory)}>
                  {t("admin.pause")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pausing !== null}
        title={t("admin.pauseTitle", { name: pausing?.name ?? "" })}
        confirmLabel={t("admin.pause")}
        cancelLabel={t("common.cancel")}
        tone="danger"
        busy={setPaused.isPending}
        onCancel={() => setPausing(null)}
        onConfirm={() =>
          pausing &&
          setPaused.mutate(
            { id: pausing.id, pause: true },
            { onSuccess: () => setPausing(null) },
          )
        }
      >
        {t("admin.pauseBody")}
      </ConfirmDialog>
    </div>
  );
}
