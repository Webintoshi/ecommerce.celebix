import { GET as existingGet, POST as existingPost, PATCH as existingPatch } from "../../[...slug]/route";
import { analyticsFixtureResponse, createAnalyticsFixtureState } from "../../../analytics/analytics-fixture-data";

const state = createAnalyticsFixtureState();
type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, { params }: Context) {
  const path = (await params).path;
  return analyticsFixtureResponse(path, request.url, state) ?? existingGet(request, { params: Promise.resolve({ slug: ["analytics", ...path] }) });
}
export async function POST(request: Request, { params }: Context) { return existingPost(request, { params: Promise.resolve({ slug: ["analytics", ...(await params).path] }) }); }
export async function PATCH(request: Request, { params }: Context) { return existingPatch(request, { params: Promise.resolve({ slug: ["analytics", ...(await params).path] }) }); }
