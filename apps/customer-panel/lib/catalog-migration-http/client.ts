import type { CatalogMigrationBatchResult, CatalogMigrationJob, CatalogMigrationProduct } from "@celebix/saas-data";
import type { WooCommerceMigrationApi } from "./workflow.ts";

const CODES = new Set(["invalid_input", "unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled", "durable_authority_invalid", "job_not_found", "media_not_found", "job_mismatch", "media_state_invalid", "product_limit_reached", "import_conflict", "operation_mismatch", "operation_not_found", "unavailable"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DIGEST = /^[a-f0-9]{64}$/;
function unavailable(): never { throw new WooCommerceMigrationApiError("unavailable", 503); }
function record(value: unknown): Record<string, unknown> { if (typeof value !== "object" || value === null || Array.isArray(value)) unavailable(); return value as Record<string, unknown>; }
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> { const parsed = record(value); if (Object.keys(parsed).sort().join(",") !== [...keys].sort().join(",")) unavailable(); return parsed; }
function integer(value: unknown, minimum: number, maximum: number): number { if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) unavailable(); return value as number; }
function parseJob(value: unknown): CatalogMigrationJob {
  const parsed = exact(value, ["jobId", "sourceDigest", "status", "totalProducts", "importedProducts", "totalMedia", "committedMedia", "failedMedia", "categoryCount", "brandCount", "version", "updatedAt", "replayed"]);
  if (typeof parsed.jobId !== "string" || !UUID.test(parsed.jobId) || typeof parsed.sourceDigest !== "string" || !DIGEST.test(parsed.sourceDigest)
    || !["processing", "media_processing", "completed", "completed_with_failures"].includes(String(parsed.status)) || typeof parsed.replayed !== "boolean"
    || typeof parsed.updatedAt !== "string") unavailable();
  let updatedAt: string; try { updatedAt = new Date(parsed.updatedAt).toISOString(); } catch { unavailable(); }
  if (updatedAt !== parsed.updatedAt) unavailable();
  const totalProducts = integer(parsed.totalProducts, 1, 2_500), totalMedia = integer(parsed.totalMedia, 0, 40_000);
  const importedProducts = integer(parsed.importedProducts, 0, totalProducts), committedMedia = integer(parsed.committedMedia, 0, totalMedia), failedMedia = integer(parsed.failedMedia, 0, totalMedia);
  if (committedMedia + failedMedia > totalMedia) unavailable();
  return Object.freeze({ jobId: parsed.jobId, sourceDigest: parsed.sourceDigest, status: parsed.status as CatalogMigrationJob["status"], totalProducts, importedProducts, totalMedia, committedMedia, failedMedia, categoryCount: integer(parsed.categoryCount, 0, 100), brandCount: integer(parsed.brandCount, 0, 50), version: integer(parsed.version, 1, Number.MAX_SAFE_INTEGER), updatedAt, replayed: parsed.replayed });
}
function parseBatch(value: unknown): CatalogMigrationBatchResult {
  const parsed = record(value); const mappings = parsed.mappings; if (!Array.isArray(mappings) || mappings.length < 1 || mappings.length > 25) unavailable();
  const selected = { ...parsed }; delete selected.mappings; const job = parseJob(selected);
  return Object.freeze({ ...job, mappings: Object.freeze(mappings.map((entry) => { const mapping = exact(entry, ["sourceProductId", "productId"]); if (typeof mapping.sourceProductId !== "string" || !/^[1-9][0-9]{0,19}$/.test(mapping.sourceProductId) || typeof mapping.productId !== "string" || !UUID.test(mapping.productId)) unavailable(); return Object.freeze({ sourceProductId: mapping.sourceProductId, productId: mapping.productId }); })) });
}
async function responseJson(response: Response): Promise<unknown> { if (response.headers.get("content-type")?.split(";", 1)[0] !== "application/json") unavailable(); try { return await response.json(); } catch { unavailable(); } }
export class WooCommerceMigrationApiError extends Error { constructor(readonly code: string, readonly status: number) { super(code === "unauthenticated" ? "Oturumunuz sona erdi." : code === "product_limit_reached" ? "Planınızdaki ürün sınırına ulaştınız." : code === "import_conflict" ? "Bazı ürünler mevcut katalogla çakışıyor." : "WooCommerce aktarımı şu anda tamamlanamadı."); this.name = "WooCommerceMigrationApiError"; } }
export function createWooCommerceMigrationApi(fetcher: typeof fetch = fetch): WooCommerceMigrationApi {
  async function request(path: string, init?: RequestInit) { const response = await fetcher(path, { credentials: "same-origin", cache: "no-store", ...init }); const value = await responseJson(response); if (!response.ok) { const parsed = record(value); const code = typeof parsed.code === "string" && CODES.has(parsed.code) ? parsed.code : "unavailable"; throw new WooCommerceMigrationApiError(code, response.status); } return value; }
  function post(path: string, value: unknown, operationId: string) { if (!UUID.test(operationId)) throw new TypeError("woocommerce_migration_client_invalid"); return request(path, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": operationId }, body: JSON.stringify(value) }); }
  const api: WooCommerceMigrationApi = {
    async begin(value: Parameters<WooCommerceMigrationApi["begin"]>[0], operationId: string) { return parseJob(await post("/api/catalog/admin/migrations/woocommerce", value, operationId)); },
    async status(jobId: string) { if (!UUID.test(jobId)) throw new TypeError("woocommerce_migration_client_invalid"); return parseJob(await request(`/api/catalog/admin/migrations/woocommerce/${jobId}`)); },
    async batch(jobId: string, value: Readonly<{ sourceDigest: string; products: readonly CatalogMigrationProduct[] }>, operationId: string) { if (!UUID.test(jobId)) throw new TypeError("woocommerce_migration_client_invalid"); return parseBatch(await post(`/api/catalog/admin/migrations/woocommerce/${jobId}/batch`, value, operationId)); },
    async media(jobId: string, value: Parameters<WooCommerceMigrationApi["media"]>[1], operationId: string) { if (!UUID.test(jobId)) throw new TypeError("woocommerce_migration_client_invalid"); const parsed = record(await post(`/api/catalog/admin/migrations/woocommerce/${jobId}/media`, value, operationId)); const keys = Object.keys(parsed).sort().join(","); if (!(["kind,mediaId,productId,replayed", "job,kind,mediaId,productId,replayed"].includes(keys)) || parsed.kind !== "committed" || typeof parsed.productId !== "string" || !UUID.test(parsed.productId) || typeof parsed.mediaId !== "string" || !UUID.test(parsed.mediaId) || typeof parsed.replayed !== "boolean") unavailable(); if (parsed.job !== undefined) parseJob(parsed.job); return Object.freeze({ kind: "committed", productId: parsed.productId, mediaId: parsed.mediaId, replayed: parsed.replayed }); },
  };
  return Object.freeze(api);
}
export const wooCommerceMigrationApi = createWooCommerceMigrationApi();
