import type { AnalyticsRepository } from "@celebix/saas-data";
import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";

type ApprovedAccess = ServerPanelAccessRuntime & Readonly<{ readiness: Readonly<{ mode: "approved_staging" }>; panelOrigin: string }>;
export type ServerAnalyticsRuntime = Readonly<{ access: ApprovedAccess; analytics: AnalyticsRepository }>;

const repositories = new WeakMap<ServerPanelAccessRuntime, AnalyticsRepository>();
function invalid(): never { throw new Error("server_analytics_runtime_invalid"); }
function facade(repository: AnalyticsRepository): AnalyticsRepository {
  if (!repository || typeof repository.dashboard !== "function") invalid();
  return Object.freeze({ dashboard: repository.dashboard.bind(repository) });
}
export function registerServerAnalyticsRepository(access: ServerPanelAccessRuntime, repository: AnalyticsRepository): void {
  try { if (!access || access.readiness.mode !== "approved_staging" || access.panelOrigin === null || repositories.has(access)) invalid(); repositories.set(access, facade(repository)); } catch { invalid(); }
}
export function resolveServerAnalyticsRuntime(access: ServerPanelAccessRuntime): ServerAnalyticsRuntime | null {
  try { if (!access || access.readiness.mode !== "approved_staging" || access.panelOrigin === null) return null; const analytics = repositories.get(access); return analytics ? Object.freeze({ access: access as ApprovedAccess, analytics }) : null; } catch { return null; }
}
