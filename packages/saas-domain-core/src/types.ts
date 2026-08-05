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
