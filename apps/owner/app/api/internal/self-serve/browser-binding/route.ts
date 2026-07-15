import { getDefaultOwnerSelfServeAuthRouteSet } from "../../../../../lib/self-serve-auth-route-mount/route-set.ts";

const routeSet = getDefaultOwnerSelfServeAuthRouteSet();

export async function GET(request: Request) {
  return routeSet.internalBrowserBinding(request);
}

export async function POST(request: Request) {
  return routeSet.internalBrowserBinding(request);
}
