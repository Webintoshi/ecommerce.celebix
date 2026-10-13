import { getDefaultCustomerPanelAuthRouteSet } from "../../../lib/panel-auth-route-mount/route-set.ts";

import {retireMerchantPasswordEntry} from "../../../lib/merchant-phone/runtime.ts";

export async function GET(request: Request) {
  return retireMerchantPasswordEntry(request) ?? getDefaultCustomerPanelAuthRouteSet().browserLogin(request);
}

export async function POST(request: Request) {
  return retireMerchantPasswordEntry(request) ?? getDefaultCustomerPanelAuthRouteSet().browserLogin(request);
}
