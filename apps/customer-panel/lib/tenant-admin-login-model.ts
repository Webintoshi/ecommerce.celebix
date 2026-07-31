import { parseCanonicalAdminOriginFromPanelOrigin } from "@celebix/saas-data";

export type TenantAdminLoginModel = Readonly<{
  kind: "tenant" | "generic";
  displayName: string;
  logoUrl: string | null;
  accentColor: string;
  canonicalAdminOrigin: string | null;
  loginHref: string;
}>;

const GENERIC: TenantAdminLoginModel = Object.freeze({
  kind: "generic",
  displayName: "Celebix",
  logoUrl: null,
  accentColor: "#ff6500",
  canonicalAdminOrigin: null,
  loginHref: "/auth/login",
});

function hostname(value: unknown): string | null {
  if (
    typeof value !== "string" || value.length < 3 || value.length > 253 || value !== value.trim() ||
    value !== value.toLowerCase() || value.includes(":") ||
    !/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value)
  ) return null;
  return value;
}

export async function resolveTenantAdminLoginModel(options: Readonly<{
  hostHeader: string | null;
  resolveRuntime(): Promise<unknown>;
  clock(): Date;
}>): Promise<TenantAdminLoginModel> {
  const requestedHostname = hostname(options?.hostHeader);
  if (!requestedHostname || typeof options.resolveRuntime !== "function" || typeof options.clock !== "function") return GENERIC;
  try {
    const runtime = await options.resolveRuntime() as any;
    const now = options.clock();
    if (!runtime || !(now instanceof Date) || !Number.isFinite(now.getTime())) return GENERIC;
    const panelOrigin = runtime.access?.panelOrigin;
    if (typeof panelOrigin !== "string") return GENERIC;
    const result = await runtime.adminDomains.resolvePublicBrand({ hostname: requestedHostname, now });
    if (result?.kind !== "resolved" || typeof result.brand?.canonicalAdminOrigin !== "string") return GENERIC;
    const canonicalAdmin = parseCanonicalAdminOriginFromPanelOrigin(
      result.brand.canonicalAdminOrigin,
      panelOrigin,
    );
    if (result.brand.storeSlug !== canonicalAdmin.storeSlug) return GENERIC;
    const accentColor = result.brand.accentColor ?? "#ff6500";
    if (!/^#[0-9a-fA-F]{6}$/.test(accentColor)) return GENERIC;
    const loginUrl = new URL("/auth/login", panelOrigin);
    if (loginUrl.origin !== panelOrigin || loginUrl.pathname !== "/auth/login") return GENERIC;
    loginUrl.searchParams.set("destination", canonicalAdmin.hostname);
    return Object.freeze({
      kind: "tenant" as const,
      displayName: String(result.brand.displayName),
      logoUrl: result.brand.logoUrl === null ? null : String(result.brand.logoUrl),
      accentColor,
      canonicalAdminOrigin: canonicalAdmin.origin,
      loginHref: loginUrl.toString(),
    });
  } catch { return GENERIC; }
}
