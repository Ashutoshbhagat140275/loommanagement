import { useTranslation } from "react-i18next";
import { LOCALES, type Locale } from "@loom/shared";

import { LANGUAGE_NAMES } from "@/i18n/index.js";
import { cn } from "@/lib/cn.js";

/**
 * Compact language picker for the app header, where the three-button switch
 * used on the sign-in screens would crowd a phone.
 *
 * A native select on purpose: it opens as the platform's own wheel or menu,
 * which is easier to hit on a phone than a custom dropdown.
 */
export function LanguageSelect({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();

  return (
    <label className={cn("relative inline-flex items-center", className)}>
      <span className="sr-only">{t("language.label")}</span>
      <select
        value={i18n.resolvedLanguage ?? "en"}
        onChange={(event) => void i18n.changeLanguage(event.target.value)}
        className={cn(
          "h-10 appearance-none rounded-lg bg-white py-0 pl-3 pr-8 text-sm font-medium text-slate-700",
          "ring-1 ring-slate-300 transition hover:bg-slate-50",
          "focus:ring-2 focus:ring-slate-900 focus:outline-none",
        )}
      >
        {LOCALES.map((locale: Locale) => (
          <option key={locale} value={locale}>
            {LANGUAGE_NAMES[locale]}
          </option>
        ))}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        className="pointer-events-none absolute right-2.5 size-4 text-slate-400"
      >
        <path
          d="M6 8l4 4 4-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </label>
  );
}
