import { createHash } from "node:crypto";
import { getPlanLimit, type TenantContext } from "@celebix/saas-contracts";
import { parseProductMedia, parseProductMediaReservation, type ProductMedia, type ProductMediaReservation } from "../../../saas-contracts/src/media/index.ts";
import { acquirePostgresClient, type PostgresClientLike } from "../postgres/pool.ts";
import { MEDIA_ERROR_CODES, ProductMediaRepositoryError, type MediaErrorCode } from "./errors.ts";
import type { ArchiveProductMediaInput, MediaMutationResult, PostgresProductMediaRepositoryOptions, ProductMediaLifecycleInput, ProductMediaRepository, ReserveProductMediaInput } from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const EXPECTED = new Set<string>(MEDIA_ERROR_CODES);
type Authority = Readonly<{ storeId: string; principalId: string; membershipId: string; planId: string; planCode: string; planVersion: number; storageBytes: number; now: Date }>;
type ReservationAuthority = Readonly<{
  storeId: string;
  operationId: string;
  mediaId: string;
  productId: string;
  payloadSha256: string;
  mediaType?: string;
  byteSize?: number;
}>;

function failure(code: MediaErrorCode): ProductMediaRepositoryError { return new ProductMediaRepositoryError(code); }
function timeout(value: number): string { if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) throw failure("unavailable"); return `${value}ms`; }
function exact<T extends object>(value: T, keys: readonly string[], optional: readonly string[] = []): T { if (!value || typeof value !== "object" || Array.isArray(value)) throw failure("invalid_input"); const allowed = new Set([...keys, ...optional]); if (keys.some((key) => !Object.hasOwn(value, key)) || Object.keys(value).some((key) => !allowed.has(key))) throw failure("invalid_input"); return value; }
function uuid(value: unknown): string { if (typeof value !== "string" || !UUID.test(value)) throw failure("invalid_input"); return value; }
function string(value: unknown, minimum: number, maximum: number): string { if (typeof value !== "string" || value.length < minimum || value.length > maximum || value !== value.trim() || CONTROL.test(value)) throw failure("invalid_input"); return value; }
function integer(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number { if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) throw failure("invalid_input"); return value as number; }
function authority(context: TenantContext, now: Date): Authority {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || !context || context.store.status !== "active" || context.membership.status !== "active") throw failure("invalid_input");
  const storageBytes = getPlanLimit(context.entitlements, "storageBytes");
  if (!Number.isSafeInteger(storageBytes) || storageBytes < 0) throw failure("invalid_input");
  return Object.freeze({ storeId: uuid(context.store.id), principalId: uuid(context.principal.id), membershipId: uuid(context.membership.id), planId: uuid(context.entitlements.planId), planCode: string(context.entitlements.planCode, 1, 64), planVersion: integer(context.entitlements.version, 1), storageBytes, now: new Date(now) });
}
function values(value: Authority): unknown[] { return [value.storeId, value.principalId, value.membershipId, value.planId, value.planCode, value.planVersion, value.storageBytes, value.now]; }
function result(rows: unknown[]): { outcome: string; resultPayload: unknown } { if (rows.length !== 1 || typeof rows[0] !== "object" || rows[0] === null || Array.isArray(rows[0])) throw failure("unavailable"); const row = rows[0] as Record<string, unknown>; if (Object.keys(row).sort().join(",") !== "outcome,result_payload" || typeof row.outcome !== "string") throw failure("unavailable"); return { outcome: row.outcome, resultPayload: row.result_payload }; }
function mediaPayload(value: unknown): ProductMedia { if (typeof value !== "object" || value === null || Array.isArray(value) || Object.keys(value).join(",") !== "media") throw failure("unavailable"); try { return parseProductMedia((value as { media: unknown }).media); } catch { throw failure("unavailable"); } }
function fingerprint(kind: string, input: unknown): string { return createHash("sha256").update(JSON.stringify({ kind, input })).digest("hex"); }

export class PostgresProductMediaRepository implements ProductMediaRepository {
  private readonly options: PostgresProductMediaRepositoryOptions;
  private readonly mediaOrigin: string;
  constructor(options: PostgresProductMediaRepositoryOptions) {
    if (!options || options.role !== "celebix_saas_app") throw failure("unavailable");
    timeout(options.timeouts.poolCheckoutMs); timeout(options.timeouts.statementMs); timeout(options.timeouts.lockMs); timeout(options.timeouts.idleTransactionMs);
    try {
      const origin = new URL(options.mediaOrigin);
      if (origin.protocol !== "https:" || origin.username || origin.password || origin.port || origin.pathname !== "/" || origin.search || origin.hash || origin.origin !== options.mediaOrigin) throw failure("unavailable");
      this.mediaOrigin = origin.origin;
    } catch { throw failure("unavailable"); }
    this.options = options;
  }
  private async configure(client: PostgresClientLike): Promise<void> { await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [timeout(this.options.timeouts.statementMs)]); await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [timeout(this.options.timeouts.lockMs)]); await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [timeout(this.options.timeouts.idleTransactionMs)]); await client.query("SET LOCAL ROLE celebix_saas_app"); }
  private expected(outcome: string): never { if (EXPECTED.has(outcome)) throw failure(outcome as MediaErrorCode); throw failure("unavailable"); }
  private audit(): void { try { const pending = this.options.audit({ type: "media_commit_unknown" }); if (pending) void pending.catch(() => undefined); } catch { /* Durable authority never depends on audit. */ } }
  private async execute(text: string, parameters: unknown[], readOnly: boolean): Promise<{ outcome: string; resultPayload: unknown }> {
    let client: PostgresClientLike; try { client = await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs); } catch { throw failure("unavailable"); }
    let began = false, terminal = false;
    try { await client.query(readOnly ? "BEGIN READ ONLY" : "BEGIN ISOLATION LEVEL READ COMMITTED"); began = true; await this.configure(client); const selected = result((await client.query(text, parameters)).rows); try { await client.query("COMMIT"); terminal = true; client.release(); } catch { terminal = true; client.release(true); if (!readOnly) this.audit(); throw failure("unavailable"); } return selected; }
    catch (caught) { if (began && !terminal) { try { await client.query("ROLLBACK"); client.release(); } catch { client.release(true); } } else if (!terminal) client.release(true); if (caught instanceof ProductMediaRepositoryError) throw caught; throw failure("unavailable"); }
  }
  private mutationOutcome(selected: { outcome: string; resultPayload: unknown }): MediaMutationResult { if (selected.outcome !== "committed" && selected.outcome !== "operation_replayed") this.expected(selected.outcome); return Object.freeze({ media: mediaPayload(selected.resultPayload), replayed: selected.outcome === "operation_replayed" }); }
  private archiveOutcome(selected: { outcome: string; resultPayload: unknown }): MediaMutationResult {
    if (!["reserved", "committed", "deleted", "operation_replayed", "found"].includes(selected.outcome)) this.expected(selected.outcome);
    return Object.freeze({ media: mediaPayload(selected.resultPayload), replayed: ["operation_replayed", "found"].includes(selected.outcome) });
  }
  private reservationOutcome(selected: { outcome: string; resultPayload: unknown }, expected: ReservationAuthority): ProductMediaReservation {
    if (!["reserved", "uploaded", "committed", "cleanup_required", "deleted", "operation_replayed", "found"].includes(selected.outcome)) this.expected(selected.outcome);
    try {
      const parsed = parseProductMediaReservation(selected.resultPayload, expected.storeId);
      const extension = parsed.mediaType === "image/jpeg" ? "jpg" : parsed.mediaType.slice("image/".length);
      const objectKey = `stores/${expected.storeId}/products/${expected.productId}/${expected.mediaId}.${extension}`;
      if (
        parsed.operationId !== expected.operationId || parsed.mediaId !== expected.mediaId ||
        parsed.productId !== expected.productId || parsed.payloadSha256 !== expected.payloadSha256 ||
        parsed.objectKey !== objectKey || parsed.publicUrl !== `${this.mediaOrigin}/${objectKey}` ||
        (expected.mediaType !== undefined && parsed.mediaType !== expected.mediaType) ||
        (expected.byteSize !== undefined && parsed.byteSize !== expected.byteSize) ||
        (["reserved", "uploaded", "committed", "cleanup_required", "deleted"].includes(selected.outcome) && parsed.state !== selected.outcome)
      ) throw failure("unavailable");
      return parsed;
    } catch { throw failure("unavailable"); }
  }
  async reserveProductMedia(input: ReserveProductMediaInput): Promise<ProductMediaReservation> {
    const parsed = exact(input, ["tenantContext", "now", "operationId", "mediaId", "productId", "mediaType", "altText", "width", "height", "byteSize", "payloadSha256"], ["variantId"]);
    const auth = authority(parsed.tenantContext, parsed.now);
    const operationId = uuid(parsed.operationId), mediaId = uuid(parsed.mediaId), productId = uuid(parsed.productId);
    const variantId = parsed.variantId === undefined ? null : uuid(parsed.variantId);
    const mediaType = string(parsed.mediaType, 9, 10);
    if (!["image/jpeg", "image/png", "image/webp"].includes(mediaType)) throw failure("invalid_input");
    const extension = mediaType === "image/jpeg" ? "jpg" : mediaType.slice("image/".length);
    const objectKey = `stores/${auth.storeId}/products/${productId}/${mediaId}.${extension}`;
    const publicUrl = `${this.mediaOrigin}/${objectKey}`;
    const altText = string(parsed.altText, 0, 500), width = integer(parsed.width, 1, 8192), height = integer(parsed.height, 1, 8192);
    const byteSize = integer(parsed.byteSize, 1, 5_242_880);
    const payloadSha256 = string(parsed.payloadSha256, 64, 64);
    if (!/^[a-f0-9]{64}$/.test(payloadSha256)) throw failure("invalid_input");
    const payloadFingerprint = fingerprint("reserve_media", { mediaId, productId, variantId, objectKey, publicUrl, mediaType, altText, width, height, byteSize, payloadSha256 });
    const selected = await this.execute(
      "SELECT outcome,result_payload FROM saas.media_reserve_product($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz,$9::uuid,$10::text,$11::uuid,$12::uuid,$13::uuid,$14::text,$15::text,$16::text,$17::text,$18::integer,$19::integer,$20::bigint,$21::text)",
      [...values(auth), operationId, payloadFingerprint, mediaId, productId, variantId, objectKey, publicUrl, mediaType, altText, width, height, byteSize, payloadSha256],
      false,
    );
    return this.reservationOutcome(selected, { storeId: auth.storeId, operationId, mediaId, productId, payloadSha256, mediaType, byteSize });
  }
  private async lifecycle(input: ProductMediaLifecycleInput, functionName: string, readOnly: boolean): Promise<ProductMediaReservation> {
    const parsed = exact(input, ["tenantContext", "now", "operationId", "mediaId", "productId", "payloadSha256"]);
    const auth = authority(parsed.tenantContext, parsed.now);
    const operationId = uuid(parsed.operationId), mediaId = uuid(parsed.mediaId), productId = uuid(parsed.productId);
    const payloadSha256 = string(parsed.payloadSha256, 64, 64);
    if (!/^[a-f0-9]{64}$/.test(payloadSha256)) throw failure("invalid_input");
    const selected = await this.execute(
      `SELECT outcome,result_payload FROM saas.${functionName}($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz,$9::uuid,$10::uuid,$11::uuid,$12::text)`,
      [...values(auth), operationId, mediaId, productId, payloadSha256],
      readOnly,
    );
    return this.reservationOutcome(selected, { storeId: auth.storeId, operationId, mediaId, productId, payloadSha256 });
  }
  markProductMediaUploaded(input: ProductMediaLifecycleInput): Promise<ProductMediaReservation> { return this.lifecycle(input, "media_mark_product_uploaded", false); }
  finalizeProductMedia(input: ProductMediaLifecycleInput): Promise<ProductMediaReservation> { return this.lifecycle(input, "media_finalize_product", false); }
  recoverProductMediaOperation(input: ProductMediaLifecycleInput): Promise<ProductMediaReservation> { return this.lifecycle(input, "media_recover_product_operation", true); }
  requireProductMediaCleanup(input: ProductMediaLifecycleInput): Promise<ProductMediaReservation> { return this.lifecycle(input, "media_require_product_cleanup", false); }
  markProductMediaDeleted(input: ProductMediaLifecycleInput): Promise<ProductMediaReservation> { return this.lifecycle(input, "media_mark_product_deleted", false); }
  async listProductMedia(input: Parameters<ProductMediaRepository["listProductMedia"]>[0]): Promise<readonly ProductMedia[]> { const parsed = exact(input, ["tenantContext", "now", "productId"], ["includeArchived"]); const auth = authority(parsed.tenantContext, parsed.now); if (parsed.includeArchived !== undefined && typeof parsed.includeArchived !== "boolean") throw failure("invalid_input"); const selected = await this.execute("SELECT outcome,result_payload FROM saas.media_list_product($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz,$9::uuid,$10::boolean)", [...values(auth), uuid(parsed.productId), parsed.includeArchived ?? false], true); if (selected.outcome !== "found") this.expected(selected.outcome); if (!Array.isArray(selected.resultPayload)) throw failure("unavailable"); try { return Object.freeze(selected.resultPayload.map(parseProductMedia)); } catch { throw failure("unavailable"); } }
  async updateAltText(input: Parameters<ProductMediaRepository["updateAltText"]>[0]): Promise<MediaMutationResult> { const parsed = exact(input, ["tenantContext", "now", "operationId", "productId", "mediaId", "expectedVersion", "altText"]); const auth = authority(parsed.tenantContext, parsed.now); const payload = { productId: uuid(parsed.productId), mediaId: uuid(parsed.mediaId), expectedVersion: integer(parsed.expectedVersion, 1), altText: string(parsed.altText, 0, 500) }; return this.mutationOutcome(await this.execute("SELECT outcome,result_payload FROM saas.media_update_alt($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz,$9::uuid,$10::text,$11::uuid,$12::uuid,$13::bigint,$14::text)", [...values(auth), uuid(parsed.operationId), fingerprint("update_alt", payload), payload.productId, payload.mediaId, payload.expectedVersion, payload.altText], false)); }
  async reorderMedia(input: Parameters<ProductMediaRepository["reorderMedia"]>[0]): Promise<readonly ProductMedia[]> { const parsed = exact(input, ["tenantContext", "now", "operationId", "productId", "orderedMediaIds"]); const auth = authority(parsed.tenantContext, parsed.now); if (!Array.isArray(parsed.orderedMediaIds) || parsed.orderedMediaIds.length < 1 || parsed.orderedMediaIds.length > 16) throw failure("invalid_input"); const ordered = Object.freeze(parsed.orderedMediaIds.map(uuid)); if (new Set(ordered).size !== ordered.length) throw failure("invalid_input"); const selected = await this.execute("SELECT outcome,result_payload FROM saas.media_reorder_product($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz,$9::uuid,$10::text,$11::uuid,$12::uuid[])", [...values(auth), uuid(parsed.operationId), fingerprint("reorder_media", { productId: parsed.productId, ordered }), uuid(parsed.productId), ordered], false); if (selected.outcome !== "committed" && selected.outcome !== "operation_replayed") this.expected(selected.outcome); if (!Array.isArray(selected.resultPayload)) throw failure("unavailable"); try { return Object.freeze(selected.resultPayload.map(parseProductMedia)); } catch { throw failure("unavailable"); } }
  private async archiveLifecycle(input: ArchiveProductMediaInput, functionName: "media_reserve_product_archive" | "media_finalize_product_archive" | "media_recover_product_archive", readOnly: boolean): Promise<MediaMutationResult> {
    const parsed = exact(input, ["tenantContext", "now", "operationId", "productId", "mediaId", "expectedVersion"]);
    const auth = authority(parsed.tenantContext, parsed.now);
    const payload = { productId: uuid(parsed.productId), mediaId: uuid(parsed.mediaId), expectedVersion: integer(parsed.expectedVersion, 1) };
    const selected = await this.execute(
      `SELECT outcome,result_payload FROM saas.${functionName}($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz,$9::uuid,$10::text,$11::uuid,$12::uuid,$13::bigint)`,
      [...values(auth), uuid(parsed.operationId), fingerprint("archive_media", payload), payload.productId, payload.mediaId, payload.expectedVersion],
      readOnly,
    );
    return this.archiveOutcome(selected);
  }
  reserveArchiveMedia(input: ArchiveProductMediaInput): Promise<MediaMutationResult> { return this.archiveLifecycle(input, "media_reserve_product_archive", false); }
  finalizeArchiveMedia(input: ArchiveProductMediaInput): Promise<MediaMutationResult> { return this.archiveLifecycle(input, "media_finalize_product_archive", false); }
  recoverArchiveMedia(input: ArchiveProductMediaInput): Promise<MediaMutationResult> { return this.archiveLifecycle(input, "media_recover_product_archive", true); }
  async markArchivedProductMediaObjectDeleted(input: Parameters<ProductMediaRepository["markArchivedProductMediaObjectDeleted"]>[0]): Promise<MediaMutationResult> {
    const parsed = exact(input, ["tenantContext", "now", "operationId", "productId", "mediaId", "objectKey"]);
    const auth = authority(parsed.tenantContext, parsed.now);
    const operationId = uuid(parsed.operationId), productId = uuid(parsed.productId), mediaId = uuid(parsed.mediaId);
    const objectKey = string(parsed.objectKey, 1, 512);
    if (!new RegExp(`^stores/${auth.storeId}/products/${productId}/${mediaId}\\.(?:jpg|png|webp)$`).test(objectKey)) throw failure("invalid_input");
    const selected = await this.execute(
      "SELECT outcome,result_payload FROM saas.media_mark_archived_object_deleted($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz,$9::uuid,$10::uuid,$11::uuid,$12::text)",
      [...values(auth), operationId, mediaId, productId, objectKey],
      false,
    );
    if (selected.outcome !== "deleted" && selected.outcome !== "operation_replayed") this.expected(selected.outcome);
    return Object.freeze({ media: mediaPayload(selected.resultPayload), replayed: selected.outcome === "operation_replayed" });
  }
}
