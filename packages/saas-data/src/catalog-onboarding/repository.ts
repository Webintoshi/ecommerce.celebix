import {
  isCatalogProductOperationAllowed,
  isMerchantActionAllowed,
  parseCatalogOnboardingOptions,
  parseCatalogOnboardingResult,
  parseCatalogProductEditorProjection,
  parseCatalogCategoryList,
  parseCatalogCategoryMutationResult,
  type CatalogCategory,
  type CatalogCategoryMutationResult,
  type CatalogOnboardingOptions,
  type CatalogOnboardingResult,
  type CatalogProductEditorProjection,
} from "@celebix/saas-contracts";

import { acquirePostgresClient, type PostgresClientLike } from "../postgres/pool.ts";
import type { ValidatedCatalogAuthority } from "../catalog/validation.ts";
import { catalogOnboardingFingerprint, stableCatalogOnboardingJson } from "./canonical.ts";
import {
  CATALOG_ONBOARDING_ERROR_CODES,
  CatalogOnboardingRepositoryError,
  type CatalogOnboardingErrorCode,
} from "./errors.ts";
import type {
  CatalogOnboardingAuthorityInput,
  CatalogOnboardingRepository,
  CreateCatalogOnboardingProductInput,
  GetCatalogProductEditorInput,
  PostgresCatalogOnboardingRepositoryOptions,
  PublishCatalogAfterMediaInput,
  UpdateCatalogMerchandisingInput,
  CreateCatalogCategoryInput,
  UpdateCatalogCategoryInput,
  ArchiveCatalogCategoryInput,
} from "./types.ts";
import {
  catalogMerchandisingPayload,
  catalogCategoryFields,
  catalogOnboardingAuthority,
  catalogOnboardingCount,
  catalogOnboardingIntent,
  catalogOnboardingPositiveInteger,
  catalogOnboardingUuid,
  exactCatalogOnboardingInput,
} from "./validation.ts";

type QuerySpec = Readonly<{ text: string; values: unknown[] }>;
type MutationParser<T> = (value: unknown, replayed: boolean) => T;
const ERROR_CODES = new Set<string>(CATALOG_ONBOARDING_ERROR_CODES);

function unavailable(): CatalogOnboardingRepositoryError {
  return new CatalogOnboardingRepositoryError("unavailable");
}

function authorizeProduct(
  authority: ValidatedCatalogAuthority,
  operation: Parameters<typeof isCatalogProductOperationAllowed>[1],
): void {
  if (!isCatalogProductOperationAllowed(authority.role, operation)) {
    throw new CatalogOnboardingRepositoryError("membership_denied");
  }
}

function authorizeCategory(
  authority: ValidatedCatalogAuthority,
  action: "catalog_admin.read" | "catalog_admin.manage" | "catalog_admin.archive",
): void {
  if (!isMerchantActionAllowed(authority.role, action)) {
    throw new CatalogOnboardingRepositoryError("membership_denied");
  }
}

function timeout(value: number): string {
  if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) throw unavailable();
  return `${value}ms`;
}

function release(client: PostgresClientLike, destroy = false): void {
  try { client.release(destroy || undefined); } catch { /* terminal cleanup is best effort */ }
}

function resultRow(value: Readonly<{ rows: unknown[]; rowCount?: number | null }>): { outcome: string; resultPayload: unknown } {
  if (value.rowCount !== 1 || value.rows.length !== 1) throw unavailable();
  const candidate = value.rows[0];
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) throw unavailable();
  const parsed = candidate as Record<string, unknown>;
  if (Object.keys(parsed).sort().join(",") !== "outcome,result_payload" || typeof parsed.outcome !== "string") throw unavailable();
  return { outcome: parsed.outcome, resultPayload: parsed.result_payload };
}

function authorityValues(authority: ValidatedCatalogAuthority): unknown[] {
  return [
    authority.storeId,
    authority.principalId,
    authority.membershipId,
    authority.planId,
    authority.planCode,
    authority.planVersion,
    authority.productsLimit,
    authority.now,
  ];
}

function parseResult(value: unknown, replayed: boolean): CatalogOnboardingResult {
  try {
    const parsed = parseCatalogOnboardingResult(value);
    if (parsed.replayed !== replayed) throw unavailable();
    return parsed;
  } catch (error) {
    if (error instanceof CatalogOnboardingRepositoryError) throw error;
    throw unavailable();
  }
}

function equalReplayable(left: Readonly<{ replayed: boolean }>, right: Readonly<{ replayed: boolean }>): boolean {
  return stableCatalogOnboardingJson({ ...left, replayed: false }) === stableCatalogOnboardingJson({ ...right, replayed: false });
}

function parseCategoryResult(value: unknown, replayed: boolean): CatalogCategoryMutationResult {
  try {
    const parsed = parseCatalogCategoryMutationResult(value);
    if (parsed.replayed !== replayed) throw unavailable();
    return parsed;
  } catch (error) {
    if (error instanceof CatalogOnboardingRepositoryError) throw error;
    throw unavailable();
  }
}

export class PostgresCatalogOnboardingRepository implements CatalogOnboardingRepository {
  private readonly options: PostgresCatalogOnboardingRepositoryOptions;

  constructor(options: PostgresCatalogOnboardingRepositoryOptions) {
    try {
      if (
        !options || typeof options !== "object" || Array.isArray(options)
        || Object.keys(options).sort().join(",") !== "audit,pool,role,timeouts,uuid"
        || options.role !== "celebix_saas_app"
        || typeof options.uuid !== "function"
        || typeof options.audit !== "function"
        || !options.pool || typeof options.pool.connect !== "function"
        || !options.timeouts || Object.keys(options.timeouts).sort().join(",") !== "idleTransactionMs,lockMs,poolCheckoutMs,statementMs"
      ) throw unavailable();
      for (const value of Object.values(options.timeouts)) timeout(value);
      this.options = Object.freeze({ ...options, timeouts: Object.freeze({ ...options.timeouts }) });
    } catch (error) {
      if (error instanceof CatalogOnboardingRepositoryError) throw error;
      throw unavailable();
    }
  }

  private async acquire(): Promise<PostgresClientLike> {
    try { return await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs); }
    catch { throw unavailable(); }
  }

  private async configure(client: PostgresClientLike): Promise<void> {
    await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [timeout(this.options.timeouts.statementMs)]);
    await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [timeout(this.options.timeouts.lockMs)]);
    await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [timeout(this.options.timeouts.idleTransactionMs)]);
    await client.query("SET LOCAL ROLE celebix_saas_app");
  }

  private mapped(outcome: string): CatalogOnboardingRepositoryError | undefined {
    return ERROR_CODES.has(outcome)
      ? new CatalogOnboardingRepositoryError(outcome as CatalogOnboardingErrorCode)
      : undefined;
  }

  private async rollback(client: PostgresClientLike): Promise<void> {
    try { await client.query("ROLLBACK"); release(client); }
    catch { release(client, true); }
  }

  private emitCommitUnknown(): void {
    try {
      const pending = this.options.audit({ type: "catalog_onboarding_commit_unknown" });
      if (pending) void pending.catch(() => undefined);
    } catch { /* observation cannot change durable authority */ }
  }

  private async read<T>(spec: QuerySpec, expected: string, parser: (value: unknown) => T): Promise<T> {
    const client = await this.acquire();
    let began = false;
    let terminal = false;
    try {
      await client.query("BEGIN READ ONLY");
      began = true;
      await this.configure(client);
      const selected = resultRow(await client.query(spec.text, spec.values));
      const mapped = this.mapped(selected.outcome);
      if (mapped) throw mapped;
      if (selected.outcome !== expected) throw unavailable();
      const parsed = parser(selected.resultPayload);
      try {
        await client.query("COMMIT");
        terminal = true;
        release(client);
      } catch {
        terminal = true;
        release(client, true);
        throw unavailable();
      }
      return parsed;
    } catch (error) {
      if (began && !terminal) await this.rollback(client);
      else if (!began && !terminal) release(client, true);
      if (error instanceof CatalogOnboardingRepositoryError) throw error;
      throw unavailable();
    }
  }

  private async recover<T extends Readonly<{ replayed: boolean }>>(
    authority: ValidatedCatalogAuthority,
    operationId: string,
    fingerprint: string,
    observed: T,
    parser: MutationParser<T>,
  ): Promise<T> {
    const recovered = await this.read({
      text: "SELECT outcome,result_payload FROM saas.catalog_recover_onboarding_operation($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz,$9::uuid,$10::text)",
      values: [...authorityValues(authority), operationId, fingerprint],
    }, "operation_replayed", (value) => parser(value, true));
    if (!equalReplayable(observed, recovered)) throw unavailable();
    return recovered;
  }

  private async mutate<T extends Readonly<{ replayed: boolean }>>(
    authority: ValidatedCatalogAuthority,
    operationId: string,
    fingerprint: string,
    expected: string,
    spec: QuerySpec,
    parser: MutationParser<T>,
  ): Promise<T> {
    const client = await this.acquire();
    let began = false;
    let terminal = false;
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      began = true;
      await this.configure(client);
      const selected = resultRow(await client.query(spec.text, spec.values));
      const mapped = this.mapped(selected.outcome);
      if (mapped) throw mapped;
      if (selected.outcome !== expected && selected.outcome !== "operation_replayed") throw unavailable();
      const parsed = parser(selected.resultPayload, selected.outcome === "operation_replayed");
      try {
        await client.query("COMMIT");
        terminal = true;
        release(client);
        return parsed;
      } catch {
        terminal = true;
        release(client, true);
        this.emitCommitUnknown();
        return await this.recover(authority, operationId, fingerprint, parsed, parser);
      }
    } catch (error) {
      if (began && !terminal) await this.rollback(client);
      else if (!began && !terminal) release(client, true);
      if (error instanceof CatalogOnboardingRepositoryError) throw error;
      throw unavailable();
    }
  }

  private authority(input: unknown, required: readonly string[], optional: readonly string[] = []) {
    const parsed = exactCatalogOnboardingInput(input, required, optional);
    return { parsed, authority: catalogOnboardingAuthority(parsed.tenantContext, parsed.now) };
  }

  async getOptions(input: CatalogOnboardingAuthorityInput): Promise<CatalogOnboardingOptions> {
    const { authority } = this.authority(input, ["tenantContext", "now"]);
    authorizeProduct(authority, "read");
    return this.read({
      text: "SELECT outcome,result_payload FROM saas.catalog_get_onboarding_options($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz)",
      values: authorityValues(authority),
    }, "found", (value) => {
      try { return parseCatalogOnboardingOptions(value); } catch { throw unavailable(); }
    });
  }

  async createProduct(input: CreateCatalogOnboardingProductInput): Promise<CatalogOnboardingResult> {
    const { parsed, authority } = this.authority(input, ["tenantContext", "now", "operationId", "intent"]);
    authorizeProduct(authority, "create");
    const operationId = catalogOnboardingUuid(parsed.operationId);
    const intent = catalogOnboardingIntent(parsed.intent);
    const productId = catalogOnboardingUuid(this.options.uuid());
    const variantCount = intent.kind === "quick" ? 1 : intent.variants.length;
    const variantIds = Object.freeze(Array.from({ length: variantCount }, () => catalogOnboardingUuid(this.options.uuid())));
    if (new Set([productId, ...variantIds]).size !== variantIds.length + 1) throw new CatalogOnboardingRepositoryError("invalid_input");
    const fingerprint = catalogOnboardingFingerprint("create_product", authority.storeId, intent);
    return this.mutate(authority, operationId, fingerprint, "created", {
      text: "SELECT outcome,result_payload FROM saas.catalog_onboard_product($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz,$9::uuid,$10::text,$11::uuid,$12::uuid[],$13::jsonb)",
      values: [...authorityValues(authority), operationId, fingerprint, productId, variantIds, JSON.stringify(intent)],
    }, parseResult);
  }

  async getProductEditor(input: GetCatalogProductEditorInput): Promise<CatalogProductEditorProjection> {
    const { parsed, authority } = this.authority(input, ["tenantContext", "now", "productId"]);
    authorizeProduct(authority, "read");
    const productId = catalogOnboardingUuid(parsed.productId);
    return this.read({
      text: "SELECT outcome,result_payload FROM saas.catalog_get_product_editor($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz,$9::uuid)",
      values: [...authorityValues(authority), productId],
    }, "found", (value) => {
      try { return parseCatalogProductEditorProjection(value); } catch { throw unavailable(); }
    });
  }

  async updateMerchandising(input: UpdateCatalogMerchandisingInput): Promise<CatalogOnboardingResult> {
    const { parsed, authority } = this.authority(input, [
      "tenantContext", "now", "operationId", "productId", "expectedProfileVersion",
      "profile", "categoryIds", "resourceIds", "channelIds",
    ]);
    authorizeProduct(authority, "manage_merchandising");
    const operationId = catalogOnboardingUuid(parsed.operationId);
    const productId = catalogOnboardingUuid(parsed.productId);
    const expectedProfileVersion = catalogOnboardingPositiveInteger(parsed.expectedProfileVersion);
    const payload = catalogMerchandisingPayload({
      profile: parsed.profile,
      categoryIds: parsed.categoryIds,
      resourceIds: parsed.resourceIds,
      channelIds: parsed.channelIds,
    });
    const fingerprint = catalogOnboardingFingerprint("update_merchandising", authority.storeId, {
      productId, expectedProfileVersion, payload,
    });
    return this.mutate(authority, operationId, fingerprint, "updated", {
      text: "SELECT outcome,result_payload FROM saas.catalog_update_merchandising($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz,$9::uuid,$10::text,$11::uuid,$12::bigint,$13::jsonb)",
      values: [...authorityValues(authority), operationId, fingerprint, productId, expectedProfileVersion, JSON.stringify(payload)],
    }, parseResult);
  }

  async publishAfterMedia(input: PublishCatalogAfterMediaInput): Promise<CatalogOnboardingResult> {
    const { parsed, authority } = this.authority(input, [
      "tenantContext", "now", "operationId", "productId", "expectedProductVersion", "expectedMediaCount",
    ]);
    authorizeProduct(authority, "publish");
    const operationId = catalogOnboardingUuid(parsed.operationId);
    const productId = catalogOnboardingUuid(parsed.productId);
    const expectedProductVersion = catalogOnboardingPositiveInteger(parsed.expectedProductVersion);
    const expectedMediaCount = catalogOnboardingCount(parsed.expectedMediaCount, 16);
    const fingerprint = catalogOnboardingFingerprint("publish_after_media", authority.storeId, {
      productId, expectedProductVersion, expectedMediaCount,
    });
    return this.mutate(authority, operationId, fingerprint, "published", {
      text: "SELECT outcome,result_payload FROM saas.catalog_publish_after_media($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz,$9::uuid,$10::text,$11::uuid,$12::bigint,$13::integer)",
      values: [...authorityValues(authority), operationId, fingerprint, productId, expectedProductVersion, expectedMediaCount],
    }, parseResult);
  }

  async listCategories(input: CatalogOnboardingAuthorityInput): Promise<readonly CatalogCategory[]> {
    const { authority } = this.authority(input, ["tenantContext", "now"]);
    authorizeCategory(authority, "catalog_admin.read");
    return this.read({
      text: "SELECT outcome,result_payload FROM saas.catalog_list_categories($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz)",
      values: authorityValues(authority),
    }, "found", (value) => {
      try { return parseCatalogCategoryList(value); } catch { throw unavailable(); }
    });
  }

  async createCategory(input: CreateCatalogCategoryInput): Promise<CatalogCategoryMutationResult> {
    const { parsed, authority } = this.authority(input, ["tenantContext", "now", "operationId", "fields"]);
    authorizeCategory(authority, "catalog_admin.manage");
    const operationId = catalogOnboardingUuid(parsed.operationId);
    const fields = catalogCategoryFields(parsed.fields);
    const categoryId = catalogOnboardingUuid(this.options.uuid());
    const fingerprint = catalogOnboardingFingerprint("create_category", authority.storeId, fields);
    return this.mutate(authority, operationId, fingerprint, "created", {
      text: "SELECT outcome,result_payload FROM saas.catalog_create_category($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz,$9::uuid,$10::text,$11::uuid,$12::jsonb)",
      values: [...authorityValues(authority), operationId, fingerprint, categoryId, JSON.stringify(fields)],
    }, parseCategoryResult);
  }

  async updateCategory(input: UpdateCatalogCategoryInput): Promise<CatalogCategoryMutationResult> {
    const { parsed, authority } = this.authority(input, ["tenantContext", "now", "operationId", "categoryId", "expectedVersion", "fields"]);
    authorizeCategory(authority, "catalog_admin.manage");
    const operationId = catalogOnboardingUuid(parsed.operationId);
    const categoryId = catalogOnboardingUuid(parsed.categoryId);
    const expectedVersion = catalogOnboardingPositiveInteger(parsed.expectedVersion);
    const fields = catalogCategoryFields(parsed.fields);
    const fingerprint = catalogOnboardingFingerprint("update_category", authority.storeId, { categoryId, expectedVersion, fields });
    return this.mutate(authority, operationId, fingerprint, "updated", {
      text: "SELECT outcome,result_payload FROM saas.catalog_update_category($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz,$9::uuid,$10::text,$11::uuid,$12::bigint,$13::jsonb)",
      values: [...authorityValues(authority), operationId, fingerprint, categoryId, expectedVersion, JSON.stringify(fields)],
    }, parseCategoryResult);
  }

  async archiveCategory(input: ArchiveCatalogCategoryInput): Promise<CatalogCategoryMutationResult> {
    const { parsed, authority } = this.authority(input, ["tenantContext", "now", "operationId", "categoryId", "expectedVersion"]);
    authorizeCategory(authority, "catalog_admin.archive");
    const operationId = catalogOnboardingUuid(parsed.operationId);
    const categoryId = catalogOnboardingUuid(parsed.categoryId);
    const expectedVersion = catalogOnboardingPositiveInteger(parsed.expectedVersion);
    const fingerprint = catalogOnboardingFingerprint("archive_category", authority.storeId, { categoryId, expectedVersion });
    return this.mutate(authority, operationId, fingerprint, "archived", {
      text: "SELECT outcome,result_payload FROM saas.catalog_archive_category($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz,$9::uuid,$10::text,$11::uuid,$12::bigint)",
      values: [...authorityValues(authority), operationId, fingerprint, categoryId, expectedVersion],
    }, parseCategoryResult);
  }
}
