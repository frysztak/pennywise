import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";

export const resources = {
  en: { translation: en },
} as const;

export const supportedLanguages = [{ code: "en", name: "English" }] as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    interpolation: {
      // React already escapes values, so i18next must not double-escape.
      escapeValue: false,
    },
  });

export default i18n;
