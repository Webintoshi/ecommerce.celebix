import { normalizeAdminRequestHostname } from "@celebix/saas-data";

import { resolveAdminDomainOriginHealth } from "../../../lib/server-admin-domains/origin-health.ts";

export async function GET(request: Request) {
  try {
    const hostname = normalizeAdminRequestHostname(request.headers.get("host"));
    const health = await resolveAdminDomainOriginHealth(hostname, new Date());
    return health
      ? Response.json(health, { status: 200, headers: { "cache-control": "no-store" } })
      : Response.json({ status: "unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ status: "not_found" }, { status: 404, headers: { "cache-control": "no-store" } });
  }
}
