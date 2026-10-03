import { getDefaultCustomerPanelAuthRouteSet } from "../../../lib/panel-auth-route-mount/route-set.ts";

const routeSet = getDefaultCustomerPanelAuthRouteSet();

export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get("state")?.startsWith("inv_")) {
    const { invitationBrowserHandlers } = await import("../../../lib/platform-invitations/runtime.ts");
    return invitationBrowserHandlers.callback(request);
  }
  return routeSet.browserCallback(request);
}

export async function POST(request: Request) {
  return routeSet.browserCallback(request);
}
