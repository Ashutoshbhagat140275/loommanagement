import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { useTranslation } from "react-i18next";
import type { Role } from "@loom/shared";

import { AppLayout } from "@/components/AppLayout.js";
import { useSession } from "@/lib/session.js";
import { Approvals } from "@/pages/Approvals.js";
import { Dashboard } from "@/pages/Dashboard.js";
import { Looms } from "@/pages/Looms.js";
import { Reports } from "@/pages/Reports.js";
import { SareeTypes } from "@/pages/SareeTypes.js";
import { SignIn } from "@/pages/SignIn.js";
import { SignUp } from "@/pages/SignUp.js";
import { WorkerProfile } from "@/pages/WorkerProfile.js";
import { Workers } from "@/pages/Workers.js";
import { WorkerSignIn } from "@/pages/WorkerSignIn.js";

function FullPageMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-4 text-slate-500">
      {children}
    </div>
  );
}

/** Blocks a route until the session is known, then redirects if not allowed. */
function RequireAuth({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { t } = useTranslation();
  const { data: user, isPending } = useSession();

  if (isPending) return <FullPageMessage>{t("common.loading")}</FullPageMessage>;
  if (!user) return <Navigate to="/sign-in" replace />;
  if (roles && user.role !== "SUPER_ADMIN" && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}

/** Sign-in and sign-up are pointless once you are already in. */
function RedirectIfSignedIn({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { data: user, isPending } = useSession();

  if (isPending) return <FullPageMessage>{t("common.loading")}</FullPageMessage>;
  if (user) return <Navigate to="/" replace />;

  return children;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/sign-in"
          element={
            <RedirectIfSignedIn>
              <SignIn />
            </RedirectIfSignedIn>
          }
        />
        <Route
          path="/sign-in/worker"
          element={
            <RedirectIfSignedIn>
              <WorkerSignIn />
            </RedirectIfSignedIn>
          }
        />
        <Route
          path="/sign-up"
          element={
            <RedirectIfSignedIn>
              <SignUp />
            </RedirectIfSignedIn>
          }
        />

        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Dashboard />} />
          <Route
            path="/looms"
            element={
              <RequireAuth roles={["OWNER", "SUPERVISOR"]}>
                <Looms />
              </RequireAuth>
            }
          />
          <Route
            path="/saree-types"
            element={
              <RequireAuth roles={["OWNER", "SUPERVISOR"]}>
                <SareeTypes />
              </RequireAuth>
            }
          />
          <Route
            path="/workers"
            element={
              <RequireAuth roles={["OWNER", "SUPERVISOR"]}>
                <Workers />
              </RequireAuth>
            }
          />
          <Route
            path="/workers/:id"
            element={
              <RequireAuth roles={["OWNER"]}>
                <WorkerProfile />
              </RequireAuth>
            }
          />
          <Route
            path="/reports"
            element={
              <RequireAuth roles={["OWNER", "SUPERVISOR"]}>
                <Reports />
              </RequireAuth>
            }
          />
          <Route
            path="/approvals"
            element={
              <RequireAuth roles={["OWNER"]}>
                <Approvals />
              </RequireAuth>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
