import type { ReviewCollectionRepository } from "@celebix/saas-data";
import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";
import { resolveServerCatalogAdminRuntime, type ServerCatalogAdminRuntime } from "../server-catalog-admin/runtime.ts";
export type ServerReviewCollectionRuntime = ServerCatalogAdminRuntime & Readonly<{ reviewCollection: ReviewCollectionRepository }>;
const repositories = new WeakMap<ServerPanelAccessRuntime, ReviewCollectionRepository>();
export function registerServerReviewCollectionRepository(access: ServerPanelAccessRuntime, repository: ReviewCollectionRepository): void {
  if (!access || access.readiness.mode !== "approved_staging" || !repository || ["overview", "saveSettings", "requestOrder"].some(key => typeof repository[key as keyof ReviewCollectionRepository] !== "function") || repositories.has(access)) throw new Error("review_collection_runtime_invalid");
  repositories.set(access, repository);
}
export function resolveServerReviewCollectionRuntime(access: ServerPanelAccessRuntime): ServerReviewCollectionRuntime | null { const catalog = resolveServerCatalogAdminRuntime(access), repository = repositories.get(access); return catalog && repository ? Object.freeze({ ...catalog, reviewCollection: repository }) : null; }
