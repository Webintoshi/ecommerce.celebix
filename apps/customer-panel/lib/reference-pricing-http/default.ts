import "server-only";

import { randomUUID } from "node:crypto";

import { resolveDefaultServerPanelAccessRuntime } from "../server-panel-access/default.ts";
import { resolveServerReferencePricingRuntime } from "../server-reference-pricing/runtime.ts";
import { createReferencePricingHttpHandler } from "./handler.ts";

export const handleReferencePricingRequest = createReferencePricingHttpHandler({
  resolveRuntime: async () => resolveServerReferencePricingRuntime(await resolveDefaultServerPanelAccessRuntime()),
  now: () => new Date(),
  requestId: randomUUID,
});
