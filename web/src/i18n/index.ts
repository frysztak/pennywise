import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import resourcesToBackend from "i18next-resources-to-backend";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";

export const supportedLanguages = [
  { code: "en", name: "English" },
  { code: "pl", name: "Polski" },
] as const;

i18n
  // The fallback locale is bundled so t() always has a synchronous baseline
  // (including for route head() titles resolved outside React); other locales
  // are code-split by Vite and fetched on demand via the dynamic import.
  .use(resourcesToBackend((language: string) => import(`./locales/${language}.json`)))
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en } },
    partialBundledLanguages: true,
    fallbackLng: "en",
    interpolation: {
      // React already escapes values, so i18next must not double-escape.
      escapeValue: false,
    },
  });

export default i18n;
