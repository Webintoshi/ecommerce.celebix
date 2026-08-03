import { parsePublicProduct, parsePublicProductMedia, parsePublicStarterThemePresentation, parsePublicStorefront, type PublicProduct, type PublicProductMedia, type PublicStarterThemePresentation, type PublicStorefront } from "../../../saas-contracts/src/storefront/index.ts";
import { parsePublicStorefrontDesign, type PublicStorefrontDesign } from "../../../saas-contracts/src/storefront-design/index.ts";
import { acquirePostgresClient, type PostgresClientLike } from "../postgres/pool.ts";
import { PublicStorefrontRepositoryError } from "./errors.ts";
import type { CampaignHomeProjection, PostgresPublicStorefrontRepositoryOptions, PublicStorefrontCategoryProductList, PublicStorefrontRepository } from "./types.ts";

const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

function failure(code: "invalid_input" | "not_found" | "unavailable"): PublicStorefrontRepositoryError { return new PublicStorefrontRepositoryError(code); }
function timeout(value: number): string { if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) throw failure("unavailable"); return `${value}ms`; }
function date(value: unknown): Date { if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw failure("invalid_input"); return new Date(value); }
function exact<T extends object>(value: T, keys: readonly string[]): T { if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== [...keys].sort().join(",")) throw failure("invalid_input"); return value; }
function hostname(value: unknown): string { if (typeof value !== "string" || value.length < 3 || value.length > 253 || value !== value.trim() || !HOSTNAME.test(value)) throw failure("invalid_input"); return value; }
function uuid(value: unknown): string { if (typeof value !== "string" || !UUID.test(value)) throw failure("invalid_input"); return value; }
function slug(value: unknown): string { if (typeof value !== "string" || value.length < 3 || value.length > 100 || !SLUG.test(value)) throw failure("invalid_input"); return value; }
function categorySlug(value: unknown, code: "invalid_input" | "unavailable" = "invalid_input"): string { if (typeof value !== "string" || value.length < 1 || value.length > 100 || !SLUG.test(value)) throw failure(code); return value; }
function categoryName(value: unknown): string { if (typeof value !== "string" || value.length < 1 || value.length > 120 || value !== value.trim() || CONTROL.test(value)) throw failure("unavailable"); return value; }
function row(rows: unknown[]): { outcome: string; resultPayload: unknown } {
  if (rows.length !== 1 || typeof rows[0] !== "object" || rows[0] === null || Array.isArray(rows[0])) throw failure("unavailable");
  const parsed = rows[0] as Record<string, unknown>;
  if (Object.keys(parsed).sort().join(",") !== "outcome,result_payload" || typeof parsed.outcome !== "string") throw failure("unavailable");
  return { outcome: parsed.outcome, resultPayload: parsed.result_payload };
}
function context(value: unknown): PublicStorefront {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.keys(value).join(",") !== "storefront") throw failure("invalid_input");
  try { return parsePublicStorefront((value as { storefront: unknown }).storefront); } catch { throw failure("invalid_input"); }
}
function categoryPayload(value: unknown): PublicStorefrontCategoryProductList {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "category,items") throw failure("unavailable");
  const payload = value as { category: unknown; items: unknown };
  if (!payload.category || typeof payload.category !== "object" || Array.isArray(payload.category) || Object.keys(payload.category).sort().join(",") !== "id,name,slug" || !Array.isArray(payload.items)) throw failure("unavailable");
  const selected = payload.category as Record<string, unknown>;
  try {
    const category = Object.freeze({ id: uuid(selected.id), name: categoryName(selected.name), slug: categorySlug(selected.slug, "unavailable") });
    return Object.freeze({ category, items: Object.freeze(payload.items.map(parsePublicProduct)) });
  } catch { throw failure("unavailable"); }
}
function campaignHomePayload(value: unknown): CampaignHomeProjection {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "presentation,productRows") throw failure("unavailable");
  const payload = value as { presentation: unknown; productRows: unknown };
  let presentation: PublicStarterThemePresentation;
  try {
    const parsed = parsePublicStarterThemePresentation(payload.presentation);
    if (parsed.schemaVersion !== 2 && parsed.schemaVersion !== 3) throw failure("unavailable");
    presentation = parsed;
  } catch (caught) { if (caught instanceof PublicStorefrontRepositoryError) throw caught; throw failure("unavailable"); }
  if (!Array.isArray(payload.productRows) || payload.productRows.length > 12) throw failure("unavailable");
  const declaredRows = presentation.sections.flatMap((section) => section.kind === "product_row" ? [Object.freeze({ key: section.key, limit: section.limit })] : []);
  const limits = new Map(declaredRows.map((section) => [section.key, section.limit]));
  const rows = payload.productRows.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || Object.keys(entry).sort().join(",") !== "items,key") throw failure("unavailable");
    const row = entry as { key: unknown; items: unknown };
    if (typeof row.key !== "string" || !limits.has(row.key) || !Array.isArray(row.items) || row.items.length > limits.get(row.key)!) throw failure("unavailable");
    try { return Object.freeze({ key: row.key, items: Object.freeze(row.items.map(parsePublicProduct)) }); } catch { throw failure("unavailable"); }
  });
  if (rows.length !== limits.size || new Set(rows.map((row) => row.key)).size !== rows.length) throw failure("unavailable");
  return Object.freeze({ presentation, productRows: Object.freeze(rows) });
}

export class PostgresPublicStorefrontRepository implements PublicStorefrontRepository {
  private readonly options: PostgresPublicStorefrontRepositoryOptions;
  constructor(options: PostgresPublicStorefrontRepositoryOptions) {
    if (!options || options.role !== "celebix_saas_host_resolver") throw failure("unavailable");
    timeout(options.timeouts.poolCheckoutMs); timeout(options.timeouts.statementMs); timeout(options.timeouts.lockMs); timeout(options.timeouts.idleTransactionMs);
    this.options = options;
  }
  private async configure(client: PostgresClientLike): Promise<void> {
    await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [timeout(this.options.timeouts.statementMs)]);
    await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [timeout(this.options.timeouts.lockMs)]);
    await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [timeout(this.options.timeouts.idleTransactionMs)]);
    await client.query("SET LOCAL ROLE celebix_saas_host_resolver");
  }
  private async read(text: string, values: unknown[]): Promise<{ outcome: string; resultPayload: unknown }> {
    let client: PostgresClientLike;
    try { client = await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs); } catch { throw failure("unavailable"); }
    let began = false;
    try {
      await client.query("BEGIN READ ONLY"); began = true; await this.configure(client);
      const result = row((await client.query(text, values)).rows);
      await client.query("COMMIT"); client.release(); return result;
    } catch (caught) {
      if (began) { try { await client.query("ROLLBACK"); client.release(); } catch { client.release(true); } } else client.release(true);
      if (caught instanceof PublicStorefrontRepositoryError) throw caught;
      throw failure("unavailable");
    }
  }
  private projection(result: { outcome: string; resultPayload: unknown }): unknown {
    if (result.outcome === "not_found" || result.outcome === "storefront_not_found") throw failure("not_found");
    if (result.outcome === "invalid_input") throw failure("invalid_input");
    if (result.outcome !== "found") throw failure("unavailable");
    return result.resultPayload;
  }
  async getPublicStorefront(input: { hostname: string; now: Date }): Promise<PublicStorefront> {
    const parsed = exact(input, ["hostname", "now"]);
    const result = await this.read("SELECT outcome, result_payload FROM saas.resolve_public_storefront($1::text,$2::timestamptz)", [hostname(parsed.hostname), date(parsed.now)]);
    try { return parsePublicStorefront(this.projection(result)); } catch (caught) { if (caught instanceof PublicStorefrontRepositoryError) throw caught; throw failure("unavailable"); }
  }
  async listPublicProducts(input: Parameters<PublicStorefrontRepository["listPublicProducts"]>[0]) {
    const parsed = exact(input, ["storefront", "now", "limit"]); const store = context({ storefront: parsed.storefront });
    if (!Number.isSafeInteger(parsed.limit) || parsed.limit < 1 || parsed.limit > 48) throw failure("invalid_input");
    const result = await this.read("SELECT outcome, result_payload FROM saas.public_list_products($1::uuid,$2::text,$3::timestamptz,$4::integer)", [store.id, store.hostname, date(parsed.now), parsed.limit]);
    const payload = this.projection(result);
    if (!Array.isArray(payload)) throw failure("unavailable");
    try { return Object.freeze({ items: Object.freeze(payload.map(parsePublicProduct)) }); } catch { throw failure("unavailable"); }
  }
  async listPublicProductsByCategory(input: Parameters<PublicStorefrontRepository["listPublicProductsByCategory"]>[0]): Promise<PublicStorefrontCategoryProductList> {
    const parsed = exact(input, ["storefront", "now", "slug", "limit"]); const store = context({ storefront: parsed.storefront });
    if (!Number.isSafeInteger(parsed.limit) || parsed.limit < 1 || parsed.limit > 48) throw failure("invalid_input");
    const selectedSlug = categorySlug(parsed.slug);
    const result = await this.read("SELECT outcome, result_payload FROM saas.public_list_products_by_category($1::uuid,$2::text,$3::timestamptz,$4::text,$5::integer)", [store.id, store.hostname, date(parsed.now), selectedSlug, parsed.limit]);
    return categoryPayload(this.projection(result));
  }
  async getPublicProductBySlug(input: Parameters<PublicStorefrontRepository["getPublicProductBySlug"]>[0]): Promise<PublicProduct> {
    const parsed = exact(input, ["storefront", "now", "slug"]); const store = context({ storefront: parsed.storefront });
    const result = await this.read("SELECT outcome, result_payload FROM saas.public_starter_product_detail($1::uuid,$2::text,$3::timestamptz,$4::text)", [store.id, store.hostname, date(parsed.now), slug(parsed.slug)]);
    try { return parsePublicProduct(this.projection(result)); } catch (caught) { if (caught instanceof PublicStorefrontRepositoryError) throw caught; throw failure("unavailable"); }
  }
  async listPublicProductMedia(input: Parameters<PublicStorefrontRepository["listPublicProductMedia"]>[0]): Promise<readonly PublicProductMedia[]> {
    const parsed = exact(input, ["storefront", "now", "productId"]); const store = context({ storefront: parsed.storefront });
    const result = await this.read("SELECT outcome, result_payload FROM saas.public_list_product_media($1::uuid,$2::text,$3::timestamptz,$4::uuid)", [store.id, store.hostname, date(parsed.now), uuid(parsed.productId)]);
    const payload = this.projection(result); if (!Array.isArray(payload)) throw failure("unavailable");
    try { return Object.freeze(payload.map(parsePublicProductMedia)); } catch { throw failure("unavailable"); }
  }
  async getPublicStorefrontDesign(input: Parameters<PublicStorefrontRepository["getPublicStorefrontDesign"]>[0]): Promise<PublicStorefrontDesign> {
    const parsed = exact(input, ["storefront", "now"]);
    const store = context({ storefront: parsed.storefront });
    const result = await this.read("SELECT outcome, result_payload FROM saas.storefront_design_get_public($1::uuid,$2::text,$3::timestamptz)", [store.id, store.hostname, date(parsed.now)]);
    try { return parsePublicStorefrontDesign(this.projection(result)); } catch (caught) { if (caught instanceof PublicStorefrontRepositoryError) throw caught; throw failure("unavailable"); }
  }
  async resolveCampaignHome(input: Parameters<NonNullable<PublicStorefrontRepository["resolveCampaignHome"]>>[0]): Promise<CampaignHomeProjection> {
    const parsed = exact(input, ["storefront", "now"]); const store = context({ storefront: parsed.storefront });
    const result = await this.read("SELECT outcome, result_payload FROM saas.public_starter_retail_home($1::uuid,$2::text,$3::timestamptz)", [store.id, store.hostname, date(parsed.now)]);
    return campaignHomePayload(this.projection(result));
  }
  async listRelatedPublicProducts(input: Parameters<NonNullable<PublicStorefrontRepository["listRelatedPublicProducts"]>>[0]) {
    const parsed = exact(input, ["storefront", "now", "productSlug", "limit"]); const store = context({ storefront: parsed.storefront });
    if (!Number.isSafeInteger(parsed.limit) || parsed.limit < 1 || parsed.limit > 12) throw failure("invalid_input");
    const result = await this.read("SELECT outcome, result_payload FROM saas.public_storefront_related_products($1::uuid,$2::text,$3::timestamptz,$4::text,$5::integer)", [store.id, store.hostname, date(parsed.now), slug(parsed.productSlug), parsed.limit]);
    const payload = this.projection(result);
    if (!Array.isArray(payload)) throw failure("unavailable");
    try { return Object.freeze({ items: Object.freeze(payload.map(parsePublicProduct)) }); } catch { throw failure("unavailable"); }
  }
}
