import {
  ORDER_PAYMENT_STATUSES,
  ORDER_STATUSES,
  parseOrderDashboardSummary,
  parseOrderDetail,
  parseOrderDraftConversionResult,
  parseOrderDraftDetail,
  parseOrderDraftListItem,
  parseOrderListItem,
  parseOrderNeighbors,
  type OrderDashboardSummary,
  type OrderDetail,
  type OrderDraftConversionResult,
  type OrderDraftDetail,
  type OrderDraftListItem,
  type OrderListItem,
  type OrderNeighbors,
  type OrderPaymentStatus,
  type OrderSort,
  type OrderStatus,
  type TenantContext,
} from "@celebix/saas-contracts";

import { acquirePostgresClient, type PostgresClientLike } from "../postgres/pool.ts";
import {
  canonicalOrderJson,
  decodeDraftCursor,
  encodeDraftCursor,
  orderFingerprint,
  parseDatabaseDraftCursor,
} from "./canonical.ts";
import { decodeOrderCursor, encodeOrderCursor, parseDatabaseCursor } from "./cursor.ts";
import { ORDER_ERROR_CODES, OrderRepositoryError, type OrderErrorCode } from "./errors.ts";
import type {
  AddOrderNoteInput,
  ArchiveOrderNoteInput,
  CreateOrderDraftInput,
  GetOrderDraftInput,
  GetOrderInput,
  ListOrdersInput,
  ListOrdersResult,
  ListOrderDraftsInput,
  ListOrderDraftsResult,
  OrderAuthorityInput,
  OrderMutationResult,
  OrderRepository,
  OrderDraftOperationInput,
  PostgresOrderRepositoryOptions,
  TransitionOrderPaymentInput,
  TransitionOrderStatusInput,
  UpdateOrderDraftInput,
  UpdateOrderShippingInput,
} from "./types.ts";
import {
  exactOrderInput,
  orderAuthority,
  orderDraftSaveIntent,
  orderNoteBody,
  orderPageSize,
  orderPaymentStatus,
  orderSearch,
  orderSort,
  orderShipping,
  orderStatus,
  orderStatusFilter,
  orderUuid,
  positiveOrderVersion,
  type ValidatedOrderAuthority,
} from "./validation.ts";

type QuerySpec = Readonly<{ text: string; values: unknown[] }>;
type MutationParser<T> = (value: unknown, replayed: boolean) => T;
type RecoveryFunction = "orders_recover_operation" | "order_drafts_recover_operation";
const ERROR_CODES = new Set<string>(ORDER_ERROR_CODES);
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function unavailable(): OrderRepositoryError {
  return new OrderRepositoryError("unavailable");
}

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

function single(result: Readonly<{ rows: unknown[]; rowCount?: number | null }>): Readonly<{
  outcome: string;
  resultPayload: unknown;
}> {
  if (result.rowCount !== 1 || result.rows.length !== 1) throw unavailable();
  const parsed = payload(result.rows[0], ["outcome", "result_payload"]);
  if (typeof parsed.outcome !== "string" || parsed.outcome.length < 1 || parsed.outcome.length > 64) throw unavailable();
  return Object.freeze({ outcome: parsed.outcome, resultPayload: parsed.result_payload });
}

function safeInteger(value: unknown, minimum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) throw unavailable();
  return value as number;
}

function safeTimestamp(value: unknown): string {
  if (typeof value !== "string" || !ISO_UTC.test(value)) throw unavailable();
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw unavailable();
  return value;
}

function safeUuid(value: unknown): string {
  try { return orderUuid(value); }
  catch { throw unavailable(); }
}

function safeStatus(value: unknown): OrderStatus {
  if (typeof value !== "string" || !ORDER_STATUSES.includes(value as OrderStatus)) throw unavailable();
  return value as OrderStatus;
}

function safePaymentStatus(value: unknown): OrderPaymentStatus {
  if (typeof value !== "string" || !ORDER_PAYMENT_STATUSES.includes(value as OrderPaymentStatus)) throw unavailable();
  return value as OrderPaymentStatus;
}

function mutationResult(value: unknown, replayed: boolean): OrderMutationResult {
  const parsed = payload(value, ["id", "status", "paymentStatus", "version", "updatedAt"]);
  return Object.freeze({
    id: safeUuid(parsed.id),
    status: safeStatus(parsed.status),
    paymentStatus: safePaymentStatus(parsed.paymentStatus),
    version: safeInteger(parsed.version, 1),
    updatedAt: safeTimestamp(parsed.updatedAt),
    replayed,
  });
}

function safeSummary(value: unknown): OrderDashboardSummary {
  try { return parseOrderDashboardSummary(value); }
  catch { throw unavailable(); }
}

function safeListItem(value: unknown): OrderListItem {
  try { return parseOrderListItem(value); }
  catch { throw unavailable(); }
}

function safeDetail(value: unknown): OrderDetail {
  try { return parseOrderDetail(value); }
  catch { throw unavailable(); }
}

function safeNeighbors(value: unknown): OrderNeighbors {
  try { return parseOrderNeighbors(value); }
  catch { throw unavailable(); }
}

function safeDraftListItem(value: unknown): OrderDraftListItem {
  try { return parseOrderDraftListItem(value); }
  catch { throw unavailable(); }
}

function safeDraftDetail(value: unknown): OrderDraftDetail {
  try { return parseOrderDraftDetail(value); }
  catch { throw unavailable(); }
}

function compareOrderListItems(left: OrderListItem, right: OrderListItem, sort: OrderSort): number {
  const compare = (leftValue: number | string, rightValue: number | string) =>
    leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
  if (sort === "highest" || sort === "lowest") {
    const total = sort === "highest"
      ? compare(right.totalCents, left.totalCents)
      : compare(left.totalCents, right.totalCents);
    if (total !== 0) return total;
  }
  const createdAt = sort === "newest" || sort === "highest"
    ? compare(right.createdAt, left.createdAt)
    : compare(left.createdAt, right.createdAt);
  if (createdAt !== 0) return createdAt;
  return sort === "newest" || sort === "highest"
    ? compare(right.id, left.id)
    : compare(left.id, right.id);
}

function compareDraftListItems(left: OrderDraftListItem, right: OrderDraftListItem): number {
  if (left.updatedAt !== right.updatedAt) return left.updatedAt > right.updatedAt ? -1 : 1;
  if (left.id === right.id) return 0;
  return left.id > right.id ? -1 : 1;
}

function authorityValues(authority: ValidatedOrderAuthority): unknown[] {
  return [
    authority.storeId,
    authority.principalId,
    authority.membershipId,
    authority.planId,
    authority.planCode,
    authority.planVersion,
    authority.now,
  ];
}

function safeRelease(client: PostgresClientLike, destroy?: boolean): void {
  try { client.release(destroy); }
  catch { /* Pool cleanup cannot change the already-known durable outcome. */ }
}

export class PostgresOrderRepository implements OrderRepository {
  private readonly options: PostgresOrderRepositoryOptions;

  constructor(options: PostgresOrderRepositoryOptions) {
    try {
      if (typeof options !== "object" || options === null || Array.isArray(options)) throw unavailable();
      const prototype = Object.getPrototypeOf(options);
      if (prototype !== Object.prototype && prototype !== null) throw unavailable();
      if (Object.keys(options).sort().join(",") !== "audit,generateId,pool,role,timeouts") throw unavailable();
      const role = options.role;
      const pool = options.pool;
      const generateId = options.generateId;
      const audit = options.audit;
      const selectedTimeouts = options.timeouts;
      if (
        role !== "celebix_saas_app" ||
        typeof generateId !== "function" ||
        typeof audit !== "function" ||
        typeof selectedTimeouts !== "object" || selectedTimeouts === null || Array.isArray(selectedTimeouts)
      ) throw unavailable();
      const timeoutPrototype = Object.getPrototypeOf(selectedTimeouts);
      if (timeoutPrototype !== Object.prototype && timeoutPrototype !== null) throw unavailable();
      if (
        Object.keys(selectedTimeouts).sort().join(",") !==
        "idleTransactionMs,lockMs,poolCheckoutMs,statementMs"
      ) throw unavailable();
      const timeouts = Object.freeze({
        poolCheckoutMs: selectedTimeouts.poolCheckoutMs,
        statementMs: selectedTimeouts.statementMs,
        lockMs: selectedTimeouts.lockMs,
        idleTransactionMs: selectedTimeouts.idleTransactionMs,
      });
      timeout(timeouts.poolCheckoutMs);
      timeout(timeouts.statementMs);
      timeout(timeouts.lockMs);
      timeout(timeouts.idleTransactionMs);
      this.options = Object.freeze({ pool, role, timeouts, generateId, audit });
    } catch (error) {
      if (error instanceof OrderRepositoryError) throw error;
      throw unavailable();
    }
  }

  private async configure(client: PostgresClientLike): Promise<void> {
    await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [timeout(this.options.timeouts.statementMs)]);
    await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [timeout(this.options.timeouts.lockMs)]);
    await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [timeout(this.options.timeouts.idleTransactionMs)]);
    await client.query("SET LOCAL ROLE celebix_saas_app");
  }

  private async rollback(client: PostgresClientLike): Promise<void> {
    try {
      await client.query("ROLLBACK");
      safeRelease(client);
    } catch {
      safeRelease(client, true);
    }
  }

  private emitUnknownCommitAudit(): void {
    try {
      const pending = this.options.audit({ type: "order_commit_unknown" });
      if (pending) void pending.catch(() => undefined);
    } catch { /* Audit is observational and cannot change transaction authority. */ }
  }

  private expectedError(outcome: string): OrderRepositoryError | undefined {
    return ERROR_CODES.has(outcome) && outcome !== "operation_replayed"
      ? new OrderRepositoryError(outcome as OrderErrorCode)
      : undefined;
  }

  private async acquire(): Promise<PostgresClientLike> {
    try {
      return await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs);
    } catch {
      throw unavailable();
    }
  }

  private async read<T>(
    authority: ValidatedOrderAuthority,
    spec: QuerySpec,
    expectedOutcome: string,
    parser: (value: unknown) => T,
  ): Promise<T> {
    const client = await this.acquire();
    let began = false;
    let terminal = false;
    try {
      await client.query("BEGIN READ ONLY");
      began = true;
      await this.configure(client);
      const result = single(await client.query(spec.text, spec.values));
      const expected = this.expectedError(result.outcome);
      if (expected) throw expected;
      if (result.outcome !== expectedOutcome) throw unavailable();
      const parsed = parser(result.resultPayload);
      try {
        await client.query("COMMIT");
        terminal = true;
        safeRelease(client);
      } catch {
        terminal = true;
        safeRelease(client, true);
        throw unavailable();
      }
      return parsed;
    } catch (error) {
      if (began && !terminal) await this.rollback(client);
      else if (!began && !terminal) safeRelease(client, true);
      if (error instanceof OrderRepositoryError) throw error;
      throw unavailable();
    }
  }

  private async recover<T>(
    authority: ValidatedOrderAuthority,
    operationId: string,
    fingerprint: string,
    parser: MutationParser<T>,
    recoveryFunction: RecoveryFunction,
  ): Promise<T> {
    const client = await this.acquire();
    let began = false;
    let terminal = false;
    try {
      await client.query("BEGIN READ ONLY");
      began = true;
      await this.configure(client);
      const recovered = single(await client.query(
        `SELECT outcome, result_payload FROM saas.${recoveryFunction}(
          $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text
        )`,
        [...authorityValues(authority), operationId, fingerprint],
      ));
      const expected = this.expectedError(recovered.outcome);
      if (expected) throw expected;
      if (recovered.outcome !== "operation_replayed") throw unavailable();
      const parsed = parser(recovered.resultPayload, true);
      try {
        await client.query("COMMIT");
        terminal = true;
        safeRelease(client);
      } catch {
        terminal = true;
        safeRelease(client, true);
        throw unavailable();
      }
      return parsed;
    } catch (error) {
      if (began && !terminal) await this.rollback(client);
      else if (!began && !terminal) safeRelease(client, true);
      if (error instanceof OrderRepositoryError) throw error;
      throw unavailable();
    }
  }

  private async mutate<T>(
    authority: ValidatedOrderAuthority,
    operationId: string,
    fingerprint: string,
    spec: QuerySpec,
    parser: MutationParser<T>,
    committedOutcome = "committed",
    recoveryFunction: RecoveryFunction = "orders_recover_operation",
  ): Promise<T> {
    const client = await this.acquire();
    let began = false;
    let terminal = false;
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      began = true;
      await this.configure(client);
      const mutation = single(await client.query(spec.text, spec.values));
      const expected = this.expectedError(mutation.outcome);
      if (expected) throw expected;
      if (mutation.outcome !== committedOutcome && mutation.outcome !== "operation_replayed") throw unavailable();
      const parsed = parser(mutation.resultPayload, mutation.outcome === "operation_replayed");
      try {
        await client.query("COMMIT");
        terminal = true;
        safeRelease(client);
        return parsed;
      } catch {
        terminal = true;
        safeRelease(client, true);
        this.emitUnknownCommitAudit();
        return await this.recover(authority, operationId, fingerprint, parser, recoveryFunction);
      }
    } catch (error) {
      if (began && !terminal) await this.rollback(client);
      else if (!began && !terminal) safeRelease(client, true);
      if (error instanceof OrderRepositoryError) throw error;
      throw unavailable();
    }
  }

  async getDashboardSummary(input: OrderAuthorityInput): Promise<OrderDashboardSummary> {
    const exact = exactOrderInput(input, ["tenantContext", "now"]);
    const authority = orderAuthority(exact.tenantContext as TenantContext, exact.now as Date);
    return this.read(authority, {
      text: `SELECT outcome, result_payload FROM saas.orders_get_dashboard_summary(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz
      )`,
      values: authorityValues(authority),
    }, "summarized", safeSummary);
  }

  async listOrders(input: ListOrdersInput): Promise<ListOrdersResult> {
    const exact = exactOrderInput(input, ["tenantContext", "now", "pageSize"], ["cursor", "status", "search", "sort"]);
    const authority = orderAuthority(exact.tenantContext as TenantContext, exact.now as Date);
    const pageSize = orderPageSize(exact.pageSize);
    const status = orderStatusFilter(exact.status);
    const search = orderSearch(exact.search);
    const sort = orderSort(exact.sort);
    const cursor = decodeOrderCursor(exact.cursor as string | undefined, authority.storeId, status, search, sort);
    return this.read(authority, {
      text: `SELECT outcome, result_payload FROM saas.orders_list(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,
        $8::text,$9::text,$10::text,$11::bigint,$12::bigint,$13::timestamptz,$14::uuid
      )`,
      values: [
        ...authorityValues(authority), status ?? null, search ?? null, sort, pageSize,
        cursor?.totalCents ?? null, cursor?.createdAt ?? null, cursor?.id ?? null,
      ],
    }, "listed", (value) => {
      const envelope = (() => {
        if (typeof value !== "object" || value === null || Array.isArray(value)) throw unavailable();
        const keys = Object.keys(value).sort().join(",");
        if (keys !== "items" && keys !== "items,nextCursor") throw unavailable();
        return value as Record<string, unknown>;
      })();
      if (!Array.isArray(envelope.items) || envelope.items.length > pageSize) throw unavailable();
      const items = Object.freeze(envelope.items.map(safeListItem));
      for (let index = 1; index < items.length; index += 1) {
        const previous = items[index - 1]!;
        const current = items[index]!;
        if (compareOrderListItems(previous, current, sort) >= 0) throw unavailable();
      }
      if (!Object.hasOwn(envelope, "nextCursor")) return Object.freeze({ items });
      if (items.length !== pageSize || items.length === 0) throw unavailable();
      let databaseCursor;
      try { databaseCursor = parseDatabaseCursor(envelope.nextCursor, items.at(-1)!); }
      catch { throw unavailable(); }
      return Object.freeze({ items, nextCursor: encodeOrderCursor(authority.storeId, status, search, sort, databaseCursor) });
    });
  }

  async getOrder(input: GetOrderInput): Promise<OrderDetail> {
    const exact = exactOrderInput(input, ["tenantContext", "now", "orderId"]);
    const authority = orderAuthority(exact.tenantContext as TenantContext, exact.now as Date);
    const orderId = orderUuid(exact.orderId);
    return this.read(authority, {
      text: `SELECT outcome, result_payload FROM saas.orders_get(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid
      )`,
      values: [...authorityValues(authority), orderId],
    }, "found", (value) => {
      const result = safeDetail(value);
      if (result.id !== orderId) throw unavailable();
      return result;
    });
  }

  async getOrderNeighbors(input: GetOrderInput): Promise<OrderNeighbors> {
    const exact = exactOrderInput(input, ["tenantContext", "now", "orderId"]);
    const authority = orderAuthority(exact.tenantContext as TenantContext, exact.now as Date);
    const orderId = orderUuid(exact.orderId);
    return this.read(authority, {
      text: `SELECT outcome, result_payload FROM saas.orders_get_neighbors(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid
      )`,
      values: [...authorityValues(authority), orderId],
    }, "found", (value) => {
      const result = safeNeighbors(value);
      if (result.previous?.id === orderId || result.next?.id === orderId) throw unavailable();
      return result;
    });
  }

  async transitionStatus(input: TransitionOrderStatusInput): Promise<OrderMutationResult> {
    const exact = exactOrderInput(input, ["tenantContext", "now", "operationId", "orderId", "expectedVersion", "nextStatus"]);
    const authority = orderAuthority(exact.tenantContext as TenantContext, exact.now as Date);
    const operationId = orderUuid(exact.operationId);
    const orderId = orderUuid(exact.orderId);
    const expectedVersion = positiveOrderVersion(exact.expectedVersion);
    const nextStatus = orderStatus(exact.nextStatus);
    const fingerprint = orderFingerprint("transition_status", authority.storeId, { orderId, expectedVersion, nextStatus });
    const parser: MutationParser<OrderMutationResult> = (value, replayed) => {
      const result = mutationResult(value, replayed);
      if (result.id !== orderId || result.version !== expectedVersion + 1 || result.status !== nextStatus) throw unavailable();
      return result;
    };
    return this.mutate(authority, operationId, fingerprint, {
      text: `SELECT outcome, result_payload FROM saas.orders_transition_status(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,
        $8::uuid,$9::text,$10::uuid,$11::bigint,$12::text
      )`,
      values: [...authorityValues(authority), operationId, fingerprint, orderId, expectedVersion, nextStatus],
    }, parser);
  }

  async transitionPayment(input: TransitionOrderPaymentInput): Promise<OrderMutationResult> {
    const exact = exactOrderInput(input, ["tenantContext", "now", "operationId", "orderId", "expectedVersion", "nextPaymentStatus"]);
    const authority = orderAuthority(exact.tenantContext as TenantContext, exact.now as Date);
    const operationId = orderUuid(exact.operationId);
    const orderId = orderUuid(exact.orderId);
    const expectedVersion = positiveOrderVersion(exact.expectedVersion);
    const nextPaymentStatus = orderPaymentStatus(exact.nextPaymentStatus);
    const fingerprint = orderFingerprint("transition_payment", authority.storeId, { orderId, expectedVersion, nextPaymentStatus });
    const parser: MutationParser<OrderMutationResult> = (value, replayed) => {
      const result = mutationResult(value, replayed);
      if (result.id !== orderId || result.version !== expectedVersion + 1 || result.paymentStatus !== nextPaymentStatus) throw unavailable();
      return result;
    };
    return this.mutate(authority, operationId, fingerprint, {
      text: `SELECT outcome, result_payload FROM saas.orders_transition_payment(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,
        $8::uuid,$9::text,$10::uuid,$11::bigint,$12::text
      )`,
      values: [...authorityValues(authority), operationId, fingerprint, orderId, expectedVersion, nextPaymentStatus],
    }, parser);
  }

  async updateShipping(input: UpdateOrderShippingInput): Promise<OrderMutationResult> {
    const exact = exactOrderInput(input, ["tenantContext", "now", "operationId", "orderId", "expectedVersion", "shippingAddress"], ["tracking"]);
    const authority = orderAuthority(exact.tenantContext as TenantContext, exact.now as Date);
    const operationId = orderUuid(exact.operationId);
    const orderId = orderUuid(exact.orderId);
    const expectedVersion = positiveOrderVersion(exact.expectedVersion);
    const shipping = orderShipping(exact.shippingAddress, exact.tracking);
    const fingerprint = orderFingerprint("update_shipping", authority.storeId, { orderId, expectedVersion, ...shipping });
    const parser: MutationParser<OrderMutationResult> = (value, replayed) => {
      const result = mutationResult(value, replayed);
      if (result.id !== orderId || result.version !== expectedVersion + 1) throw unavailable();
      return result;
    };
    return this.mutate(authority, operationId, fingerprint, {
      text: `SELECT outcome, result_payload FROM saas.orders_update_shipping(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,
        $8::uuid,$9::text,$10::uuid,$11::bigint,$12::jsonb,$13::jsonb
      )`,
      values: [
        ...authorityValues(authority), operationId, fingerprint, orderId, expectedVersion,
        JSON.stringify(shipping.shippingAddress), shipping.tracking === undefined ? null : JSON.stringify(shipping.tracking),
      ],
    }, parser);
  }

  async addNote(input: AddOrderNoteInput): Promise<OrderMutationResult> {
    const exact = exactOrderInput(input, ["tenantContext", "now", "operationId", "orderId", "body"]);
    const authority = orderAuthority(exact.tenantContext as TenantContext, exact.now as Date);
    const operationId = orderUuid(exact.operationId);
    const orderId = orderUuid(exact.orderId);
    const body = orderNoteBody(exact.body);
    let noteId: string;
    try { noteId = orderUuid(this.options.generateId("note")); }
    catch { throw unavailable(); }
    const fingerprint = orderFingerprint("add_note", authority.storeId, { orderId, body });
    const parser: MutationParser<OrderMutationResult> = (value, replayed) => {
      const result = mutationResult(value, replayed);
      if (result.id !== orderId) throw unavailable();
      return result;
    };
    return this.mutate(authority, operationId, fingerprint, {
      text: `SELECT outcome, result_payload FROM saas.orders_add_note(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,
        $8::uuid,$9::text,$10::uuid,$11::uuid,$12::text
      )`,
      values: [...authorityValues(authority), operationId, fingerprint, noteId, orderId, body],
    }, parser);
  }

  async archiveNote(input: ArchiveOrderNoteInput): Promise<OrderMutationResult> {
    const exact = exactOrderInput(input, ["tenantContext", "now", "operationId", "orderId", "noteId"]);
    const authority = orderAuthority(exact.tenantContext as TenantContext, exact.now as Date);
    const operationId = orderUuid(exact.operationId);
    const orderId = orderUuid(exact.orderId);
    const noteId = orderUuid(exact.noteId);
    const fingerprint = orderFingerprint("archive_note", authority.storeId, { orderId, noteId });
    const parser: MutationParser<OrderMutationResult> = (value, replayed) => {
      const result = mutationResult(value, replayed);
      if (result.id !== orderId) throw unavailable();
      return result;
    };
    return this.mutate(authority, operationId, fingerprint, {
      text: `SELECT outcome, result_payload FROM saas.orders_archive_note(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,
        $8::uuid,$9::text,$10::uuid,$11::uuid
      )`,
      values: [...authorityValues(authority), operationId, fingerprint, orderId, noteId],
    }, parser);
  }

  async listDrafts(input: ListOrderDraftsInput): Promise<ListOrderDraftsResult> {
    const exact = exactOrderInput(input, ["tenantContext", "now", "pageSize"], ["cursor"]);
    const authority = orderAuthority(exact.tenantContext as TenantContext, exact.now as Date);
    const pageSize = orderPageSize(exact.pageSize);
    const cursor = decodeDraftCursor(exact.cursor as string | undefined, authority.storeId);
    return this.read(authority, {
      text: "SELECT outcome, result_payload FROM saas.order_drafts_list($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::integer,$9::timestamptz,$10::uuid)",
      values: [...authorityValues(authority), pageSize, cursor?.updatedAt ?? null, cursor?.id ?? null],
    }, "listed", (value) => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) throw unavailable();
      const envelope = value as Record<string, unknown>;
      const keys = Object.keys(envelope).sort().join(",");
      if (keys !== "items" && keys !== "items,nextCursor") throw unavailable();
      if (!Array.isArray(envelope.items) || envelope.items.length > pageSize) throw unavailable();
      const items = Object.freeze(envelope.items.map(safeDraftListItem));
      for (let index = 1; index < items.length; index += 1) {
        if (compareDraftListItems(items[index - 1]!, items[index]!) >= 0) throw unavailable();
      }
      if (!Object.hasOwn(envelope, "nextCursor")) return Object.freeze({ items });
      if (items.length !== pageSize || items.length === 0) throw unavailable();
      let databaseCursor;
      try { databaseCursor = parseDatabaseDraftCursor(envelope.nextCursor, items.at(-1)!); }
      catch { throw unavailable(); }
      return Object.freeze({ items, nextCursor: encodeDraftCursor(authority.storeId, databaseCursor) });
    });
  }

  async getDraft(input: GetOrderDraftInput): Promise<OrderDraftDetail> {
    const exact = exactOrderInput(input, ["tenantContext", "now", "draftId"]);
    const authority = orderAuthority(exact.tenantContext as TenantContext, exact.now as Date);
    const draftId = orderUuid(exact.draftId);
    return this.read(authority, {
      text: "SELECT outcome, result_payload FROM saas.order_drafts_get($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid)",
      values: [...authorityValues(authority), draftId],
    }, "found", (value) => {
      const result = safeDraftDetail(value);
      if (result.id !== draftId) throw unavailable();
      return result;
    });
  }

  async createDraft(input: CreateOrderDraftInput): Promise<OrderDraftDetail> {
    const exact = exactOrderInput(input, ["tenantContext", "now", "operationId", "intent"]);
    const authority = orderAuthority(exact.tenantContext as TenantContext, exact.now as Date);
    const operationId = orderUuid(exact.operationId);
    const intent = orderDraftSaveIntent(exact.intent);
    let draftId: string;
    try { draftId = orderUuid(this.options.generateId("draft")); }
    catch { throw unavailable(); }
    const fingerprint = orderFingerprint("draft_create", authority.storeId, intent);
    const parser: MutationParser<OrderDraftDetail> = (value, replayed) => {
      const result = safeDraftDetail(value);
      if (result.status !== "draft" || result.version !== 1 || (!replayed && result.id !== draftId)) throw unavailable();
      return result;
    };
    return this.mutate(authority, operationId, fingerprint, {
      text: "SELECT outcome, result_payload FROM saas.order_drafts_create($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::jsonb)",
      values: [...authorityValues(authority), operationId, fingerprint, draftId, canonicalOrderJson(intent)],
    }, parser, "created", "order_drafts_recover_operation");
  }

  async updateDraft(input: UpdateOrderDraftInput): Promise<OrderDraftDetail> {
    const exact = exactOrderInput(input, ["tenantContext", "now", "operationId", "draftId", "expectedVersion", "intent"]);
    const authority = orderAuthority(exact.tenantContext as TenantContext, exact.now as Date);
    const operationId = orderUuid(exact.operationId);
    const draftId = orderUuid(exact.draftId);
    const expectedVersion = positiveOrderVersion(exact.expectedVersion);
    const intent = orderDraftSaveIntent(exact.intent, expectedVersion);
    const fingerprint = orderFingerprint("draft_update", authority.storeId, { draftId, expectedVersion, intent });
    const parser: MutationParser<OrderDraftDetail> = (value) => {
      const result = safeDraftDetail(value);
      if (result.id !== draftId || result.status !== "draft" || result.version !== expectedVersion + 1) throw unavailable();
      return result;
    };
    return this.mutate(authority, operationId, fingerprint, {
      text: "SELECT outcome, result_payload FROM saas.order_drafts_update($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint,$12::jsonb)",
      values: [...authorityValues(authority), operationId, fingerprint, draftId, expectedVersion, canonicalOrderJson(intent)],
    }, parser, "updated", "order_drafts_recover_operation");
  }

  async archiveDraft(input: OrderDraftOperationInput): Promise<OrderDraftDetail> {
    const exact = exactOrderInput(input, ["tenantContext", "now", "operationId", "draftId", "expectedVersion"]);
    const authority = orderAuthority(exact.tenantContext as TenantContext, exact.now as Date);
    const operationId = orderUuid(exact.operationId);
    const draftId = orderUuid(exact.draftId);
    const expectedVersion = positiveOrderVersion(exact.expectedVersion);
    const fingerprint = orderFingerprint("draft_archive", authority.storeId, { draftId, expectedVersion });
    const parser: MutationParser<OrderDraftDetail> = (value) => {
      const result = safeDraftDetail(value);
      if (result.id !== draftId || result.status !== "archived" || result.version !== expectedVersion + 1) throw unavailable();
      return result;
    };
    return this.mutate(authority, operationId, fingerprint, {
      text: "SELECT outcome, result_payload FROM saas.order_drafts_archive($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint)",
      values: [...authorityValues(authority), operationId, fingerprint, draftId, expectedVersion],
    }, parser, "archived", "order_drafts_recover_operation");
  }

  async convertDraft(input: OrderDraftOperationInput): Promise<OrderDraftConversionResult> {
    const exact = exactOrderInput(input, ["tenantContext", "now", "operationId", "draftId", "expectedVersion"]);
    const authority = orderAuthority(exact.tenantContext as TenantContext, exact.now as Date);
    const operationId = orderUuid(exact.operationId);
    const draftId = orderUuid(exact.draftId);
    const expectedVersion = positiveOrderVersion(exact.expectedVersion);
    const fingerprint = orderFingerprint("draft_convert", authority.storeId, { draftId, expectedVersion });
    const parser: MutationParser<OrderDraftConversionResult> = (value, replayed) => {
      let parsed: OrderDraftConversionResult;
      try { parsed = parseOrderDraftConversionResult(value); }
      catch { throw unavailable(); }
      if (parsed.draftId !== draftId || parsed.draftVersion !== expectedVersion + 1) throw unavailable();
      return Object.freeze({ ...parsed, replayed });
    };
    return this.mutate(authority, operationId, fingerprint, {
      text: "SELECT outcome, result_payload FROM saas.order_drafts_convert($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint)",
      values: [...authorityValues(authority), operationId, fingerprint, draftId, expectedVersion],
    }, parser, "converted", "order_drafts_recover_operation");
  }
}
