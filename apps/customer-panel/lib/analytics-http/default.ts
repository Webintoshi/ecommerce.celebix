import "server-only";
import { randomUUID } from "node:crypto";
import { resolveDefaultServerPanelAccessRuntime } from "../server-panel-access/default.ts";
import { resolveServerAnalyticsRuntime } from "../server-analytics/runtime.ts";
import { createAnalyticsHttpHandlers } from "./handler.ts";
async function runtime() { return resolveServerAnalyticsRuntime(await resolveDefaultServerPanelAccessRuntime()); }
const handlers = createAnalyticsHttpHandlers({ resolveRuntime: runtime, now: () => new Date(), requestId: randomUUID });
export const handleDefaultAnalyticsDashboard = handlers.dashboard;
export const handleDefaultAnalyticsExport = handlers.export;
