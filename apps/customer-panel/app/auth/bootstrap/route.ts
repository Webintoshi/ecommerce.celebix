import { getDefaultCustomerPanelAuthRouteSet } from "../../../lib/panel-auth-route-mount/route-set.ts";

const routeSet = getDefaultCustomerPanelAuthRouteSet();

export async function GET(request: Request) {
  return routeSet.browserBootstrap(request);
}

export async function POST(request: Request) {
  return routeSet.browserBootstrap(request);
}
