import "server-only";

import process from "node:process";

import { initializeApprovedStagingServerPanelAccessRuntime } from "./postgres-runtime.ts";
import { createServerPanelAccessRuntimeResolver } from "./resolver.ts";
import {
  createDisabledServerPanelAccessRuntime,
  createUnavailableServerPanelAccessRuntime,
} from "./runtime.ts";

const resolver = createServerPanelAccessRuntimeResolver({
  source: process.env,
  disabled: createDisabledServerPanelAccessRuntime,
  unavailable: createUnavailableServerPanelAccessRuntime,
  initialize: initializeApprovedStagingServerPanelAccessRuntime,
  diagnostic(code) { console.error(code); },
});

export async function resolveDefaultServerPanelAccess(input: Readonly<{
  credential: string | null;
  requestId: string;
  now: Date;
}>) {
  const runtime = await resolver.resolve();
  return runtime.resolveCredential(input);
}
