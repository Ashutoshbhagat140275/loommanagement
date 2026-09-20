import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { DEFAULT_LOCALE, LOCALES } from "@loom/shared";

import en from "./locales/en.json";
import hi from "./locales/hi.json";
import mr from "./locales/mr.json";

export const LANGUAGE_NAMES = {
  en: "English",
  hi: "हिंदी",
  mr: "मराठी",
} as const;

function syncHtmlLang(language: string) {
  document.documentElement.lang = language;
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      hi: { translation: hi },
      mr: { translation: mr },
    },
    supportedLngs: [...LOCALES],
    fallbackLng: DEFAULT_LOCALE,
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "loom.locale",
    },
  })
  // languageChanged does not fire for the language picked during init,
  // so set it once here as well or <html lang> stays on the markup default.
  .then(() => syncHtmlLang(i18n.resolvedLanguage ?? DEFAULT_LOCALE));

i18n.on("languageChanged", syncHtmlLang);

export default i18n;
