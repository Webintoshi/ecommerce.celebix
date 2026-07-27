import { types as nodeTypes } from "node:util";

import { acquirePostgresClient, type PostgresClientLike } from "../postgres/pool.ts";
import {
  PAYMENT_ATTEMPT_ERROR_CODES,
  PaymentAttemptRepositoryError,
  isTrustedPaymentAttemptError,
  trustedPaymentAttemptError,
  type PaymentAttemptErrorCode,
} from "./errors.ts";
import type {
  BeginPaymentAttemptInput,
  BeginPaymentAttemptResult,
  ClaimPaymentAttemptReconciliationInput,
  FinalizePaymentAttemptReconciliationInput,
  GetPaymentCallbackAuthorityInput,
  MarkPaymentAttemptInitializedInput,
  MarkPaymentAttemptUnknownInput,
  PaymentAttemptAuthority,
  PaymentAttemptMutationResult,
  PaymentAttemptReconciliationClaim,
  PaymentAttemptRepository,
  PaymentAttemptStatus,
  PostgresPaymentAttemptRepositoryOptions,
  SettlePaymentAttemptCallbackInput,
} from "./types.ts";
import {
  exactPaymentAttemptInput,
  paymentAttemptCurrency,
  paymentAttemptDate,
  paymentAttemptDigest,
  paymentAttemptEnvironment,
  paymentAttemptInteger,
  paymentAttemptLeaseWindow,
  paymentAttemptOrderReference,
  paymentAttemptProviderCode,
  paymentAttemptProviderReference,
  paymentAttemptPublicConfig,
  paymentAttemptSafeCode,
  paymentAttemptSealedCredentials,
  paymentAttemptStatus,
  paymentAttemptStoreAuthority,
  paymentAttemptTimestamp,
  paymentAttemptUuid,
  paymentAttemptWorker,
} from "./validation.ts";

type Options = Readonly<PostgresPaymentAttemptRepositoryOptions>;
type Query = Readonly<{ text: string; values: readonly unknown[] }>;
type Selected = Readonly<{ outcome: string; payload: unknown }>;

const DATABASE_ERRORS = new Set<PaymentAttemptErrorCode>(
  PAYMENT_ATTEMPT_ERROR_CODES.filter(
    (code) => code !== "unavailable" && code !== "commit_unknown",
  ),
);

function unavailable(): never {
  throw trustedPaymentAttemptError("unavailable");
}

function commitUnknown(): never {
  throw trustedPaymentAttemptError("commit_unknown");
}

function timeout(value: unknown): string {
  try {
    if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 60_000) {
      unavailable();
    }
    return `${value as number}ms`;
  } catch (error) {
    if (isTrustedPaymentAttemptError(error)) throw error;
    return unavailable();
  }
}

function release(client: PostgresClientLike, destroy = false): void {
  try {
    client.release(destroy || undefined);
  } catch {
    // Cleanup cannot alter authority.
  }
}

function outputRecord(
  value: unknown,
  required: readonly string[],
): Readonly<Record<string, unknown>> {
  try {
    if (
      typeof value !== "object"
      || value === null
      || Array.isArray(value)
      || nodeTypes.isProxy(value)
    ) unavailable();
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) unavailable();
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<PropertyKey, PropertyDescriptor>;
    const keys = Reflect.ownKeys(descriptors);
    if (
      keys.length !== required.length
      || keys.some((key) => typeof key !== "string" || !required.includes(key))
      || required.some((key) => !Object.hasOwn(descriptors, key))
    ) unavailable();
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of required) {
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) unavailable();
      result[key] = descriptor.value;
    }
    return Object.freeze(result);
  } catch (error) {
    if (isTrustedPaymentAttemptError(error)) throw error;
    return unavailable();
  }
}

function selected(value: unknown): Selected {
  try {
    if (typeof value !== "object" || value === null || nodeTypes.isProxy(value)) unavailable();
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<PropertyKey, PropertyDescriptor>;
    const rowsDescriptor = descriptors.rows;
    const countDescriptor = descriptors.rowCount;
    if (
      !rowsDescriptor
      || !("value" in rowsDescriptor)
      || !rowsDescriptor.enumerable
      || !countDescriptor
      || !("value" in countDescriptor)
      || !countDescriptor.enumerable
      || countDescriptor.value !== 1
      || !Array.isArray(rowsDescriptor.value)
      || nodeTypes.isProxy(rowsDescriptor.value)
      || Object.getPrototypeOf(rowsDescriptor.value) !== Array.prototype
    ) unavailable();
    const rows = rowsDescriptor.value as unknown[];
    const rowDescriptors = Object.getOwnPropertyDescriptors(rows) as unknown as Record<PropertyKey, PropertyDescriptor>;
    if (rows.length !== 1 || Reflect.ownKeys(rowDescriptors).length !== 2) unavailable();
    const rowDescriptor = rowDescriptors["0"];
    if (!rowDescriptor || !rowDescriptor.enumerable || !("value" in rowDescriptor)) unavailable();
    const row = outputRecord(rowDescriptor.value, ["outcome", "result_payload"]);
    if (
      typeof row.outcome !== "string"
      || !/^[a-z][a-z0-9_]{0,63}$/.test(row.outcome)
    ) unavailable();
    return Object.freeze({ outcome: row.outcome, payload: row.result_payload });
  } catch (error) {
    if (isTrustedPaymentAttemptError(error)) throw error;
    return unavailable();
  }
}

function database<T>(operation: () => T): T {
  try {
    return operation();
  } catch {
    return unavailable();
  }
}

function mapOutcome(value: string): void {
  if (DATABASE_ERRORS.has(value as PaymentAttemptErrorCode)) {
    throw trustedPaymentAttemptError(value as PaymentAttemptErrorCode);
  }
}

function parseAuthority(value: unknown): PaymentAttemptAuthority {
  return database(() => {
    const parsed = outputRecord(value, [
      "attemptId",
      "storeId",
      "paymentMethodId",
      "profileId",
      "providerCode",
      "environment",
      "credentialVersion",
      "orderReference",
      "amountMinor",
      "currency",
      "status",
      "version",
      "providerReference",
      "publicConfig",
      "sealedCredentials",
    ]);
    const environment = paymentAttemptEnvironment(parsed.environment);
    const publicConfig = paymentAttemptPublicConfig(parsed.publicConfig);
    if (publicConfig.environment !== environment) unavailable();
    return Object.freeze({
      attemptId: paymentAttemptUuid(parsed.attemptId),
      storeId: paymentAttemptUuid(parsed.storeId),
      paymentMethodId: paymentAttemptUuid(parsed.paymentMethodId),
      profileId: paymentAttemptUuid(parsed.profileId),
      providerCode: paymentAttemptProviderCode(parsed.providerCode),
      environment,
      credentialVersion: paymentAttemptInteger(parsed.credentialVersion),
      orderReference: paymentAttemptOrderReference(parsed.orderReference),
      amountMinor: paymentAttemptInteger(parsed.amountMinor),
      currency: paymentAttemptCurrency(parsed.currency),
      status: paymentAttemptStatus(parsed.status),
      version: paymentAttemptInteger(parsed.version),
      providerReference: paymentAttemptProviderReference(parsed.providerReference),
      publicConfig,
      sealedCredentials: paymentAttemptSealedCredentials(parsed.sealedCredentials),
    });
  });
}

function parseBegin(
  value: unknown,
  outcome: string,
  expected: Readonly<{
    storeId: string;
    attemptId: string;
    paymentMethodId: string;
    amountMinor: number;
    currency: string;
  }>,
): BeginPaymentAttemptResult {
  return database(() => {
    const parsed = outputRecord(value, [
      "attemptId",
      "storeId",
      "paymentMethodId",
      "profileId",
      "providerCode",
      "environment",
      "credentialVersion",
      "amountMinor",
      "currency",
      "publicConfig",
      "sealedCredentials",
    ]);
    const environment = paymentAttemptEnvironment(parsed.environment);
    const publicConfig = paymentAttemptPublicConfig(parsed.publicConfig);
    const result = Object.freeze({
      outcome: outcome === "operation_replayed" ? "replayed" as const : "created" as const,
      attemptId: paymentAttemptUuid(parsed.attemptId),
      storeId: paymentAttemptUuid(parsed.storeId),
      paymentMethodId: paymentAttemptUuid(parsed.paymentMethodId),
      profileId: paymentAttemptUuid(parsed.profileId),
      providerCode: paymentAttemptProviderCode(parsed.providerCode),
      environment,
      credentialVersion: paymentAttemptInteger(parsed.credentialVersion),
      amountMinor: paymentAttemptInteger(parsed.amountMinor),
      currency: paymentAttemptCurrency(parsed.currency),
      publicConfig,
      sealedCredentials: paymentAttemptSealedCredentials(parsed.sealedCredentials),
    });
    if (
      result.attemptId !== expected.attemptId
      || result.storeId !== expected.storeId
      || result.paymentMethodId !== expected.paymentMethodId
      || result.amountMinor !== expected.amountMinor
      || result.currency !== expected.currency
      || publicConfig.environment !== environment
    ) unavailable();
    return result;
  });
}

function parseMutation(
  value: unknown,
  outcome: string,
  expected: Readonly<{
    attemptId: string;
    expectedVersion: number;
    status: PaymentAttemptStatus;
    providerReference: string | null;
    safeCode: string;
    callbackReplay: boolean;
    historicalOperationReplay: boolean;
  }>,
): PaymentAttemptMutationResult {
  return database(() => {
    const parsed = outputRecord(value, [
      "attemptId",
      "status",
      "version",
      "providerReference",
      "safeCode",
      "replayed",
    ]);
    if (typeof parsed.replayed !== "boolean") unavailable();
    const replayed = outcome === "operation_replayed" || outcome === "callback_replayed";
    const result = Object.freeze({
      attemptId: paymentAttemptUuid(parsed.attemptId),
      status: paymentAttemptStatus(parsed.status),
      version: paymentAttemptInteger(parsed.version),
      providerReference: paymentAttemptProviderReference(parsed.providerReference),
      safeCode: paymentAttemptSafeCode(parsed.safeCode),
      replayed: parsed.replayed,
    });
    const mutationVersion = result.version === expected.expectedVersion + 1;
    const historicalReplayVersion = expected.historicalOperationReplay
      && outcome === "operation_replayed"
      && result.version >= 1
      && result.version <= expected.expectedVersion;
    if (
      result.attemptId !== expected.attemptId
      || result.status !== expected.status
      || result.providerReference !== expected.providerReference
      || result.safeCode !== expected.safeCode
      || result.replayed !== replayed
      || (!expected.callbackReplay && !mutationVersion && !historicalReplayVersion)
    ) unavailable();
    return result;
  });
}

function parseClaim(
  value: unknown,
  outcome: string,
  expected: Readonly<{
    attemptId: string;
    expectedVersion: number;
    leaseId: string;
    leaseOwner: string;
    leaseExpiresAt: Date;
  }>,
): PaymentAttemptReconciliationClaim {
  return database(() => {
    const parsed = outputRecord(value, [
      "attemptId",
      "storeId",
      "paymentMethodId",
      "profileId",
      "providerCode",
      "environment",
      "credentialVersion",
      "orderReference",
      "amountMinor",
      "currency",
      "status",
      "version",
      "providerReference",
      "publicConfig",
      "sealedCredentials",
      "leaseId",
      "leaseOwner",
      "leaseExpiresAt",
    ]);
    const authority = parseAuthority(Object.freeze({
      attemptId: parsed.attemptId,
      storeId: parsed.storeId,
      paymentMethodId: parsed.paymentMethodId,
      profileId: parsed.profileId,
      providerCode: parsed.providerCode,
      environment: parsed.environment,
      credentialVersion: parsed.credentialVersion,
      orderReference: parsed.orderReference,
      amountMinor: parsed.amountMinor,
      currency: parsed.currency,
      status: parsed.status,
      version: parsed.version,
      providerReference: parsed.providerReference,
      publicConfig: parsed.publicConfig,
      sealedCredentials: parsed.sealedCredentials,
    }));
    const leaseExpiresAt = paymentAttemptTimestamp(parsed.leaseExpiresAt);
    const result = Object.freeze({
      ...authority,
      outcome: outcome === "operation_replayed" ? "replayed" as const : "claimed" as const,
      leaseId: paymentAttemptUuid(parsed.leaseId),
      leaseOwner: paymentAttemptWorker(parsed.leaseOwner),
      leaseExpiresAt,
    });
    if (
      result.attemptId !== expected.attemptId
      || result.status !== "reconciliation_required"
      || result.version !== expected.expectedVersion + 1
      || result.leaseId !== expected.leaseId
      || result.leaseOwner !== expected.leaseOwner
      || result.leaseExpiresAt !== expected.leaseExpiresAt.toISOString()
    ) unavailable();
    return result;
  });
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function expectedReplay<T extends object>(observed: T, discriminant: "outcome" | "replayed"): T {
  return Object.freeze({
    ...observed,
    [discriminant]: discriminant === "outcome" ? "replayed" : true,
  }) as T;
}

async function configure(client: PostgresClientLike, options: Options): Promise<void> {
  await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [
    timeout(options.timeouts.statementMs),
  ]);
  await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [
    timeout(options.timeouts.lockMs),
  ]);
  await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [
    timeout(options.timeouts.idleTransactionMs),
  ]);
  await client.query("SET LOCAL ROLE celebix_saas_workflow");
}

async function acquire(options: Options): Promise<PostgresClientLike> {
  try {
    return await acquirePostgresClient(options.pool, options.timeouts.poolCheckoutMs);
  } catch {
    return unavailable();
  }
}

function destroyFor(error: unknown): boolean {
  return !isTrustedPaymentAttemptError(error)
    || error.code === "unavailable"
    || error.code === "commit_unknown";
}

async function rollback(client: PostgresClientLike, destroy: boolean): Promise<void> {
  try {
    await client.query("ROLLBACK");
    release(client, destroy);
  } catch {
    release(client, true);
  }
}

function audit(options: Options): void {
  try {
    void Promise.resolve(
      options.audit(Object.freeze({ type: "payment_attempt_commit_unknown" })),
    ).catch(() => undefined);
  } catch {
    // Audit is observational and never changes durable authority.
  }
}

async function read<T>(
  options: Options,
  query: Query,
  expected: string | readonly string[],
  parser: (payload: unknown, outcome: string) => T,
): Promise<T> {
  const client = await acquire(options);
  let began = false;
  let terminal = false;
  try {
    await client.query("BEGIN READ ONLY");
    began = true;
    await configure(client, options);
    const result = selected(await client.query(query.text, [...query.values]));
    mapOutcome(result.outcome);
    if (!(Array.isArray(expected) ? expected : [expected]).includes(result.outcome)) unavailable();
    const parsed = parser(result.payload, result.outcome);
    try {
      await client.query("COMMIT");
      terminal = true;
      release(client);
      return parsed;
    } catch {
      terminal = true;
      release(client, true);
      return unavailable();
    }
  } catch (error) {
    if (began && !terminal) await rollback(client, destroyFor(error));
    else if (!began && !terminal) release(client, true);
    if (isTrustedPaymentAttemptError(error)) throw error;
    return unavailable();
  }
}

async function write<T>(
  options: Options,
  query: Query,
  expected: readonly string[],
  parser: (payload: unknown, outcome: string) => T,
  recoveryOutcome: (observedOutcome: string) => string,
  recoveryMatches: (observed: T, recovered: T) => boolean,
): Promise<T> {
  const client = await acquire(options);
  let began = false;
  let terminal = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    began = true;
    await configure(client, options);
    const result = selected(await client.query(query.text, [...query.values]));
    mapOutcome(result.outcome);
    if (!expected.includes(result.outcome)) unavailable();
    const observed = parser(result.payload, result.outcome);
    try {
      await client.query("COMMIT");
      terminal = true;
      release(client);
      return observed;
    } catch {
      terminal = true;
      release(client, true);
      audit(options);
      try {
        const recovered = await read(
          options,
          query,
          recoveryOutcome(result.outcome),
          parser,
        );
        if (!recoveryMatches(observed, recovered)) commitUnknown();
        return recovered;
      } catch {
        return commitUnknown();
      }
    }
  } catch (error) {
    if (began && !terminal) await rollback(client, destroyFor(error));
    else if (!began && !terminal) release(client, true);
    if (isTrustedPaymentAttemptError(error)) throw error;
    return unavailable();
  }
}

function operationReplay(): string {
  return "operation_replayed";
}

export class PostgresPaymentAttemptRepository implements PaymentAttemptRepository {
  private readonly options: Options;

  constructor(options: PostgresPaymentAttemptRepositoryOptions) {
    try {
      const parsed = exactPaymentAttemptInput(options, ["pool", "role", "timeouts", "audit"]);
      const timeouts = exactPaymentAttemptInput(parsed.timeouts, [
        "poolCheckoutMs",
        "statementMs",
        "lockMs",
        "idleTransactionMs",
      ]);
      if (
        parsed.role !== "celebix_saas_workflow"
        || typeof parsed.audit !== "function"
        || typeof parsed.pool !== "object"
        || parsed.pool === null
        || nodeTypes.isProxy(parsed.pool)
        || typeof (parsed.pool as { connect?: unknown }).connect !== "function"
      ) unavailable();
      timeout(timeouts.poolCheckoutMs);
      timeout(timeouts.statementMs);
      timeout(timeouts.lockMs);
      timeout(timeouts.idleTransactionMs);
      this.options = Object.freeze({
        pool: parsed.pool as Options["pool"],
        role: "celebix_saas_workflow",
        timeouts: Object.freeze({
          poolCheckoutMs: timeouts.poolCheckoutMs as number,
          statementMs: timeouts.statementMs as number,
          lockMs: timeouts.lockMs as number,
          idleTransactionMs: timeouts.idleTransactionMs as number,
        }),
        audit: parsed.audit as Options["audit"],
      });
    } catch {
      throw new PaymentAttemptRepositoryError("unavailable");
    }
  }

  async begin(input: BeginPaymentAttemptInput): Promise<BeginPaymentAttemptResult> {
    const parsed = exactPaymentAttemptInput(input, [
      "authority",
      "operationId",
      "fingerprint",
      "paymentMethodId",
      "orderReference",
      "amountMinor",
      "currency",
      "callbackBindingDigest",
    ]);
    const authority = paymentAttemptStoreAuthority(parsed.authority);
    const attemptId = paymentAttemptUuid(parsed.operationId);
    const fingerprint = paymentAttemptDigest(parsed.fingerprint);
    const paymentMethodId = paymentAttemptUuid(parsed.paymentMethodId);
    const orderReference = paymentAttemptOrderReference(parsed.orderReference);
    const amountMinor = paymentAttemptInteger(parsed.amountMinor);
    const currency = paymentAttemptCurrency(parsed.currency);
    const callbackBindingDigest = paymentAttemptDigest(parsed.callbackBindingDigest);
    const query = Object.freeze({
      text: "SELECT outcome,result_payload FROM saas.payment_attempt_begin($1::uuid,$2::timestamptz,$3::uuid,$4::text,$5::uuid,$6::text,$7::bigint,$8::text,$9::text)",
      values: Object.freeze([
        authority.storeId,
        authority.now,
        attemptId,
        fingerprint,
        paymentMethodId,
        orderReference,
        amountMinor,
        currency,
        callbackBindingDigest,
      ]),
    });
    return write(
      this.options,
      query,
      ["created", "operation_replayed"],
      (payload, outcome) => parseBegin(payload, outcome, {
        storeId: authority.storeId,
        attemptId,
        paymentMethodId,
        amountMinor,
        currency,
      }),
      operationReplay,
      (observed, recovered) => same(expectedReplay(observed, "outcome"), recovered),
    );
  }

  async markInitialized(
    input: MarkPaymentAttemptInitializedInput,
  ): Promise<PaymentAttemptMutationResult> {
    const parsed = exactPaymentAttemptInput(input, [
      "attemptId",
      "operationId",
      "fingerprint",
      "expectedVersion",
      "credentialVersion",
      "status",
      "providerReference",
      "safeCode",
      "now",
    ]);
    const attemptId = paymentAttemptUuid(parsed.attemptId);
    const operationId = paymentAttemptUuid(parsed.operationId);
    const fingerprint = paymentAttemptDigest(parsed.fingerprint);
    const expectedVersion = paymentAttemptInteger(parsed.expectedVersion);
    const credentialVersion = paymentAttemptInteger(parsed.credentialVersion);
    const statuses = ["awaiting_customer", "submitted", "failed", "cancelled", "expired"] as const;
    if (!statuses.includes(parsed.status as never)) throw trustedPaymentAttemptError("invalid_input");
    const status = parsed.status as MarkPaymentAttemptInitializedInput["status"];
    const providerReference = paymentAttemptProviderReference(parsed.providerReference);
    const safeCode = paymentAttemptSafeCode(parsed.safeCode);
    const now = paymentAttemptDate(parsed.now);
    const query = Object.freeze({
      text: "SELECT outcome,result_payload FROM saas.payment_attempt_mark_initialized($1::uuid,$2::uuid,$3::text,$4::bigint,$5::bigint,$6::text,$7::text,$8::text,$9::timestamptz)",
      values: Object.freeze([
        attemptId, operationId, fingerprint, expectedVersion, credentialVersion,
        status, providerReference, safeCode, now,
      ]),
    });
    return write(
      this.options,
      query,
      [status, "operation_replayed"],
      (payload, outcome) => parseMutation(payload, outcome, {
        attemptId,
        expectedVersion,
        status,
        providerReference,
        safeCode,
        callbackReplay: false,
        historicalOperationReplay: false,
      }),
      operationReplay,
      (observed, recovered) => same(expectedReplay(observed, "replayed"), recovered),
    );
  }

  async markUnknown(input: MarkPaymentAttemptUnknownInput): Promise<PaymentAttemptMutationResult> {
    const parsed = exactPaymentAttemptInput(input, [
      "attemptId",
      "operationId",
      "fingerprint",
      "expectedVersion",
      "credentialVersion",
      "providerReference",
      "safeCode",
      "now",
    ]);
    const attemptId = paymentAttemptUuid(parsed.attemptId);
    const operationId = paymentAttemptUuid(parsed.operationId);
    const fingerprint = paymentAttemptDigest(parsed.fingerprint);
    const expectedVersion = paymentAttemptInteger(parsed.expectedVersion);
    const credentialVersion = paymentAttemptInteger(parsed.credentialVersion);
    const providerReference = paymentAttemptProviderReference(parsed.providerReference);
    const safeCode = paymentAttemptSafeCode(parsed.safeCode);
    const now = paymentAttemptDate(parsed.now);
    const query = Object.freeze({
      text: "SELECT outcome,result_payload FROM saas.payment_attempt_mark_unknown($1::uuid,$2::uuid,$3::text,$4::bigint,$5::bigint,$6::text,$7::text,$8::timestamptz)",
      values: Object.freeze([
        attemptId, operationId, fingerprint, expectedVersion, credentialVersion,
        providerReference, safeCode, now,
      ]),
    });
    return write(
      this.options,
      query,
      ["provider_outcome_unknown", "operation_replayed"],
      (payload, outcome) => parseMutation(payload, outcome, {
        attemptId,
        expectedVersion,
        status: "provider_outcome_unknown",
        providerReference,
        safeCode,
        callbackReplay: false,
        historicalOperationReplay: true,
      }),
      operationReplay,
      (observed, recovered) => same(expectedReplay(observed, "replayed"), recovered),
    );
  }

  async getCallbackAuthority(
    input: GetPaymentCallbackAuthorityInput,
  ): Promise<PaymentAttemptAuthority> {
    const parsed = exactPaymentAttemptInput(input, [
      "providerCode",
      "callbackBindingDigest",
      "now",
    ]);
    const providerCode = paymentAttemptProviderCode(parsed.providerCode);
    return read(
      this.options,
      Object.freeze({
        text: "SELECT outcome,result_payload FROM saas.payment_callback_authority($1::text,$2::text,$3::timestamptz)",
        values: Object.freeze([
          providerCode,
          paymentAttemptDigest(parsed.callbackBindingDigest),
          paymentAttemptDate(parsed.now),
        ]),
      }),
      "found",
      (payload) => {
        const authority = parseAuthority(payload);
        if (authority.providerCode !== providerCode) unavailable();
        return authority;
      },
    );
  }

  async settleCallback(
    input: SettlePaymentAttemptCallbackInput,
  ): Promise<PaymentAttemptMutationResult> {
    const parsed = exactPaymentAttemptInput(input, [
      "providerCode",
      "callbackBindingDigest",
      "operationId",
      "fingerprint",
      "eventKeyDigest",
      "expectedVersion",
      "credentialVersion",
      "status",
      "providerReference",
      "safeCode",
      "amountMinor",
      "currency",
      "now",
    ]);
    const providerCode = paymentAttemptProviderCode(parsed.providerCode);
    const callbackBindingDigest = paymentAttemptDigest(parsed.callbackBindingDigest);
    const operationId = paymentAttemptUuid(parsed.operationId);
    const fingerprint = paymentAttemptDigest(parsed.fingerprint);
    const eventKeyDigest = paymentAttemptDigest(parsed.eventKeyDigest);
    const expectedVersion = paymentAttemptInteger(parsed.expectedVersion);
    const credentialVersion = paymentAttemptInteger(parsed.credentialVersion);
    const statuses = ["authorized", "captured", "failed", "partially_refunded", "refunded"] as const;
    if (!statuses.includes(parsed.status as never)) throw trustedPaymentAttemptError("invalid_input");
    const status = parsed.status as SettlePaymentAttemptCallbackInput["status"];
    const providerReference = paymentAttemptProviderReference(parsed.providerReference);
    const safeCode = paymentAttemptSafeCode(parsed.safeCode);
    const amountMinor = paymentAttemptInteger(parsed.amountMinor);
    const currency = paymentAttemptCurrency(parsed.currency);
    const now = paymentAttemptDate(parsed.now);
    const query = Object.freeze({
      text: "SELECT outcome,result_payload FROM saas.payment_attempt_settle_callback($1::text,$2::text,$3::uuid,$4::text,$5::text,$6::bigint,$7::bigint,$8::text,$9::text,$10::text,$11::bigint,$12::text,$13::timestamptz)",
      values: Object.freeze([
        providerCode, callbackBindingDigest, operationId, fingerprint, eventKeyDigest,
        expectedVersion, credentialVersion, status, providerReference, safeCode,
        amountMinor, currency, now,
      ]),
    });
    return write(
      this.options,
      query,
      [status, "callback_replayed", "operation_replayed"],
      (payload, outcome) => parseMutation(payload, outcome, {
        attemptId: paymentAttemptUuid(
          outputRecord(payload, [
            "attemptId", "status", "version", "providerReference", "safeCode", "replayed",
          ]).attemptId,
        ),
        expectedVersion,
        status,
        providerReference,
        safeCode,
        callbackReplay: outcome === "callback_replayed",
        historicalOperationReplay: false,
      }),
      (observedOutcome) => observedOutcome === "callback_replayed"
        ? "callback_replayed"
        : "operation_replayed",
      (observed, recovered) => same(
        observed.replayed ? observed : expectedReplay(observed, "replayed"),
        recovered,
      ),
    );
  }

  async claimReconciliation(
    input: ClaimPaymentAttemptReconciliationInput,
  ): Promise<PaymentAttemptReconciliationClaim> {
    const parsed = exactPaymentAttemptInput(input, [
      "attemptId",
      "operationId",
      "fingerprint",
      "expectedVersion",
      "workerId",
      "leaseId",
      "now",
      "leaseExpiresAt",
    ]);
    const attemptId = paymentAttemptUuid(parsed.attemptId);
    const operationId = paymentAttemptUuid(parsed.operationId);
    const fingerprint = paymentAttemptDigest(parsed.fingerprint);
    const expectedVersion = paymentAttemptInteger(parsed.expectedVersion);
    const workerId = paymentAttemptWorker(parsed.workerId);
    const leaseId = paymentAttemptUuid(parsed.leaseId);
    const window = paymentAttemptLeaseWindow(parsed.now, parsed.leaseExpiresAt);
    const query = Object.freeze({
      text: "SELECT outcome,result_payload FROM saas.payment_attempt_claim_reconciliation($1::uuid,$2::uuid,$3::text,$4::bigint,$5::text,$6::uuid,$7::timestamptz,$8::timestamptz)",
      values: Object.freeze([
        attemptId, operationId, fingerprint, expectedVersion, workerId, leaseId,
        window.now, window.leaseExpiresAt,
      ]),
    });
    return write(
      this.options,
      query,
      ["claimed", "operation_replayed"],
      (payload, outcome) => parseClaim(payload, outcome, {
        attemptId,
        expectedVersion,
        leaseId,
        leaseOwner: workerId,
        leaseExpiresAt: window.leaseExpiresAt,
      }),
      operationReplay,
      (observed, recovered) => same(expectedReplay(observed, "outcome"), recovered),
    );
  }

  async finalizeReconciliation(
    input: FinalizePaymentAttemptReconciliationInput,
  ): Promise<PaymentAttemptMutationResult> {
    const parsed = exactPaymentAttemptInput(input, [
      "attemptId",
      "operationId",
      "fingerprint",
      "expectedVersion",
      "workerId",
      "leaseId",
      "credentialVersion",
      "status",
      "providerReference",
      "safeCode",
      "amountMinor",
      "currency",
      "now",
    ]);
    const attemptId = paymentAttemptUuid(parsed.attemptId);
    const operationId = paymentAttemptUuid(parsed.operationId);
    const fingerprint = paymentAttemptDigest(parsed.fingerprint);
    const expectedVersion = paymentAttemptInteger(parsed.expectedVersion);
    const workerId = paymentAttemptWorker(parsed.workerId);
    const leaseId = paymentAttemptUuid(parsed.leaseId);
    const credentialVersion = paymentAttemptInteger(parsed.credentialVersion);
    const statuses = ["captured", "failed", "provider_outcome_unknown"] as const;
    if (!statuses.includes(parsed.status as never)) throw trustedPaymentAttemptError("invalid_input");
    const status = parsed.status as FinalizePaymentAttemptReconciliationInput["status"];
    const providerReference = paymentAttemptProviderReference(parsed.providerReference);
    const safeCode = paymentAttemptSafeCode(parsed.safeCode);
    const amountMinor = paymentAttemptInteger(parsed.amountMinor);
    const currency = paymentAttemptCurrency(parsed.currency);
    const now = paymentAttemptDate(parsed.now);
    const query = Object.freeze({
      text: "SELECT outcome,result_payload FROM saas.payment_attempt_finalize_reconciliation($1::uuid,$2::uuid,$3::text,$4::bigint,$5::text,$6::uuid,$7::bigint,$8::text,$9::text,$10::text,$11::bigint,$12::text,$13::timestamptz)",
      values: Object.freeze([
        attemptId, operationId, fingerprint, expectedVersion, workerId, leaseId,
        credentialVersion, status, providerReference, safeCode, amountMinor, currency, now,
      ]),
    });
    return write(
      this.options,
      query,
      [status, "operation_replayed"],
      (payload, outcome) => parseMutation(payload, outcome, {
        attemptId,
        expectedVersion,
        status,
        providerReference,
        safeCode,
        callbackReplay: false,
        historicalOperationReplay: false,
      }),
      operationReplay,
      (observed, recovered) => same(expectedReplay(observed, "replayed"), recovered),
    );
  }
}
