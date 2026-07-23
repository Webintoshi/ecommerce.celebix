import "server-only";

import { randomUUID } from "node:crypto";

import { resolveDefaultServerPanelAccessRuntime } from "../server-panel-access/default.ts";
import { resolveServerInventoryRuntime } from "../server-inventory/runtime.ts";
import { createInventoryHttpHandler } from "./handler.ts";

async function runtime() {
  return resolveServerInventoryRuntime(await resolveDefaultServerPanelAccessRuntime());
}

export const handleInventoryRequest = createInventoryHttpHandler({
  resolveRuntime: runtime,
  now: () => new Date(),
  requestId: randomUUID,
});
