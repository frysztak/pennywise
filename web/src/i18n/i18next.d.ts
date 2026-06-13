import "i18next";

import type en from "./locales/en.json";

// Make t() keys type-safe and autocompletable against the English catalog,
// which is the source of truth for available translation keys.
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: {
      translation: typeof en;
    };
  }
}
