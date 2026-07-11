const NORMALIZED_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
