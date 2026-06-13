import MCR from "monocart-coverage-reports";

import coverageOptions from "./mcr.config";

async function globalTeardown() {
  await MCR(coverageOptions).generate();
}

export default globalTeardown;
