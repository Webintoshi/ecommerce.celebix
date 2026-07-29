import { getDefaultOwnerSelfServeAuthRouteSet } from "../../../../lib/self-serve-auth-route-mount/route-set.ts";

const routeSet = getDefaultOwnerSelfServeAuthRouteSet();

export async function GET(request: Request) {
  return routeSet.publicRegistration(request);
}

export async function POST(request: Request) {
  return routeSet.publicRegistration(request);
}
