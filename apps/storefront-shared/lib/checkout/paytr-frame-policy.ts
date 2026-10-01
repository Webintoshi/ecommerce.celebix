const PAYTR_ORIGIN = "https://www.paytr.com";
const SUPPORTED_PROVIDER_ORIGINS = new Set([
  PAYTR_ORIGIN,
  "https://sandbox-cpp.iyzipay.com",
  "https://cpp.iyzipay.com",
]);
// Confirmed as the blocked ACS navigation during an actual PayTR 3DS checkout.
// Keep bank origins explicit: provider redirects do not grant arbitrary frames.
const PAYTR_BANK_ORIGIN = "https://inbound.apigateway.vakifbank.com.tr";
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** The merchant hostname must come from verified storefront host authority. */
export function hostedPaymentFrameSources(providerOrigin: unknown, storefrontHostname: unknown): string | null {
  if (typeof providerOrigin !== "string" || !SUPPORTED_PROVIDER_ORIGINS.has(providerOrigin)
    || typeof storefrontHostname !== "string" || storefrontHostname.length > 253
    || !HOSTNAME.test(storefrontHostname)) return null;
  if (providerOrigin !== PAYTR_ORIGIN) return providerOrigin;
  return `${PAYTR_ORIGIN} ${PAYTR_BANK_ORIGIN} https://${storefrontHostname}/odeme/hizli/sonuc`;
}
