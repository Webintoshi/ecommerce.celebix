import {
  parseAbandonedCartDetail,
  parseAbandonedCartListItem,
  parseAbandonedCartMutationResult,
  parseAbandonedCartSummary,
  type AbandonedCartListItem,
  type AbandonedCartMutationResult,
  type AbandonedCartSort,
  type TenantContext,
} from "@celebix/saas-contracts";

import { acquirePostgresClient, type PostgresClientLike } from "../postgres/pool.ts";
import { abandonedCartFingerprint } from "./canonical.ts";
import { decodeAbandonedCartCursor, encodeAbandonedCartCursor, parseDatabaseAbandonedCartCursor } from "./cursor.ts";
import { ABANDONED_CART_ERROR_CODES, AbandonedCartRepositoryError, type AbandonedCartErrorCode } from "./errors.ts";
import type {
  AbandonedCartRepository,
  AbandonedCartAuthorityInput,
  GetAbandonedCartInput,
  ListAbandonedCartsInput,
  ListAbandonedCartsResult,
  MutateAbandonedCartInput,
  PostgresAbandonedCartRepositoryOptions,
} from "./types.ts";
import {
  abandonedCartAuthority,
  abandonedCartPageSize,
  abandonedCartSearch,
  abandonedCartSort,
  abandonedCartStatusFilter,
  abandonedCartUuid,
  abandonedCartVersion,
  exactAbandonedCartInput,
} from "./validation.ts";
import type { ValidatedOrderAuthority } from "../orders/validation.ts";

type QuerySpec = Readonly<{ text: string; values: unknown[] }>;
type MutationParser = (value: unknown, replayed: boolean) => AbandonedCartMutationResult;
const ERROR_CODES = new Set<string>(ABANDONED_CART_ERROR_CODES);

function unavailable(): AbandonedCartRepositoryError { return new AbandonedCartRepositoryError("unavailable"); }

function timeout(value: number): string {
  if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) throw unavailable();
  return `${value}ms`;
}

function payload(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw unavailable();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw unavailable();
  const parsed = value as Record<string, unknown>;
  if (Object.keys(parsed).sort().join(",") !== [...keys].sort().join(",")) throw unavailable();
  return parsed;
}

function single(result: Readonly<{ rows: unknown[]; rowCount?: number | null }>) {
  if (result.rowCount !== 1 || result.rows.length !== 1) throw unavailable();
  const parsed = payload(result.rows[0], ["outcome", "result_payload"]);
  if (typeof parsed.outcome !== "string" || parsed.outcome.length < 1 || parsed.outcome.length > 64) throw unavailable();
  return Object.freeze({ outcome: parsed.outcome, resultPayload: parsed.result_payload });
}

function safeRelease(client: PostgresClientLike, destroy?: boolean): void {
  try { client.release(destroy); } catch { /* cleanup cannot change durable authority */ }
}

function authorityValues(authority: ValidatedOrderAuthority): unknown[] {
  return [authority.storeId, authority.principalId, authority.membershipId, authority.planId, authority.planCode, authority.planVersion, authority.now];
}

function compare(left: AbandonedCartListItem, right: AbandonedCartListItem, sort: AbandonedCartSort): number {
  const cmp = (a: number | string, b: number | string) => a < b ? -1 : a > b ? 1 : 0;
  if (sort === "highest" || sort === "lowest") {
    const total = sort === "highest" ? cmp(right.totalCents, left.totalCents) : cmp(left.totalCents, right.totalCents);
    if (total !== 0) return total;
  }
  const activity = sort === "newest" || sort === "highest" ? cmp(right.lastActivityAt, left.lastActivityAt) : cmp(left.lastActivityAt, right.lastActivityAt);
  if (activity !== 0) return activity;
  return sort === "newest" || sort === "highest" ? cmp(right.id, left.id) : cmp(left.id, right.id);
}

export class PostgresAbandonedCartRepository implements AbandonedCartRepository {
  private readonly options: PostgresAbandonedCartRepositoryOptions;

  constructor(options: PostgresAbandonedCartRepositoryOptions) {
    try {
      if (typeof options !== "object" || options === null || Array.isArray(options)) throw unavailable();
      const prototype = Object.getPrototypeOf(options);
      if (prototype !== Object.prototype && prototype !== null) throw unavailable();
      if (Object.keys(options).sort().join(",") !== "audit,pool,role,timeouts" || options.role !== "celebix_saas_app" || typeof options.audit !== "function") throw unavailable();
      if (typeof options.timeouts !== "object" || options.timeouts === null || Array.isArray(options.timeouts) || Object.keys(options.timeouts).sort().join(",") !== "idleTransactionMs,lockMs,poolCheckoutMs,statementMs") throw unavailable();
      timeout(options.timeouts.poolCheckoutMs); timeout(options.timeouts.statementMs); timeout(options.timeouts.lockMs); timeout(options.timeouts.idleTransactionMs);
      this.options = Object.freeze({ ...options, timeouts: Object.freeze({ ...options.timeouts }) });
    } catch (error) {
      if (error instanceof AbandonedCartRepositoryError) throw error;
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

  private async rollback(client: PostgresClientLike): Promise<void> {
    try { await client.query("ROLLBACK"); safeRelease(client); }
    catch { safeRelease(client, true); }
  }

  private expectedError(outcome: string): AbandonedCartRepositoryError | undefined {
    return ERROR_CODES.has(outcome) && outcome !== "operation_replayed" ? new AbandonedCartRepositoryError(outcome as AbandonedCartErrorCode) : undefined;
  }

  private async read<T>(spec: QuerySpec, expectedOutcome: string, parser: (value: unknown) => T, reconcilesDurableCarts = false): Promise<T> {
    const client = await this.acquire();
    let began = false;
    let terminal = false;
    try {
      await client.query(reconcilesDurableCarts ? "BEGIN ISOLATION LEVEL READ COMMITTED" : "BEGIN READ ONLY"); began = true; await this.configure(client);
      const result = single(await client.query(spec.text, spec.values));
      const expected = this.expectedError(result.outcome); if (expected) throw expected;
      if (result.outcome !== expectedOutcome) throw unavailable();
      const parsed = parser(result.resultPayload);
      try { await client.query("COMMIT"); terminal = true; safeRelease(client); }
      catch { terminal = true; safeRelease(client, true); throw unavailable(); }
      return parsed;
    } catch (error) {
      if (began && !terminal) await this.rollback(client); else if (!began && !terminal) safeRelease(client, true);
      if (error instanceof AbandonedCartRepositoryError) throw error;
      throw unavailable();
    }
  }

  private emitUnknownCommitAudit(): void {
    try { const pending = this.options.audit({ type: "abandoned_cart_commit_unknown" }); if (pending) void pending.catch(() => undefined); }
    catch { /* observational only */ }
  }

  private async recover(authority: ValidatedOrderAuthority, operationId: string, fingerprint: string, parser: MutationParser): Promise<AbandonedCartMutationResult> {
    return this.read({
      text: `SELECT outcome, result_payload FROM saas.abandoned_carts_recover_operation(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text
      )`,
      values: [...authorityValues(authority), operationId, fingerprint],
    }, "operation_replayed", (value) => parser(value, true));
  }

  private async mutate(authority: ValidatedOrderAuthority, operationId: string, fingerprint: string, spec: QuerySpec, parser: MutationParser): Promise<AbandonedCartMutationResult> {
    const client = await this.acquire();
    let began = false;
    let terminal = false;
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED"); began = true; await this.configure(client);
      const result = single(await client.query(spec.text, spec.values));
      const expected = this.expectedError(result.outcome); if (expected) throw expected;
      if (result.outcome !== "committed" && result.outcome !== "operation_replayed") throw unavailable();
      const parsed = parser(result.resultPayload, result.outcome === "operation_replayed");
      try { await client.query("COMMIT"); terminal = true; safeRelease(client); return parsed; }
      catch { terminal = true; safeRelease(client, true); this.emitUnknownCommitAudit(); return await this.recover(authority, operationId, fingerprint, parser); }
    } catch (error) {
      if (began && !terminal) await this.rollback(client); else if (!began && !terminal) safeRelease(client, true);
      if (error instanceof AbandonedCartRepositoryError) throw error;
      throw unavailable();
    }
  }

  async getSummary(input: AbandonedCartAuthorityInput) {
    const exact = exactAbandonedCartInput(input, ["tenantContext", "now"]);
    const authority = abandonedCartAuthority(exact.tenantContext as TenantContext, exact.now as Date);
    return this.read({ text: `SELECT outcome, result_payload FROM saas.abandoned_carts_summary(
      $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz
    )`, values: authorityValues(authority) }, "summarized", (value) => {
      try { return parseAbandonedCartSummary(value); } catch { throw unavailable(); }
    }, true);
  }

  async list(input: ListAbandonedCartsInput): Promise<ListAbandonedCartsResult> {
    const exact = exactAbandonedCartInput(input, ["tenantContext", "now", "pageSize"], ["cursor", "status", "search", "sort"]);
    const authority = abandonedCartAuthority(exact.tenantContext as TenantContext, exact.now as Date);
    const pageSize = abandonedCartPageSize(exact.pageSize);
    const status = abandonedCartStatusFilter(exact.status);
    const search = abandonedCartSearch(exact.search);
    const sort = abandonedCartSort(exact.sort);
    const cursor = decodeAbandonedCartCursor(exact.cursor as string | undefined, authority.storeId, status, search, sort);
    return this.read({ text: `SELECT outcome, result_payload FROM saas.abandoned_carts_list(
      $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,
      $8::text,$9::text,$10::text,$11::bigint,$12::bigint,$13::timestamptz,$14::uuid
    )`, values: [...authorityValues(authority), status ?? null, search ?? null, sort, pageSize, cursor?.totalCents ?? null, cursor?.lastActivityAt ?? null, cursor?.id ?? null] }, "listed", (value) => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) throw unavailable();
      const envelope = value as Record<string, unknown>;
      const keys = Object.keys(envelope).sort().join(",");
      if (keys !== "items" && keys !== "items,nextCursor") throw unavailable();
      if (!Array.isArray(envelope.items) || envelope.items.length > pageSize) throw unavailable();
      let items: readonly AbandonedCartListItem[];
      try { items = Object.freeze(envelope.items.map((entry) => parseAbandonedCartListItem(entry))); } catch { throw unavailable(); }
      for (let index = 1; index < items.length; index += 1) if (compare(items[index - 1]!, items[index]!, sort) >= 0) throw unavailable();
      if (!Object.hasOwn(envelope, "nextCursor")) return Object.freeze({ items });
      if (items.length !== pageSize || items.length === 0) throw unavailable();
      let databaseCursor; try { databaseCursor = parseDatabaseAbandonedCartCursor(envelope.nextCursor, items.at(-1)!); } catch { throw unavailable(); }
      return Object.freeze({ items, nextCursor: encodeAbandonedCartCursor(authority.storeId, status, search, sort, databaseCursor) });
    }, true);
  }

  async get(input: GetAbandonedCartInput) {
    const exact = exactAbandonedCartInput(input, ["tenantContext", "now", "cartId"]);
    const authority = abandonedCartAuthority(exact.tenantContext as TenantContext, exact.now as Date);
    const cartId = abandonedCartUuid(exact.cartId);
    return this.read({ text: `SELECT outcome, result_payload FROM saas.abandoned_carts_get(
      $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid
    )`, values: [...authorityValues(authority), cartId] }, "found", (value) => {
      try { const result = parseAbandonedCartDetail(value); if (result.id !== cartId) throw unavailable(); return result; } catch (error) { if (error instanceof AbandonedCartRepositoryError) throw error; throw unavailable(); }
    }, true);
  }

  private mutation(input: MutateAbandonedCartInput, kind: "mark_recovered" | "archive", functionName: "abandoned_carts_mark_recovered" | "abandoned_carts_archive", expectedStatus: "recovered" | "archived") {
    const exact = exactAbandonedCartInput(input, ["tenantContext", "now", "cartId", "operationId", "expectedVersion"]);
    const authority = abandonedCartAuthority(exact.tenantContext as TenantContext, exact.now as Date);
    const cartId = abandonedCartUuid(exact.cartId);
    const operationId = abandonedCartUuid(exact.operationId);
    const expectedVersion = abandonedCartVersion(exact.expectedVersion);
    const fingerprint = abandonedCartFingerprint(kind, authority.storeId, { cartId, expectedVersion });
    const parser: MutationParser = (value, replayed) => {
      try {
        const result = parseAbandonedCartMutationResult({ ...payload(value, ["id", "status", "version", "updatedAt"]), replayed });
        if (result.id !== cartId || result.status !== expectedStatus || result.version !== expectedVersion + 1) throw unavailable();
        return result;
      } catch (error) { if (error instanceof AbandonedCartRepositoryError) throw error; throw unavailable(); }
    };
    return this.mutate(authority, operationId, fingerprint, { text: `SELECT outcome, result_payload FROM saas.${functionName}(
      $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,
      $8::uuid,$9::text,$10::uuid,$11::bigint
    )`, values: [...authorityValues(authority), operationId, fingerprint, cartId, expectedVersion] }, parser);
  }

  async markRecovered(input: MutateAbandonedCartInput) { return this.mutation(input, "mark_recovered", "abandoned_carts_mark_recovered", "recovered"); }
  async archive(input: MutateAbandonedCartInput) { return this.mutation(input, "archive", "abandoned_carts_archive", "archived"); }
}
