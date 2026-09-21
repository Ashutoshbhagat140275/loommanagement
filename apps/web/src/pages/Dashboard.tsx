import { Link } from "react-router";
import { useTranslation } from "react-i18next";

import { OutboxBanner } from "@/components/OutboxBanner.js";
import { PassbookShare } from "@/components/PassbookShare.js";
import { BalanceText, PassbookView } from "@/components/PassbookView.js";
import { useMyPassbook, usePassbookSummary } from "@/lib/passbook.js";
import { formatAmount } from "@/lib/rupees.js";
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
      <div className="space-y-4">
        <div className="print:hidden">
          <OutboxBanner />
        </div>
        <MyPassbook />
        <p className="rounded-2xl bg-white p-6 text-center text-slate-500 ring-1 ring-slate-200 print:hidden">
          {t("entry.noSaree")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <OutboxBanner />
      </div>
      <MyPassbook />
      {list.map((job) => (
        <section
          key={job.id}
          className="space-y-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200 print:hidden"
        >
          <div>
            <p className="font-medium">
              {job.label ?? t("looms.label", { number: job.loom.number })}
            </p>
            {job.label ? (
              <p className="text-sm text-slate-500">
                {t("looms.label", { number: job.loom.number })}
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

/** What the owner owes across everyone, and what is out on advance. */
function MoneySummary() {
  const { t } = useTranslation();
  const summary = usePassbookSummary();

  if (!summary.data) return null;

  const tiles = [
    { label: t("summary.currentWork"), amount: summary.data.currentWorkPaise },
    { label: t("summary.advancesOut"), amount: summary.data.advancesOutPaise },
    { label: t("summary.oldBalanceOwed"), amount: summary.data.oldBalanceOwedPaise },
  ];

  return (
    <section className="space-y-2">
      <h2 className="font-medium">{t("summary.title")}</h2>
      <dl className="grid gap-3 sm:grid-cols-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <dt className="text-sm text-slate-500">{tile.label}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">
              {formatAmount(tile.amount)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function OwnerHome() {
  const { t } = useTranslation();
  const { data: user } = useSession();
  if (!user) return null;

  return (
    <div className="space-y-6">
      {user.role === "OWNER" || user.role === "SUPER_ADMIN" ? <MoneySummary /> : null}

      <Link
        to="/reports"
        className="flex items-center justify-between gap-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200 transition hover:bg-slate-50"
      >
        <div className="min-w-0">
          <p className="font-medium">{t("dashboard.reports")}</p>
          <p className="text-sm text-slate-500">{t("dashboard.reportsHint")}</p>
        </div>
        <span aria-hidden className="text-slate-400">
          ›
        </span>
      </Link>

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
    </div>
  );
}

/**
 * The weaver's own passbook, folded away under the entry forms: the forms are
 * what they come to the app for, the balance is what they check now and then.
 * Read online only; stale money numbers would do more harm than none.
 */
function MyPassbook() {
  const { t } = useTranslation();
  const passbook = useMyPassbook();

  if (!passbook.data) return null;

  return (
    <>
    <details className="group rounded-2xl bg-white ring-1 ring-slate-200 print:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4">
        <div className="min-w-0">
          <p className="text-sm text-slate-500">{t("passbook.mine")}</p>
          <BalanceText
            amountPaise={passbook.data.netPaise}
            perspective="weaver"
            className="mt-0.5 font-semibold"
          />
        </div>
        <span aria-hidden className="text-slate-400 transition group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="border-t border-slate-100 p-4">
        <PassbookView passbook={passbook.data} perspective="weaver" />
      </div>
    </details>
    <PassbookShare passbook={passbook.data} perspective="weaver" />
    </>
  );
}

export function Dashboard() {
  const { t } = useTranslation();
  const { data: user } = useSession();

  if (!user) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight print:hidden">
        {t("dashboard.greeting", { name: user.name })}
      </h1>
      {user.role === "WORKER" ? <WeaverHome /> : <OwnerHome />}
    </div>
  );
}
