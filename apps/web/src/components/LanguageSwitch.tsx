import { useTranslation } from "react-i18next";
import { LOCALES, type Locale } from "@loom/shared";

import { LANGUAGE_NAMES } from "@/i18n/index.js";
import { cn } from "@/lib/cn.js";

export function LanguageSwitch({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <span className="text-sm text-slate-500">{t("language.label")}</span>
      {LOCALES.map((locale: Locale) => {
        const active = i18n.resolvedLanguage === locale;
        return (
          <button
            key={locale}
            type="button"
            onClick={() => void i18n.changeLanguage(locale)}
            aria-pressed={active}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition",
              active
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100",
            )}
          >
            {LANGUAGE_NAMES[locale]}
          </button>
        );
      })}
    </div>
  );
}
