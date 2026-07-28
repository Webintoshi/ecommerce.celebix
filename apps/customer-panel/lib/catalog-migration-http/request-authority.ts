export type CatalogMigrationRequestAuthorityResult = "allowed" | "method_not_allowed" | "origin_denied" | "invalid_input" | "unavailable";

const PRIVATE_HEADERS = new Set(["authorization", "x-store-id", "x-tenant-id", "x-principal-id", "x-membership-id", "x-plan-id", "x-database-url"]);

function canonicalOrigin(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048 || value !== value.trim() || /[\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.port
      && parsed.pathname === "/" && !parsed.search && !parsed.hash && parsed.origin === value ? value : null;
  } catch { return null; }
}

export function validateCatalogMigrationRequestAuthority(
  request: Request,
  expected: Readonly<{ method: "GET" | "POST"; pathname: string; panelOrigin: string }>,
): CatalogMigrationRequestAuthorityResult {
  const panelOrigin = canonicalOrigin(expected?.panelOrigin);
  if (!panelOrigin || !expected.pathname.startsWith("/api/catalog/admin/migrations/woocommerce")) return "unavailable";
  if (request.method !== expected.method) return "method_not_allowed";
  let url: URL;
  try { url = new URL(request.url); } catch { return "invalid_input"; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== expected.pathname || url.search || url.hash) return "invalid_input";
  for (const [name] of request.headers) if (PRIVATE_HEADERS.has(name) || name.startsWith("x-celebix")) return "invalid_input";
  if (expected.method === "POST") {
    const origin = request.headers.get("origin");
    if (origin !== panelOrigin || origin.includes(",")) return "origin_denied";
  }
  return "allowed";
}
