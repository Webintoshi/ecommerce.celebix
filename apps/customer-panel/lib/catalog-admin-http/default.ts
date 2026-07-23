import "server-only";
import { randomUUID } from "node:crypto";
import { resolveDefaultServerPanelAccessRuntime } from "../server-panel-access/default.ts";
import { resolveServerCatalogAdminRuntime } from "../server-catalog-admin/runtime.ts";
import { createCatalogAdminHttpHandlers } from "./handler.ts";
async function runtime() { return resolveServerCatalogAdminRuntime(await resolveDefaultServerPanelAccessRuntime()); }
const handlers = createCatalogAdminHttpHandlers({ resolveRuntime: runtime, now: () => new Date(), requestId: randomUUID });
type ResourceContext = Readonly<{ params: Promise<Readonly<{ kind: string; resourceId?: string }>> }>;
type ReviewContext = Readonly<{ params: Promise<Readonly<{ reviewId: string }>> }>;
type PreviewContext = Readonly<{ params: Promise<Readonly<{ previewId: string }>> }>;
export async function handleCatalogAdminResources(request: Request, context: ResourceContext) { return handlers.resources(request, (await context.params).kind); }
export async function handleCatalogAdminResourceSave(request: Request, context: ResourceContext) { return handlers.saveResource(request, (await context.params).kind); }
export async function handleCatalogAdminResourceArchive(request: Request, context: ResourceContext) { const params = await context.params; return handlers.archiveResource(request, params.kind, params.resourceId); }
export const handleCatalogAdminReviews = handlers.reviews;
export async function handleCatalogAdminReviewModeration(request: Request, context: ReviewContext) { return handlers.moderateReview(request, (await context.params).reviewId); }
export const handleCatalogAdminImports = handlers.imports;
export const handleCatalogAdminImportProducts = handlers.importProducts;
export const handleCatalogAdminImportPreviewPrepare = handlers.prepareImportPreview;
export async function handleCatalogAdminImportPreview(request: Request, context: PreviewContext) { return handlers.getImportPreview(request, (await context.params).previewId); }
export async function handleCatalogAdminImportPreviewCommit(request: Request, context: PreviewContext) { return handlers.commitImportPreview(request, (await context.params).previewId); }
