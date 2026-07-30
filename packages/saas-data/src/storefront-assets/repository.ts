import { createHash } from "node:crypto";
import { getPlanLimit, parseStorefrontAsset, STOREFRONT_ASSET_KINDS, type StorefrontAsset, type StorefrontAssetKind, type TenantContext } from "@celebix/saas-contracts";
import { acquirePostgresClient, type PostgresClientLike } from "../postgres/pool.ts";
import { STOREFRONT_ASSET_ERROR_CODES, type ArchiveStorefrontAssetInput, type CreateStorefrontAssetInput, type ListStorefrontAssetsInput, type PostgresStorefrontAssetRepositoryOptions, type RecoverStorefrontAssetOperationInput, type StorefrontAssetErrorCode, type StorefrontAssetMutationResult, type StorefrontAssetRecoveryResult, type StorefrontAssetRepository } from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const EXPECTED = new Set<string>(STOREFRONT_ASSET_ERROR_CODES);
type Authority = Readonly<{ storeId: string; principalId: string; membershipId: string; planId: string; planCode: string; planVersion: number; storageBytes: number; now: Date }>;

export class StorefrontAssetRepositoryError extends Error {
  readonly code: StorefrontAssetErrorCode;
  constructor(code: StorefrontAssetErrorCode) { super(code); this.name = "StorefrontAssetRepositoryError"; this.code = code; Object.freeze(this); }
}
function failure(code: StorefrontAssetErrorCode): StorefrontAssetRepositoryError { return new StorefrontAssetRepositoryError(code); }
function timeout(value: number): string { if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) throw failure("unavailable"); return `${value}ms`; }
function exact<T extends object>(value: T, keys: readonly string[], optional: readonly string[] = []): T { if (!value || typeof value !== "object" || Array.isArray(value)) throw failure("invalid_input"); const allowed = new Set([...keys, ...optional]); if (keys.some((key) => !Object.hasOwn(value, key)) || Object.keys(value).some((key) => !allowed.has(key))) throw failure("invalid_input"); return value; }
function uuid(value: unknown): string { if (typeof value !== "string" || !UUID.test(value)) throw failure("invalid_input"); return value; }
function text(value: unknown, minimum: number, maximum: number): string { if (typeof value !== "string" || value.length < minimum || value.length > maximum || value !== value.trim() || CONTROL.test(value)) throw failure("invalid_input"); return value; }
function integer(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number { if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) throw failure("invalid_input"); return value as number; }
function authority(context: TenantContext, now: Date): Authority {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || !context || context.store.status !== "active" || context.membership.status !== "active") throw failure("invalid_input");
  const storageBytes = getPlanLimit(context.entitlements, "storageBytes");
  if (!Number.isSafeInteger(storageBytes) || storageBytes < 0) throw failure("invalid_input");
  return Object.freeze({ storeId: uuid(context.store.id), principalId: uuid(context.principal.id), membershipId: uuid(context.membership.id), planId: uuid(context.entitlements.planId), planCode: text(context.entitlements.planCode, 1, 64), planVersion: integer(context.entitlements.version, 1), storageBytes, now: new Date(now) });
}
function authorityValues(value: Authority): unknown[] { return [value.storeId, value.principalId, value.membershipId, value.planId, value.planCode, value.planVersion, value.storageBytes, value.now]; }
function selected(rows: unknown[]): { outcome: string; resultPayload: unknown } { if (rows.length !== 1 || typeof rows[0] !== "object" || rows[0] === null || Array.isArray(rows[0])) throw failure("unavailable"); const row = rows[0] as Record<string, unknown>; if (Object.keys(row).sort().join(",") !== "outcome,result_payload" || typeof row.outcome !== "string") throw failure("unavailable"); return { outcome: row.outcome, resultPayload: row.result_payload }; }
function payload(value: unknown): StorefrontAsset { if (typeof value !== "object" || value === null || Array.isArray(value) || Object.keys(value).join(",") !== "asset") throw failure("unavailable"); try { return parseStorefrontAsset((value as { asset: unknown }).asset); } catch { throw failure("unavailable"); } }
export function storefrontAssetFingerprint(kind: "create_asset" | "archive_asset", input: unknown): string { return createHash("sha256").update(JSON.stringify({ kind, input })).digest("hex"); }

export class PostgresStorefrontAssetRepository implements StorefrontAssetRepository {
  private readonly options: PostgresStorefrontAssetRepositoryOptions;
  constructor(options: PostgresStorefrontAssetRepositoryOptions) { if (!options || options.role !== "celebix_saas_app" || typeof options.audit !== "function") throw failure("unavailable"); timeout(options.timeouts.poolCheckoutMs); timeout(options.timeouts.statementMs); timeout(options.timeouts.lockMs); timeout(options.timeouts.idleTransactionMs); this.options = options; }
  private async configure(client: PostgresClientLike): Promise<void> { await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [timeout(this.options.timeouts.statementMs)]); await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [timeout(this.options.timeouts.lockMs)]); await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [timeout(this.options.timeouts.idleTransactionMs)]); await client.query("SET LOCAL ROLE celebix_saas_app"); }
  private expected(outcome: string): never { if (EXPECTED.has(outcome)) throw failure(outcome as StorefrontAssetErrorCode); throw failure("unavailable"); }
  private audit(): void { try { const pending = this.options.audit({ type: "storefront_asset_commit_unknown" }); if (pending) void pending.catch(() => undefined); } catch { /* audit cannot redefine authority */ } }
  private async execute(sql: string, parameters: unknown[], readOnly: boolean) {
    let client: PostgresClientLike; try { client = await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs); } catch { throw failure("unavailable"); }
    let began = false, terminal = false;
    try {
      await client.query(readOnly ? "BEGIN READ ONLY" : "BEGIN ISOLATION LEVEL READ COMMITTED"); began = true; await this.configure(client);
      const result = selected((await client.query(sql, parameters)).rows);
      try { await client.query("COMMIT"); terminal = true; client.release(); }
      catch { terminal = true; client.release(true); if (!readOnly) { this.audit(); throw failure("commit_unknown"); } throw failure("unavailable"); }
      return result;
    } catch (caught) {
      if (began && !terminal) { try { await client.query("ROLLBACK"); client.release(); } catch { client.release(true); } } else if (!terminal) client.release(true);
      if (caught instanceof StorefrontAssetRepositoryError) throw caught;
      throw failure("unavailable");
    }
  }
  private mutation(result: { outcome: string; resultPayload: unknown }): StorefrontAssetMutationResult { if (result.outcome !== "committed" && result.outcome !== "operation_replayed") this.expected(result.outcome); return Object.freeze({ asset: payload(result.resultPayload), replayed: result.outcome === "operation_replayed" }); }
  async createAsset(input: CreateStorefrontAssetInput): Promise<StorefrontAssetMutationResult> {
    const parsed = exact(input, ["tenantContext", "now", "operationId", "assetId", "kind", "objectKey", "publicUrl", "mediaType", "altText", "width", "height", "byteSize", "contentDigest"]), auth = authority(parsed.tenantContext, parsed.now);
    const assetId = uuid(parsed.assetId), operationId = uuid(parsed.operationId), kind = parsed.kind as StorefrontAssetKind;
    if (!STOREFRONT_ASSET_KINDS.includes(kind) || !["image/jpeg", "image/png", "image/webp"].includes(parsed.mediaType)) throw failure("invalid_input");
    const extension = parsed.mediaType === "image/jpeg" ? "jpg" : parsed.mediaType.slice(6), objectKey = text(parsed.objectKey, 1, 512);
    if (objectKey !== `stores/${auth.storeId}/storefront/${kind}/${assetId}.${extension}`) throw failure("invalid_input");
    const publicUrl = text(parsed.publicUrl, 1, 2048); let url: URL; try { url = new URL(publicUrl); } catch { throw failure("invalid_input"); }
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== `/${objectKey}` || url.toString() !== publicUrl) throw failure("invalid_input");
    const body = { kind, mediaType: parsed.mediaType, altText: text(parsed.altText, 0, 500), width: integer(parsed.width, 1, 8192), height: integer(parsed.height, 1, 8192), byteSize: integer(parsed.byteSize, 1, 5_242_880), contentDigest: text(parsed.contentDigest, 64, 64) };
    if (!SHA256.test(body.contentDigest)) throw failure("invalid_input");
    return this.mutation(await this.execute("SELECT outcome,result_payload FROM saas.storefront_asset_create($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz,$9::uuid,$10::text,$11::uuid,$12::text,$13::text,$14::text,$15::text,$16::text,$17::integer,$18::integer,$19::bigint)", [...authorityValues(auth), operationId, storefrontAssetFingerprint("create_asset", body), assetId, kind, objectKey, publicUrl, body.mediaType, body.altText, body.width, body.height, body.byteSize], false));
  }
  async listAssets(input: ListStorefrontAssetsInput): Promise<readonly StorefrontAsset[]> {
    const parsed = exact(input, ["tenantContext", "now"], ["kind", "includeArchived"]), auth = authority(parsed.tenantContext, parsed.now);
    const kind = parsed.kind === undefined ? null : parsed.kind; if (kind !== null && !STOREFRONT_ASSET_KINDS.includes(kind)) throw failure("invalid_input");
    if (parsed.includeArchived !== undefined && typeof parsed.includeArchived !== "boolean") throw failure("invalid_input");
    const result = await this.execute("SELECT outcome,result_payload FROM saas.storefront_asset_list($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz,$9::text,$10::boolean)", [...authorityValues(auth), kind, parsed.includeArchived ?? false], true);
    if (result.outcome !== "found") this.expected(result.outcome); if (!Array.isArray(result.resultPayload)) throw failure("unavailable");
    try { return Object.freeze(result.resultPayload.map(parseStorefrontAsset)); } catch { throw failure("unavailable"); }
  }
  async archiveAsset(input: ArchiveStorefrontAssetInput): Promise<StorefrontAssetMutationResult> {
    const parsed = exact(input, ["tenantContext", "now", "operationId", "assetId", "expectedVersion"]), auth = authority(parsed.tenantContext, parsed.now);
    const body = { assetId: uuid(parsed.assetId), expectedVersion: integer(parsed.expectedVersion, 1) };
    return this.mutation(await this.execute("SELECT outcome,result_payload FROM saas.storefront_asset_archive($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz,$9::uuid,$10::text,$11::uuid,$12::bigint)", [...authorityValues(auth), uuid(parsed.operationId), storefrontAssetFingerprint("archive_asset", body), body.assetId, body.expectedVersion], false));
  }
  async recoverOperation(input: RecoverStorefrontAssetOperationInput): Promise<StorefrontAssetRecoveryResult> {
    const parsed = exact(input, ["tenantContext", "now", "operationId", "operationKind", "fingerprint"]), auth = authority(parsed.tenantContext, parsed.now);
    if (!["create_asset", "archive_asset"].includes(parsed.operationKind) || typeof parsed.fingerprint !== "string" || !SHA256.test(parsed.fingerprint)) throw failure("invalid_input");
    const result = await this.execute("SELECT outcome,result_payload FROM saas.storefront_asset_recover($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz,$9::uuid,$10::text,$11::text)", [...authorityValues(auth), uuid(parsed.operationId), parsed.operationKind, parsed.fingerprint], true);
    if (result.outcome === "operation_not_found") return Object.freeze({ kind: "absent" as const });
    if (result.outcome !== "operation_replayed") this.expected(result.outcome);
    return Object.freeze({ kind: "found" as const, result: Object.freeze({ asset: payload(result.resultPayload), replayed: true }) });
  }
}
