function toAbsoluteUrl(value: string): string {
  return value.startsWith("http://") || value.startsWith("https://")
    ? value
    : `https://${value}`;
}

function resolveHostname(value: string | undefined): string {
  if (!value || !value.trim()) {
    return "";
  }

  try {
    return new URL(toAbsoluteUrl(value)).hostname.toLocaleLowerCase("tr");
  } catch {
    return value.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLocaleLowerCase("tr");
  }
}

function inferDomainFromUrl(url: string | undefined): string {
  const hostname = resolveHostname(url);
  return hostname || "";
}

function isLocalDomain(value: string | undefined): boolean {
  const normalized = resolveHostname(value);

  if (!normalized) {
    return false;
  }

  return normalized.includes("localhost") || normalized.endsWith(".local");
}

function resolvePublicDomain(
  domainValue: string | undefined,
  urlValue: string | undefined,
  fallbackDomain: string,
): string {
  if (domainValue?.trim() && !isLocalDomain(domainValue)) {
    return resolveHostname(domainValue) || fallbackDomain;
  }

  const inferredFromUrl = inferDomainFromUrl(urlValue);

  if (inferredFromUrl && !isLocalDomain(inferredFromUrl)) {
    return inferredFromUrl;
  }

  return fallbackDomain;
}

function normalizeUrl(url: string | undefined, fallbackDomain: string): string {
  const normalizedFallback = toAbsoluteUrl(fallbackDomain);
  const fallbackHost = resolveHostname(fallbackDomain);

  if (!url || url.trim().length === 0) {
    return normalizedFallback;
  }

  const normalizedUrl = toAbsoluteUrl(url.trim());
  const urlHost = resolveHostname(normalizedUrl);

  if (
    fallbackHost &&
    urlHost &&
    fallbackHost !== urlHost &&
    !fallbackHost.includes("localhost") &&
    !fallbackHost.endsWith(".local")
  ) {
    return normalizedFallback;
  }

  return normalizedUrl;
}

const storeSlug = process.env.NEXT_PUBLIC_STORE_SLUG || "default-store";
const storeName = process.env.NEXT_PUBLIC_STORE_NAME || "Celebix E-ticaret";
const storeTagline =
  process.env.NEXT_PUBLIC_STORE_TAGLINE || "Celebix Panel ortak e-ticaret altyapisi";
const storefrontUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.STORE_URL ||
  "https://localhost:3300";
const adminUrl =
  process.env.NEXT_PUBLIC_ADMIN_URL ||
  process.env.ADMIN_URL ||
  "https://localhost:3200";
const storefrontDomain = resolvePublicDomain(
  process.env.NEXT_PUBLIC_STORE_DOMAIN || process.env.STORE_DOMAIN,
  storefrontUrl,
  "localhost:3300",
);
const adminDomain = resolvePublicDomain(
  process.env.NEXT_PUBLIC_ADMIN_DOMAIN || process.env.ADMIN_DOMAIN,
  adminUrl,
  "localhost:3200",
);

export const STORE_RUNTIME = {
  slug: storeSlug,
  name: storeName,
  tagline: storeTagline,
  storefrontDomain,
  adminDomain,
  storefrontUrl: normalizeUrl(storefrontUrl, storefrontDomain),
  adminUrl: normalizeUrl(adminUrl, adminDomain),
  supportEmail:
    process.env.NEXT_PUBLIC_STORE_SUPPORT_EMAIL || `destek@${storeSlug}.local`,
  supportPhone: process.env.NEXT_PUBLIC_STORE_SUPPORT_PHONE || "",
  senderEmail:
    process.env.NEXT_PUBLIC_STORE_SENDER_EMAIL || `noreply@${storeSlug}.local`,
  smsSenderTitle:
    process.env.NEXT_PUBLIC_STORE_SMS_SENDER || storeSlug.replace(/-/g, "").toUpperCase(),
  defaultProductBrand:
    process.env.NEXT_PUBLIC_DEFAULT_PRODUCT_BRAND || storeName,
  marketplaceIntegrationName: `${storeSlug.replace(/-/g, "")}Marketplace`,
  defaultAdminEmail:
    process.env.NEXT_PUBLIC_DEFAULT_ADMIN_EMAIL || `admin@${storeSlug}.local`,
} as const;

export function getStoreRuntime() {
  return STORE_RUNTIME;
}

export function buildStorefrontUrl(path = "/") {
  const baseUrl = STORE_RUNTIME.storefrontUrl.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

export function buildStorefrontProductUrl(slug: string) {
  return buildStorefrontUrl(`/urunler/${slug}`);
}
