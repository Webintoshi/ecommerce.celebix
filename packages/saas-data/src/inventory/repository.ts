import {
  parseInventoryBalance,
  parseInventoryCount,
  parseInventoryLocation,
  parseInventoryMutationResult,
  parseInventoryTransfer,
  parsePurchaseOrder,
  type InventoryBalance,
  type InventoryCount,
  type InventoryLocation,
  type InventoryMutationResult,
  type InventoryTransfer,
  type PurchaseOrder,
  type TenantContext,
} from "@celebix/saas-contracts";

import { acquirePostgresClient, type PostgresClientLike } from "../postgres/pool.ts";
import type { ValidatedOrderAuthority } from "../orders/validation.ts";
import { canonicalInventoryLines, inventoryFingerprint } from "./canonical.ts";
import {
  INVENTORY_ERROR_CODES,
  inventoryFailure,
  inventoryRepositoryErrorCode,
  type InventoryErrorCode,
} from "./errors.ts";
import type {
  CancelInventoryCountInput,
  CancelInventoryTransferInput,
  CommitInventoryCountInput,
  DispatchInventoryTransferInput,
  GetInventoryCountInput,
  GetInventoryTransferInput,
  GetPurchaseOrderInput,
  InventoryAuthorityInput,
  InventoryRepository,
  ListInventoryBalancesInput,
  ListInventoryCountsInput,
  ListInventoryTransfersInput,
  ListPurchaseOrdersInput,
  PostgresInventoryRepositoryOptions,
  ReceiveInventoryTransferInput,
  ReceivePurchaseOrderInput,
  SaveInventoryCountInput,
  SaveInventoryTransferInput,
  SavePurchaseOrderInput,
  StartInventoryCountInput,
  TransitionPurchaseOrderInput,
} from "./types.ts";
import {
  countSaveLines,
  exactInventoryInput,
  inventoryAuthority,
  inventoryText,
  inventoryUuid,
  inventoryVersion,
  purchaseReceiptLines,
  purchaseSaveLines,
  transferSaveLines,
} from "./validation.ts";

const SQL = Object.freeze({
  listLocations: "SELECT outcome,result_payload FROM saas.inventory_list_locations($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz)",
  listBalances: "SELECT outcome,result_payload FROM saas.inventory_list_balances($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid)",
  listPurchaseOrders: "SELECT outcome,result_payload FROM saas.purchasing_list($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz)",
  getPurchaseOrder: "SELECT outcome,result_payload FROM saas.purchasing_get($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid)",
  savePurchaseOrder: "SELECT outcome,result_payload FROM saas.purchasing_save($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint,$12::uuid,$13::text,$14::jsonb)",
  transitionPurchaseOrder: "SELECT outcome,result_payload FROM saas.purchasing_transition($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint,$12::text)",
  receivePurchaseOrder: "SELECT outcome,result_payload FROM saas.purchasing_receive($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint,$12::uuid,$13::jsonb)",
  listCounts: "SELECT outcome,result_payload FROM saas.inventory_counts_list($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz)",
  getCount: "SELECT outcome,result_payload FROM saas.inventory_counts_get($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid)",
  saveCount: "SELECT outcome,result_payload FROM saas.inventory_counts_save($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint,$12::uuid,$13::jsonb)",
  startCount: "SELECT outcome,result_payload FROM saas.inventory_counts_start($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint)",
  commitCount: "SELECT outcome,result_payload FROM saas.inventory_counts_commit($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint)",
  cancelCount: "SELECT outcome,result_payload FROM saas.inventory_counts_cancel($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint)",
  listTransfers: "SELECT outcome,result_payload FROM saas.inventory_transfers_list($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz)",
  getTransfer: "SELECT outcome,result_payload FROM saas.inventory_transfers_get($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid)",
  saveTransfer: "SELECT outcome,result_payload FROM saas.inventory_transfers_save($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint,$12::uuid,$13::uuid,$14::jsonb)",
  dispatchTransfer: "SELECT outcome,result_payload FROM saas.inventory_transfers_dispatch($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint)",
  receiveTransfer: "SELECT outcome,result_payload FROM saas.inventory_transfers_receive($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint)",
  cancelTransfer: "SELECT outcome,result_payload FROM saas.inventory_transfers_cancel($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint)",
  recover: "SELECT outcome,result_payload FROM saas.inventory_recover_operation($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text)",
});

type Spec = Readonly<{ text: string; values: unknown[] }>;
type MutationParser = (value: unknown, replayed: boolean) => InventoryMutationResult;
const ERRORS = new Set<string>(INVENTORY_ERROR_CODES);

function unavailable(): Error { return inventoryFailure("unavailable"); }
function timeout(value: number): string {
  if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) throw unavailable();
  return `${value}ms`;
}
function release(client: PostgresClientLike, destroy = false): void {
  try { client.release(destroy || undefined); } catch { /* Cleanup cannot change the durable outcome. */ }
}
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw unavailable();
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw unavailable();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const ownKeys = Reflect.ownKeys(descriptors);
    if (
      ownKeys.length !== keys.length ||
      ownKeys.some((key) => typeof key !== "string" || !keys.includes(key))
    ) throw unavailable();
    const parsed = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw unavailable();
      parsed[key] = descriptor.value;
    }
    return parsed;
  } catch { throw unavailable(); }
}
function denseArray(value: unknown, minimum: number, maximum: number): readonly unknown[] {
  try {
    if (
      !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype ||
      value.length < minimum || value.length > maximum
    ) throw unavailable();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).length !== value.length + 1) throw unavailable();
    const copied: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw unavailable();
      copied.push(descriptor.value);
    }
    return Object.freeze(copied);
  } catch { throw unavailable(); }
}
function row(result: Readonly<{ rows: unknown[]; rowCount?: number | null }>) {
  try {
    const rows = denseArray(result.rows, 1, 1);
    if (result.rowCount !== 1) throw unavailable();
    const parsed = record(rows[0], ["outcome", "result_payload"]);
    if (typeof parsed.outcome !== "string" || parsed.outcome.length < 1 || parsed.outcome.length > 64) throw unavailable();
    return Object.freeze({ outcome: parsed.outcome, result: parsed.result_payload });
  } catch { throw unavailable(); }
}
function authorityValues(authority: ValidatedOrderAuthority): unknown[] {
  return [authority.storeId, authority.principalId, authority.membershipId, authority.planId, authority.planCode, authority.planVersion, authority.now];
}
function compareDescending(left: Readonly<{ updatedAt: string; id: string }>, right: Readonly<{ updatedAt: string; id: string }>): number {
  if (left.updatedAt !== right.updatedAt) return left.updatedAt > right.updatedAt ? -1 : 1;
  return left.id > right.id ? -1 : left.id < right.id ? 1 : 0;
}
function equalMutation(left: InventoryMutationResult, right: InventoryMutationResult): boolean {
  return left.id === right.id && left.status === right.status && left.version === right.version && left.updatedAt === right.updatedAt;
}

export class PostgresInventoryRepository implements InventoryRepository {
  private readonly options: PostgresInventoryRepositoryOptions;

  constructor(options: PostgresInventoryRepositoryOptions) {
    try {
      if (typeof options !== "object" || options === null || Array.isArray(options)) throw unavailable();
      const prototype = Object.getPrototypeOf(options);
      if (prototype !== Object.prototype && prototype !== null) throw unavailable();
      if (Object.keys(options).sort().join(",") !== "audit,pool,role,timeouts,uuid") throw unavailable();
      if (
        options.role !== "celebix_saas_app" || typeof options.uuid !== "function" ||
        typeof options.audit !== "function" || typeof options.timeouts !== "object" ||
        options.timeouts === null || Array.isArray(options.timeouts) ||
        Object.keys(options.timeouts).sort().join(",") !== "idleTransactionMs,lockMs,poolCheckoutMs,statementMs"
      ) throw unavailable();
      for (const value of Object.values(options.timeouts)) timeout(value);
      this.options = Object.freeze({ ...options, timeouts: Object.freeze({ ...options.timeouts }) });
    } catch { throw unavailable(); }
  }

  private async acquire(): Promise<PostgresClientLike> {
    try { return await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs); }
    catch { throw unavailable(); }
  }

  private async query(client: PostgresClientLike, text: string, values?: unknown[]) {
    try { return await client.query(text, values); }
    catch { throw unavailable(); }
  }

  private async configure(client: PostgresClientLike): Promise<void> {
    await this.query(client, "SELECT pg_catalog.set_config('statement_timeout', $1, true)", [timeout(this.options.timeouts.statementMs)]);
    await this.query(client, "SELECT pg_catalog.set_config('lock_timeout', $1, true)", [timeout(this.options.timeouts.lockMs)]);
    await this.query(client, "SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [timeout(this.options.timeouts.idleTransactionMs)]);
    await this.query(client, "SET LOCAL ROLE celebix_saas_app");
  }

  private expected(outcome: string): Error | undefined {
    return ERRORS.has(outcome) ? inventoryFailure(outcome as InventoryErrorCode) : undefined;
  }

  private async rollback(client: PostgresClientLike): Promise<void> {
    try { await this.query(client, "ROLLBACK"); release(client); }
    catch { release(client, true); }
  }

  private async read<T>(spec: Spec, expectedOutcome: string, parser: (value: unknown) => T): Promise<T> {
    const client = await this.acquire();
    let began = false;
    let terminal = false;
    try {
      await this.query(client, "BEGIN READ ONLY");
      began = true;
      await this.configure(client);
      const result = row(await this.query(client, spec.text, spec.values));
      const expected = this.expected(result.outcome);
      if (expected) throw expected;
      if (result.outcome !== expectedOutcome) throw unavailable();
      const parsed = parser(result.result);
      try {
        await this.query(client, "COMMIT");
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
      if (inventoryRepositoryErrorCode(error) !== undefined) throw error;
      throw unavailable();
    }
  }

  private emitUnknownCommit(): void {
    try {
      const pending = this.options.audit({ type: "inventory_commit_unknown" });
      if (pending) void pending.catch(() => undefined);
    } catch { /* Audit is observational. */ }
  }

  private async recover(
    authority: ValidatedOrderAuthority,
    operationId: string,
    fingerprint: string,
    parser: MutationParser,
    observed: InventoryMutationResult,
  ): Promise<InventoryMutationResult> {
    return this.read({
      text: SQL.recover,
      values: [...authorityValues(authority), operationId, fingerprint],
    }, "operation_replayed", (value) => {
      const recovered = parser(value, true);
      if (!equalMutation(observed, recovered)) throw unavailable();
      return recovered;
    });
  }

  private async mutate(
    authority: ValidatedOrderAuthority,
    operationId: string,
    fingerprint: string,
    successOutcome: string,
    spec: Spec,
    parser: MutationParser,
  ): Promise<InventoryMutationResult> {
    const client = await this.acquire();
    let began = false;
    let terminal = false;
    try {
      await this.query(client, "BEGIN ISOLATION LEVEL READ COMMITTED");
      began = true;
      await this.configure(client);
      const result = row(await this.query(client, spec.text, spec.values));
      const expected = this.expected(result.outcome);
      if (expected) throw expected;
      if (result.outcome !== successOutcome && result.outcome !== "operation_replayed") throw unavailable();
      const parsed = parser(result.result, result.outcome === "operation_replayed");
      try {
        await this.query(client, "COMMIT");
        terminal = true;
        release(client);
        return parsed;
      } catch {
        terminal = true;
        release(client, true);
        this.emitUnknownCommit();
        return await this.recover(authority, operationId, fingerprint, parser, parsed);
      }
    } catch (error) {
      if (began && !terminal) await this.rollback(client);
      else if (!began && !terminal) release(client, true);
      if (inventoryRepositoryErrorCode(error) !== undefined) throw error;
      throw unavailable();
    }
  }

  private validated(input: unknown, required: readonly string[], optional: readonly string[] = []) {
    const parsed = exactInventoryInput(input, required, optional);
    return Object.freeze({
      parsed,
      authority: inventoryAuthority(parsed.tenantContext as TenantContext, parsed.now as Date),
    });
  }

  private generatedId(): string {
    try { return inventoryUuid(this.options.uuid()); } catch { throw unavailable(); }
  }

  private list<T>(
    value: unknown,
    parser: (entry: unknown) => T,
    ordered?: (left: T, right: T) => number,
  ): readonly T[] {
    const envelope = record(value, ["items"]);
    const rawItems = denseArray(envelope.items, 0, 500);
    let items: readonly T[];
    try { items = Object.freeze(rawItems.map(parser)); } catch { throw unavailable(); }
    if (ordered) {
      for (let index = 1; index < items.length; index += 1) {
        if (ordered(items[index - 1]!, items[index]!) >= 0) throw unavailable();
      }
    }
    return items;
  }

  private mutationParser(
    targetId: string,
    expectedVersion: number,
    statuses: readonly string[],
    generatedTarget: boolean,
  ): MutationParser {
    return (value, replayed) => {
      try {
        const raw = record(value, ["id", "status", "version", "updatedAt", "replayed"]);
        if (raw.replayed !== false) throw unavailable();
        const parsed = parseInventoryMutationResult({
          id: raw.id, status: raw.status, version: raw.version, updatedAt: raw.updatedAt, replayed,
        });
        if (
          (!replayed || !generatedTarget) && parsed.id !== targetId ||
          parsed.version !== expectedVersion ||
          !statuses.includes(parsed.status)
        ) throw unavailable();
        return parsed;
      } catch (error) {
        if (inventoryRepositoryErrorCode(error) !== undefined) throw error;
        throw unavailable();
      }
    };
  }

  async listLocations(input: InventoryAuthorityInput): Promise<readonly InventoryLocation[]> {
    const { authority } = this.validated(input, ["tenantContext", "now"]);
    return this.read({ text: SQL.listLocations, values: authorityValues(authority) }, "listed", (value) =>
      this.list(value, parseInventoryLocation, (left, right) => {
        if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
        return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
      }));
  }

  async listBalances(input: ListInventoryBalancesInput): Promise<readonly InventoryBalance[]> {
    const { parsed, authority } = this.validated(input, ["tenantContext", "now", "locationId"]);
    const locationId = inventoryUuid(parsed.locationId);
    return this.read({ text: SQL.listBalances, values: [...authorityValues(authority), locationId] }, "listed", (value) =>
      this.list(value, parseInventoryBalance, (left, right) => left.variantId < right.variantId ? -1 : left.variantId > right.variantId ? 1 : 0));
  }

  async listPurchaseOrders(input: ListPurchaseOrdersInput): Promise<readonly PurchaseOrder[]> {
    const { authority } = this.validated(input, ["tenantContext", "now"]);
    return this.read({ text: SQL.listPurchaseOrders, values: authorityValues(authority) }, "listed", (value) =>
      this.list(value, parsePurchaseOrder, compareDescending));
  }

  async getPurchaseOrder(input: GetPurchaseOrderInput): Promise<PurchaseOrder> {
    const { parsed, authority } = this.validated(input, ["tenantContext", "now", "orderId"]);
    const orderId = inventoryUuid(parsed.orderId);
    return this.read({ text: SQL.getPurchaseOrder, values: [...authorityValues(authority), orderId] }, "found", (value) => {
      try { const result = parsePurchaseOrder(value); if (result.id !== orderId) throw unavailable(); return result; }
      catch (error) { if (inventoryRepositoryErrorCode(error) !== undefined) throw error; throw unavailable(); }
    });
  }

  async savePurchaseOrder(input: SavePurchaseOrderInput): Promise<InventoryMutationResult> {
    const { parsed, authority } = this.validated(
      input, ["tenantContext", "now", "operationId", "locationId", "supplierName", "lines"], ["orderId", "expectedVersion"],
    );
    const operationId = inventoryUuid(parsed.operationId);
    const existingId = parsed.orderId === undefined ? undefined : inventoryUuid(parsed.orderId);
    const expectedVersion = parsed.expectedVersion === undefined ? undefined : inventoryVersion(parsed.expectedVersion);
    if ((existingId === undefined) !== (expectedVersion === undefined)) throw inventoryFailure("invalid_input");
    const targetId = existingId ?? this.generatedId();
    const locationId = inventoryUuid(parsed.locationId);
    const supplierName = inventoryText(parsed.supplierName, 1, 200);
    const lines = canonicalInventoryLines(purchaseSaveLines(parsed.lines));
    const fingerprint = inventoryFingerprint("purchase_save", authority.storeId, existingId ?? null, expectedVersion ?? null, {
      lines, locationId, supplierName,
    });
    return this.mutate(authority, operationId, fingerprint, "saved", {
      text: SQL.savePurchaseOrder,
      values: [...authorityValues(authority), operationId, fingerprint, targetId, expectedVersion ?? null, locationId, supplierName, JSON.stringify(lines)],
    }, this.mutationParser(targetId, (expectedVersion ?? 0) + 1, ["draft"], existingId === undefined));
  }

  async transitionPurchaseOrder(input: TransitionPurchaseOrderInput): Promise<InventoryMutationResult> {
    const { parsed, authority } = this.validated(input, ["tenantContext", "now", "operationId", "orderId", "expectedVersion", "transition"]);
    const operationId = inventoryUuid(parsed.operationId), orderId = inventoryUuid(parsed.orderId), expectedVersion = inventoryVersion(parsed.expectedVersion);
    if (parsed.transition !== "order" && parsed.transition !== "cancel") throw inventoryFailure("invalid_input");
    const transition = parsed.transition;
    const fingerprint = inventoryFingerprint("purchase_transition", authority.storeId, orderId, expectedVersion, { transition });
    return this.mutate(authority, operationId, fingerprint, "transitioned", {
      text: SQL.transitionPurchaseOrder,
      values: [...authorityValues(authority), operationId, fingerprint, orderId, expectedVersion, transition],
    }, this.mutationParser(orderId, expectedVersion + 1, [transition === "order" ? "ordered" : "cancelled"], false));
  }

  async receivePurchaseOrder(input: ReceivePurchaseOrderInput): Promise<InventoryMutationResult> {
    const { parsed, authority } = this.validated(input, ["tenantContext", "now", "operationId", "orderId", "expectedVersion", "locationId", "lines"]);
    const operationId = inventoryUuid(parsed.operationId), orderId = inventoryUuid(parsed.orderId), expectedVersion = inventoryVersion(parsed.expectedVersion), locationId = inventoryUuid(parsed.locationId);
    const lines = canonicalInventoryLines(purchaseReceiptLines(parsed.lines));
    const fingerprint = inventoryFingerprint("purchase_receive", authority.storeId, orderId, expectedVersion, { lines, locationId });
    return this.mutate(authority, operationId, fingerprint, "received", {
      text: SQL.receivePurchaseOrder,
      values: [...authorityValues(authority), operationId, fingerprint, orderId, expectedVersion, locationId, JSON.stringify(lines)],
    }, this.mutationParser(orderId, expectedVersion + 1, ["partially_received", "received"], false));
  }

  async listCounts(input: ListInventoryCountsInput): Promise<readonly InventoryCount[]> {
    const { authority } = this.validated(input, ["tenantContext", "now"]);
    return this.read({ text: SQL.listCounts, values: authorityValues(authority) }, "listed", (value) =>
      this.list(value, parseInventoryCount, compareDescending));
  }

  async getCount(input: GetInventoryCountInput): Promise<InventoryCount> {
    const { parsed, authority } = this.validated(input, ["tenantContext", "now", "countId"]);
    const countId = inventoryUuid(parsed.countId);
    return this.read({ text: SQL.getCount, values: [...authorityValues(authority), countId] }, "found", (value) => {
      try { const result = parseInventoryCount(value); if (result.id !== countId) throw unavailable(); return result; }
      catch (error) { if (inventoryRepositoryErrorCode(error) !== undefined) throw error; throw unavailable(); }
    });
  }

  async saveCount(input: SaveInventoryCountInput): Promise<InventoryMutationResult> {
    const { parsed, authority } = this.validated(
      input, ["tenantContext", "now", "operationId", "locationId", "lines"], ["countId", "expectedVersion"],
    );
    const operationId = inventoryUuid(parsed.operationId);
    const existingId = parsed.countId === undefined ? undefined : inventoryUuid(parsed.countId);
    const expectedVersion = parsed.expectedVersion === undefined ? undefined : inventoryVersion(parsed.expectedVersion);
    if ((existingId === undefined) !== (expectedVersion === undefined)) throw inventoryFailure("invalid_input");
    const targetId = existingId ?? this.generatedId(), locationId = inventoryUuid(parsed.locationId);
    const lines = canonicalInventoryLines(countSaveLines(parsed.lines));
    const fingerprint = inventoryFingerprint("count_save", authority.storeId, existingId ?? null, expectedVersion ?? null, { lines, locationId });
    return this.mutate(authority, operationId, fingerprint, "saved", {
      text: SQL.saveCount,
      values: [...authorityValues(authority), operationId, fingerprint, targetId, expectedVersion ?? null, locationId, JSON.stringify(lines)],
    }, this.mutationParser(targetId, (expectedVersion ?? 0) + 1, existingId === undefined ? ["draft"] : ["draft", "counting"], existingId === undefined));
  }

  private countOperation(
    input: StartInventoryCountInput | CommitInventoryCountInput | CancelInventoryCountInput,
    kind: "start" | "commit" | "cancel",
  ): Promise<InventoryMutationResult> {
    const { parsed, authority } = this.validated(input, ["tenantContext", "now", "operationId", "countId", "expectedVersion"]);
    const operationId = inventoryUuid(parsed.operationId), countId = inventoryUuid(parsed.countId), expectedVersion = inventoryVersion(parsed.expectedVersion);
    const fingerprint = inventoryFingerprint(`count_${kind}`, authority.storeId, countId, expectedVersion, {});
    const definition = {
      start: [SQL.startCount, "started"],
      commit: [SQL.commitCount, "committed"],
      cancel: [SQL.cancelCount, "cancelled"],
    } as const;
    return this.mutate(authority, operationId, fingerprint, definition[kind][1], {
      text: definition[kind][0],
      values: [...authorityValues(authority), operationId, fingerprint, countId, expectedVersion],
    }, this.mutationParser(countId, expectedVersion + 1, {
      start: ["counting"],
      commit: ["committed"],
      cancel: ["cancelled"],
    }[kind], false));
  }

  startCount(input: StartInventoryCountInput) { return this.countOperation(input, "start"); }
  commitCount(input: CommitInventoryCountInput) { return this.countOperation(input, "commit"); }
  cancelCount(input: CancelInventoryCountInput) { return this.countOperation(input, "cancel"); }

  async listTransfers(input: ListInventoryTransfersInput): Promise<readonly InventoryTransfer[]> {
    const { authority } = this.validated(input, ["tenantContext", "now"]);
    return this.read({ text: SQL.listTransfers, values: authorityValues(authority) }, "listed", (value) =>
      this.list(value, parseInventoryTransfer, compareDescending));
  }

  async getTransfer(input: GetInventoryTransferInput): Promise<InventoryTransfer> {
    const { parsed, authority } = this.validated(input, ["tenantContext", "now", "transferId"]);
    const transferId = inventoryUuid(parsed.transferId);
    return this.read({ text: SQL.getTransfer, values: [...authorityValues(authority), transferId] }, "found", (value) => {
      try { const result = parseInventoryTransfer(value); if (result.id !== transferId) throw unavailable(); return result; }
      catch (error) { if (inventoryRepositoryErrorCode(error) !== undefined) throw error; throw unavailable(); }
    });
  }

  async saveTransfer(input: SaveInventoryTransferInput): Promise<InventoryMutationResult> {
    const { parsed, authority } = this.validated(
      input, ["tenantContext", "now", "operationId", "sourceLocationId", "destinationLocationId", "lines"], ["transferId", "expectedVersion"],
    );
    const operationId = inventoryUuid(parsed.operationId);
    const existingId = parsed.transferId === undefined ? undefined : inventoryUuid(parsed.transferId);
    const expectedVersion = parsed.expectedVersion === undefined ? undefined : inventoryVersion(parsed.expectedVersion);
    if ((existingId === undefined) !== (expectedVersion === undefined)) throw inventoryFailure("invalid_input");
    const targetId = existingId ?? this.generatedId(), sourceLocationId = inventoryUuid(parsed.sourceLocationId), destinationLocationId = inventoryUuid(parsed.destinationLocationId);
    if (sourceLocationId === destinationLocationId) throw inventoryFailure("invalid_input");
    const lines = canonicalInventoryLines(transferSaveLines(parsed.lines));
    const fingerprint = inventoryFingerprint("transfer_save", authority.storeId, existingId ?? null, expectedVersion ?? null, {
      destinationLocationId, lines, sourceLocationId,
    });
    return this.mutate(authority, operationId, fingerprint, "saved", {
      text: SQL.saveTransfer,
      values: [...authorityValues(authority), operationId, fingerprint, targetId, expectedVersion ?? null, sourceLocationId, destinationLocationId, JSON.stringify(lines)],
    }, this.mutationParser(targetId, (expectedVersion ?? 0) + 1, ["draft"], existingId === undefined));
  }

  private transferOperation(
    input: DispatchInventoryTransferInput | ReceiveInventoryTransferInput | CancelInventoryTransferInput,
    kind: "dispatch" | "receive" | "cancel",
  ): Promise<InventoryMutationResult> {
    const { parsed, authority } = this.validated(input, ["tenantContext", "now", "operationId", "transferId", "expectedVersion"]);
    const operationId = inventoryUuid(parsed.operationId), transferId = inventoryUuid(parsed.transferId), expectedVersion = inventoryVersion(parsed.expectedVersion);
    const fingerprint = inventoryFingerprint(`transfer_${kind}`, authority.storeId, transferId, expectedVersion, {});
    const definition = {
      dispatch: [SQL.dispatchTransfer, "dispatched"],
      receive: [SQL.receiveTransfer, "received"],
      cancel: [SQL.cancelTransfer, "cancelled"],
    } as const;
    return this.mutate(authority, operationId, fingerprint, definition[kind][1], {
      text: definition[kind][0],
      values: [...authorityValues(authority), operationId, fingerprint, transferId, expectedVersion],
    }, this.mutationParser(transferId, expectedVersion + 1, {
      dispatch: ["in_transit"],
      receive: ["received"],
      cancel: ["cancelled"],
    }[kind], false));
  }

  dispatchTransfer(input: DispatchInventoryTransferInput) { return this.transferOperation(input, "dispatch"); }
  receiveTransfer(input: ReceiveInventoryTransferInput) { return this.transferOperation(input, "receive"); }
  cancelTransfer(input: CancelInventoryTransferInput) { return this.transferOperation(input, "cancel"); }
}
