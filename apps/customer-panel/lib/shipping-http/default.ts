import "server-only";

import { randomUUID } from "node:crypto";

import { resolveDefaultServerPanelAccessRuntime } from "../server-panel-access/default.ts";
import { resolveServerShippingRuntime } from "../server-shipping/runtime.ts";
import { runShippingValidationJob } from "../server-shipping/validation-worker.ts";
import { createShippingHttpHandlers } from "./handler.ts";

async function runtime() {
  return resolveServerShippingRuntime(await resolveDefaultServerPanelAccessRuntime());
}

const handlers = createShippingHttpHandlers({
  resolveRuntime: runtime,
  now: () => new Date(),
  requestId: randomUUID,
  validateJob: ({ jobId, workerId, runtime: selectedRuntime }) => runShippingValidationJob({
    jobId,
    workerId,
    runtime: selectedRuntime,
  }),
});

export const handleShippingConnection = handlers.connection;
export const handleShippingConnectionResources = handlers.resources;
export const handleShippingConnectionRevoke = handlers.revoke;
