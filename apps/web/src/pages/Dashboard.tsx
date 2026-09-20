import { useTranslation } from "react-i18next";

import { useSession } from "@/lib/session.js";

export function Dashboard() {
  const { t } = useTranslation();
  const { data: user } = useSession();

  if (!user) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        {t("dashboard.greeting", { name: user.name })}
      </h1>

      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <dt className="text-sm text-slate-500">{t("dashboard.factory")}</dt>
          <dd className="mt-1 font-medium">{user.factory?.name ?? "—"}</dd>
        </div>
        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <dt className="text-sm text-slate-500">{t("dashboard.yourRole")}</dt>
          <dd className="mt-1 font-medium">{t(`role.${user.role}`)}</dd>
        </div>
        {user.worker ? (
          <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <dt className="text-sm text-slate-500">{t("workers.wageType")}</dt>
            <dd className="mt-1 font-medium">{t(`wageType.${user.worker.wageType}`)}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
