import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { describeBalance } from "@loom/shared";

import { cn } from "@/lib/cn.js";
import type { Passbook, PassbookLine, SareeAccount } from "@/lib/passbook.js";
import { formatAmount, formatSignedPaise } from "@/lib/rupees.js";

export type Perspective = "owner" | "weaver";

const DOT = {
  OWNER_OWES: "bg-amber-500",
  WORKER_OWES: "bg-sky-500",
  SETTLED: "bg-emerald-500",
} as const;

/** "You owe ₹5,000" to the owner, "Owner owes you ₹5,000" to the weaver. */
export function BalanceText({
  amountPaise,
  perspective,
  className,
}: {
  amountPaise: number;
  perspective: Perspective;
  className?: string;
}) {
  const { t } = useTranslation();
  const { direction, amount } = describeBalance(amountPaise);

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className={cn("size-2 shrink-0 rounded-full", DOT[direction])} aria-hidden />
      {t(`passbook.${perspective}.${direction}`, { amount: formatAmount(amount) })}
    </span>
  );
}

function sareeName(saree: SareeAccount | undefined, t: TFunction) {
  if (!saree) return null;
  const loom = t("looms.label", { number: saree.loomNumber });
  return saree.label ? `${saree.label} · ${loom}` : loom;
}

type Group = { id: string; createdAt: string; lines: PassbookLine[] };

/** Lines written by one action are shown as one row. */
function groupLines(lines: PassbookLine[]): Group[] {
  const groups: Group[] = [];
  const byId = new Map<string, Group>();
  for (const line of lines) {
    let group = byId.get(line.groupId);
    if (!group) {
      group = { id: line.groupId, createdAt: line.createdAt, lines: [] };
      byId.set(line.groupId, group);
      groups.push(group);
    }
    group.lines.push(line);
  }
  return groups;
}

function sum(lines: PassbookLine[], predicate: (line: PassbookLine) => boolean) {
  return lines.filter(predicate).reduce((total, line) => total + line.amountPaise, 0);
}

function HistoryRow({
  group,
  sarees,
}: {
  group: Group;
  sarees: Map<string, SareeAccount>;
}) {
  const { t, i18n } = useTranslation();
  const kinds = new Set(group.lines.map((line) => line.kind));

  let title: string;
  let detail: string | null = null;

  if (kinds.has("PAYMENT_CASH") || kinds.has("PAYMENT_BY_ADVANCE_CUT")) {
    const cash = -sum(group.lines, (line) => line.kind === "PAYMENT_CASH");
    const cut = -sum(group.lines, (line) => line.kind === "PAYMENT_BY_ADVANCE_CUT");
    title = t("passbook.line.payment", { amount: formatAmount(cash + cut) });
    if (cut > 0) {
      detail = t("passbook.line.paymentSplit", {
        cash: formatAmount(cash),
        cut: formatAmount(cut),
      });
    }
  } else if (kinds.has("ADVANCE_GIVEN")) {
    title = t("passbook.line.advanceGiven");
  } else if (kinds.has("OLD_BALANCE_SETTLED")) {
    title = t("passbook.line.settled");
  } else if (kinds.has("SHIFT_ADJUSTMENT") || kinds.has("CARRIED_OVER")) {
    title = t("passbook.line.shift");
  } else if (kinds.has("WORK_EARNED")) {
    title = group.lines.some((line) => line.productionEntryId)
      ? t("passbook.line.inches")
      : t("passbook.line.wage");
  } else {
    title = t("passbook.line.other");
  }

  const sareeId = group.lines.find((line) => line.sareeJobId)?.sareeJobId;
  const where = sareeId ? sareeName(sarees.get(sareeId), t) : null;

  const currentWork = sum(group.lines, (line) => line.section === "CURRENT_WORK");
  const oldBalance = sum(group.lines, (line) => line.section === "OLD_BALANCE");
  const note = group.lines.find((line) => line.note)?.note;

  return (
    <li className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0 space-y-0.5">
        <p className="font-medium">{title}</p>
        {detail ? <p className="text-sm text-slate-600">{detail}</p> : null}
        {where ? <p className="text-sm break-words text-slate-500">{where}</p> : null}
        {note ? <p className="text-sm text-slate-500 italic">{note}</p> : null}
        <p className="text-xs text-slate-400">
          {new Date(group.createdAt).toLocaleDateString(i18n.resolvedLanguage, {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </p>
      </div>
      <div className="shrink-0 space-y-0.5 text-right text-sm">
        {currentWork !== 0 ? (
          <p>
            <span className="text-slate-500">{t("passbook.currentWork")} </span>
            <span className="font-medium tabular-nums">{formatSignedPaise(currentWork)}</span>
          </p>
        ) : null}
        {oldBalance !== 0 ? (
          <p>
            <span className="text-slate-500">{t("passbook.oldBalance")} </span>
            <span className="font-medium tabular-nums">{formatSignedPaise(oldBalance)}</span>
          </p>
        ) : null}
      </div>
    </li>
  );
}

export function PassbookView({
  passbook,
  perspective,
  historyLimit,
}: {
  passbook: Passbook;
  perspective: Perspective;
  /** Show only the most recent actions, for a shared statement. */
  historyLimit?: number;
}) {
  const { t } = useTranslation();
  const sarees = new Map(passbook.currentWork.map((saree) => [saree.sareeJobId, saree]));

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <p className="text-sm text-slate-500">{t("passbook.total")}</p>
        <BalanceText
          amountPaise={passbook.netPaise}
          perspective={perspective}
          className="mt-1 text-2xl font-semibold"
        />
      </section>

      <section className="space-y-3 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <div>
          <h2 className="font-medium">{t("passbook.currentWork")}</h2>
          <p className="text-sm text-slate-500">{t("passbook.currentWorkHint")}</p>
        </div>
        {passbook.currentWork.length === 0 ? (
          <p className="text-sm text-slate-500">{t("passbook.noSarees")}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {passbook.currentWork.map((saree) => (
              <li
                key={saree.sareeJobId}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{sareeName(saree, t)}</p>
                  <p className="text-sm text-slate-500">
                    {t(`wageType.${saree.wageType}`)}
                    {!saree.stillOnIt
                      ? ` · ${t("passbook.shiftedOff")}`
                      : saree.status === "FINISHED"
                        ? ` · ${t("passbook.finished")}`
                        : ""}
                  </p>
                </div>
                <BalanceText amountPaise={saree.balancePaise} perspective={perspective} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="font-medium">{t("passbook.oldBalance")}</h2>
        <p className="text-sm text-slate-500">
          {t(perspective === "owner" ? "passbook.oldBalanceHint" : "passbook.oldBalanceHintWeaver")}
        </p>
        <BalanceText
          amountPaise={passbook.oldBalancePaise}
          perspective={perspective}
          className="pt-1 font-medium"
        />
      </section>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="font-medium">{t("passbook.history")}</h2>
        {passbook.lines.length === 0 ? (
          <p className="pt-2 text-sm text-slate-500">{t("passbook.noHistory")}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {groupLines(passbook.lines)
              .slice(0, historyLimit ?? Number.POSITIVE_INFINITY)
              .map((group) => (
                <HistoryRow key={group.id} group={group} sarees={sarees} />
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}
