import {
  parsePriceList,
  parsePricingPreviewRequest,
  parsePricingPreviewResult,
  type PriceList,
  type TenantContext,
} from "@celebix/saas-contracts";
import { acquirePostgresClient, type PostgresClientLike } from "../postgres/pool.ts";
import { canonicalPricingItems, canonicalPricingRules, deterministicPricingCreateId, equalPricingProjection, pricingFingerprint } from "./canonical.ts";
import { PRICING_ERROR_CODES, pricingFailure, pricingRepositoryErrorCode, type PricingErrorCode } from "./errors.ts";
import type { PostgresPricingRepositoryOptions, PriceListOperationInput, PricingRepository, SavePriceListInput } from "./types.ts";
import { exactPricingInput, pricingAuthority, pricingItems, pricingRules, pricingText, pricingUuid, pricingVersion } from "./validation.ts";
import type { ValidatedOrderAuthority } from "../orders/validation.ts";

const SQL = Object.freeze({
  list: "SELECT outcome,result_payload FROM saas.pricing_list($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz)",
  get: "SELECT outcome,result_payload FROM saas.pricing_get($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid)",
  save: "SELECT outcome,result_payload FROM saas.pricing_save($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint,$12::text,$13::jsonb,$14::jsonb)",
  activate: "SELECT outcome,result_payload FROM saas.pricing_activate($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint)",
  archive: "SELECT outcome,result_payload FROM saas.pricing_archive($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint)",
  recover: "SELECT outcome,result_payload FROM saas.pricing_recover_operation($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text)",
  preview: "SELECT outcome,result_payload FROM saas.pricing_preview($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::text,$9::uuid[])",
});
const EXPECTED = new Set<string>([...PRICING_ERROR_CODES, "not_found"]);
function unavailable(): Error { return pricingFailure("unavailable"); }
function timeout(value: unknown): string { if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 60_000) throw unavailable(); return `${value}ms`; }
function release(client: PostgresClientLike, destroy = false) { try { client.release(destroy || undefined); } catch { /* terminal */ } }
function authorityValues(authority: ValidatedOrderAuthority): unknown[] { return [authority.storeId, authority.principalId, authority.membershipId, authority.planId, authority.planCode, authority.planVersion, authority.now]; }
function row(result: Readonly<{ rows: unknown[]; rowCount?: number | null }>) {
  try {
    const resultDescriptors = Object.getOwnPropertyDescriptors(result), rowsDescriptor = resultDescriptors.rows, rowCountDescriptor = resultDescriptors.rowCount;
    if (!rowsDescriptor || !("value" in rowsDescriptor) || !rowCountDescriptor || !("value" in rowCountDescriptor) || rowCountDescriptor.value !== 1) throw unavailable();
    const rows = rowsDescriptor.value; if (!Array.isArray(rows) || Object.getPrototypeOf(rows) !== Array.prototype || rows.length !== 1) throw unavailable();
    const rowsDescriptors = Object.getOwnPropertyDescriptors(rows), selected = rowsDescriptors["0"];
    if (Reflect.ownKeys(rowsDescriptors).length !== 2 || !selected || !("value" in selected) || !selected.enumerable) throw unavailable();
    const raw = selected.value; if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw unavailable();
    const descriptors = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(descriptors).map(String).sort().join(",") !== "outcome,result_payload") throw unavailable();
    const outcome = descriptors.outcome, payload = descriptors.result_payload;
    if (!outcome || !("value" in outcome) || !outcome.enumerable || typeof outcome.value !== "string" || outcome.value.length > 64 || !payload || !("value" in payload) || !payload.enumerable) throw unavailable();
    return { outcome: outcome.value, result: payload.value };
  } catch { throw unavailable(); }
}
export class PostgresPricingRepository implements PricingRepository {
  private readonly options: PostgresPricingRepositoryOptions;
  constructor(options: PostgresPricingRepositoryOptions) {
    try { if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).sort().join(",") !== "audit,pool,role,timeouts,uuid" || options.role !== "celebix_saas_app" || typeof options.uuid !== "function" || typeof options.audit !== "function" || !options.timeouts || Object.keys(options.timeouts).sort().join(",") !== "idleTransactionMs,lockMs,poolCheckoutMs,statementMs") throw unavailable(); Object.values(options.timeouts).forEach(timeout); this.options = Object.freeze({ ...options, timeouts: Object.freeze({ ...options.timeouts }) }); }
    catch { throw unavailable(); }
  }
  private async acquire() { try { return await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs); } catch { throw unavailable(); } }
  private async query(client: PostgresClientLike, text: string, values?: unknown[]) { try { return await client.query(text, values); } catch { throw unavailable(); } }
  private async configure(client: PostgresClientLike) { await this.query(client, "SELECT pg_catalog.set_config('statement_timeout', $1, true)", [timeout(this.options.timeouts.statementMs)]); await this.query(client, "SELECT pg_catalog.set_config('lock_timeout', $1, true)", [timeout(this.options.timeouts.lockMs)]); await this.query(client, "SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [timeout(this.options.timeouts.idleTransactionMs)]); await this.query(client, "SET LOCAL ROLE celebix_saas_app"); }
  private mapped(outcome: string): Error | undefined { if (!EXPECTED.has(outcome)) return undefined; const mapped: Record<string, PricingErrorCode> = { not_found: "resource_not_found" }; return pricingFailure(mapped[outcome] ?? outcome as PricingErrorCode); }
  private async rollback(client: PostgresClientLike) { try { await this.query(client, "ROLLBACK"); release(client); } catch { release(client, true); } }
  private async read<T>(text: string, values: unknown[], success: string, parser: (value: unknown) => T): Promise<T> {
    const client = await this.acquire(); let began = false, terminal = false;
    try { await this.query(client, "BEGIN READ ONLY"); began = true; await this.configure(client); const selected = row(await this.query(client, text, values)); const known = this.mapped(selected.outcome); if (known) throw known; if (selected.outcome !== success) throw unavailable(); const parsed = parser(selected.result); try { await this.query(client, "COMMIT"); terminal = true; release(client); } catch { terminal = true; release(client, true); throw unavailable(); } return parsed; }
    catch (error) { if (began && !terminal) await this.rollback(client); else if (!began && !terminal) release(client, true); if (pricingRepositoryErrorCode(error)) throw error; throw unavailable(); }
  }
  private emitUnknown() { try { const pending = this.options.audit({ type: "pricing_commit_unknown" }); if (pending) void pending.catch(() => undefined); } catch { /* observational */ } }
  private projection(value: unknown, id: string, status: PriceList["status"], version: number): PriceList {
    try { const parsed = parsePriceList(value); if (parsed.id !== id || parsed.status !== status || parsed.version !== version) throw unavailable(); return parsed; }
    catch { throw unavailable(); }
  }
  private async recover(authority: ValidatedOrderAuthority, operationId: string, fingerprint: string, observed: PriceList, parser: (value: unknown) => PriceList): Promise<PriceList> {
    return this.read(SQL.recover, [...authorityValues(authority), operationId, fingerprint], "operation_replayed", (value) => { const parsed = parser(value); if (!equalPricingProjection(parsed, observed)) throw unavailable(); return parsed; });
  }
  private async mutate(authority: ValidatedOrderAuthority, operationId: string, fingerprint: string, success: string, text: string, values: unknown[], parser: (value: unknown) => PriceList): Promise<PriceList> {
    const client = await this.acquire(); let began = false, terminal = false;
    try { await this.query(client, "BEGIN ISOLATION LEVEL READ COMMITTED"); began = true; await this.configure(client); const selected = row(await this.query(client, text, values)); const known = this.mapped(selected.outcome); if (known) throw known; if (selected.outcome !== success && selected.outcome !== "operation_replayed") throw unavailable(); const parsed = parser(selected.result); try { await this.query(client, "COMMIT"); terminal = true; release(client); return parsed; } catch { terminal = true; release(client, true); this.emitUnknown(); return await this.recover(authority, operationId, fingerprint, parsed, parser); } }
    catch (error) { if (began && !terminal) await this.rollback(client); else if (!began && !terminal) release(client, true); if (pricingRepositoryErrorCode(error)) throw error; throw unavailable(); }
  }
  private validated(value: unknown, required: readonly string[], optional: readonly string[] = []) { const parsed = exactPricingInput(value, required, optional); return { parsed, authority: pricingAuthority(parsed.tenantContext as TenantContext, parsed.now as Date) }; }
  async list(input: Parameters<PricingRepository["list"]>[0]) { const { authority } = this.validated(input, ["tenantContext", "now"]); return this.read(SQL.list, authorityValues(authority), "listed", (value) => { try { if (typeof value !== "object" || value === null || Array.isArray(value)) throw unavailable(); const root = Object.getOwnPropertyDescriptors(value), itemDescriptor = root.items; if (Reflect.ownKeys(root).length !== 1 || !itemDescriptor || !("value" in itemDescriptor) || !itemDescriptor.enumerable) throw unavailable(); const items = itemDescriptor.value; if (!Array.isArray(items) || Object.getPrototypeOf(items) !== Array.prototype || items.length > 500) throw unavailable(); const descriptors = Object.getOwnPropertyDescriptors(items); if (Reflect.ownKeys(descriptors).length !== items.length + 1) throw unavailable(); const copied: unknown[] = []; for (let index = 0; index < items.length; index += 1) { const descriptor = descriptors[String(index)]; if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw unavailable(); copied.push(descriptor.value); } const parsed = Object.freeze(copied.map(parsePriceList)); for (let index = 1; index < parsed.length; index += 1) { const a = parsed[index - 1]!, b = parsed[index]!; if (a.updatedAt < b.updatedAt || (a.updatedAt === b.updatedAt && a.id <= b.id)) throw unavailable(); } return parsed; } catch { throw unavailable(); } }); }
  async get(input: Parameters<PricingRepository["get"]>[0]) { const { parsed, authority } = this.validated(input, ["tenantContext", "now", "priceListId"]); const id = pricingUuid(parsed.priceListId); return this.read(SQL.get, [...authorityValues(authority), id], "found", (value) => { try { const result = parsePriceList(value); if (result.id !== id) throw unavailable(); return result; } catch { throw unavailable(); } }); }
  async save(input: SavePriceListInput) { const { parsed, authority } = this.validated(input, ["tenantContext", "now", "operationId", "name", "items", "rules"], ["priceListId", "expectedVersion"]); const operationId = pricingUuid(parsed.operationId), existing = parsed.priceListId === undefined ? undefined : pricingUuid(parsed.priceListId), expected = parsed.expectedVersion === undefined ? undefined : pricingVersion(parsed.expectedVersion); if ((existing === undefined) !== (expected === undefined)) throw pricingFailure("invalid_input"); const name = pricingText(parsed.name), items = canonicalPricingItems(pricingItems(parsed.items)), rules = canonicalPricingRules(pricingRules(parsed.rules)), payload = { items, name, rules }; const id = existing ?? deterministicPricingCreateId(authority.storeId, operationId, payload); const fingerprint = pricingFingerprint("save", authority.storeId, id, expected ?? null, payload); return this.mutate(authority, operationId, fingerprint, "saved", SQL.save, [...authorityValues(authority), operationId, fingerprint, id, expected ?? null, name, JSON.stringify(items), JSON.stringify(rules)], (value) => this.projection(value, id, "draft", (expected ?? 0) + 1)); }
  private operation(input: PriceListOperationInput, kind: "activate" | "archive") { const { parsed, authority } = this.validated(input, ["tenantContext", "now", "operationId", "priceListId", "expectedVersion"]); const operationId = pricingUuid(parsed.operationId), id = pricingUuid(parsed.priceListId), expected = pricingVersion(parsed.expectedVersion), fingerprint = pricingFingerprint(kind, authority.storeId, id, expected, {}), status = kind === "activate" ? "active" : "archived"; return this.mutate(authority, operationId, fingerprint, kind === "activate" ? "activated" : "archived", SQL[kind], [...authorityValues(authority), operationId, fingerprint, id, expected], (value) => this.projection(value, id, status, expected + 1)); }
  activate(input: PriceListOperationInput) { return this.operation(input, "activate"); }
  archive(input: PriceListOperationInput) { return this.operation(input, "archive"); }
  async preview(input: Parameters<PricingRepository["preview"]>[0]) {
    const { parsed, authority } = this.validated(
      input,
      ["tenantContext", "now", "channel", "variantIds"],
    );
    let request: ReturnType<typeof parsePricingPreviewRequest>;
    try {
      request = parsePricingPreviewRequest({
        channel: parsed.channel,
        variantIds: parsed.variantIds,
      });
    } catch {
      throw pricingFailure("invalid_input");
    }
    return this.read(
      SQL.preview,
      [...authorityValues(authority), request.channel, [...request.variantIds]],
      "previewed",
      (value) => {
        try {
          const raw = exactPricingInput(value, ["entries", "asOf"]);
          const result = parsePricingPreviewResult(raw);
          const expectedAsOf = authority.now.toISOString().replace(/(\.\d{3})Z$/, "$1000Z");
          const requested = new Set(request.variantIds);
          if (
            raw.asOf !== result.asOf
            || result.asOf !== expectedAsOf
            || result.entries.length !== request.variantIds.length
            || result.entries.some((entry) => (
              entry.channel !== request.channel || !requested.delete(entry.variantId)
            ))
            || requested.size !== 0
          ) throw unavailable();
          return result;
        } catch {
          throw unavailable();
        }
      },
    );
  }
}
