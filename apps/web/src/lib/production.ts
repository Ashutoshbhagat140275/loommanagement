import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LoomPlace, LoomStatus, WageType } from "@loom/shared";

import { ApiError, apiFetch, apiPost } from "./api.js";
import { readLastKnown, writeLastKnown } from "./lastKnown.js";

export type Loom = {
  id: string;
  number: string;
  status: LoomStatus;
  place: LoomPlace;
  note: string | null;
};

export type SareeJob = {
  id: string;
  label: string | null;
  lengthInches: number;
  wageType: WageType;
  wagePaise: number | null;
  ratePerInchPaise: number | null;
  status: "RUNNING" | "FINISHED";
  startedAt: string;
  finishedAt: string | null;
  loom: { id: string; number: string; place: LoomPlace };
  sareeType: { id: string; name: string } | null;
  workers: { id: string; name: string }[];
  inchesDone: number;
};

export type ProductionEntry = {
  id: string;
  weekStart: string;
  inches: number;
  ratePerInchPaise: number | null;
  status: "APPROVED" | "AWAITING_OWNER";
  sareeJob: {
    id: string;
    label: string | null;
    lengthInches: number;
    loom: { id: string; number: string };
    workers: { id: string; name: string }[];
  };
};

export type MySareeJob = {
  id: string;
  label: string | null;
  lengthInches: number;
  loom: { id: string; number: string };
  inchesDone: number;
  entries: { weekStart: string; inches: number; status: string }[];
};

/**
 * Everything that changes when production is recorded or approved. That
 * includes passbooks: starting a saree owes its wage, approving an entry pays
 * for its inches, and shifting a weaver settles their share.
 */
function useProductionMutation<TInput>(run: (input: TInput) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: async () => {
      await Promise.all(
        [
          ["saree-jobs"],
          ["my-saree-jobs"],
          ["production-entries"],
          ["looms"],
          ["passbook"],
          ["my-passbook"],
          ["passbook-summary"],
          ["shift-preview"],
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
  });
}

export type SareeType = {
  id: string;
  name: string;
  lengthInches: number;
  defaultWagePaise: number | null;
  defaultRatePerInchPaise: number | null;
};

export type ProductionReport = {
  from: string;
  to: string;
  totalInches: number;
  byWeek: { weekStart: string; inches: number }[];
  byLoom: { loomId: string; number: string; inches: number }[];
  byWorker: { workerId: string; name: string; inches: number }[];
};

export const useLooms = () =>
  useQuery({
    queryKey: ["looms"],
    queryFn: () => apiFetch<{ looms: Loom[] }>("/api/looms"),
  });

export const useSareeJobs = (status: "RUNNING" | "FINISHED" = "RUNNING") =>
  useQuery({
    queryKey: ["saree-jobs", status],
    queryFn: () => apiFetch<{ sareeJobs: SareeJob[] }>(`/api/saree-jobs?status=${status}`),
  });

/**
 * The weaver's own sarees. Falls back to the last copy seen when the server
 * cannot be reached, so the entry form is still usable at a loom with no
 * signal. Owner screens deliberately do not do this: they are used where
 * there is internet, and stale numbers there would be misleading.
 */
export const useMySareeJobs = () =>
  useQuery({
    queryKey: ["my-saree-jobs"],
    retry: false,
    queryFn: async (): Promise<{ sareeJobs: MySareeJob[] }> => {
      try {
        const result = await apiFetch<{ sareeJobs: MySareeJob[] }>(
          "/api/my/saree-jobs",
        );
        writeLastKnown("my-saree-jobs", result);
        return result;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) throw error;
        const cached = readLastKnown<{ sareeJobs: MySareeJob[] }>("my-saree-jobs");
        if (cached) return cached;
        throw error;
      }
    },
  });

export const usePendingEntries = () =>
  useQuery({
    queryKey: ["production-entries", "AWAITING_OWNER"],
    queryFn: () =>
      apiFetch<{ entries: ProductionEntry[] }>(
        "/api/production-entries?status=AWAITING_OWNER",
      ),
  });

export const useSareeTypes = () =>
  useQuery({
    queryKey: ["saree-types"],
    queryFn: () => apiFetch<{ sareeTypes: SareeType[] }>("/api/saree-types"),
  });

export const useProductionReport = (from: string, to: string) =>
  useQuery({
    queryKey: ["reports", "production", from, to],
    queryFn: () =>
      apiFetch<ProductionReport>(
        `/api/reports/production?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
  });

export function useCreateSareeType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => apiPost("/api/saree-types", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["saree-types"] }),
  });
}

/** Take a weaver off a half-done saree, optionally handing it to someone else. */
export const useShiftWorker = () =>
  useProductionMutation(
    (input: {
      sareeJobId: string;
      workerId: string;
      replacementWorkerId?: string;
    }) =>
      apiPost(`/api/saree-jobs/${input.sareeJobId}/shift-worker`, {
        workerId: input.workerId,
        ...(input.replacementWorkerId
          ? { replacementWorkerId: input.replacementWorkerId }
          : {}),
      }),
  );

export const useCreateLoom = () =>
  useProductionMutation((input: { number: string; place: LoomPlace }) =>
    apiPost("/api/looms", input),
  );

export const useStartSareeJob = () =>
  useProductionMutation((input: Record<string, unknown>) =>
    apiPost("/api/saree-jobs", input),
  );

export const useFinishSareeJob = () =>
  useProductionMutation((sareeJobId: string) =>
    apiPost(`/api/saree-jobs/${sareeJobId}/finish`, {}),
  );

export const useFileWeeklyEntry = () =>
  useProductionMutation(
    (input: {
      sareeJobId: string;
      weekStart: string;
      inches: number;
      allowOverflow?: boolean;
    }) =>
      apiPost(`/api/saree-jobs/${input.sareeJobId}/entries`, {
        weekStart: input.weekStart,
        inches: input.inches,
        allowOverflow: input.allowOverflow ?? false,
      }),
  );

export const useApproveEntry = () =>
  useProductionMutation((input: { entryId: string; inches?: number }) =>
    apiPost(
      `/api/production-entries/${input.entryId}/approve`,
      input.inches === undefined ? {} : { inches: input.inches },
    ),
  );

export const useRejectEntry = () =>
  useProductionMutation((entryId: string) =>
    apiFetch(`/api/production-entries/${entryId}`, { method: "DELETE" }),
  );
