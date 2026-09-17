import { getDefaultCustomerPanelAuthRouteSet } from "../../../lib/panel-auth-route-mount/route-set.ts";
export const runtime = "nodejs";
export async function POST(request: Request) { return getDefaultCustomerPanelAuthRouteSet().invitationStart(request); }
