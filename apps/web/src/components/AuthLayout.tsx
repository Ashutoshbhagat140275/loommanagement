import type { ReactNode } from "react";

import { LanguageSwitch } from "./LanguageSwitch.js";

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="text-slate-600">{subtitle}</p> : null}
      </header>

      <div className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">{children}</div>

      {footer ? <div className="text-center text-sm">{footer}</div> : null}

      <LanguageSwitch className="justify-center" />
    </main>
  );
}
