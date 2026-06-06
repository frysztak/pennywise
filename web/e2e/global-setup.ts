import MCR from "monocart-coverage-reports";

import coverageOptions from "./mcr.config";

function globalSetup() {
  MCR(coverageOptions).cleanCache();
}

export default globalSetup;
