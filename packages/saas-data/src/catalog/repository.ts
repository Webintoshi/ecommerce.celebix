import { parseProduct, parseProductVariant, type Product, type ProductStatus, type ProductVariant } from "@celebix/saas-contracts";

import { acquirePostgresClient, type PostgresClientLike } from "../postgres/pool.ts";
import { catalogFingerprint } from "./canonical.ts";
import { decodeCursor, encodeCursor } from "./cursor.ts";
import { CATALOG_ERROR_CODES, CatalogRepositoryError, type CatalogErrorCode } from "./errors.ts";
import type {
  ArchiveProductInput,
  ArchiveVariantInput,
  CatalogDashboardSummary,
  CatalogRepository,
  CreateProductInput,
  CreateProductResult,
  CreateVariantInput,
  GetProductDetailsInput,
  GetProductInput,
  GetCatalogDashboardSummaryInput,
  ListProductsInput,
  ListProductsResult,
  PostgresCatalogRepositoryOptions,
  ProductDetailsResult,
  ProductMutationResult,
  UpdateProductInput,
  UpdateVariantInput,
  VariantMutationResult,
} from "./types.ts";
import {
  catalogAuthority,
  catalogUuid,
  exactInput,
  pageSize,
  positiveVersion,
  productFields,
  statusFilter,
  variantFields,
  type ValidatedCatalogAuthority,
} from "./validation.ts";

type MutationParser<T> = (payload: unknown, replayed: boolean) => T;
type QuerySpec = Readonly<{ text: string; values: unknown[] }>;
const ERROR_CODES = new Set<string>(CATALOG_ERROR_CODES);

function unavailable(): CatalogRepositoryError { return new CatalogRepositoryError("unavailable"); }

function timeout(value: number): string {
  if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) throw unavailable();
  return `${value}ms`;
}

function row(value: unknown): { outcome: string; resultPayload: unknown } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw unavailable();
  const parsed = value as Record<string, unknown>;
  if (Object.keys(parsed).sort().join(",") !== "outcome,result_payload" || typeof parsed.outcome !== "string") throw unavailable();
  return { outcome: parsed.outcome, resultPayload: parsed.result_payload };
}

function single(rows: unknown[]): ReturnType<typeof row> {
  if (rows.length !== 1) throw unavailable();
  return row(rows[0]);
}

function payload(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw unavailable();
  const parsed = value as Record<string, unknown>;
  if (Object.keys(parsed).sort().join(",") !== [...keys].sort().join(",")) throw unavailable();
  return parsed;
}

function count(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw unavailable();
  return value as number;
}

function dashboardSummary(value: unknown): CatalogDashboardSummary {
  const parsed = payload(value, [
    "totalProducts",
    "activeProducts",
    "draftProducts",
    "productLimit",
    "activeVariants",
    "outOfStockVariants",
    "productsWithoutMedia",
    "activeMedia",
  ]);
  const result = Object.freeze({
    totalProducts: count(parsed.totalProducts),
    activeProducts: count(parsed.activeProducts),
    draftProducts: count(parsed.draftProducts),
    productLimit: count(parsed.productLimit),
    activeVariants: count(parsed.activeVariants),
    outOfStockVariants: count(parsed.outOfStockVariants),
    productsWithoutMedia: count(parsed.productsWithoutMedia),
    activeMedia: count(parsed.activeMedia),
  });
  if (
    result.activeProducts + result.draftProducts !== result.totalProducts ||
    result.outOfStockVariants > result.activeVariants ||
    result.productsWithoutMedia > result.totalProducts
  ) throw unavailable();
  return result;
}

function productResult(value: unknown, replayed: boolean): ProductMutationResult {
  const parsed = payload(value, ["product"]);
  return Object.freeze({ product: parseProduct(parsed.product), replayed });
}

function createProductResult(value: unknown, replayed: boolean): CreateProductResult {
  const parsed = payload(value, ["product", "initialVariant"]);
  return Object.freeze({
    product: parseProduct(parsed.product),
    initialVariant: parseProductVariant(parsed.initialVariant),
    replayed,
  });
}

function variantResult(value: unknown, replayed: boolean): VariantMutationResult {
  const parsed = payload(value, ["variant"]);
  return Object.freeze({ variant: parseProductVariant(parsed.variant), replayed });
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

export class PostgresCatalogRepository implements CatalogRepository {
  private readonly options: PostgresCatalogRepositoryOptions;

  constructor(options: PostgresCatalogRepositoryOptions) {
    if (options.role !== "celebix_saas_app") throw unavailable();
    timeout(options.timeouts.poolCheckoutMs);
    timeout(options.timeouts.statementMs);
    timeout(options.timeouts.lockMs);
    timeout(options.timeouts.idleTransactionMs);
    this.options = options;
  }

  private async configure(client: PostgresClientLike): Promise<void> {
    await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [timeout(this.options.timeouts.statementMs)]);
    await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [timeout(this.options.timeouts.lockMs)]);
    await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [timeout(this.options.timeouts.idleTransactionMs)]);
    await client.query("SET LOCAL ROLE celebix_saas_app");
  }

  private async rollback(client: PostgresClientLike): Promise<void> {
    try { await client.query("ROLLBACK"); client.release(); }
    catch { client.release(true); }
  }

  private emitUnknownCommitAudit(): void {
    try {
      const pending = this.options.audit({ type: "catalog_commit_unknown" });
      if (pending) void pending.catch(() => undefined);
    } catch { /* Audit cannot alter durable transaction authority. */ }
  }

  private expectedError(outcome: string): CatalogRepositoryError | undefined {
    return ERROR_CODES.has(outcome) && outcome !== "operation_replayed"
      ? new CatalogRepositoryError(outcome as CatalogErrorCode)
      : undefined;
  }

  private async recover<T>(
    authority: ValidatedCatalogAuthority,
    operationId: string,
    fingerprint: string,
    parser: MutationParser<T>,
  ): Promise<T> {
    let client: PostgresClientLike;
    try { client = await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs); }
    catch { throw unavailable(); }
    let began = false;
    let terminal = false;
    try {
      await client.query("BEGIN READ ONLY");
      began = true;
      await this.configure(client);
      const result = await client.query(
        `SELECT outcome, result_payload
         FROM saas.catalog_recover_operation(
           $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz,
           $9::uuid,$10::text
         )`,
        [...authorityValues(authority), operationId, fingerprint],
      );
      const recovered = single(result.rows);
      const expected = this.expectedError(recovered.outcome);
      if (expected) throw expected;
      if (recovered.outcome !== "operation_replayed") throw unavailable();
      const parsed = parser(recovered.resultPayload, true);
      try {
        await client.query("COMMIT");
        terminal = true;
        client.release();
      } catch {
        terminal = true;
        client.release(true);
        throw unavailable();
      }
      return parsed;
    } catch (error) {
      if (began && !terminal) await this.rollback(client);
      else if (!began && !terminal) client.release(true);
      if (error instanceof CatalogRepositoryError) throw error;
      throw unavailable();
    }
  }

  private async mutate<T>(
    authority: ValidatedCatalogAuthority,
    operationId: string,
    fingerprint: string,
    spec: QuerySpec,
    acceptedOutcomes: readonly string[],
    parser: MutationParser<T>,
  ): Promise<T> {
    let client: PostgresClientLike;
    try { client = await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs); }
    catch { throw unavailable(); }
    let began = false;
    let terminal = false;
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      began = true;
      await this.configure(client);
      const result = await client.query(spec.text, spec.values);
      const mutation = single(result.rows);
      const expected = this.expectedError(mutation.outcome);
      if (expected) throw expected;
      if (!acceptedOutcomes.includes(mutation.outcome) && mutation.outcome !== "operation_replayed") throw unavailable();
      const parsed = parser(mutation.resultPayload, mutation.outcome === "operation_replayed");
      try {
        await client.query("COMMIT");
        terminal = true;
        client.release();
        return parsed;
      } catch {
        terminal = true;
        client.release(true);
        this.emitUnknownCommitAudit();
        return await this.recover(authority, operationId, fingerprint, parser);
      }
    } catch (error) {
      if (began && !terminal) await this.rollback(client);
      else if (!began && !terminal) client.release(true);
      if (error instanceof CatalogRepositoryError) throw error;
      throw unavailable();
    }
  }

  private async read(authority: ValidatedCatalogAuthority, spec: QuerySpec): Promise<ReturnType<typeof row>> {
    let client: PostgresClientLike;
    try { client = await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs); }
    catch { throw unavailable(); }
    let began = false;
    let terminal = false;
    try {
      await client.query("BEGIN READ ONLY");
      began = true;
      await this.configure(client);
      const result = single((await client.query(spec.text, spec.values)).rows);
      const expected = this.expectedError(result.outcome);
      if (expected) throw expected;
      try {
        await client.query("COMMIT");
        terminal = true;
        client.release();
      } catch {
        terminal = true;
        client.release(true);
        throw unavailable();
      }
      return result;
    } catch (error) {
      if (began && !terminal) await this.rollback(client);
      else if (!began && !terminal) client.release(true);
      if (error instanceof CatalogRepositoryError) throw error;
      throw unavailable();
    }
  }

  async createProduct(input: CreateProductInput): Promise<CreateProductResult> {
    const exact = exactInput(input, ["tenantContext", "now", "operationId", "product", "initialVariant"]);
    const authority = catalogAuthority(exact.tenantContext as CreateProductInput["tenantContext"], exact.now as Date);
    const operationId = catalogUuid(exact.operationId);
    const product = productFields(exact.product);
    const initialVariant = variantFields(exact.initialVariant);
    const productId = catalogUuid(this.options.generateId("product"));
    const variantId = catalogUuid(this.options.generateId("variant"));
    const fingerprint = catalogFingerprint("create_product", authority.storeId, { product, initialVariant });
    return this.mutate(authority, operationId, fingerprint, {
      text: `SELECT outcome, result_payload FROM saas.catalog_create_product(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz,
        $9::uuid,$10::text,$11::uuid,$12::uuid,$13::text,$14::text,$15::text,$16::text,$17::text,
        $18::text,$19::text,$20::text,$21::bigint,$22::bigint,$23::bigint,$24::boolean,$25::bigint,$26::jsonb
      )`,
      values: [
        ...authorityValues(authority), operationId, fingerprint, productId, variantId,
        product.slug, product.title, product.description ?? null, product.status, product.currency,
        initialVariant.title, initialVariant.sku ?? null, initialVariant.barcode ?? null,
        initialVariant.priceCents, initialVariant.compareAtCents ?? null, initialVariant.costCents ?? null,
        initialVariant.stockTracking, initialVariant.stockQuantity, JSON.stringify(initialVariant.attributes),
      ],
    }, ["created"], createProductResult);
  }

  async getDashboardSummary(input: GetCatalogDashboardSummaryInput): Promise<CatalogDashboardSummary> {
    const exact = exactInput(input, ["tenantContext", "now"]);
    const authority = catalogAuthority(
      exact.tenantContext as GetCatalogDashboardSummaryInput["tenantContext"],
      exact.now as Date,
    );
    const result = await this.read(authority, {
      text: `SELECT outcome, result_payload FROM saas.catalog_get_dashboard_summary(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz
      )`,
      values: authorityValues(authority),
    });
    if (result.outcome !== "summarized") throw unavailable();
    return dashboardSummary(result.resultPayload);
  }

  async getProduct(input: GetProductInput): Promise<Product> {
    const exact = exactInput(input, ["tenantContext", "now", "productId"]);
    const authority = catalogAuthority(exact.tenantContext as GetProductInput["tenantContext"], exact.now as Date);
    const productId = catalogUuid(exact.productId);
    const result = await this.read(authority, {
      text: `SELECT outcome, result_payload FROM saas.catalog_get_product(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz,$9::uuid
      )`,
      values: [...authorityValues(authority), productId],
    });
    if (result.outcome !== "found") throw unavailable();
    return parseProduct(payload(result.resultPayload, ["product"]).product);
  }

  async getProductDetails(input: GetProductDetailsInput): Promise<ProductDetailsResult> {
    const exact = exactInput(input, ["tenantContext", "now", "productId"], ["includeArchivedVariants"]);
    const authority = catalogAuthority(exact.tenantContext as GetProductDetailsInput["tenantContext"], exact.now as Date);
    const productId = catalogUuid(exact.productId);
    const includeArchivedVariants = exact.includeArchivedVariants ?? false;
    if (typeof includeArchivedVariants !== "boolean") throw new CatalogRepositoryError("invalid_input");
    const result = await this.read(authority, {
      text: `SELECT outcome, result_payload FROM saas.catalog_get_product_details(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz,
        $9::uuid,$10::boolean
      )`,
      values: [...authorityValues(authority), productId, includeArchivedVariants],
    });
    if (result.outcome !== "found") throw unavailable();
    const envelope = payload(result.resultPayload, ["product", "variants"]);
    if (!Array.isArray(envelope.variants)) throw unavailable();
    const product = parseProduct(envelope.product);
    const variants = Object.freeze(envelope.variants.map((value) => parseProductVariant(value)));
    if (
      product.id !== productId || product.storeId !== authority.storeId || product.status === "archived" ||
      variants.some((variant) => (
        variant.productId !== product.id || variant.storeId !== authority.storeId ||
        (!includeArchivedVariants && variant.status !== "active")
      ))
    ) throw unavailable();
    for (let index = 1; index < variants.length; index += 1) {
      const previous = variants[index - 1]!;
      const current = variants[index]!;
      if (previous.createdAt > current.createdAt || (previous.createdAt === current.createdAt && previous.id >= current.id)) {
        throw unavailable();
      }
    }
    return Object.freeze({ product, variants });
  }

  async listProducts(input: ListProductsInput): Promise<ListProductsResult> {
    const exact = exactInput(input, ["tenantContext", "now", "pageSize"], ["cursor", "status"]);
    const authority = catalogAuthority(exact.tenantContext as ListProductsInput["tenantContext"], exact.now as Date);
    const boundedPageSize = pageSize(exact.pageSize);
    const filter = statusFilter(exact.status);
    const cursor = decodeCursor(exact.cursor as string | undefined, authority.storeId, filter);
    const result = await this.read(authority, {
      text: `SELECT outcome, result_payload FROM saas.catalog_list_products(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz,
        $9::text,$10::integer,$11::timestamptz,$12::uuid
      )`,
      values: [...authorityValues(authority), filter ?? null, boundedPageSize, cursor?.createdAt ?? null, cursor?.id ?? null],
    });
    if (result.outcome !== "listed") throw unavailable();
    const envelope = payload(result.resultPayload, ["items", "hasMore"]);
    if (!Array.isArray(envelope.items) || typeof envelope.hasMore !== "boolean" || envelope.items.length > boundedPageSize) throw unavailable();
    const items = Object.freeze(envelope.items.map((item) => parseProduct(item)));
    if (items.some((item) => item.storeId !== authority.storeId)) throw unavailable();
    for (let index = 1; index < items.length; index += 1) {
      const previous = items[index - 1]!;
      const current = items[index]!;
      if (previous.createdAt < current.createdAt || (previous.createdAt === current.createdAt && previous.id <= current.id)) throw unavailable();
    }
    if (envelope.hasMore && items.length === 0) throw unavailable();
    return Object.freeze({
      items,
      ...(envelope.hasMore ? { nextCursor: encodeCursor(authority.storeId, filter, items.at(-1)!) } : {}),
    });
  }

  async updateProduct(input: UpdateProductInput): Promise<ProductMutationResult> {
    const exact = exactInput(input, ["tenantContext", "now", "operationId", "productId", "expectedVersion", "product"]);
    const authority = catalogAuthority(exact.tenantContext as UpdateProductInput["tenantContext"], exact.now as Date);
    const operationId = catalogUuid(exact.operationId);
    const productId = catalogUuid(exact.productId);
    const expectedVersion = positiveVersion(exact.expectedVersion);
    const product = productFields(exact.product);
    const fingerprint = catalogFingerprint("update_product", authority.storeId, { productId, expectedVersion, product });
    return this.mutate(authority, operationId, fingerprint, {
      text: `SELECT outcome, result_payload FROM saas.catalog_update_product(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz,
        $9::uuid,$10::text,$11::uuid,$12::bigint,$13::text,$14::text,$15::text,$16::text,$17::text
      )`,
      values: [...authorityValues(authority), operationId, fingerprint, productId, expectedVersion, product.slug, product.title, product.description ?? null, product.status, product.currency],
    }, ["updated"], productResult);
  }

  async archiveProduct(input: ArchiveProductInput): Promise<ProductMutationResult> {
    const exact = exactInput(input, ["tenantContext", "now", "operationId", "productId", "expectedVersion"]);
    const authority = catalogAuthority(exact.tenantContext as ArchiveProductInput["tenantContext"], exact.now as Date);
    const operationId = catalogUuid(exact.operationId);
    const productId = catalogUuid(exact.productId);
    const expectedVersion = positiveVersion(exact.expectedVersion);
    const fingerprint = catalogFingerprint("archive_product", authority.storeId, { productId, expectedVersion });
    return this.mutate(authority, operationId, fingerprint, {
      text: `SELECT outcome, result_payload FROM saas.catalog_archive_product(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz,
        $9::uuid,$10::text,$11::uuid,$12::bigint
      )`,
      values: [...authorityValues(authority), operationId, fingerprint, productId, expectedVersion],
    }, ["archived"], productResult);
  }

  async createVariant(input: CreateVariantInput): Promise<VariantMutationResult> {
    const exact = exactInput(input, ["tenantContext", "now", "operationId", "productId", "variant"]);
    const authority = catalogAuthority(exact.tenantContext as CreateVariantInput["tenantContext"], exact.now as Date);
    const operationId = catalogUuid(exact.operationId);
    const productId = catalogUuid(exact.productId);
    const variant = variantFields(exact.variant);
    const variantId = catalogUuid(this.options.generateId("variant"));
    const fingerprint = catalogFingerprint("create_variant", authority.storeId, { productId, variant });
    return this.mutate(authority, operationId, fingerprint, {
      text: `SELECT outcome, result_payload FROM saas.catalog_create_variant(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz,
        $9::uuid,$10::text,$11::uuid,$12::uuid,$13::text,$14::text,$15::text,$16::bigint,$17::bigint,
        $18::bigint,$19::boolean,$20::bigint,$21::jsonb
      )`,
      values: [...authorityValues(authority), operationId, fingerprint, productId, variantId, variant.title, variant.sku ?? null, variant.barcode ?? null, variant.priceCents, variant.compareAtCents ?? null, variant.costCents ?? null, variant.stockTracking, variant.stockQuantity, JSON.stringify(variant.attributes)],
    }, ["created"], variantResult);
  }

  async updateVariant(input: UpdateVariantInput): Promise<VariantMutationResult> {
    const exact = exactInput(input, ["tenantContext", "now", "operationId", "productId", "variantId", "expectedVersion", "variant"]);
    const authority = catalogAuthority(exact.tenantContext as UpdateVariantInput["tenantContext"], exact.now as Date);
    const operationId = catalogUuid(exact.operationId);
    const productId = catalogUuid(exact.productId);
    const variantId = catalogUuid(exact.variantId);
    const expectedVersion = positiveVersion(exact.expectedVersion);
    const variant = variantFields(exact.variant);
    const fingerprint = catalogFingerprint("update_variant", authority.storeId, { productId, variantId, expectedVersion, variant });
    return this.mutate(authority, operationId, fingerprint, {
      text: `SELECT outcome, result_payload FROM saas.catalog_update_variant(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz,
        $9::uuid,$10::text,$11::uuid,$12::uuid,$13::bigint,$14::text,$15::text,$16::text,$17::bigint,
        $18::bigint,$19::bigint,$20::boolean,$21::bigint,$22::jsonb
      )`,
      values: [...authorityValues(authority), operationId, fingerprint, productId, variantId, expectedVersion, variant.title, variant.sku ?? null, variant.barcode ?? null, variant.priceCents, variant.compareAtCents ?? null, variant.costCents ?? null, variant.stockTracking, variant.stockQuantity, JSON.stringify(variant.attributes)],
    }, ["updated"], variantResult);
  }

  async archiveVariant(input: ArchiveVariantInput): Promise<VariantMutationResult> {
    const exact = exactInput(input, ["tenantContext", "now", "operationId", "productId", "variantId", "expectedVersion"]);
    const authority = catalogAuthority(exact.tenantContext as ArchiveVariantInput["tenantContext"], exact.now as Date);
    const operationId = catalogUuid(exact.operationId);
    const productId = catalogUuid(exact.productId);
    const variantId = catalogUuid(exact.variantId);
    const expectedVersion = positiveVersion(exact.expectedVersion);
    const fingerprint = catalogFingerprint("archive_variant", authority.storeId, { productId, variantId, expectedVersion });
    return this.mutate(authority, operationId, fingerprint, {
      text: `SELECT outcome, result_payload FROM saas.catalog_archive_variant(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz,
        $9::uuid,$10::text,$11::uuid,$12::uuid,$13::bigint
      )`,
      values: [...authorityValues(authority), operationId, fingerprint, productId, variantId, expectedVersion],
    }, ["archived"], variantResult);
  }
}
