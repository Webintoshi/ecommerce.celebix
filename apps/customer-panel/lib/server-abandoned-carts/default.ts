import "server-only";

import process from "node:process";

import { initializeApprovedStagingServerAbandonedCartRuntime } from "./postgres-runtime.ts";
import { createServerAbandonedCartRuntimeResolver } from "./resolver.ts";

const resolver = createServerAbandonedCartRuntimeResolver({
  source: process.env,
  initialize: initializeApprovedStagingServerAbandonedCartRuntime,
  diagnostic(code) { console.error(code); },
});

export async function resolveDefaultServerAbandonedCartRuntime() {
  return resolver.resolve();
}
