import "server-only";
import { randomUUID } from "node:crypto";
import { resolveDefaultServerPanelAccessRuntime } from "../server-panel-access/default.ts";
import { resolveServerProductPageReviewRuntime } from "../server-product-page-reviews/runtime.ts";
import { createProductPageReviewHttpHandlers } from "./handler.ts";
const handlers = createProductPageReviewHttpHandlers({ resolveRuntime: async () => resolveServerProductPageReviewRuntime(await resolveDefaultServerPanelAccessRuntime()), now: () => new Date(), requestId: randomUUID });
export const handleProductPageReviewSettings = handlers.get;
export const handleProductPageReviewSettingsSave = handlers.save;
