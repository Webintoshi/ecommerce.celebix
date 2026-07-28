import { createHash } from "node:crypto";

import type { TenantContext } from "@celebix/saas-contracts";
import type { CatalogMigrationJob, CatalogMigrationRepository } from "@celebix/saas-data";

import type { ProductMediaUploadService } from "../server-media/upload-service.ts";
import { fetchMigrationImage, type MigrationImage } from "./remote-image-fetcher.ts";
import { validateMigrationImageUrl } from "./remote-image-authority.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SOURCE_ID = /^[1-9][0-9]{0,19}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

export type MigrationMediaIngestionInput = Readonly<{
  tenantContext: TenantContext;
  now: Date;
  operationId: string;
  jobId: string;
  sourceProductId: string;
  ordinal: number;
  sourceUrl: string;
  altText: string;
}>;

export type MigrationMediaIngestionResult =
  | Readonly<{ kind: "committed"; productId: string; mediaId: string; replayed: true }>
  | Readonly<{ kind: "committed"; job: CatalogMigrationJob; productId: string; mediaId: string; replayed: boolean }>;

export type MigrationMediaIngestionDependencies = Readonly<{
  migration: CatalogMigrationRepository;
  upload: ProductMediaUploadService;
  fetchImage?: (url: string) => Promise<MigrationImage>;
}>;

function unavailable(): Error { return new Error("catalog_migration_media_unavailable"); }
export function deriveMigrationMediaUploadOperationId(input: Readonly<{ storeId: string; jobId: string; sourceProductId: string; ordinal: number }>): string {
  if (!UUID.test(input.storeId) || !UUID.test(input.jobId) || !SOURCE_ID.test(input.sourceProductId) || !Number.isSafeInteger(input.ordinal) || input.ordinal < 0 || input.ordinal > 15) throw unavailable();
  const hex = createHash("sha256").update("celebix-catalog-migration-media-v1\0").update(input.storeId).update("\0").update(input.jobId).update("\0").update(input.sourceProductId).update("\0").update(String(input.ordinal)).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
function exactInput(value: unknown): MigrationMediaIngestionInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw unavailable();
  const parsed = value as Record<string, unknown>;
  if (Object.keys(parsed).sort().join(",") !== "altText,jobId,now,operationId,ordinal,sourceProductId,sourceUrl,tenantContext"
    || typeof parsed.sourceProductId !== "string" || !SOURCE_ID.test(parsed.sourceProductId)
    || typeof parsed.operationId !== "string" || !UUID.test(parsed.operationId)
    || typeof parsed.jobId !== "string" || !UUID.test(parsed.jobId)
    || !Number.isSafeInteger(parsed.ordinal) || (parsed.ordinal as number) < 0 || (parsed.ordinal as number) > 15
    || typeof parsed.altText !== "string" || parsed.altText !== parsed.altText.trim() || parsed.altText.length > 500 || CONTROL.test(parsed.altText)
    || !(parsed.now instanceof Date) || !Number.isFinite(parsed.now.getTime())) throw unavailable();
  return value as MigrationMediaIngestionInput;
}

async function recordFailure(
  input: MigrationMediaIngestionInput,
  dependencies: MigrationMediaIngestionDependencies,
  sourceUrlDigest: string,
  safeFailureCode: "source_fetch_failed" | "media_upload_failed",
): Promise<never> {
  try {
    await dependencies.migration.recordMedia({
      tenantContext: input.tenantContext, now: input.now, operationId: input.operationId,
      jobId: input.jobId, sourceProductId: input.sourceProductId, ordinal: input.ordinal,
      sourceUrlDigest, outcome: "failed", safeFailureCode,
    });
  } catch {}
  throw unavailable();
}

export async function ingestMigrationMediaItem(
  value: unknown,
  dependencies: MigrationMediaIngestionDependencies,
): Promise<MigrationMediaIngestionResult> {
  const input = exactInput(value);
  if (!dependencies?.migration || typeof dependencies.migration.authorizeMedia !== "function"
    || typeof dependencies.migration.recordMedia !== "function" || !dependencies.upload
    || typeof dependencies.upload.upload !== "function") throw unavailable();
  let sourceUrl: string;
  try { sourceUrl = validateMigrationImageUrl(input.sourceUrl); } catch { throw unavailable(); }
  const sourceUrlDigest = createHash("sha256").update(sourceUrl).digest("hex");

  let authority;
  try {
    authority = await dependencies.migration.authorizeMedia({
      tenantContext: input.tenantContext, now: input.now, jobId: input.jobId,
      sourceProductId: input.sourceProductId, ordinal: input.ordinal, sourceUrlDigest,
    });
  } catch { throw unavailable(); }
  if (authority.jobId !== input.jobId || authority.sourceProductId !== input.sourceProductId
    || authority.ordinal !== input.ordinal || authority.sourceUrlDigest !== sourceUrlDigest) throw unavailable();
  if (authority.status === "committed") {
    if (!authority.committedMediaId) throw unavailable();
    return Object.freeze({ kind: "committed", productId: authority.productId, mediaId: authority.committedMediaId, replayed: true });
  }

  let image: MigrationImage;
  try { image = await (dependencies.fetchImage ?? fetchMigrationImage)(sourceUrl); }
  catch { return recordFailure(input, dependencies, sourceUrlDigest, "source_fetch_failed"); }

  let uploaded: Awaited<ReturnType<ProductMediaUploadService["upload"]>>;
  try {
    const uploadOperationId = authority.status === "pending"
      ? deriveMigrationMediaUploadOperationId({ storeId: input.tenantContext.store.id, jobId: input.jobId, sourceProductId: input.sourceProductId, ordinal: input.ordinal })
      : input.operationId;
    uploaded = await dependencies.upload.upload({
      tenantContext: input.tenantContext, operationId: uploadOperationId,
      productId: authority.productId, variantId: authority.variantId,
      mediaType: image.mediaType, altText: input.altText,
      width: image.width, height: image.height, bytes: image.bytes,
    });
  } catch { return recordFailure(input, dependencies, sourceUrlDigest, "media_upload_failed"); }
  if (uploaded.media.storeId !== input.tenantContext.store.id || uploaded.media.productId !== authority.productId
    || uploaded.media.status !== "active") throw unavailable();

  let job: CatalogMigrationJob;
  try {
    job = await dependencies.migration.recordMedia({
      tenantContext: input.tenantContext, now: input.now, operationId: input.operationId,
      jobId: input.jobId, sourceProductId: input.sourceProductId, ordinal: input.ordinal,
      sourceUrlDigest, outcome: "committed", mediaId: uploaded.media.id,
    });
  } catch { throw unavailable(); }
  return Object.freeze({ kind: "committed", job, productId: authority.productId, mediaId: uploaded.media.id, replayed: uploaded.replayed || job.replayed });
}
