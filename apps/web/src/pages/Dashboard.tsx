import { useTranslation } from "react-i18next";

import { ProgressBar } from "@/components/ProgressBar.js";
import { WeeklyEntryForm } from "@/components/WeeklyEntryForm.js";
import { useMySareeJobs } from "@/lib/production.js";
import { useSession } from "@/lib/session.js";

/** What a weaver sees: their loom, how far the saree has come, and one form. */
function WeaverHome() {
  const { t } = useTranslation();
  const jobs = useMySareeJobs();

  if (jobs.isPending) return <p className="text-slate-500">{t("common.loading")}</p>;

  const list = jobs.data?.sareeJobs ?? [];
  if (list.length === 0) {
    return (
      <p className="rounded-2xl bg-white p-6 text-center text-slate-500 ring-1 ring-slate-200">
        {t("entry.noSaree")}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {list.map((job) => (
        <section key={job.id} className="space-y-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <div>
            <p className="font-medium">
              {job.label ?? `${t("looms.number")} ${job.loom.number}`}
            </p>
            {job.label ? (
              <p className="text-sm text-slate-500">
                {t("looms.number")} {job.loom.number}
              </p>
            ) : null}
          </div>

          <ProgressBar
            done={job.inchesDone}
            total={job.lengthInches}
            label={t("saree.progress", {
              done: job.inchesDone,
              total: job.lengthInches,
            })}
          />

          <div className="border-t border-slate-200 pt-4">
            <h2 className="mb-3 font-medium">{t("entry.title")}</h2>
            <WeeklyEntryForm sareeJobId={job.id} />
          </div>

          {job.entries.length > 0 ? (
            <div className="border-t border-slate-200 pt-4">
              <h3 className="mb-2 text-sm font-medium text-slate-700">
                {t("entry.history")}
              </h3>
              <ul className="space-y-1 text-sm">
                {job.entries.map((entry) => (
                  <li key={entry.weekStart} className="flex justify-between gap-4">
                    <span className="text-slate-600">{entry.weekStart}</span>
                    <span>
                      {entry.inches}&nbsp;
                      <span className="text-slate-500">
                        {entry.status === "APPROVED"
                          ? t("entry.approved")
                          : t("entry.waiting")}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}

function OwnerHome() {
  const { t } = useTranslation();
  const { data: user } = useSession();
  if (!user) return null;

  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <dt className="text-sm text-slate-500">{t("dashboard.factory")}</dt>
        <dd className="mt-1 font-medium">{user.factory?.name ?? "—"}</dd>
      </div>
      <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <dt className="text-sm text-slate-500">{t("dashboard.yourRole")}</dt>
        <dd className="mt-1 font-medium">{t(`role.${user.role}`)}</dd>
      </div>
    </dl>
  );
}

export function Dashboard() {
  const { t } = useTranslation();
  const { data: user } = useSession();

  if (!user) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        {t("dashboard.greeting", { name: user.name })}
      </h1>
      {user.role === "WORKER" ? <WeaverHome /> : <OwnerHome />}
    </div>
  );
}
