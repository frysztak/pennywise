import { type Page, test as testBase } from "@playwright/test";
import MCR from "monocart-coverage-reports";

import coverageOptions from "./mcr.config";

export const test = testBase.extend<{ autoCoverage: void }>({
  autoCoverage: [
    async ({ context }, use) => {
      // page.coverage is Chromium-only.
      const isChromium = test.info().project.name === "chromium";

      const startCoverage = (page: Page) => page.coverage.startJSCoverage({ resetOnNavigation: false });
      if (isChromium) {
        context.on("page", startCoverage);
      }

      await use();

      if (isChromium) {
        context.off("page", startCoverage);
        const coverage = await Promise.all(context.pages().map((page) => page.coverage.stopJSCoverage()));
        await MCR(coverageOptions).add(coverage.flat());
      }
    },
    { scope: "test", auto: true },
  ],
});

export { expect } from "@playwright/test";
