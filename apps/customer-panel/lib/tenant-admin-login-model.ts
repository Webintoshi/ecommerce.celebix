import { normalizeAdminRequestHostname, parseCanonicalAdminOriginFromPanelOrigin, parseExactAdminHttpsOrigin } from "@celebix/saas-data";

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
  try { return normalizeAdminRequestHostname(value); } catch { return null; }
}

function centralLoginHref(value: string, panelOrigin: string): string | null {
  if (!PANEL_ORIGINS.some((approved) => approved === panelOrigin)) return null;
  try {
    const loginUrl = new URL("/auth/login", panelOrigin);
    loginUrl.searchParams.set("destination", value);
    return loginUrl.toString();
  } catch {
    return null;
  }
}

function centralLoginHrefForAdminHostname(value: string): string | null {
  for (const panelOrigin of PANEL_ORIGINS) {
    try {
      const canonicalAdmin = parseCanonicalAdminOriginFromPanelOrigin(`https://${value}`, panelOrigin);
      return centralLoginHref(canonicalAdmin.hostname, panelOrigin);
    } catch {
      // Try the next approved panel environment.
    }
  }
  return null;
}

function genericForHostname(value: string, panelOrigin?: string): TenantAdminLoginModel {
  return Object.freeze({
    ...GENERIC,
    loginHref: (panelOrigin ? centralLoginHref(value, panelOrigin) : null) ?? centralLoginHrefForAdminHostname(value) ?? GENERIC.loginHref,
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
    if (result?.kind !== "resolved" || typeof result.brand?.canonicalAdminOrigin !== "string") {
      const temporaryCustomDomainFailure = result?.kind === "unavailable" && requestedHostname.startsWith("admin.");
      return genericForHostname(requestedHostname, temporaryCustomDomainFailure ? panelOrigin : undefined);
    }
    let canonicalAdmin: ReturnType<typeof parseExactAdminHttpsOrigin>;
    try {
      canonicalAdmin = parseExactAdminHttpsOrigin(result.brand.canonicalAdminOrigin);
    } catch {
      return GENERIC;
    }
    if (canonicalAdmin.hostname.endsWith(".admin.celebix.site")) {
      try {
        const platformAdmin = parseCanonicalAdminOriginFromPanelOrigin(canonicalAdmin.origin, panelOrigin);
        if (platformAdmin.storeSlug !== result.brand.storeSlug) return GENERIC;
      } catch { return GENERIC; }
    }
    const accentColor = result.brand.accentColor ?? "#ff6500";
    if (!/^#[0-9a-fA-F]{6}$/.test(accentColor)) return GENERIC;
    const loginUrl = new URL("/auth/login", panelOrigin);
    if (loginUrl.origin !== panelOrigin || loginUrl.pathname !== "/auth/login") return GENERIC;
    loginUrl.searchParams.set("destination", requestedHostname);
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
