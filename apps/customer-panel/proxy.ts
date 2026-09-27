import { NextResponse, type NextRequest } from "next/server.js";
import {
  adminOriginEnvironmentFromPanelOrigin,
  normalizeAdminRequestHostname,
  type PostgresAdminDomainRepository,
} from "@celebix/saas-data";

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

function denied(status: 404 | 503): NextResponse {
  return new NextResponse(status === 404 ? "Admin host not found" : "Admin host unavailable", {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "text/plain; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}

export function createCustomerPanelProxy(dependencies: AdminHostGateDependencies) {
  return async (request: NextRequest): Promise<NextResponse> => {
    if (request.nextUrl.pathname !== "/" && request.nextUrl.pathname !== "/login") return NextResponse.next();
    const originalHost = request.headers.get("host");
    if (dependencies.development === true && originalHost !== null && LOCAL_DEVELOPMENT_HOSTS.has(originalHost)) {
      return NextResponse.next();
    }
    let hostname: string;
    try { hostname = normalizeAdminRequestHostname(originalHost); }
    catch { return denied(404); }

    try {
      const runtime = await dependencies.resolveRuntime();
      if (!runtime) return denied(503);
      const panelOrigin = runtime.access.panelOrigin;
      adminOriginEnvironmentFromPanelOrigin(panelOrigin);
      if (hostname === new URL(panelOrigin).hostname) return NextResponse.next();

      const now = dependencies.clock();
      if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return denied(503);
      const resolved = await runtime.adminDomains.resolvePublicBrand({ hostname, now: new Date(now) });
      if (resolved.kind === "admin_host_unknown") return denied(404);
      return resolved.kind === "resolved" ? NextResponse.next() : denied(503);
    } catch { return denied(503); }
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

export const config = { matcher: ["/", "/login"] };
