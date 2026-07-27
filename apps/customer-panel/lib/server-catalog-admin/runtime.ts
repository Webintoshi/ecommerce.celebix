import type { CatalogAdminRepository } from "@celebix/saas-data";
import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";

type Approved = ServerPanelAccessRuntime & Readonly<{ readiness: Readonly<{ mode: "approved_staging" }>; panelOrigin: string }>;
export type ServerCatalogAdminRuntime = Readonly<{ access: Approved; catalogAdmin: CatalogAdminRepository }>;
const repositories = new WeakMap<ServerPanelAccessRuntime, CatalogAdminRepository>();
const METHODS = Object.freeze(["listResources", "getResource", "saveResource", "archiveResource", "listReviews", "moderateReview", "listImports", "importProducts", "importProductsV2", "authorizeFeedPreview", "prepareImport", "getImportPreview", "commitImportPreview"] as const);
function invalid(): never { throw new Error("server_catalog_admin_runtime_invalid"); }
function facade(repository: CatalogAdminRepository): CatalogAdminRepository { if (!repository || METHODS.some((method) => typeof repository[method] !== "function")) invalid(); return Object.freeze(Object.fromEntries(METHODS.map((method) => [method, repository[method].bind(repository)])) as unknown as CatalogAdminRepository); }
export function registerServerCatalogAdminRepository(access: ServerPanelAccessRuntime, repository: CatalogAdminRepository) { try { if (!access || access.readiness.mode !== "approved_staging" || access.panelOrigin === null || repositories.has(access)) invalid(); repositories.set(access, facade(repository)); } catch { invalid(); } }
export function resolveServerCatalogAdminRuntime(access: ServerPanelAccessRuntime): ServerCatalogAdminRuntime | null { try { if (!access || access.readiness.mode !== "approved_staging" || access.panelOrigin === null) return null; const catalogAdmin = repositories.get(access); return catalogAdmin ? Object.freeze({ access: access as Approved, catalogAdmin }) : null; } catch { return null; } }
