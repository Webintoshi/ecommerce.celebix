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

const PANEL_ORIGINS = Object.freeze([
  "https://panel.saas-staging.celebix.site",
  "https://panel.celebix.site",
] as const);

function hostname(value: unknown): string | null {
  if (
    typeof value !== "string" || value.length < 3 || value.length > 253 || value !== value.trim() ||
    value !== value.toLowerCase() || value.includes(":") ||
    !/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value)
  ) return null;
  return value;
}

function centralLoginHrefForAdminHostname(value: string): string | null {
  for (const panelOrigin of PANEL_ORIGINS) {
    try {
      const canonicalAdmin = parseCanonicalAdminOriginFromPanelOrigin(`https://${value}`, panelOrigin);
      const loginUrl = new URL("/auth/login", panelOrigin);
      loginUrl.searchParams.set("destination", canonicalAdmin.hostname);
      return loginUrl.toString();
    } catch {
      // Try the next approved panel environment.
    }
  }
  return null;
}

function genericForHostname(value: string): TenantAdminLoginModel {
  return Object.freeze({
    ...GENERIC,
    loginHref: centralLoginHrefForAdminHostname(value) ?? GENERIC.loginHref,
  });
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
    if (!runtime || !(now instanceof Date) || !Number.isFinite(now.getTime())) return genericForHostname(requestedHostname);
    const panelOrigin = runtime.access?.panelOrigin;
    if (typeof panelOrigin !== "string") return genericForHostname(requestedHostname);
    const result = await runtime.adminDomains.resolvePublicBrand({ hostname: requestedHostname, now });
    if (result?.kind !== "resolved" || typeof result.brand?.canonicalAdminOrigin !== "string") return genericForHostname(requestedHostname);
    let canonicalAdmin: ReturnType<typeof parseCanonicalAdminOriginFromPanelOrigin>;
    try {
      canonicalAdmin = parseCanonicalAdminOriginFromPanelOrigin(
        result.brand.canonicalAdminOrigin,
        panelOrigin,
      );
    } catch {
      return GENERIC;
    }
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
  } catch { return genericForHostname(requestedHostname); }
}
