import { GET as existingGet, POST as existingPost, PATCH as existingPatch } from "../../[...slug]/route";
import { ANALYTICS_FIXTURE_NOW, analyticsFixtureResponse, createAnalyticsFixtureState } from "../../../analytics/analytics-fixture-data";

const state = createAnalyticsFixtureState();
type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, { params }: Context) {
  const path = (await params).path;
  let fixtureQuery = new URLSearchParams();
  try {
    const referer = new URL(request.headers.get("referer") ?? "");
    if (referer.pathname === "/analytics" || referer.pathname === "/controls-polish/dashboard") fixtureQuery = referer.searchParams;
  } catch { /* Other fixture callers keep their existing responses. */ }
  if (path.length === 1 && path[0] === "active") {
    const visitors = fixtureQuery.get("qaVisitors") ?? fixtureQuery.get("visitors");
    if (visitors === "loading") await new Promise((resolve) => setTimeout(resolve, 8000));
    if (visitors === "unavailable") return Response.json({ schemaVersion: 1, status: "unavailable", activeVisitors: null, asOf: ANALYTICS_FIXTURE_NOW });
    if (visitors === "zero") return Response.json({ schemaVersion: 1, status: "ready", activeVisitors: 0, asOf: ANALYTICS_FIXTURE_NOW });
  }
  const response = analyticsFixtureResponse(path, request.url, state);
  const scenario = fixtureQuery.get("qaState");
  if (response?.ok && path[0] !== "active" && ["worker-delayed", "traffic-missing", "worker-delayed-missing"].includes(scenario ?? "")) {
    const payload = await response.json();
    payload.status = "degraded";
    if (scenario?.includes("worker-delayed")) {
      payload.commerce.worker = { ...payload.commerce.worker, retry: 2, oldestPendingSeconds: 480 };
      if (payload.comparisonCommerce) payload.comparisonCommerce.worker = { ...payload.comparisonCommerce.worker, retry: 2, oldestPendingSeconds: 480 };
    }
    if (scenario?.includes("missing")) { payload.traffic = null; payload.comparisonTraffic = null; }
    return Response.json(payload);
  }
  return response ?? existingGet(request, { params: Promise.resolve({ slug: ["analytics", ...path] }) });
}
export async function POST(request: Request, { params }: Context) { return existingPost(request, { params: Promise.resolve({ slug: ["analytics", ...(await params).path] }) }); }
export async function PATCH(request: Request, { params }: Context) { return existingPatch(request, { params: Promise.resolve({ slug: ["analytics", ...(await params).path] }) }); }
