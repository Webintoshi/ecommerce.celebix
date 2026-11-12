import { NextResponse, type NextRequest } from "next/server.js";
import {
  adminOriginEnvironmentFromPanelOrigin,
  normalizeAdminRequestHostname,
  type PostgresAdminDomainRepository,
} from "@celebix/saas-data";
import { applySecurityHeaders } from "../../packages/platform-config/src/http-security.ts";

type AdminHostGateRuntime = Readonly<{
  access: Readonly<{ panelOrigin: string }>;
  adminDomains: Pick<PostgresAdminDomainRepository, "resolvePublicBrand">;
}>;

type AdminHostGateDependencies = Readonly<{
  resolveRuntime(): Promise<AdminHostGateRuntime | null>;
  clock(): Date;
  development?: boolean;
}>;

const LOCAL_DEVELOPMENT_HOSTS = new Set(["localhost:3400", "127.0.0.1:3400", "[::1]:3400"]);

function securePanelDocument(request: NextRequest, response: NextResponse): NextResponse {
  // Session logout and store switching can redirect form submissions to another trusted host.
  response.headers.set("Content-Security-Policy", "base-uri 'self'; frame-ancestors 'none'; object-src 'none'");
  return applySecurityHeaders(request, response, "admin", { contentSecurityPolicy: "route-owned" });
}

function denied(request: NextRequest, status: 404 | 503): NextResponse {
  const response = new NextResponse(status === 404 ? "Admin host not found" : "Admin host unavailable", {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "text/plain; charset=utf-8",
    },
  });
  return securePanelDocument(request, response);
}

function continuePage(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers);
  // Page authorization must use the real route, never a caller supplied header.
  headers.set("x-celebix-panel-pathname", request.nextUrl.pathname);
  return securePanelDocument(request, NextResponse.next({ request: { headers } }));
}

export function createCustomerPanelProxy(dependencies: AdminHostGateDependencies) {
  return async (request: NextRequest): Promise<NextResponse> => {
    if (request.nextUrl.pathname !== "/" && request.nextUrl.pathname !== "/login") return continuePage(request);
    const originalHost = request.headers.get("host");
    if (dependencies.development === true && originalHost !== null && LOCAL_DEVELOPMENT_HOSTS.has(originalHost)) {
      return continuePage(request);
    }
    let hostname: string;
    try { hostname = normalizeAdminRequestHostname(originalHost); }
    catch { return denied(request, 404); }

    try {
      const runtime = await dependencies.resolveRuntime();
      if (!runtime) return denied(request, 503);
      const panelOrigin = runtime.access.panelOrigin;
      adminOriginEnvironmentFromPanelOrigin(panelOrigin);
      if (hostname === new URL(panelOrigin).hostname) return continuePage(request);

      const now = dependencies.clock();
      if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return denied(request, 503);
      const resolved = await runtime.adminDomains.resolvePublicBrand({ hostname, now: new Date(now) });
      if (resolved.kind === "admin_host_unknown") return denied(request, 404);
      return resolved.kind === "resolved" ? continuePage(request) : denied(request, 503);
    } catch { return denied(request, 503); }
  };
}

const defaultProxy = createCustomerPanelProxy({
  development: process.env.NODE_ENV === "development",
  clock: () => new Date(),
  async resolveRuntime() {
    const { resolveDefaultServerAdminHostAuthRuntime } = await import("./lib/server-admin-host-auth/default.ts");
    return resolveDefaultServerAdminHostAuthRuntime();
  },
});

export function proxy(request: NextRequest): Promise<NextResponse> { return defaultProxy(request); }

export const config = { matcher: ["/((?!api(?:/|$)|auth(?:/|$)|_next(?:/|$)|favicon.ico).*)"] };
