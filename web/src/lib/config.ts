// Frontend configuration injected by the server
interface PennywiseConfig {
  oidcEnabled: boolean;
  registrationEnabled: boolean;
  passwordLoginEnabled: boolean;
}

declare global {
  interface Window {
    __PENNYWISE_CONFIG__?: PennywiseConfig;
  }
}

export function getConfig(): PennywiseConfig {
  return window.__PENNYWISE_CONFIG__ ?? { oidcEnabled: false, registrationEnabled: true, passwordLoginEnabled: true };
}
