import process from "node:process";

import {
  createDisabledCustomerPanelAuthRouteSet,
  createUnavailableCustomerPanelStagingAuthRouteSet,
  type CustomerPanelAuthRouteSet,
} from "../panel-auth-route-mount/route-set.ts";
import { createCustomerPanelStagingAuthRouteSetResolver } from "./resolver.ts";
import { initializeCustomerPanelStagingAuthRouteSet } from "./runtime.ts";

const resolver = createCustomerPanelStagingAuthRouteSetResolver<CustomerPanelAuthRouteSet>({
  source: process.env,
  disabled: createDisabledCustomerPanelAuthRouteSet,
  unavailable: createUnavailableCustomerPanelStagingAuthRouteSet,
  initialize: initializeCustomerPanelStagingAuthRouteSet,
  diagnostic(code) { console.error(code); },
});

export function resolveDefaultCustomerPanelStagingAuthRouteSet(): Promise<CustomerPanelAuthRouteSet> {
  return resolver.resolve();
}
