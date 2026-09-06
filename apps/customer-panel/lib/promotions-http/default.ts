import "server-only";

import { randomUUID } from "node:crypto";

import { resolveDefaultServerPanelAccessRuntime } from "../server-panel-access/default.ts";
import { resolveServerPromotionsRuntime } from "../server-promotions/runtime.ts";
import { createPromotionsHttpHandler } from "./handler.ts";

const handler = createPromotionsHttpHandler({
  async resolveRuntime() {
    return resolveServerPromotionsRuntime(await resolveDefaultServerPanelAccessRuntime());
  },
  now: () => new Date(),
  requestId: randomUUID,
});

export const handleDefaultPromotionsRequest = handler;
