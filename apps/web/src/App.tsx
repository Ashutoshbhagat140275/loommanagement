import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { LOCALES, type Locale } from "@loom/shared";

import { apiFetch } from "./lib/api.js";
import { LANGUAGE_NAMES } from "./i18n/index.js";

type Health = { ok: boolean; at: string };

function LanguageSwitch() {
  const { t, i18n } = useTranslation();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-slate-500">{t("language.label")}</span>
      {LOCALES.map((locale: Locale) => {
        const active = i18n.resolvedLanguage === locale;
        return (
          <button
            key={locale}
            type="button"
            onClick={() => void i18n.changeLanguage(locale)}
            aria-pressed={active}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              active
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
            }`}
          >
            {LANGUAGE_NAMES[locale]}
          </button>
        );
      })}
    </div>
  );
}

function ServerStatus() {
  const { t } = useTranslation();
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => apiFetch<Health>("/health"),
  });

  const { label, dot } = health.isPending
    ? { label: t("health.checking"), dot: "bg-amber-400" }
    : health.isError
      ? { label: t("health.failed"), dot: "bg-red-500" }
      : { label: t("health.connected"), dot: "bg-emerald-500" };

  return (
    <div className="inline-flex self-start items-center gap-2 rounded-full bg-white px-4 py-2 text-sm ring-1 ring-slate-200">
      <span className={`size-2 rounded-full ${dot}`} aria-hidden />
      {label}
    </div>
  );
}

export function App() {
  const { t } = useTranslation();

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-8 px-4 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t("app.name")}</h1>
        <p className="text-slate-600">{t("app.tagline")}</p>
      </header>

      <ServerStatus />

      <section className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
        <h2 className="font-medium">{t("phase.title")}</h2>
        <p className="mt-1 text-sm text-slate-600">{t("phase.body")}</p>
      </section>

      <LanguageSwitch />
    </main>
  );
}
