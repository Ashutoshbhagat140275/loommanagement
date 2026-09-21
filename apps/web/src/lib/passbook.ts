import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LedgerKind, LedgerSection, WageType } from "@loom/shared";

import { apiFetch, apiPost } from "./api.js";

/**
 * The passbook. Online only, on purpose: nothing here goes through the
 * offline outbox. Payments are made where there is internet, and queueing one
 * could leave two different balances for the same weaver.
 */

export type PassbookLine = {
  id: string;
  section: LedgerSection;
  kind: LedgerKind;
  amountPaise: number;
  sareeJobId: string | null;
  productionEntryId: string | null;
  groupId: string;
  note: string | null;
  createdAt: string;
};

export type SareeAccount = {
  sareeJobId: string;
  label: string | null;
  loomNumber: string;
  status: "RUNNING" | "FINISHED";
  wageType: WageType;
  startedAt: string;
  stillOnIt: boolean;
  balancePaise: number;
};

export type Passbook = {
  worker: { id: string; name: string; phone: string | null; wageType: WageType };
  oldBalancePaise: number;
  currentWorkPaise: number;
  netPaise: number;
  currentWork: SareeAccount[];
  lines: PassbookLine[];
};

export type PassbookSummary = {
  currentWorkPaise: number;
  advancesOutPaise: number;
  oldBalanceOwedPaise: number;
};

export type ShiftPreview = {
  wageType: WageType;
  inchesDone: number;
  lengthInches: number;
  sharePaise: number | null;
  earnedPaise: number | null;
  unearnedPaise: number | null;
  paidPaise: number;
  carriedPaise: number;
};

export const usePassbook = (workerId: string) =>
  useQuery({
    queryKey: ["passbook", workerId],
    queryFn: () =>
      apiFetch<{ passbook: Passbook }>(`/api/workers/${workerId}/passbook`).then(
        (result) => result.passbook,
      ),
  });

export const useMyPassbook = () =>
  useQuery({
    queryKey: ["my-passbook"],
    queryFn: () =>
      apiFetch<{ passbook: Passbook }>("/api/my/passbook").then((result) => result.passbook),
  });

export const usePassbookSummary = () =>
  useQuery({
    queryKey: ["passbook-summary"],
    queryFn: () =>
      apiFetch<{ summary: PassbookSummary }>("/api/passbook/summary").then(
        (result) => result.summary,
      ),
  });

export const useShiftPreview = (
  sareeJobId: string,
  workerId: string,
  enabled: boolean,
) =>
  useQuery({
    queryKey: ["shift-preview", sareeJobId, workerId],
    enabled: enabled && Boolean(workerId),
    // A preview of money must never be a stale one.
    staleTime: 0,
    queryFn: () =>
      apiFetch<{ preview: ShiftPreview }>(
        `/api/saree-jobs/${sareeJobId}/shift-preview?workerId=${encodeURIComponent(workerId)}`,
      ).then((result) => result.preview),
  });

function usePassbookMutation<TInput>(
  workerId: string,
  run: (input: TInput) => Promise<unknown>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["passbook", workerId] }),
        queryClient.invalidateQueries({ queryKey: ["passbook-summary"] }),
      ]);
    },
  });
}

export const useGiveAdvance = (workerId: string) =>
  usePassbookMutation(workerId, (input: { amountPaise: number; note?: string }) =>
    apiPost(`/api/workers/${workerId}/advances`, input),
  );

export const usePayWorker = (workerId: string) =>
  usePassbookMutation(
    workerId,
    (input: {
      sareeJobId: string;
      workAmountPaise: number;
      cutForAdvancePaise: number;
      note?: string;
    }) => apiPost(`/api/workers/${workerId}/payments`, input),
  );

export const useSettleOldBalance = (workerId: string) =>
  usePassbookMutation(workerId, (input: { amountPaise: number; note?: string }) =>
    apiPost(`/api/workers/${workerId}/old-balance-settlements`, input),
  );
