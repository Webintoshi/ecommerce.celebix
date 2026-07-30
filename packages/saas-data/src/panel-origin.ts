const NORMALIZED_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ADMIN_HOST_SUFFIXES = Object.freeze({
  production: ".admin.celebix.site",
  staging: ".admin.saas-staging.celebix.site",
} as const);

export type AdminOriginEnvironment = keyof typeof ADMIN_HOST_SUFFIXES;

function invalidOrigin(): never {
  throw new Error("invalid_exact_https_origin");
}

export function normalizeExactHttpsOrigin(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) invalidOrigin();
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    invalidOrigin();
  }
  if (
    parsed.protocol !== "https:"
    || parsed.username !== ""
    || parsed.password !== ""
    || parsed.search !== ""
    || parsed.hash !== ""
    || (parsed.pathname !== "" && parsed.pathname !== "/")
  ) invalidOrigin();
  const normalized = parsed.origin;
  if (normalized === "null" || (value !== normalized && value !== `${normalized}/`)) invalidOrigin();
  return normalized;
}

export function createPanelStoreUrl(panelOrigin: unknown, storeSlug: unknown): string {
  const normalizedOrigin = normalizeExactHttpsOrigin(panelOrigin);
  if (typeof storeSlug !== "string" || !NORMALIZED_SLUG.test(storeSlug)) invalidOrigin();
  const expectedPath = `/stores/${storeSlug}`;
  const result = new URL(expectedPath, `${normalizedOrigin}/`);
  if (
    result.origin !== normalizedOrigin
    || result.pathname !== expectedPath
    || result.username !== ""
    || result.password !== ""
    || result.search !== ""
    || result.hash !== ""
  ) invalidOrigin();
  return result.href;
}

function normalizedAdminSlug(value: unknown): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > 63
    || !NORMALIZED_SLUG.test(value)
  ) invalidOrigin();
  return value;
}

function adminHostSuffix(environment: unknown): string {
  if (environment !== "production" && environment !== "staging") invalidOrigin();
  return ADMIN_HOST_SUFFIXES[environment];
}

export function createCanonicalAdminOrigin(
  storeSlug: unknown,
  environment: AdminOriginEnvironment,
): string {
  const slug = normalizedAdminSlug(storeSlug);
  const hostname = `${slug}${adminHostSuffix(environment)}`;
  if (parseCanonicalAdminHostname(hostname, environment) !== slug) invalidOrigin();
  return `https://${hostname}`;
}

export function createCanonicalAdminOriginFromPanelOrigin(
  panelOrigin: unknown,
  storeSlug: unknown,
): string {
  const origin = normalizeExactHttpsOrigin(panelOrigin);
  if (origin === "https://panel.celebix.site") {
    return createCanonicalAdminOrigin(storeSlug, "production");
  }
  if (origin === "https://panel.saas-staging.celebix.site") {
    return createCanonicalAdminOrigin(storeSlug, "staging");
  }
  invalidOrigin();
}

export function parseCanonicalAdminHostname(
  hostname: unknown,
  environment: AdminOriginEnvironment,
): string {
  if (typeof hostname !== "string" || hostname.length === 0 || hostname !== hostname.trim()) invalidOrigin();
  const suffix = adminHostSuffix(environment);
  if (!hostname.endsWith(suffix)) invalidOrigin();
  const slug = normalizedAdminSlug(hostname.slice(0, -suffix.length));
  if (`${slug}${suffix}` !== hostname) invalidOrigin();
  return slug;
}
