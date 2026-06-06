import type { CoverageReportOptions } from "monocart-coverage-reports";

const coverageOptions: CoverageReportOptions = {
  name: "Pennywise E2E Coverage",
  outputDir: "./coverage-e2e",
  reports: ["console-summary", "lcovonly"],
  entryFilter: (entry) => entry.url.includes("/assets/"),
  sourceFilter: (sourcePath) => sourcePath.includes("src/") && !sourcePath.includes("node_modules"),
};

export default coverageOptions;
