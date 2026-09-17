import { getDefaultCustomerPanelAuthRouteSet } from "../../../lib/panel-auth-route-mount/route-set.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return getDefaultCustomerPanelAuthRouteSet().invitationAccept(request); }
export async function POST(request: Request) { return getDefaultCustomerPanelAuthRouteSet().invitationAccept(request); }
