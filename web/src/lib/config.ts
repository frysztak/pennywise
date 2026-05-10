// Frontend configuration injected by the server
interface PennywiseConfig {
  oidcEnabled: boolean;
  oidcProviderName?: string;
  registrationEnabled: boolean;
  passwordLoginEnabled: boolean;
  receiptScanningEnabled: boolean;
  appVersion: string;
}

declare global {
  interface Window {
    __PENNYWISE_CONFIG__?: PennywiseConfig;
  }
}

export function getConfig(): PennywiseConfig {
  return (
    window.__PENNYWISE_CONFIG__ ?? {
      oidcEnabled: false,
      registrationEnabled: true,
      passwordLoginEnabled: true,
      receiptScanningEnabled: false,
      appVersion: "dev",
    }
  );
}
