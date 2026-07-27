import "server-only";
import { randomUUID } from "node:crypto";
import { resolveDefaultServerPanelAccessRuntime } from "../server-panel-access/default.ts";
import { resolveServerPricingRuntime } from "../server-pricing/runtime.ts";
import { createPricingHttpHandler } from "./handler.ts";
export const handlePricingRequest = createPricingHttpHandler({ resolveRuntime: async () => resolveServerPricingRuntime(await resolveDefaultServerPanelAccessRuntime()), now: () => new Date(), requestId: randomUUID });
