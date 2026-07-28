import {
  parseMerchantPaymentMethod,
  parsePaymentMethodMutationResult,
  parsePaymentMethodReorderResult,
  type MerchantPaymentMethod,
  type PaymentMethodMutationResult,
  type PaymentMethodReorderResult,
  type TenantContext,
} from "@celebix/saas-contracts";

import { acquirePostgresClient, type PostgresClientLike } from "../postgres/pool.ts";
import type { ValidatedOrderAuthority } from "../orders/validation.ts";
import {
  exactPaymentMethodInput,
  paymentMethodAuthority,
  paymentMethodConfig,
  paymentMethodEmergencyReason,
  paymentMethodFingerprint,
  paymentMethodFingerprintValue,
  paymentMethodKind,
  paymentMethodLabel,
  paymentMethodOrderItems,
  paymentMethodProviderCode,
  paymentMethodState,
  paymentMethodUuid,
  paymentMethodVersion,
} from "./canonical.ts";
import {
  PAYMENT_METHOD_ERROR_CODES,
  PaymentMethodRepositoryError,
  type PaymentMethodErrorCode,
} from "./errors.ts";
import type {
  ListPaymentMethodsInput,
  PaymentMethodOperationResult,
  PaymentMethodRepository,
  PostgresPaymentMethodRepositoryOptions,
  RecoverPaymentMethodOperationInput,
  ReorderPaymentMethodsInput,
  SavePaymentMethodInput,
  SetPaymentMethodStateInput,
} from "./types.ts";

type Spec = Readonly<{ text: string; values: unknown[] }>;
type OperationParser<T extends PaymentMethodOperationResult> = (value: unknown, replayed: boolean) => T;
const CODES = new Set<string>(PAYMENT_METHOD_ERROR_CODES);

function unavailable(): PaymentMethodRepositoryError {
  return new PaymentMethodRepositoryError("unavailable");
}

function timeout(value: number): string {
  if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) throw unavailable();
  return `${value}ms`;
}

function release(client: PostgresClientLike, destroy = false): void {
  try { client.release(destroy || undefined); } catch {}
}

function payload(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw unavailable();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw unavailable();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  const actual = Reflect.ownKeys(descriptors);
  if (
    actual.length !== keys.length
    || actual.some((key) => typeof key !== "string" || !keys.includes(key))
    || keys.some((key) => !Object.hasOwn(descriptors, key))
  ) throw unavailable();
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of actual) {
    if (typeof key !== "string") throw unavailable();
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) throw unavailable();
    result[key] = descriptor.value;
  }
  return result;
}

function denseArray(value: unknown, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) throw unavailable();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) throw unavailable();
  const result: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) throw unavailable();
    result.push(descriptor.value);
  }
  return result;
}

function row(value: Readonly<{ rows: unknown[]; rowCount?: number | null }>): Readonly<{ outcome: string; result: unknown }> {
  if (value.rowCount !== 1 || value.rows.length !== 1) throw unavailable();
  const parsed = payload(value.rows[0], ["outcome", "result_payload"]);
  if (typeof parsed.outcome !== "string") throw unavailable();
  return Object.freeze({ outcome: parsed.outcome, result: parsed.result_payload });
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

function method(value: unknown): MerchantPaymentMethod {
  try { return parseMerchantPaymentMethod(value); } catch { throw unavailable(); }
}

function mutation(value: unknown, replayed: boolean): PaymentMethodMutationResult {
  try {
    const parsed = parsePaymentMethodMutationResult(value);
    if (parsed.replayed !== replayed) throw unavailable();
    return parsed;
  } catch (error) {
    if (error instanceof PaymentMethodRepositoryError) throw error;
    throw unavailable();
  }
}

function reorder(value: unknown, replayed: boolean): PaymentMethodReorderResult {
  try {
    const parsed = parsePaymentMethodReorderResult(value);
    if (parsed.replayed !== replayed) throw unavailable();
    return parsed;
  } catch (error) {
    if (error instanceof PaymentMethodRepositoryError) throw error;
    throw unavailable();
  }
}

function operation(value: unknown, replayed: boolean): PaymentMethodOperationResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw unavailable();
  const descriptor = Object.getOwnPropertyDescriptor(value, "items");
  return descriptor && "value" in descriptor ? reorder(value, replayed) : mutation(value, replayed);
}

function comparable(value: PaymentMethodOperationResult): string {
  if ("items" in value) {
    return JSON.stringify({
      items: value.items.map((item) => ({ ...item, replayed: false })),
      replayed: false,
    });
  }
  return JSON.stringify({ ...value, replayed: false });
}

export class PostgresPaymentMethodRepository implements PaymentMethodRepository {
  private readonly options: PostgresPaymentMethodRepositoryOptions;

  constructor(options: PostgresPaymentMethodRepositoryOptions) {
    try {
      if (
        !options
        || typeof options !== "object"
        || Array.isArray(options)
        || Object.keys(options).sort().join(",") !== "audit,pool,role,timeouts"
        || options.role !== "celebix_saas_app"
        || typeof options.audit !== "function"
        || !options.pool
        || typeof options.pool.connect !== "function"
        || !options.timeouts
        || Object.keys(options.timeouts).sort().join(",") !== "idleTransactionMs,lockMs,poolCheckoutMs,statementMs"
      ) throw unavailable();
      for (const value of Object.values(options.timeouts)) timeout(value);
      this.options = Object.freeze({ ...options, timeouts: Object.freeze({ ...options.timeouts }) });
    } catch (error) {
      if (error instanceof PaymentMethodRepositoryError) throw error;
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

  private mapped(outcome: string): PaymentMethodRepositoryError | undefined {
    return CODES.has(outcome)
      ? new PaymentMethodRepositoryError(outcome as PaymentMethodErrorCode)
      : undefined;
  }

  private async rollback(client: PostgresClientLike): Promise<void> {
    try { await client.query("ROLLBACK"); release(client); } catch { release(client, true); }
  }

  private async read<T>(spec: Spec, expected: string, parser: (value: unknown) => T): Promise<T> {
    const client = await this.acquire();
    let began = false;
    let terminal = false;
    try {
      await client.query("BEGIN READ ONLY");
      began = true;
      await this.configure(client);
      const result = row(await client.query(spec.text, spec.values));
      const mapped = this.mapped(result.outcome);
      if (mapped) throw mapped;
      if (result.outcome !== expected) throw unavailable();
      const parsed = parser(result.result);
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
      if (error instanceof PaymentMethodRepositoryError) throw error;
      throw unavailable();
    }
  }

  private audit(): void {
    try {
      const pending = this.options.audit(Object.freeze({ type: "payment_method_commit_unknown" }));
      if (pending) void pending.catch(() => undefined);
    } catch {}
  }

  private recover<T extends PaymentMethodOperationResult>(
    authority: ValidatedOrderAuthority,
    operationId: string,
    fingerprint: string,
    observed: T,
    parser: OperationParser<T>,
  ): Promise<T> {
    return this.read({
      text: "SELECT outcome,result_payload FROM saas.payment_method_recover_operation($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text)",
      values: [...authorityValues(authority), operationId, fingerprint],
    }, "operation_replayed", (value) => {
      const recovered = parser(value, true);
      if (comparable(recovered) !== comparable(observed)) throw unavailable();
      return recovered;
    });
  }

  private async recoverDurableError(
    authority: ValidatedOrderAuthority,
    operationId: string,
    fingerprint: string,
    observed: PaymentMethodErrorCode,
  ): Promise<never> {
    await this.read({
      text: "SELECT outcome,result_payload FROM saas.payment_method_recover_operation($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text)",
      values: [...authorityValues(authority), operationId, fingerprint],
    }, "operation_replayed", (value) => {
      const recovered = payload(value, ["outcome", "replayed"]);
      if (recovered.outcome !== observed || recovered.replayed !== true) throw unavailable();
    });
    throw new PaymentMethodRepositoryError(observed);
  }

  private async mutate<T extends PaymentMethodOperationResult>(
    authority: ValidatedOrderAuthority,
    operationId: string,
    fingerprint: string,
    expected: string,
    spec: Spec,
    parser: OperationParser<T>,
  ): Promise<T> {
    const client = await this.acquire();
    let began = false;
    let terminal = false;
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      began = true;
      await this.configure(client);
      const result = row(await client.query(spec.text, spec.values));
      const mapped = this.mapped(result.outcome);
      const durableError = result.outcome === "method_already_exists" ? mapped : undefined;
      if (durableError) {
        if (result.result !== null) throw unavailable();
        try {
          await client.query("COMMIT");
          terminal = true;
          release(client);
        } catch {
          terminal = true;
          release(client, true);
          this.audit();
          return await this.recoverDurableError(
            authority,
            operationId,
            fingerprint,
            durableError.code,
          );
        }
        throw durableError;
      }
      if (mapped) throw mapped;
      if (result.outcome !== expected && result.outcome !== "operation_replayed") throw unavailable();
      const parsed = parser(result.result, result.outcome === "operation_replayed");
      try {
        await client.query("COMMIT");
        terminal = true;
        release(client);
        return parsed;
      } catch {
        terminal = true;
        release(client, true);
        this.audit();
        return await this.recover(authority, operationId, fingerprint, parsed, parser);
      }
    } catch (error) {
      if (began && !terminal) await this.rollback(client);
      else if (!began && !terminal) release(client, true);
      if (error instanceof PaymentMethodRepositoryError) throw error;
      throw unavailable();
    }
  }

  async list(input: ListPaymentMethodsInput): Promise<readonly MerchantPaymentMethod[]> {
    const parsed = exactPaymentMethodInput(input, ["tenantContext", "now"]);
    const authority = paymentMethodAuthority(parsed.tenantContext as TenantContext, parsed.now as Date);
    return this.read({
      text: "SELECT outcome,result_payload FROM saas.payment_method_list($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz)",
      values: authorityValues(authority),
    }, "listed", (value) => {
      const selected = payload(value, ["items"]);
      return Object.freeze(denseArray(selected.items, 100).map(method));
    });
  }

  async save(input: SavePaymentMethodInput): Promise<PaymentMethodMutationResult> {
    const parsed = exactPaymentMethodInput(input, [
      "tenantContext", "now", "operationId", "methodId", "expectedVersion", "kind",
      "profileId", "providerCode", "label", "config",
    ]);
    const authority = paymentMethodAuthority(parsed.tenantContext as TenantContext, parsed.now as Date);
    const operationId = paymentMethodUuid(parsed.operationId);
    const methodId = paymentMethodUuid(parsed.methodId);
    const expectedVersion = paymentMethodVersion(parsed.expectedVersion, 0);
    const kind = paymentMethodKind(parsed.kind);
    const profileId = parsed.profileId === null ? null : paymentMethodUuid(parsed.profileId);
    const providerCode = parsed.providerCode === null ? null : paymentMethodProviderCode(parsed.providerCode);
    if (kind === "provider" ? profileId === null || providerCode === null : profileId !== null || providerCode !== null) {
      throw new PaymentMethodRepositoryError("invalid_input");
    }
    const label = paymentMethodLabel(parsed.label);
    const config = paymentMethodConfig(parsed.config);
    const fingerprint = paymentMethodFingerprint("save", authority.storeId, {
      methodId, expectedVersion, kind, profileId, providerCode, label, config,
    });
    return this.mutate(authority, operationId, fingerprint, "saved", {
      text: "SELECT outcome,result_payload FROM saas.payment_method_save($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint,$12::text,$13::uuid,$14::text,$15::text,$16::jsonb)",
      values: [...authorityValues(authority), operationId, fingerprint, methodId, expectedVersion, kind, profileId, providerCode, label, JSON.stringify(config)],
    }, (value, replayed) => {
      const result = mutation(value, replayed);
      if (result.id !== methodId || result.version !== (expectedVersion === 0 ? 1 : expectedVersion + 1)) throw unavailable();
      return result;
    });
  }

  async setState(input: SetPaymentMethodStateInput): Promise<PaymentMethodMutationResult> {
    const parsed = exactPaymentMethodInput(input, [
      "tenantContext", "now", "operationId", "methodId", "expectedVersion", "state", "emergencyReason",
    ]);
    const authority = paymentMethodAuthority(parsed.tenantContext as TenantContext, parsed.now as Date);
    const operationId = paymentMethodUuid(parsed.operationId);
    const methodId = paymentMethodUuid(parsed.methodId);
    const expectedVersion = paymentMethodVersion(parsed.expectedVersion, 1);
    const state = paymentMethodState(parsed.state);
    const emergencyReason = paymentMethodEmergencyReason(parsed.emergencyReason, state);
    const fingerprint = paymentMethodFingerprint("set_state", authority.storeId, {
      methodId, expectedVersion, state, emergencyReason,
    });
    return this.mutate(authority, operationId, fingerprint, "state_changed", {
      text: "SELECT outcome,result_payload FROM saas.payment_method_set_state($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint,$12::text,$13::text)",
      values: [...authorityValues(authority), operationId, fingerprint, methodId, expectedVersion, state, emergencyReason],
    }, (value, replayed) => {
      const result = mutation(value, replayed);
      if (result.id !== methodId || result.state !== state || result.version !== expectedVersion + 1) throw unavailable();
      return result;
    });
  }

  async reorder(input: ReorderPaymentMethodsInput): Promise<PaymentMethodReorderResult> {
    const parsed = exactPaymentMethodInput(input, ["tenantContext", "now", "operationId", "items"]);
    const authority = paymentMethodAuthority(parsed.tenantContext as TenantContext, parsed.now as Date);
    const operationId = paymentMethodUuid(parsed.operationId);
    const items = paymentMethodOrderItems(parsed.items);
    const fingerprint = paymentMethodFingerprint("reorder", authority.storeId, { items });
    return this.mutate(authority, operationId, fingerprint, "reordered", {
      text: "SELECT outcome,result_payload FROM saas.payment_method_reorder($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::jsonb)",
      values: [...authorityValues(authority), operationId, fingerprint, JSON.stringify(items)],
    }, (value, replayed) => {
      const result = reorder(value, replayed);
      if (result.items.length !== items.length) throw unavailable();
      const expected = new Map(items.map((item) => [item.id, item]));
      for (const item of result.items) {
        const source = expected.get(item.id);
        if (!source || item.position !== source.position || item.version !== source.expectedVersion + 1) throw unavailable();
      }
      return result;
    });
  }

  async recoverOperation(input: RecoverPaymentMethodOperationInput): Promise<PaymentMethodOperationResult> {
    const parsed = exactPaymentMethodInput(input, ["tenantContext", "now", "operationId", "fingerprint"]);
    const authority = paymentMethodAuthority(parsed.tenantContext as TenantContext, parsed.now as Date);
    const operationId = paymentMethodUuid(parsed.operationId);
    const fingerprint = paymentMethodFingerprintValue(parsed.fingerprint);
    return this.read({
      text: "SELECT outcome,result_payload FROM saas.payment_method_recover_operation($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text)",
      values: [...authorityValues(authority), operationId, fingerprint],
    }, "operation_replayed", (value) => operation(value, true));
  }
}
