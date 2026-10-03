import "server-only";
import { randomUUID } from "node:crypto";
import { resolveDefaultServerPanelAccessRuntime } from "../server-panel-access/default.ts";
import { resolveServerReviewCollectionRuntime } from "../server-review-collection/runtime.ts";
import { createReviewCollectionHttpHandlers } from "./handler.ts";
const handlers = createReviewCollectionHttpHandlers({ resolveRuntime: async () => resolveServerReviewCollectionRuntime(await resolveDefaultServerPanelAccessRuntime()), now: () => new Date(), requestId: randomUUID });
export const handleReviewCollectionOverview = handlers.overview;
export const handleReviewCollectionSettings = handlers.settings;
export const handleReviewCollectionRequest = handlers.request;
