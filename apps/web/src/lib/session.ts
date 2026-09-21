import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Role, WageType } from "@loom/shared";

import { ApiError, apiFetch, apiPost } from "./api.js";
import { clearLastKnown, readLastKnown, writeLastKnown } from "./lastKnown.js";

export type CurrentUser = {
  id: string;
  name: string;
  email: string | null;
  username: string | null;
  role: Role;
  factory: {
    id: string;
    name: string;
    plan: "FREE";
    /** Set when the super admin has paused the factory. */
    suspendedAt: string | null;
  } | null;
  worker: { id: string; wageType: WageType; trusted: boolean } | null;
};

const SESSION_KEY = ["session"] as const;

/**
 * The one source of truth for who is signed in. Returns null when nobody is,
 * which is a normal state rather than an error.
 */
export function useSession() {
  return useQuery({
    queryKey: SESSION_KEY,
    retry: false,
    staleTime: 60_000,
    queryFn: async (): Promise<CurrentUser | null> => {
      try {
        const { user } = await apiFetch<{ user: CurrentUser }>("/api/me");
        writeLastKnown("session", user);
        return user;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          // The server answered and said no. That really is signed out.
          clearLastKnown();
          return null;
        }

        // The server could not be reached. Falling back to sign-in here would
        // lock a weaver out of the entry form exactly when they need it most.
        const cached = readLastKnown<CurrentUser>("session");
        if (cached) return cached;
        throw error;
      }
    },
  });
}

function useSessionMutation<TInput>(run: (input: TInput) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SESSION_KEY });
    },
  });
}

export const useSignUpFactory = () =>
  useSessionMutation((input: {
    factoryName: string;
    ownerName: string;
    email: string;
    password: string;
  }) => apiPost("/api/factories/sign-up", input));

export const useSignInOwner = () =>
  useSessionMutation((input: { email: string; password: string }) =>
    apiPost("/api/auth/sign-in/email", input),
  );

/** The worker's phone number is their username and the PIN is their password. */
export const useSignInWorker = () =>
  useSessionMutation((input: { phone: string; pin: string }) =>
    apiPost("/api/auth/sign-in/username", {
      username: input.phone,
      password: input.pin,
    }),
  );

export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost("/api/auth/sign-out", {}),
    onSuccess: () => {
      // Set the session to null before dropping anything else, so the route
      // guards see "signed out" on the very next render and redirect.
      // queryClient.clear() on its own leaves mounted queries rendering the
      // previous user's data until they each happen to refetch.
      clearLastKnown();
      queryClient.setQueryData(SESSION_KEY, null);
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== SESSION_KEY[0],
      });
    },
  });
}
