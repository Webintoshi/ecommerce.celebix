import { createHash } from "node:crypto";
import { parseReferenceIdentity, type ReferenceIdentity } from "@celebix/saas-contracts";
import { acquirePostgresClient, type PostgresClientLike } from "../postgres/pool.ts";
import type { ValidatedOrderAuthority } from "../orders/validation.ts";
import { failure, referencePricingRepositoryErrorCode, type ReferencePricingErrorCode } from "./errors.ts";
import type {
  PostgresReferencePricingRepositoryOptions, ReferencePricingRepository,
} from "./types.ts";
import {
  authorityInput, decimal, digest, exact, integer, label, parseActivated,
  parseDefinitionsList, parseList, parsePolicy, parsePolicyPreview, parsePreview, parseSavedSet, parseSet, policy, setValues, uuid,
} from "./validation.ts";

const SQL = Object.freeze({
  listDefinitions: "SELECT outcome,result_payload FROM saas.pricing_reference_definitions_list($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz)",
  list: "SELECT outcome,result_payload FROM saas.pricing_reference_list($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::integer,$9::bigint)",
  get: "SELECT outcome,result_payload FROM saas.pricing_reference_get($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid)",
  getPolicy: "SELECT outcome,result_payload FROM saas.pricing_variant_policy_get($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid)",
  previewPolicy: "SELECT outcome,result_payload FROM saas.pricing_variant_policy_preview($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::jsonb,$10::text)",
  preview: "SELECT outcome,result_payload FROM saas.pricing_reference_set_preview($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::integer,$11::uuid)",
  define: "SELECT outcome,result_payload FROM saas.pricing_reference_define($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::text,$12::text,$13::text)",
  saveSet: "SELECT outcome,result_payload FROM saas.pricing_reference_set_save($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint,$12::jsonb)",
  activate: "SELECT outcome,result_payload FROM saas.pricing_reference_set_activate($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint,$12::text)",
  savePolicy: "SELECT outcome,result_payload FROM saas.pricing_variant_policy_save_v2($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint,$12::bigint,$13::jsonb,$14::text)",
  recover: "SELECT outcome,result_payload FROM saas.pricing_reference_operation_get($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid)",
});

function unavailable(): never { throw failure("unavailable"); }
function timeout(value: unknown): string {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 60_000) return unavailable();
  return `${value}ms`;
}
function release(client: PostgresClientLike, destroy = false): void {
  try { client.release(destroy || undefined); } catch { /* terminal */ }
}
function authorityValues(authority: ValidatedOrderAuthority): unknown[] {
  return [authority.storeId, authority.principalId, authority.membershipId,
    authority.planId, authority.planCode, authority.planVersion, authority.now];
}
function stable(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    return encoded === undefined ? unavailable() : encoded;
  }
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`).join(",")}}`;
}
function fingerprint(kind: string, storeId: string, payload: unknown): string {
  return createHash("sha256").update(stable({ kind, storeId, payload }), "utf8").digest("hex");
}
function row(result: Readonly<{ rows: unknown[]; rowCount?: number | null }>): Readonly<{ outcome: string; payload: unknown }> {
  try {
    const selected = Object.getOwnPropertyDescriptors(result);
    if (!selected.rows || !("value" in selected.rows) || !selected.rowCount || !("value" in selected.rowCount)
      || selected.rowCount.value !== 1) return unavailable();
    const rows = selected.rows.value;
    if (!Array.isArray(rows) || Object.getPrototypeOf(rows) !== Array.prototype || rows.length !== 1) return unavailable();
    const entries = Object.getOwnPropertyDescriptors(rows);
    if (Reflect.ownKeys(entries).length !== 2 || !entries["0"] || !("value" in entries["0"]!) || !entries["0"]!.enumerable) return unavailable();
    const item = exact(entries["0"]!.value, ["outcome", "result_payload"], [], true);
    if (typeof item.outcome !== "string" || item.outcome.length > 64) return unavailable();
    return { outcome: item.outcome, payload: item.result_payload };
  } catch { return unavailable(); }
}
function mapped(outcome: string): ReferencePricingErrorCode | undefined {
  if (outcome === "not_found") return "resource_not_found";
  const known = new Set<ReferencePricingErrorCode>([
    "invalid_input", "unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled",
    "resource_not_found", "version_conflict", "operation_mismatch", "scope_conflict",
    "durable_authority_invalid", "unavailable",
  ]);
  return known.has(outcome as ReferencePricingErrorCode) ? outcome as ReferencePricingErrorCode : undefined;
}
function identity(value: unknown): ReferenceIdentity {
  try { return parseReferenceIdentity(value); } catch { return unavailable(); }
}

export class PostgresReferencePricingRepository implements ReferencePricingRepository {
  private readonly options: PostgresReferencePricingRepositoryOptions;
  constructor(options: PostgresReferencePricingRepositoryOptions) {
    try {
      const parsed = exact(options, ["pool", "role", "timeouts", "audit"]);
      if (parsed.role !== "celebix_saas_app" || typeof parsed.audit !== "function") unavailable();
      const timeouts = exact(parsed.timeouts, ["poolCheckoutMs", "statementMs", "lockMs", "idleTransactionMs"]);
      for (const value of Object.values(timeouts)) timeout(value);
      if (!parsed.pool || typeof parsed.pool !== "object" || typeof (parsed.pool as { connect?: unknown }).connect !== "function") unavailable();
      this.options = Object.freeze({ ...options, timeouts: Object.freeze({ ...options.timeouts }) });
    } catch { unavailable(); }
  }
  private async acquire(): Promise<PostgresClientLike> {
    try { return await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs); }
    catch { return unavailable(); }
  }
  private async query(client: PostgresClientLike, text: string, values?: unknown[]) {
    try { return await client.query(text, values); } catch { return unavailable(); }
  }
  private async configure(client: PostgresClientLike) {
    await this.query(client, "SELECT pg_catalog.set_config('statement_timeout', $1, true)", [timeout(this.options.timeouts.statementMs)]);
    await this.query(client, "SELECT pg_catalog.set_config('lock_timeout', $1, true)", [timeout(this.options.timeouts.lockMs)]);
    await this.query(client, "SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [timeout(this.options.timeouts.idleTransactionMs)]);
    await this.query(client, "SET LOCAL ROLE celebix_saas_app");
  }
  private async rollback(client: PostgresClientLike) {
    try { await this.query(client, "ROLLBACK"); release(client); } catch { release(client, true); }
  }
  private async read<T>(sql: string, values: unknown[], success: string, parser: (value: unknown) => T): Promise<T> {
    const client = await this.acquire(); let began = false; let terminal = false;
    try {
      await this.query(client, "BEGIN READ ONLY"); began = true;
      await this.configure(client);
      const selected = row(await this.query(client, sql, values));
      const code = mapped(selected.outcome);
      if (code) throw failure(code);
      if (selected.outcome !== success) return unavailable();
      const parsed = parser(selected.payload);
      try { await this.query(client, "COMMIT"); terminal = true; release(client); }
      catch { terminal = true; release(client, true); return unavailable(); }
      return parsed;
    } catch (error) {
      if (began && !terminal) await this.rollback(client);
      else if (!began && !terminal) release(client, true);
      if (referencePricingRepositoryErrorCode(error)) throw error;
      return unavailable();
    }
  }
  private emitUnknown() {
    try {
      const pending = this.options.audit({ type: "reference_pricing_commit_unknown" });
      if (pending) void pending.catch(() => undefined);
    } catch { /* observational */ }
  }
  private async recover<T>(authority: ValidatedOrderAuthority, operationId: string, kind: string,
    observed: T, parser: (value: unknown) => T): Promise<T> {
    try {
      return await this.read(SQL.recover, [...authorityValues(authority), operationId], "found", (value) => {
        const selected = exact(value, ["operationKind", "result"], [], true);
        if (selected.operationKind !== kind) return unavailable();
        const recovered = parser(selected.result);
        if (stable(recovered) !== stable(observed)) return unavailable();
        return recovered;
      });
    } catch { return unavailable(); }
  }
  private async mutate<T>(authority: ValidatedOrderAuthority, operationId: string, kind: string,
    success: string, sql: string, values: unknown[], parser: (value: unknown) => T): Promise<T> {
    const client = await this.acquire(); let began = false; let terminal = false;
    try {
      await this.query(client, "BEGIN ISOLATION LEVEL READ COMMITTED"); began = true;
      await this.configure(client);
      const selected = row(await this.query(client, sql, values));
      const code = mapped(selected.outcome);
      if (code) throw failure(code);
      if (selected.outcome !== success && selected.outcome !== "operation_replayed") return unavailable();
      const parsed = parser(selected.payload);
      try { await this.query(client, "COMMIT"); terminal = true; release(client); return parsed; }
      catch { terminal = true; release(client, true); this.emitUnknown(); return await this.recover(authority, operationId, kind, parsed, parser); }
    } catch (error) {
      if (began && !terminal) await this.rollback(client);
      else if (!began && !terminal) release(client, true);
      if (referencePricingRepositoryErrorCode(error)) throw error;
      return unavailable();
    }
  }
  async listDefinitions(input: Parameters<ReferencePricingRepository["listDefinitions"]>[0]) {
    const { authority } = authorityInput(input, []);
    return this.read(SQL.listDefinitions, authorityValues(authority), "listed", parseDefinitionsList);
  }
  async list(input: Parameters<ReferencePricingRepository["list"]>[0]) {
    const { parsed, authority } = authorityInput(input, ["pageSize"], ["afterSetVersion"]);
    const pageSize = integer(parsed.pageSize, 1, 100);
    const cursor = parsed.afterSetVersion === undefined ? null : integer(parsed.afterSetVersion, 1);
    return this.read(SQL.list, [...authorityValues(authority), pageSize, cursor], "listed", parseList);
  }
  async get(input: Parameters<ReferencePricingRepository["get"]>[0]) {
    const { parsed, authority } = authorityInput(input, [], ["setId"]);
    const setId = parsed.setId === undefined ? null : uuid(parsed.setId);
    return this.read(SQL.get, [...authorityValues(authority), setId], "found", (value) => {
      const result = parseSet(value);
      if (setId !== null && result.setId !== setId) return unavailable();
      return result;
    });
  }
  async getPolicy(input: Parameters<ReferencePricingRepository["getPolicy"]>[0]) {
    const { parsed, authority } = authorityInput(input, ["variantId"]);
    const variantId = uuid(parsed.variantId);
    return this.read(SQL.getPolicy, [...authorityValues(authority), variantId], "found", (value) => {
      const result = parsePolicy(value);
      if (result.variantId !== variantId) return unavailable();
      return result;
    });
  }
  async previewPolicy(input: Parameters<ReferencePricingRepository["previewPolicy"]>[0]) {
    const { parsed, authority } = authorityInput(input, ["variantId", "channel", "policy"]);
    const variantId = uuid(parsed.variantId);
    if (parsed.channel !== "storefront") throw failure("invalid_input");
    const selectedPolicy = policy(parsed.policy);
    return this.read(SQL.previewPolicy, [...authorityValues(authority), variantId, JSON.stringify(selectedPolicy), parsed.channel], "previewed", (value) => {
      const result = parsePolicyPreview(value);
      if (result.variantId !== variantId || result.method !== selectedPolicy.method) return unavailable();
      return result;
    });
  }
  async preview(input: Parameters<ReferencePricingRepository["preview"]>[0]) {
    const { parsed, authority } = authorityInput(input, ["setId", "channel", "pageSize"], ["afterVariantId"]);
    const setId = uuid(parsed.setId);
    if (parsed.channel !== "storefront" && parsed.channel !== "quick_order") throw failure("invalid_input");
    const pageSize = integer(parsed.pageSize, 1, 100);
    const cursor = parsed.afterVariantId === undefined ? null : uuid(parsed.afterVariantId);
    return this.read(SQL.preview, [...authorityValues(authority), setId, parsed.channel, pageSize, cursor], "previewed", (value) => {
      const result = parsePreview(value);
      if (result.setId !== setId || result.entries.length > pageSize) return unavailable();
      return result;
    });
  }
  async define(input: Parameters<ReferencePricingRepository["define"]>[0]) {
    const { parsed, authority } = authorityInput(input, ["operationId", "referenceId", "kind", "label"], ["referencePurity"]);
    const operationId = uuid(parsed.operationId), referenceId = uuid(parsed.referenceId);
    if (parsed.kind !== "usd" && parsed.kind !== "eur" && parsed.kind !== "gold_gram") throw failure("invalid_input");
    if (parsed.kind !== "gold_gram" && Object.hasOwn(parsed, "referencePurity")) throw failure("invalid_input");
    const kind = parsed.kind, selectedLabel = label(parsed.label);
    const referencePurity = parsed.referencePurity === undefined ? null : decimal(parsed.referencePurity, 8, true, 1n);
    const body = { referenceId, kind, label: selectedLabel, referencePurity };
    const hash = fingerprint("define", authority.storeId, body);
    return this.mutate(authority, operationId, "define", "defined", SQL.define,
      [...authorityValues(authority), operationId, hash, referenceId, kind, selectedLabel, referencePurity],
      (value) => {
        const result = identity(value);
        if (result.id !== referenceId || result.kind !== kind || result.label !== selectedLabel
          || (result.referencePurity ?? null) !== referencePurity) return unavailable();
        return result;
      });
  }
  async saveSet(input: Parameters<ReferencePricingRepository["saveSet"]>[0]) {
    const { parsed, authority } = authorityInput(input, ["operationId", "setId", "expectedStateVersion", "values"]);
    const operationId = uuid(parsed.operationId), setId = uuid(parsed.setId);
    const expected = integer(parsed.expectedStateVersion, 0);
    const values = setValues(parsed.values);
    const hash = fingerprint("save_set", authority.storeId, { setId, expected, values });
    return this.mutate(authority, operationId, "save_set", "saved", SQL.saveSet,
      [...authorityValues(authority), operationId, hash, setId, expected, JSON.stringify(values)],
      (value) => {
        const result = parseSavedSet(value);
        if (result.setId !== setId) return unavailable();
        return result;
      });
  }
  async activate(input: Parameters<ReferencePricingRepository["activate"]>[0]) {
    const { parsed, authority } = authorityInput(input, ["operationId", "setId", "expectedStateVersion", "expectedScopeDigest"]);
    const operationId = uuid(parsed.operationId), setId = uuid(parsed.setId);
    const expected = integer(parsed.expectedStateVersion, 0), scope = digest(parsed.expectedScopeDigest);
    const hash = fingerprint("activate", authority.storeId, { setId, expected, scope });
    return this.mutate(authority, operationId, "activate", "activated", SQL.activate,
      [...authorityValues(authority), operationId, hash, setId, expected, scope],
      (value) => {
        const result = parseActivated(value);
        if (result.setId !== setId || result.stateVersion !== expected + 1) return unavailable();
        return result;
      });
  }
  async savePolicy(input: Parameters<ReferencePricingRepository["savePolicy"]>[0]) {
    const { parsed, authority } = authorityInput(input, ["operationId", "variantId", "expectedVariantVersion", "expectedPolicyVersion", "policy", "expectedScopeDigest"]);
    const operationId = uuid(parsed.operationId), variantId = uuid(parsed.variantId);
    const variantVersion = integer(parsed.expectedVariantVersion, 1), expected = integer(parsed.expectedPolicyVersion, 0);
    const selectedPolicy = policy(parsed.policy);
    const scope = digest(parsed.expectedScopeDigest);
    const hash = fingerprint("policy_save", authority.storeId, { variantId, variantVersion, expected, policy: selectedPolicy, scope });
    return this.mutate(authority, operationId, "policy_save", "policy_saved", SQL.savePolicy,
      [...authorityValues(authority), operationId, hash, variantId, variantVersion, expected, JSON.stringify(selectedPolicy), scope],
      (value) => {
        const result = parsePolicy(value);
        if (result.variantId !== variantId || result.version !== expected + 1) return unavailable();
        return result;
      });
  }
}
