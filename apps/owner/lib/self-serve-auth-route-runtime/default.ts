import process from "node:process";

import {
  createDisabledOwnerSelfServeAuthRouteSet,
  createUnavailableOwnerStagingAuthRouteSet,
  type OwnerSelfServeAuthRouteSet,
} from "../self-serve-auth-route-mount/route-set.ts";
import { createOwnerStagingAuthRouteSetResolver } from "./resolver.ts";
import { initializeOwnerStagingAuthRouteSet } from "./runtime.ts";

const resolver = createOwnerStagingAuthRouteSetResolver<OwnerSelfServeAuthRouteSet>({
  source: process.env,
  disabled: createDisabledOwnerSelfServeAuthRouteSet,
  unavailable: createUnavailableOwnerStagingAuthRouteSet,
  initialize: initializeOwnerStagingAuthRouteSet,
  diagnostic(code) { console.error(code); },
});

export function resolveDefaultOwnerStagingAuthRouteSet(): Promise<OwnerSelfServeAuthRouteSet> {
  return resolver.resolve();
}
