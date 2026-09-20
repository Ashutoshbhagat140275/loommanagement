import { NavLink, Outlet } from "react-router";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button.js";
import { cn } from "@/lib/cn.js";
import { useSession, useSignOut } from "@/lib/session.js";

function BottomNav() {
  const { t } = useTranslation();
  const { data: user } = useSession();
  const canSeeWorkers = user?.role === "OWNER" || user?.role === "SUPERVISOR";

  const items = [
    { to: "/", label: t("nav.home"), end: true },
    ...(canSeeWorkers ? [{ to: "/workers", label: t("nav.workers"), end: false }] : []),
  ];

  return (
    <nav
      aria-label={t("nav.home")}
      className="sticky bottom-0 border-t border-slate-200 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
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

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-semibold">{user?.factory?.name ?? t("app.name")}</p>
            <p className="truncate text-sm text-slate-500">
              {user ? t(`role.${user.role}`) : null}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => signOut.mutate()}
            disabled={signOut.isPending}
          >
            {t("auth.signOut")}
          </Button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        <Outlet />
      </div>

      <BottomNav />
    </div>
  );
}
