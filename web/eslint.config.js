// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import js from "@eslint/js";
import i18next from "eslint-plugin-i18next";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import storybook from "eslint-plugin-storybook";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["dist", "coverage", "coverage-e2e"]),
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["src/gen/**/*"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat["recommended-latest"],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      "react-refresh/only-export-components": "off",
      "react-hooks/incompatible-library": "off",
    },
  },
  ...storybook.configs["flat/recommended"],
  {
    // Catch hardcoded user-facing strings in app code; everything must go through t().
    files: ["src/features/**/*.tsx", "src/routes/**/*.tsx"],
    ignores: ["src/routes/routeTree.gen.ts", "**/*.test.tsx", "**/*.stories.tsx"],
    plugins: { i18next },
    rules: {
      // jsx-text-only checks visible text content; attribute enums (variant/size/etc.)
      // are too noisy to gate on. A handful of real attribute literals (placeholders,
      // hardcoded locales) are handled separately.
      "i18next/no-literal-string": ["warn", { mode: "jsx-text-only" }],
    },
  },
]);
