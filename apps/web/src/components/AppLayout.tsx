import { NavLink, Outlet } from "react-router";
import { useTranslation } from "react-i18next";

import { LanguageSelect } from "@/components/LanguageSelect.js";
import { Button } from "@/components/ui/button.js";
import { cn } from "@/lib/cn.js";
import { useSession, useSignOut } from "@/lib/session.js";
import { useOutboxSync } from "@/lib/useOutbox.js";

function BottomNav() {
  const { t } = useTranslation();
  const { data: user } = useSession();
  const canSeeWorkers = user?.role === "OWNER" || user?.role === "SUPERVISOR";

  // The super admin has one page and nothing else to go to.
  if (user?.role === "SUPER_ADMIN") return null;

  const items = [
    { to: "/", label: t("nav.home"), end: true },
    // Five tabs at most, so each stays wide enough to hit on a phone. Reports
    // are occasional, so they live on Home rather than here.
    ...(canSeeWorkers
      ? [
          { to: "/looms", label: t("nav.looms"), end: false },
          { to: "/stock", label: t("nav.stock"), end: false },
          { to: "/workers", label: t("nav.workers"), end: false },
        ]
      : []),
    ...(user?.role === "OWNER"
      ? [{ to: "/approvals", label: t("nav.approvals"), end: false }]
      : []),
  ];

  return (
    <nav
      aria-label={t("nav.home")}
      className="sticky bottom-0 border-t border-slate-200 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)] print:hidden"
    >
      <ul className="mx-auto flex max-w-2xl">
        {items.map((item) => (
          <li key={item.to} className="flex-1">
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex h-14 items-center justify-center text-sm font-medium transition",
                  isActive ? "text-slate-900" : "text-slate-500 hover:text-slate-700",
                )
              }
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function AppLayout() {
  const { t } = useTranslation();
  const { data: user } = useSession();
  const signOut = useSignOut();
  useOutboxSync();
  const paused = Boolean(user?.factory?.suspendedAt);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-slate-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-semibold">{user?.factory?.name ?? t("app.name")}</p>
            <p className="truncate text-sm text-slate-500">
              {user ? t(`role.${user.role}`) : null}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <LanguageSelect />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => signOut.mutate()}
              disabled={signOut.isPending}
            >
              {t("auth.signOut")}
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        {paused ? <Paused /> : <Outlet />}
      </div>

      {paused ? null : <BottomNav />}
    </div>
  );
}

/**
 * Shown instead of the app when the super admin has paused the factory, so
 * its people see why nothing works rather than a screen of errors.
 */
function Paused() {
  const { t } = useTranslation();
  return (
    <div className="space-y-2 rounded-2xl bg-amber-50 p-6 ring-1 ring-amber-200">
      <h1 className="text-lg font-semibold text-amber-900">{t("paused.title")}</h1>
      <p className="text-amber-900">{t("paused.body")}</p>
    </div>
  );
}
