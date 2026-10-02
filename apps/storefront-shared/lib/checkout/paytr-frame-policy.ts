const PAYTR_ORIGIN = "https://www.paytr.com";
const SUPPORTED_PROVIDER_ORIGINS = new Set([
  PAYTR_ORIGIN,
  "https://sandbox-cpp.iyzipay.com",
  "https://cpp.iyzipay.com",
]);
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** The merchant hostname must come from verified storefront host authority. */
export function hostedPaymentFrameSources(providerOrigin: unknown, storefrontHostname: unknown): string | null {
  if (typeof providerOrigin !== "string" || !SUPPORTED_PROVIDER_ORIGINS.has(providerOrigin)
    || typeof storefrontHostname !== "string" || storefrontHostname.length > 253
    || !HOSTNAME.test(storefrontHostname)) return null;
  if (providerOrigin !== PAYTR_ORIGIN) return providerOrigin;
  // Only isolated payment documents use this policy. The initial frame still
  // comes from an exact, sealed PayTR token; PayTR controls subsequent bank ACS
  // navigation. Enumerating banks breaks valid 3DS flows as issuers change hosts.
  // Scripts, connections, forms and all non-frame sources remain denied.
  return `${PAYTR_ORIGIN} https:`;
}
