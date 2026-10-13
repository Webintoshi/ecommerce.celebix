import { getDefaultCustomerPanelAuthRouteSet } from "../../../lib/panel-auth-route-mount/route-set.ts";

const routeSet = getDefaultCustomerPanelAuthRouteSet();

export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get("state")?.startsWith("inv_")) {
    const { retiredInvitationResponse } = await import("../../../lib/platform-invitations/handlers.ts");
    return retiredInvitationResponse();
  }
  return routeSet.browserCallback(request);
}

export async function POST(request: Request) {
  return routeSet.browserCallback(request);
}
