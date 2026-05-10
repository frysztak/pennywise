import { SiAuthelia, SiAuthentik, SiKeycloak } from "@icons-pack/react-simple-icons";
import { KeyRound } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

interface ProviderEntry {
  name: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const GENERIC: ProviderEntry = { name: "OIDC", Icon: KeyRound };

const PROVIDERS: Record<string, ProviderEntry> = {
  authelia: { name: "Authelia", Icon: SiAuthelia },
  authentik: { name: "Authentik", Icon: SiAuthentik },
  keycloak: { name: "Keycloak", Icon: SiKeycloak },
  oidc: GENERIC,
};

// Resolve the server-provided OIDC_PROVIDER_NAME value. Known keys map to a
// branded entry; unknown strings render with the generic icon and the user's
// chosen name as the label.
export function resolveOidcProvider(raw: string | undefined): ProviderEntry {
  if (!raw) return GENERIC;
  const key = raw.toLowerCase().replace(/\s+/g, "");
  if (key in PROVIDERS) return PROVIDERS[key];
  return { name: raw, Icon: KeyRound };
}
