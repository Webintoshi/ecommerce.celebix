import { cacheDependencySnapshot, resolveDefaultCacheRuntime } from "@celebix/saas-cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== "GET" || url.pathname !== "/api/health" || url.search !== "" || url.hash !== "") {
    return Response.json({ status: "not_found" }, { status: 404, headers: { "cache-control": "no-store" } });
  }
  const redisCache = await cacheDependencySnapshot(resolveDefaultCacheRuntime());
  return Response.json(
    { status: redisCache.status === "unavailable" ? "degraded" : "ok", dependencies: { redisCache } },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
}
