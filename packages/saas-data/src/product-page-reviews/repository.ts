import { createHash } from "node:crypto";
import { parseProductPageReviewAvailability, parseProductPageReviewSettings, parseReviewSubmission, type ProductPageReviewAvailability, type ProductPageReviewSettings, type ReviewSubmission, type TenantContext } from "@celebix/saas-contracts";
import { acquirePostgresClient, type PostgresPoolLike, type PostgresTimeoutOptions } from "../postgres/pool.ts";
import { CatalogRepositoryError } from "../catalog/errors.ts";
import { catalogAuthority } from "../catalog/validation.ts";
import { commerceCandidates, commerceDate, commerceHostname, commerceUuid } from "../storefront-commerce/validation.ts";

export class ProductPageReviewError extends Error {
  constructor(readonly code: string) { super("product_page_review_failed"); this.name = "ProductPageReviewError"; }
}
export type ProductPageReviewAuthority = Readonly<{ tenantContext: TenantContext; now: Date }>;
export type ProductPageReviewPublicInput = Readonly<{ hostname: string; now: Date; productId: string; candidates: readonly Readonly<{ keyId: string; digest: string }>[] }>;
export interface ProductPageReviewRepository {
  settings(input: ProductPageReviewAuthority): Promise<ProductPageReviewSettings>;
  saveSettings(input: ProductPageReviewAuthority & Readonly<{ operationId: string; expectedVersion: number; enabled: boolean }>): Promise<ProductPageReviewSettings>;
  availability(input: ProductPageReviewPublicInput): Promise<ProductPageReviewAvailability>;
  submit(input: ProductPageReviewPublicInput & Readonly<{ operationId: string; review: ReviewSubmission }>): Promise<Readonly<{ status: "pending" }>>;
}
export type PostgresProductPageReviewRepositoryOptions = Readonly<{ pool: PostgresPoolLike; role: "celebix_saas_app" | "celebix_saas_host_resolver"; timeouts: PostgresTimeoutOptions }>;
function fingerprint(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function validated<T>(parse: () => T): T { try { return parse(); } catch (caught) { if (caught instanceof ProductPageReviewError) throw caught; throw new ProductPageReviewError("invalid_input"); } }
function authority(input: ProductPageReviewAuthority): unknown[] {
  try { const a = catalogAuthority(input.tenantContext, input.now); return [a.storeId, a.principalId, a.membershipId, a.planId, a.planCode, a.planVersion, a.now]; } catch (caught) { throw new ProductPageReviewError(caught instanceof CatalogRepositoryError ? caught.code : "invalid_input"); }
}
function publicValues(input: ProductPageReviewPublicInput): unknown[] {
  return validated(() => [commerceHostname(input.hostname), commerceDate(input.now), commerceUuid(input.productId), JSON.stringify(commerceCandidates(input.candidates, true))]);
}
function response<T>(parse: () => T): T { try { return parse(); } catch { throw new ProductPageReviewError("unavailable"); } }

export class PostgresProductPageReviewRepository implements ProductPageReviewRepository {
  private readonly options: PostgresProductPageReviewRepositoryOptions;
  constructor(options: PostgresProductPageReviewRepositoryOptions) {
    const keys = ["poolCheckoutMs", "statementMs", "lockMs", "idleTransactionMs"] as const;
    if (!options?.pool || typeof options.pool.connect !== "function" || !["celebix_saas_app", "celebix_saas_host_resolver"].includes(options.role) || !options.timeouts || keys.some(key => !Number.isSafeInteger(options.timeouts[key]) || options.timeouts[key] < 1 || options.timeouts[key] > 60000)) throw new ProductPageReviewError("unavailable");
    this.options = Object.freeze({ ...options, timeouts: Object.freeze({ ...options.timeouts }) });
  }
  private async rpc(name: string, values: unknown[], expected: readonly string[], role: PostgresProductPageReviewRepositoryOptions["role"]): Promise<unknown> {
    if (this.options.role !== role) throw new ProductPageReviewError("unavailable");
    let client; try { client = await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs); } catch { throw new ProductPageReviewError("unavailable"); }
    let committing = false;
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_catalog.set_config('statement_timeout',$1,true),pg_catalog.set_config('lock_timeout',$2,true),pg_catalog.set_config('idle_in_transaction_session_timeout',$3,true)", [`${this.options.timeouts.statementMs}ms`, `${this.options.timeouts.lockMs}ms`, `${this.options.timeouts.idleTransactionMs}ms`]);
      await client.query(`SET LOCAL ROLE ${role}`);
      const result = await client.query(`SELECT outcome,result_payload FROM saas.${name}(${values.map((_, index) => `$${index + 1}`).join(",")})`, values);
      if (result.rowCount !== 1 || result.rows.length !== 1) throw new ProductPageReviewError("unavailable");
      const row = result.rows[0];
      if (!row || typeof row.outcome !== "string") throw new ProductPageReviewError("unavailable");
      if (!expected.includes(row.outcome)) throw new ProductPageReviewError(row.outcome);
      committing = true; await client.query("COMMIT"); client.release(); return row.result_payload;
    } catch (caught) {
      // A lost commit response is resolved only by replaying the caller's same
      // operation. Destroy this connection; never start an automatic new write.
      if (committing) client.release(true);
      else { try { await client.query("ROLLBACK"); client.release(); } catch { client.release(true); } }
      if (caught instanceof ProductPageReviewError) throw caught;
      throw new ProductPageReviewError("unavailable");
    }
  }
  async settings(input: ProductPageReviewAuthority): Promise<ProductPageReviewSettings> {
    const payload = await this.rpc("product_page_review_admin_get", authority(input), ["found"], "celebix_saas_app");
    return response(() => parseProductPageReviewSettings(payload));
  }
  async saveSettings(input: ProductPageReviewAuthority & Readonly<{ operationId: string; expectedVersion: number; enabled: boolean }>): Promise<ProductPageReviewSettings> {
    const config = validated(() => parseProductPageReviewSettings({ enabled: input.enabled, version: input.expectedVersion }));
    const values = authority(input), operationId = validated(() => commerceUuid(input.operationId));
    const payload = await this.rpc("product_page_review_admin_save", [...values, operationId, fingerprint([values[0], "settings", config.version, config.enabled]), config.version, config.enabled], ["saved", "operation_replayed"], "celebix_saas_app");
    return response(() => parseProductPageReviewSettings(payload));
  }
  async availability(input: ProductPageReviewPublicInput): Promise<ProductPageReviewAvailability> {
    const payload = await this.rpc("public_product_page_review_availability", publicValues(input), ["found"], "celebix_saas_host_resolver");
    return response(() => parseProductPageReviewAvailability(payload));
  }
  async submit(input: ProductPageReviewPublicInput & Readonly<{ operationId: string; review: ReviewSubmission }>): Promise<Readonly<{ status: "pending" }>> {
    const values = publicValues(input), operationId = validated(() => commerceUuid(input.operationId)), draft = validated(() => parseReviewSubmission(input.review));
    const payload = await this.rpc("public_product_page_review_submit", [...values, operationId, fingerprint([values[0], values[2], draft]), JSON.stringify(draft)], ["submitted", "operation_replayed"], "celebix_saas_host_resolver");
    if (!payload || typeof payload !== "object" || Object.keys(payload).length !== 1 || (payload as Record<string, unknown>).status !== "pending") throw new ProductPageReviewError("unavailable");
    return Object.freeze({ status: "pending" });
  }
}
