import { useState } from "react";
import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";

import { PassbookView } from "@/components/PassbookView.js";
import { Button } from "@/components/ui/button.js";
import { ConfirmDialog } from "@/components/ui/confirm-dialog.js";
import { Field, FormError, Input, Select } from "@/components/ui/field.js";
import {
  useGiveAdvance,
  usePassbook,
  usePayWorker,
  useSettleOldBalance,
  type Passbook,
} from "@/lib/passbook.js";
import { formatAmount, parseRupees } from "@/lib/rupees.js";
import { useApiErrorMessage } from "@/lib/useApiErrorMessage.js";

function RupeeInput({
  value,
  onChange,
  ...props
}: {
  value: string;
  onChange: (value: string) => void;
  id: string;
  "aria-invalid": boolean;
  "aria-describedby": string | undefined;
}) {
  return (
    <Input
      {...props}
      type="number"
      inputMode="decimal"
      min={0}
      step="0.01"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function AdvanceDialog({
  passbook,
  open,
  onClose,
}: {
  passbook: Passbook;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const give = useGiveAdvance(passbook.worker.id);
  const toMessage = useApiErrorMessage();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [amountError, setAmountError] = useState<string>();

  const close = () => {
    setAmount("");
    setNote("");
    setAmountError(undefined);
    give.reset();
    onClose();
  };

  const confirm = () => {
    const amountPaise = parseRupees(amount);
    if (amountPaise === null || amountPaise <= 0) {
      setAmountError(t("passbook.errors.badAmount"));
      return;
    }
    setAmountError(undefined);
    give.mutate(
      { amountPaise, ...(note.trim() ? { note: note.trim() } : {}) },
      { onSuccess: close },
    );
  };

  return (
    <ConfirmDialog
      open={open}
      title={t("passbook.advanceTitle", { name: passbook.worker.name })}
      confirmLabel={t("passbook.giveAdvance")}
      cancelLabel={t("common.cancel")}
      busy={give.isPending}
      onConfirm={confirm}
      onCancel={close}
    >
      <div className="space-y-4">
        <FormError>{toMessage(give.error)}</FormError>
        <p className="text-sm">{t("passbook.advanceHint")}</p>
        <Field label={t("passbook.amount")} error={amountError}>
          {(props) => <RupeeInput {...props} value={amount} onChange={setAmount} />}
        </Field>
        <Field label={`${t("passbook.note")} (${t("common.optional")})`}>
          {(props) => (
            <Input {...props} value={note} onChange={(event) => setNote(event.target.value)} />
          )}
        </Field>
      </div>
    </ConfirmDialog>
  );
}

/**
 * The payment form the owner described in planning: the amount for the work,
 * how much of it to cut from the advance, and the cash to hand over worked out
 * for him.
 */
function PayDialog({
  passbook,
  open,
  onClose,
}: {
  passbook: Passbook;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const pay = usePayWorker(passbook.worker.id);
  const toMessage = useApiErrorMessage();

  const defaultSaree =
    passbook.currentWork.find((saree) => saree.stillOnIt && saree.status === "RUNNING") ??
    passbook.currentWork[0];

  const [sareeJobId, setSareeJobId] = useState(defaultSaree?.sareeJobId ?? "");
  const [amount, setAmount] = useState("");
  const [cut, setCut] = useState("0");
  const [note, setNote] = useState("");
  const [amountError, setAmountError] = useState<string>();
  const [cutError, setCutError] = useState<string>();

  const advanceOwed = Math.max(0, -passbook.oldBalancePaise);
  const amountPaise = parseRupees(amount) ?? 0;
  const cutPaise = advanceOwed > 0 ? (parseRupees(cut) ?? 0) : 0;
  const cashPaise = Math.max(0, amountPaise - cutPaise);

  const close = () => {
    setAmount("");
    setCut("0");
    setNote("");
    setAmountError(undefined);
    setCutError(undefined);
    pay.reset();
    onClose();
  };

  const confirm = () => {
    const parsedAmount = parseRupees(amount);
    if (parsedAmount === null || parsedAmount <= 0) {
      setAmountError(t("passbook.errors.badAmount"));
      return;
    }
    setAmountError(undefined);

    if (cutPaise > parsedAmount || cutPaise > advanceOwed) {
      setCutError(t("passbook.errors.CUT_MORE_THAN_ADVANCE"));
      return;
    }
    setCutError(undefined);

    pay.mutate(
      {
        sareeJobId,
        workAmountPaise: parsedAmount,
        cutForAdvancePaise: cutPaise,
        ...(note.trim() ? { note: note.trim() } : {}),
      },
      { onSuccess: close },
    );
  };

  return (
    <ConfirmDialog
      open={open}
      title={t("passbook.payTitle", { name: passbook.worker.name })}
      confirmLabel={t("passbook.pay")}
      cancelLabel={t("common.cancel")}
      busy={pay.isPending}
      onConfirm={confirm}
      onCancel={close}
    >
      <div className="space-y-4">
        <FormError>{toMessage(pay.error)}</FormError>

        {passbook.currentWork.length > 1 ? (
          <Field label={t("passbook.paySaree")}>
            {(props) => (
              <Select
                {...props}
                value={sareeJobId}
                onChange={(event) => setSareeJobId(event.target.value)}
              >
                {passbook.currentWork.map((saree) => (
                  <option key={saree.sareeJobId} value={saree.sareeJobId}>
                    {saree.label
                      ? `${saree.label} · ${t("looms.label", { number: saree.loomNumber })}`
                      : t("looms.label", { number: saree.loomNumber })}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}

        <Field label={t("passbook.payAmount")} error={amountError}>
          {(props) => <RupeeInput {...props} value={amount} onChange={setAmount} />}
        </Field>

        {advanceOwed > 0 ? (
          <Field
            label={t("passbook.payCut")}
            hint={t("passbook.payCutHint", { amount: formatAmount(advanceOwed) })}
            error={cutError}
          >
            {(props) => <RupeeInput {...props} value={cut} onChange={setCut} />}
          </Field>
        ) : (
          <p className="text-sm text-slate-500">{t("passbook.payNoAdvance")}</p>
        )}

        <div className="rounded-xl bg-slate-50 px-4 py-3">
          <p className="text-sm text-slate-500">{t("passbook.payCash")}</p>
          <p className="text-xl font-semibold tabular-nums">{formatAmount(cashPaise)}</p>
          {cutPaise > 0 ? (
            <p className="mt-1 text-sm text-slate-600">{t("passbook.payCutCounts")}</p>
          ) : null}
        </div>

        <Field label={`${t("passbook.note")} (${t("common.optional")})`}>
          {(props) => (
            <Input {...props} value={note} onChange={(event) => setNote(event.target.value)} />
          )}
        </Field>
      </div>
    </ConfirmDialog>
  );
}

function SettleDialog({
  passbook,
  open,
  onClose,
}: {
  passbook: Passbook;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const settle = useSettleOldBalance(passbook.worker.id);
  const toMessage = useApiErrorMessage();
  const owed = Math.max(0, passbook.oldBalancePaise);

  const [amount, setAmount] = useState(() => (owed > 0 ? String(owed / 100) : ""));
  const [note, setNote] = useState("");
  const [amountError, setAmountError] = useState<string>();

  const close = () => {
    setNote("");
    setAmountError(undefined);
    settle.reset();
    onClose();
  };

  const confirm = () => {
    const amountPaise = parseRupees(amount);
    if (amountPaise === null || amountPaise <= 0) {
      setAmountError(t("passbook.errors.badAmount"));
      return;
    }
    if (amountPaise > owed) {
      setAmountError(t("passbook.errors.SETTLE_MORE_THAN_OWED"));
      return;
    }
    setAmountError(undefined);
    settle.mutate(
      { amountPaise, ...(note.trim() ? { note: note.trim() } : {}) },
      { onSuccess: close },
    );
  };

  return (
    <ConfirmDialog
      open={open}
      title={t("passbook.settleTitle", { name: passbook.worker.name })}
      confirmLabel={t("passbook.settle")}
      cancelLabel={t("common.cancel")}
      busy={settle.isPending}
      onConfirm={confirm}
      onCancel={close}
    >
      <div className="space-y-4">
        <FormError>{toMessage(settle.error)}</FormError>
        <p className="text-sm">{t("passbook.settleHint", { amount: formatAmount(owed) })}</p>
        <Field label={t("passbook.amount")} error={amountError}>
          {(props) => <RupeeInput {...props} value={amount} onChange={setAmount} />}
        </Field>
        <Field label={`${t("passbook.note")} (${t("common.optional")})`}>
          {(props) => (
            <Input {...props} value={note} onChange={(event) => setNote(event.target.value)} />
          )}
        </Field>
      </div>
    </ConfirmDialog>
  );
}

export function WorkerProfile() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const passbook = usePassbook(id);
  const toMessage = useApiErrorMessage();

  const [dialog, setDialog] = useState<"advance" | "pay" | "settle" | null>(null);
  const close = () => setDialog(null);

  if (passbook.isPending) return <p className="text-slate-500">{t("common.loading")}</p>;
  if (passbook.isError || !passbook.data) {
    return <FormError>{toMessage(passbook.error)}</FormError>;
  }

  const book = passbook.data;
  const canSettle = book.oldBalancePaise > 0;
  const canPay = book.currentWork.length > 0;

  return (
    <div className="space-y-4">
      <div>
        <Link to="/workers" className="text-sm text-slate-500 underline">
          {t("workers.title")}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("passbook.title", { name: book.worker.name })}
        </h1>
        <p className="text-sm text-slate-500">
          {t(`wageType.${book.worker.wageType}`)}
          {book.worker.phone ? ` · ${book.worker.phone}` : ""}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setDialog("pay")} disabled={!canPay}>
          {t("passbook.pay")}
        </Button>
        <Button variant="outline" onClick={() => setDialog("advance")}>
          {t("passbook.giveAdvance")}
        </Button>
        <Button variant="outline" onClick={() => setDialog("settle")} disabled={!canSettle}>
          {t("passbook.settle")}
        </Button>
      </div>
      {!canPay ? <p className="text-sm text-slate-500">{t("passbook.noSareeToPay")}</p> : null}

      <PassbookView passbook={book} perspective="owner" />

      {/* Keyed so each opening starts from the latest balances. */}
      <AdvanceDialog
        key={`advance-${dialog === "advance"}`}
        passbook={book}
        open={dialog === "advance"}
        onClose={close}
      />
      <PayDialog
        key={`pay-${dialog === "pay"}`}
        passbook={book}
        open={dialog === "pay"}
        onClose={close}
      />
      <SettleDialog
        key={`settle-${dialog === "settle"}-${book.oldBalancePaise}`}
        passbook={book}
        open={dialog === "settle"}
        onClose={close}
      />
    </div>
  );
}
