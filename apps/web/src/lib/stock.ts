import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  FinishedSareeStatus,
  MaterialUnit,
  ReimbursementMethod,
  StockMovementKind,
  WageType,
} from "@loom/shared";

import { apiFetch, apiPost } from "./api.js";

export type StockMaterial = {
  id: string;
  name: string;
  unit: MaterialUnit;
  lowStockAtMilli: number | null;
  onHandMilli: number;
  averageUnitPricePaise: number | null;
  valuePaise: number | null;
  isLow: boolean;
  lastPurchaseAt: string | null;
};

export type SareeMaterialRow = {
  materialId: string;
  name: string;
  unit: MaterialUnit;
  givenMilli: number;
  returnedMilli: number;
  boughtByWeaverMilli: number;
  usedMilli: number;
  returnableMilli: number;
  costPaise: number | null;
};

export type SareeMaterials = {
  materials: SareeMaterialRow[];
  totalCostPaise: number | null;
  movements: {
    id: string;
    kind: StockMovementKind;
    quantityMilli: number;
    costPaise: number | null;
    createdAt: string;
    reimbursement: ReimbursementMethod | null;
    material: { id: string; name: string; unit: MaterialUnit };
    workerName: string | null;
  }[];
};

export type FinishedSaree = {
  id: string;
  label: string | null;
  lengthInches: number;
  wageType: WageType;
  startedAt: string;
  finishedAt: string | null;
  saleStatus: FinishedSareeStatus | null;
  soldAt: string | null;
  loom: { number: string };
  sareeType: { name: string } | null;
  workers: { id: string; name: string }[];
  materialCostPaise: number | null;
  /** Null for a supervisor: wages are the owner's to see. */
  labourCostPaise: number | null;
};

/** Anything that moves material changes the store room and the saree's cost. */
function useStockMutation<TInput>(run: (input: TInput) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: async () => {
      await Promise.all(
        [
          ["materials"],
          ["saree-materials"],
          ["finished-sarees"],
          // Paying a weaver back into his passbook changes it.
          ["passbook"],
          ["passbook-summary"],
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
  });
}

export const useMaterials = () =>
  useQuery({
    queryKey: ["materials"],
    queryFn: () =>
      apiFetch<{ materials: StockMaterial[] }>("/api/materials").then(
        (result) => result.materials,
      ),
  });

export const useSareeMaterials = (sareeJobId: string, enabled = true) =>
  useQuery({
    queryKey: ["saree-materials", sareeJobId],
    enabled,
    queryFn: () => apiFetch<SareeMaterials>(`/api/saree-jobs/${sareeJobId}/materials`),
  });

export const useFinishedSarees = () =>
  useQuery({
    queryKey: ["finished-sarees"],
    queryFn: () =>
      apiFetch<{ sarees: FinishedSaree[] }>("/api/finished-sarees").then(
        (result) => result.sarees,
      ),
  });

export const useCreateMaterial = () =>
  useStockMutation(
    (input: { name: string; unit: MaterialUnit; lowStockAtMilli?: number }) =>
      apiPost("/api/materials", input),
  );

export const useRecordPurchase = () =>
  useStockMutation(
    (input: {
      materialId: string;
      quantityMilli: number;
      costPaise?: number;
      supplier?: string;
    }) => {
      const { materialId, ...body } = input;
      return apiPost(`/api/materials/${materialId}/purchases`, body);
    },
  );

export const useGiveMaterial = (sareeJobId: string) =>
  useStockMutation((input: { materialId: string; quantityMilli: number }) =>
    apiPost(`/api/saree-jobs/${sareeJobId}/materials/give`, input),
  );

export const useReturnMaterial = (sareeJobId: string) =>
  useStockMutation((input: { materialId: string; quantityMilli: number }) =>
    apiPost(`/api/saree-jobs/${sareeJobId}/materials/return`, input),
  );

export const useWeaverBought = (sareeJobId: string) =>
  useStockMutation(
    (input: {
      materialId: string;
      quantityMilli: number;
      costPaise: number;
      workerId: string;
      reimbursement: ReimbursementMethod;
    }) => apiPost(`/api/saree-jobs/${sareeJobId}/materials/bought-by-weaver`, input),
  );

export const useSetSaleStatus = () =>
  useStockMutation((input: { sareeJobId: string; status: FinishedSareeStatus }) =>
    apiPost(
      `/api/finished-sarees/${input.sareeJobId}/${input.status === "SOLD" ? "sold" : "in-stock"}`,
      {},
    ),
  );
