export type StorefrontHostnamePolicy = Readonly<{
  reservedSuffixes: readonly string[];
  cnameTarget: string;
}>;

export type NormalizedStorefrontHostname = Readonly<{
  hostname: string;
  registrableDomain: string;
  recordName: string;
  apex: boolean;
}>;

export type ProviderHostnameStatus = "pending" | "active" | "failed" | "deleted";

export type ProviderValidationInstruction = Readonly<{
  type: "txt" | "http" | "cname";
  name: string;
  value: string;
}>;

export type ProviderHostnameSnapshot = Readonly<{
  providerHostnameId: string;
  hostname: string;
  hostnameStatus: ProviderHostnameStatus;
  sslStatus: ProviderHostnameStatus;
  ownershipValidation: ProviderValidationInstruction | null;
  certificateValidation: readonly ProviderValidationInstruction[];
}>;

export interface CustomHostnameProvider {
  create(hostname: string): Promise<ProviderHostnameSnapshot>;
  get(providerHostnameId: string): Promise<ProviderHostnameSnapshot>;
  find(hostname: string): Promise<ProviderHostnameSnapshot | null>;
  remove(providerHostnameId: string): Promise<Readonly<{ deleted: true }>>;
}

export type CloudflareForSaaSConfig = Readonly<{
  zoneId: string;
  apiToken: string;
  apiBaseUrl: string;
  minimumTlsVersion: "1.2";
  timeoutMs: number;
}>;

export const CLOUDFLARE_CUSTOM_HOSTNAME_ERROR_CODES = Object.freeze([
  "invalid_input",
  "duplicate",
  "not_found",
  "rate_limited",
  "unavailable",
  "malformed_response",
] as const);

export type CloudflareCustomHostnameErrorCode = (typeof CLOUDFLARE_CUSTOM_HOSTNAME_ERROR_CODES)[number];
