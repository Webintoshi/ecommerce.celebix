import { acquirePostgresClient, type PostgresClientLike } from "../postgres/pool.ts";
import type { ValidatedCatalogAuthority } from "../catalog/validation.ts";
import { catalogMigrationFingerprint, stableCatalogMigrationJson } from "./canonical.ts";
import { CATALOG_MIGRATION_ERROR_CODES, CatalogMigrationRepositoryError, type CatalogMigrationErrorCode } from "./errors.ts";
import type { AuthorizeCatalogMigrationMediaInput, BeginCatalogMigrationInput, CatalogMigrationBatchResult, CatalogMigrationJob, CatalogMigrationMediaAuthority, CatalogMigrationRepository, GetCatalogMigrationInput, ImportCatalogMigrationBatchInput, PostgresCatalogMigrationRepositoryOptions, RecordCatalogMigrationMediaInput } from "./types.ts";
import { catalogMigrationAuthority, catalogMigrationCategories, catalogMigrationDigest, catalogMigrationInteger, catalogMigrationProducts, catalogMigrationSafeFailureCode, catalogMigrationSourceProductId, catalogMigrationTaxonomies, catalogMigrationUuid, exactCatalogMigrationInput, parseCatalogMigrationJob, parseCatalogMigrationMediaAuthority } from "./validation.ts";

type QuerySpec = Readonly<{ text: string; values: unknown[] }>;
type MutationParser<T> = (value: unknown, replayed: boolean) => T;
const ERROR_CODES = new Set<string>(CATALOG_MIGRATION_ERROR_CODES);

function unavailable(): CatalogMigrationRepositoryError { return new CatalogMigrationRepositoryError("unavailable"); }
function timeout(value: number): string { if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) throw unavailable(); return `${value}ms`; }
function release(client: PostgresClientLike, destroy = false): void { try { client.release(destroy || undefined); } catch {} }
function row(value: Readonly<{ rows: unknown[]; rowCount?: number | null }>): Readonly<{ outcome: string; result: unknown }> {
  if (value.rowCount !== 1 || value.rows.length !== 1) throw unavailable();
  const selected = value.rows[0];
  if (typeof selected !== "object" || selected === null || Array.isArray(selected)) throw unavailable();
  const parsed = selected as Record<string, unknown>;
  if (Object.keys(parsed).sort().join(",") !== "outcome,result_payload" || typeof parsed.outcome !== "string") throw unavailable();
  return { outcome: parsed.outcome, result: parsed.result_payload };
}
function authorityValues(authority: ValidatedCatalogAuthority): unknown[] {
  return [authority.storeId, authority.principalId, authority.membershipId, authority.planId, authority.planCode, authority.planVersion, authority.productsLimit, authority.now];
}

export class PostgresCatalogMigrationRepository implements CatalogMigrationRepository {
  private readonly options: PostgresCatalogMigrationRepositoryOptions;
  constructor(options: PostgresCatalogMigrationRepositoryOptions) {
    try {
      if (!options || typeof options !== "object" || Array.isArray(options)
        || Object.keys(options).sort().join(",") !== "audit,pool,role,timeouts,uuid"
        || options.role !== "celebix_saas_app" || typeof options.audit !== "function" || typeof options.uuid !== "function"
        || !options.pool || typeof options.pool.connect !== "function"
        || !options.timeouts || Object.keys(options.timeouts).sort().join(",") !== "idleTransactionMs,lockMs,poolCheckoutMs,statementMs") throw unavailable();
      for (const value of Object.values(options.timeouts)) timeout(value);
      this.options = Object.freeze({ ...options, timeouts: Object.freeze({ ...options.timeouts }) });
    } catch (error) { if (error instanceof CatalogMigrationRepositoryError) throw error; throw unavailable(); }
  }
  private async acquire(): Promise<PostgresClientLike> { try { return await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs); } catch { throw unavailable(); } }
  private async configure(client: PostgresClientLike): Promise<void> {
    await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [timeout(this.options.timeouts.statementMs)]);
    await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [timeout(this.options.timeouts.lockMs)]);
    await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [timeout(this.options.timeouts.idleTransactionMs)]);
    await client.query("SET LOCAL ROLE celebix_saas_app");
  }
  private mapped(outcome: string): CatalogMigrationRepositoryError | undefined { return ERROR_CODES.has(outcome) ? new CatalogMigrationRepositoryError(outcome as CatalogMigrationErrorCode) : undefined; }
  private async rollback(client: PostgresClientLike): Promise<void> { try { await client.query("ROLLBACK"); release(client); } catch { release(client, true); } }
  private emitUnknown(): void { try { const pending = this.options.audit({ type: "catalog_migration_commit_unknown" }); if (pending) void pending.catch(() => undefined); } catch {} }
  private uuid(): string { try { return catalogMigrationUuid(this.options.uuid()); } catch { throw unavailable(); } }
  private authority(input: unknown, required: readonly string[], optional: readonly string[] = []) {
    const parsed = exactCatalogMigrationInput(input, required, optional);
    return { parsed, authority: catalogMigrationAuthority(parsed.tenantContext, parsed.now) };
  }
  private async read<T>(spec: QuerySpec, expected: string, parser: (value: unknown) => T): Promise<T> {
    const client = await this.acquire(); let began = false; let terminal = false;
    try {
      await client.query("BEGIN READ ONLY"); began = true; await this.configure(client);
      const selected = row(await client.query(spec.text, spec.values));
      const mapped = this.mapped(selected.outcome); if (mapped) throw mapped;
      if (selected.outcome !== expected) throw unavailable();
      const result = parser(selected.result);
      try { await client.query("COMMIT"); terminal = true; release(client); }
      catch { terminal = true; release(client, true); throw unavailable(); }
      return result;
    } catch (error) {
      if (began && !terminal) await this.rollback(client); else if (!began && !terminal) release(client, true);
      if (error instanceof CatalogMigrationRepositoryError) throw error; throw unavailable();
    }
  }
  private async recover<T>(authority: ValidatedCatalogAuthority, operationId: string, fingerprint: string, observed: T, parser: MutationParser<T>): Promise<T> {
    const recovered = await this.read({
      text: "SELECT outcome,result_payload FROM saas.catalog_migration_recover_operation($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz,$9::uuid,$10::text)",
      values: [...authorityValues(authority), operationId, fingerprint],
    }, "operation_replayed", (value) => parser(value, true));
    if (stableCatalogMigrationJson({ ...(observed as object), replayed: false }) !== stableCatalogMigrationJson({ ...(recovered as object), replayed: false })) throw unavailable();
    return recovered;
  }
  private async mutate<T>(authority: ValidatedCatalogAuthority, operationId: string, fingerprint: string, expected: string, spec: QuerySpec, parser: MutationParser<T>): Promise<T> {
    const client = await this.acquire(); let began = false; let terminal = false;
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED"); began = true; await this.configure(client);
      const selected = row(await client.query(spec.text, spec.values));
      const mapped = this.mapped(selected.outcome); if (mapped) throw mapped;
      if (selected.outcome !== expected && selected.outcome !== "operation_replayed") throw unavailable();
      const result = parser(selected.result, selected.outcome === "operation_replayed");
      try { await client.query("COMMIT"); terminal = true; release(client); return result; }
      catch { terminal = true; release(client, true); this.emitUnknown(); return await this.recover(authority, operationId, fingerprint, result, parser); }
    } catch (error) {
      if (began && !terminal) await this.rollback(client); else if (!began && !terminal) release(client, true);
      if (error instanceof CatalogMigrationRepositoryError) throw error; throw unavailable();
    }
  }
  private job(value: unknown, replayed: boolean): CatalogMigrationJob { try { return parseCatalogMigrationJob(value, replayed); } catch (error) { if (error instanceof CatalogMigrationRepositoryError && error.code === "unavailable") throw error; throw unavailable(); } }
  private batch(value: unknown, replayed: boolean): CatalogMigrationBatchResult {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw unavailable();
    const parsed = value as Record<string, unknown>;
    const mappings = parsed.mappings;
    if (!Array.isArray(mappings) || mappings.length < 1 || mappings.length > 25) throw unavailable();
    const jobValue = { ...parsed }; delete jobValue.mappings;
    const job = this.job(jobValue, replayed);
    const selected = mappings.map((candidate) => {
      const mapping = exactCatalogMigrationInput(candidate, ["sourceProductId", "productId"]);
      if (typeof mapping.sourceProductId !== "string" || !/^[1-9][0-9]{0,19}$/.test(mapping.sourceProductId)) throw unavailable();
      return Object.freeze({ sourceProductId: mapping.sourceProductId, productId: catalogMigrationUuid(mapping.productId) });
    });
    if (new Set(selected.map((mapping) => mapping.sourceProductId)).size !== selected.length) throw unavailable();
    return Object.freeze({ ...job, mappings: Object.freeze(selected) });
  }
  async begin(input: BeginCatalogMigrationInput): Promise<CatalogMigrationJob> {
    const { parsed, authority } = this.authority(input, ["tenantContext", "now", "operationId", "sourceDigest", "totalProducts", "totalMedia", "categories", "brands"]);
    const operationId = catalogMigrationUuid(parsed.operationId), sourceDigest = catalogMigrationDigest(parsed.sourceDigest);
    const totalProducts = catalogMigrationInteger(parsed.totalProducts, 1, 2_500), totalMedia = catalogMigrationInteger(parsed.totalMedia, 0, 40_000);
    if (totalMedia > totalProducts * 16) throw new CatalogMigrationRepositoryError("invalid_input");
    const categories = catalogMigrationCategories(parsed.categories, 100), brands = catalogMigrationTaxonomies(parsed.brands, 50);
    const jobId = this.uuid();
    const persistedCategories = categories.map((entry) => ({ id: this.uuid(), ...entry }));
    const persistedBrands = brands.map((entry) => ({ id: this.uuid(), ...entry }));
    const fingerprint = catalogMigrationFingerprint("begin", authority.storeId, { sourceDigest, totalProducts, totalMedia, categories, brands });
    return this.mutate(authority, operationId, fingerprint, "begun", {
      text: "SELECT outcome,result_payload FROM saas.catalog_migration_begin($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz,$9::uuid,$10::text,$11::uuid,$12::text,$13::integer,$14::integer,$15::jsonb,$16::jsonb)",
      values: [...authorityValues(authority), operationId, fingerprint, jobId, sourceDigest, totalProducts, totalMedia, JSON.stringify(persistedCategories), JSON.stringify(persistedBrands)],
    }, (value, replayed) => this.job(value, replayed));
  }
  async importBatch(input: ImportCatalogMigrationBatchInput): Promise<CatalogMigrationBatchResult> {
    const { parsed, authority } = this.authority(input, ["tenantContext", "now", "operationId", "jobId", "sourceDigest", "products"]);
    const operationId = catalogMigrationUuid(parsed.operationId), jobId = catalogMigrationUuid(parsed.jobId), sourceDigest = catalogMigrationDigest(parsed.sourceDigest);
    const products = catalogMigrationProducts(parsed.products);
    const persisted = products.map((product) => ({ ...product, productId: this.uuid(), variant: { ...product.variant, variantId: this.uuid() } }));
    const fingerprint = catalogMigrationFingerprint("import_batch", authority.storeId, { jobId, sourceDigest, products });
    return this.mutate(authority, operationId, fingerprint, "batch_imported", {
      text: "SELECT outcome,result_payload FROM saas.catalog_migration_import_batch($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz,$9::uuid,$10::text,$11::uuid,$12::text,$13::jsonb)",
      values: [...authorityValues(authority), operationId, fingerprint, jobId, sourceDigest, JSON.stringify(persisted)],
    }, (value, replayed) => this.batch(value, replayed));
  }
  async get(input: GetCatalogMigrationInput): Promise<CatalogMigrationJob> {
    const { parsed, authority } = this.authority(input, ["tenantContext", "now", "jobId"]);
    const jobId = catalogMigrationUuid(parsed.jobId);
    return this.read({
      text: "SELECT outcome,result_payload FROM saas.catalog_migration_get($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz,$9::uuid)",
      values: [...authorityValues(authority), jobId],
    }, "found", (value) => { const result = this.job(value, false); if (result.jobId !== jobId) throw unavailable(); return result; });
  }
  async authorizeMedia(input: AuthorizeCatalogMigrationMediaInput): Promise<CatalogMigrationMediaAuthority> {
    const { parsed, authority } = this.authority(input, ["tenantContext", "now", "jobId", "sourceProductId", "ordinal", "sourceUrlDigest"]);
    const jobId = catalogMigrationUuid(parsed.jobId), sourceProductId = catalogMigrationSourceProductId(parsed.sourceProductId);
    const ordinal = catalogMigrationInteger(parsed.ordinal, 0, 15), sourceUrlDigest = catalogMigrationDigest(parsed.sourceUrlDigest);
    return this.read({
      text: "SELECT outcome,result_payload FROM saas.catalog_migration_authorize_media($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz,$9::uuid,$10::text,$11::integer,$12::text)",
      values: [...authorityValues(authority), jobId, sourceProductId, ordinal, sourceUrlDigest],
    }, "authorized", (value) => {
      try { const result = parseCatalogMigrationMediaAuthority(value); if (result.jobId !== jobId || result.sourceProductId !== sourceProductId || result.ordinal !== ordinal || result.sourceUrlDigest !== sourceUrlDigest) throw unavailable(); return result; }
      catch (error) { if (error instanceof CatalogMigrationRepositoryError && error.code === "unavailable") throw error; throw unavailable(); }
    });
  }
  async recordMedia(input: RecordCatalogMigrationMediaInput): Promise<CatalogMigrationJob> {
    const { parsed, authority } = this.authority(input, ["tenantContext", "now", "operationId", "jobId", "sourceProductId", "ordinal", "sourceUrlDigest", "outcome"], ["mediaId", "safeFailureCode"]);
    const operationId = catalogMigrationUuid(parsed.operationId), jobId = catalogMigrationUuid(parsed.jobId), sourceProductId = catalogMigrationSourceProductId(parsed.sourceProductId);
    const ordinal = catalogMigrationInteger(parsed.ordinal, 0, 15), sourceUrlDigest = catalogMigrationDigest(parsed.sourceUrlDigest);
    if (parsed.outcome !== "committed" && parsed.outcome !== "failed") throw new CatalogMigrationRepositoryError("invalid_input");
    if ((parsed.outcome === "committed" && (parsed.mediaId === undefined || parsed.safeFailureCode !== undefined))
      || (parsed.outcome === "failed" && (parsed.safeFailureCode === undefined || parsed.mediaId !== undefined))) throw new CatalogMigrationRepositoryError("invalid_input");
    const mediaId = parsed.outcome === "committed" ? catalogMigrationUuid(parsed.mediaId) : null;
    const safeFailureCode = parsed.outcome === "failed" ? catalogMigrationSafeFailureCode(parsed.safeFailureCode) : null;
    const fingerprint = catalogMigrationFingerprint("record_media", authority.storeId, { jobId, sourceProductId, ordinal, sourceUrlDigest, outcome: parsed.outcome, mediaId, safeFailureCode });
    return this.mutate(authority, operationId, fingerprint, "media_recorded", {
      text: "SELECT outcome,result_payload FROM saas.catalog_migration_record_media($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz,$9::uuid,$10::text,$11::uuid,$12::text,$13::integer,$14::text,$15::text,$16::uuid,$17::text)",
      values: [...authorityValues(authority), operationId, fingerprint, jobId, sourceProductId, ordinal, sourceUrlDigest, parsed.outcome, mediaId, safeFailureCode],
    }, (value, replayed) => this.job(value, replayed));
  }
}
