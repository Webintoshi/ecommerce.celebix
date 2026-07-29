import { types as nodeTypes } from "node:util";

import type { TenantContext } from "@celebix/saas-contracts";

import { acquirePostgresClient, type PostgresClientLike, type PostgresPoolLike } from "../postgres/pool.ts";
import {
  IYZICO_SANDBOX_EVIDENCE_ERROR_CODES,
  isTrustedIyzicoSandboxEvidenceError,
  trustedIyzicoSandboxEvidenceError,
  type IyzicoSandboxEvidenceErrorCode,
} from "./errors.ts";
import type {
  ActivateIyzicoSandboxEvidenceInput,
  ActivateIyzicoSandboxEvidenceResult,
  ActivateCurrentIyzicoSandboxEvidenceInput,
  ActivateCurrentIyzicoSandboxEvidenceResult,
  BeginIyzicoSandboxEvidenceInput,
  BeginIyzicoSandboxEvidenceResult,
  BeginCurrentIyzicoSandboxEvidenceInput,
  BeginCurrentIyzicoSandboxEvidenceResult,
  ClaimIyzicoSandboxEvidenceInput,
  ClaimIyzicoSandboxEvidenceResult,
  ClaimNextIyzicoSandboxEvidenceInput,
  ClaimNextIyzicoSandboxEvidenceResult,
  ClaimedIyzicoSandboxEvidenceProfileInput,
  ClaimedIyzicoSandboxEvidenceProfileResult,
  CurrentIyzicoSandboxEvidenceInput,
  CurrentIyzicoSandboxEvidenceResult,
  FinalizeIyzicoSandboxEvidenceInput,
  FinalizeIyzicoSandboxEvidenceResult,
  IyzicoSandboxEvidenceActivationAppRepository,
  IyzicoSandboxEvidenceActivationWorkflowRepository,
  IyzicoSandboxEvidenceAuditEvent,
  PostgresIyzicoSandboxEvidenceAppRepositoryOptions,
  PostgresIyzicoSandboxEvidenceWorkflowRepositoryOptions,
  RecordIyzicoSandboxEvidenceEventInput,
  RecordIyzicoSandboxEvidenceEventResult,
} from "./types.ts";
import {
  providerPublicConfig,
  providerSealedCredential,
} from "../provider-execution/canonical.ts";
import {
  evidenceAuthority,
  evidenceCase,
  evidenceDate,
  evidenceDigest,
  evidenceInteger,
  evidenceLeaseWindow,
  evidenceTimestamp,
  evidenceUuid,
  evidenceWorker,
  exactIyzicoSandboxEvidenceRecord,
  prefixedEvidenceDigest,
} from "./validation.ts";

type RepositoryRole = "celebix_saas_app" | "celebix_saas_workflow";
type AuditRole = "app" | "workflow";
type MutationOperation = IyzicoSandboxEvidenceAuditEvent["operation"];
type Query = Readonly<{ text: string; values: readonly unknown[] }>;
type Selected = Readonly<{ outcome: string; payload: unknown }>;
type RuntimeOptions = Readonly<{
  pool: PostgresPoolLike;
  role: RepositoryRole;
  auditRole: AuditRole;
  timeouts: Readonly<{
    poolCheckoutMs: number;
    statementMs: number;
    lockMs: number;
    idleTransactionMs: number;
  }>;
  audit: (event: IyzicoSandboxEvidenceAuditEvent) => void | Promise<void>;
}>;

type MutationSpec<Result> = Readonly<{
  operation: MutationOperation;
  query: Query;
  success: readonly string[];
  parse: (selected: Selected) => Result;
  sameAuthority: (observed: Result, recovered: Result) => boolean;
  errorPayloadMustBeNull?: boolean;
}>;

const DATABASE_ERRORS = new Set<IyzicoSandboxEvidenceErrorCode>(
  IYZICO_SANDBOX_EVIDENCE_ERROR_CODES.filter(
    (code) => code !== "unavailable" && code !== "commit_unknown",
  ),
);

const BEGIN_SQL = "SELECT outcome,result_payload FROM saas.iyzico_iframe_tenant_evidence_begin($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint,$12::bigint,$13::text,$14::integer)";
const BEGIN_CURRENT_SQL = "SELECT outcome,result_payload FROM saas.iyzico_iframe_tenant_evidence_begin_current($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint,$12::bigint,$13::text,$14::integer)";
const CURRENT_SQL = "SELECT outcome,result_payload FROM saas.iyzico_iframe_tenant_evidence_current($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid)";
const CLAIM_SQL = "SELECT outcome,result_payload FROM saas.iyzico_iframe_tenant_evidence_claim($1::uuid,$2::text,$3::uuid,$4::timestamptz,$5::timestamptz)";
const CLAIM_NEXT_SQL = "SELECT outcome,result_payload FROM saas.iyzico_iframe_tenant_evidence_claim_next($1::text,$2::uuid,$3::timestamptz,$4::timestamptz)";
const CLAIMED_PROFILE_SQL = "SELECT outcome,result_payload FROM saas.iyzico_iframe_tenant_evidence_claimed_profile($1::uuid,$2::uuid,$3::text,$4::timestamptz)";
const EVENT_SQL = "SELECT outcome,result_payload FROM saas.iyzico_iframe_tenant_evidence_record_event($1::uuid,$2::uuid,$3::text,$4::uuid,$5::text,$6::text,$7::uuid,$8::text,$9::text,$10::timestamptz)";
const FINALIZE_SQL = "SELECT outcome,result_payload FROM saas.iyzico_iframe_tenant_evidence_finalize($1::uuid,$2::uuid,$3::text,$4::uuid,$5::text,$6::timestamptz)";
const ACTIVATE_SQL = "SELECT outcome,result_payload FROM saas.iyzico_iframe_tenant_evidence_activate($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint,$12::uuid,$13::bigint)";
const ACTIVATE_CURRENT_SQL = "SELECT outcome,result_payload FROM saas.iyzico_iframe_tenant_evidence_activate_current($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint)";
const PREFLIGHT_SQL = "SELECT saas.iyzico_iframe_tenant_evidence_preflight() AS ready";
const ACTIVATION_RUNTIME_PREFLIGHT_SQL = "SELECT saas.iyzico_iframe_tenant_activation_runtime_preflight() AS ready";

function unavailable(): never {
  throw trustedIyzicoSandboxEvidenceError("unavailable");
}

function commitUnknown(): never {
  throw trustedIyzicoSandboxEvidenceError("commit_unknown");
}

function release(client: PostgresClientLike, destroy = false): void {
  try {
    client.release(destroy || undefined);
  } catch {
    // Cleanup cannot establish durable authority.
  }
}

async function rollback(client: PostgresClientLike): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Cleanup cannot establish durable authority.
  }
}

function timeout(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 60_000) {
    return unavailable();
  }
  return value as number;
}

function options(
  value: unknown,
  expectedRole: RepositoryRole,
  auditRole: AuditRole,
): RuntimeOptions {
  try {
    const parsed = exactIyzicoSandboxEvidenceRecord(
      value,
      ["pool", "role", "timeouts", "audit"],
      "unavailable",
    );
    if (parsed.role !== expectedRole || typeof parsed.audit !== "function") unavailable();
    if (
      typeof parsed.pool !== "object"
      || parsed.pool === null
      || nodeTypes.isProxy(parsed.pool)
      || typeof (parsed.pool as PostgresPoolLike).connect !== "function"
    ) unavailable();
    const parsedTimeouts = exactIyzicoSandboxEvidenceRecord(
      parsed.timeouts,
      ["poolCheckoutMs", "statementMs", "lockMs", "idleTransactionMs"],
      "unavailable",
    );
    return Object.freeze({
      pool: parsed.pool as PostgresPoolLike,
      role: expectedRole,
      auditRole,
      timeouts: Object.freeze({
        poolCheckoutMs: timeout(parsedTimeouts.poolCheckoutMs),
        statementMs: timeout(parsedTimeouts.statementMs),
        lockMs: timeout(parsedTimeouts.lockMs),
        idleTransactionMs: timeout(parsedTimeouts.idleTransactionMs),
      }),
      audit: parsed.audit as RuntimeOptions["audit"],
    });
  } catch (error) {
    if (isTrustedIyzicoSandboxEvidenceError(error)) {
      if (error.code === "unavailable") throw error;
      return unavailable();
    }
    return unavailable();
  }
}

function outputRecord(value: unknown, required: readonly string[]): Readonly<Record<string, unknown>> {
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
    if (isTrustedIyzicoSandboxEvidenceError(error)) throw error;
    return unavailable();
  }
}

function oneRow(value: unknown): unknown {
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
    const rowDescriptors = Object.getOwnPropertyDescriptors(rows) as unknown as Record<
      PropertyKey,
      PropertyDescriptor
    >;
    const entry = rowDescriptors["0"];
    const length = rowDescriptors.length;
    if (
      rows.length !== 1
      || Reflect.ownKeys(rowDescriptors).length !== 2
      || !entry
      || !entry.enumerable
      || !("value" in entry)
      || !length
      || length.enumerable
      || !("value" in length)
      || length.value !== 1
    ) unavailable();
    return entry.value;
  } catch (error) {
    if (isTrustedIyzicoSandboxEvidenceError(error)) throw error;
    return unavailable();
  }
}

function selected(value: unknown): Selected {
  const row = outputRecord(oneRow(value), ["outcome", "result_payload"]);
  if (typeof row.outcome !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(row.outcome)) {
    return unavailable();
  }
  return Object.freeze({ outcome: row.outcome, payload: row.result_payload });
}

function parseOutput<Result>(operation: () => Result): Result {
  try {
    return operation();
  } catch {
    return unavailable();
  }
}

function replayed(outcome: string, value: unknown): boolean {
  const expected = outcome === "operation_replayed";
  if (typeof value !== "boolean" || value !== expected) unavailable();
  return value;
}

function parseBegin(value: Selected): BeginIyzicoSandboxEvidenceResult {
  return parseOutput(() => {
    if (value.outcome !== "created" && value.outcome !== "operation_replayed") unavailable();
    const payload = outputRecord(value.payload, ["runId", "status", "replayed"]);
    const statuses = ["pending", "leased", "attested", "rejected"] as const;
    if (!statuses.includes(payload.status as never)) unavailable();
    return Object.freeze({
      outcome: value.outcome,
      runId: evidenceUuid(payload.runId),
      status: payload.status as BeginIyzicoSandboxEvidenceResult["status"],
      replayed: replayed(value.outcome, payload.replayed),
    });
  });
}

function parseBeginCurrent(value: Selected): BeginCurrentIyzicoSandboxEvidenceResult {
  return parseOutput(() => {
    if (value.outcome !== "created" && value.outcome !== "operation_replayed") unavailable();
    const payload = outputRecord(value.payload, [
      "runId",
      "status",
      "methodId",
      "methodVersion",
      "methodState",
      "replayed",
    ]);
    const statuses = ["pending", "leased", "attested", "rejected"] as const;
    if (!statuses.includes(payload.status as never) || payload.methodState !== "disabled") unavailable();
    return Object.freeze({
      outcome: value.outcome,
      runId: evidenceUuid(payload.runId),
      status: payload.status as BeginCurrentIyzicoSandboxEvidenceResult["status"],
      methodId: evidenceUuid(payload.methodId),
      methodVersion: evidenceInteger(payload.methodVersion),
      methodState: "disabled" as const,
      replayed: replayed(value.outcome, payload.replayed),
    });
  });
}

function nullableUuid(value: unknown): string | null {
  return value === null ? null : evidenceUuid(value);
}

function nullableInteger(value: unknown): number | null {
  return value === null ? null : evidenceInteger(value);
}

function parseCurrent(value: Selected): CurrentIyzicoSandboxEvidenceResult {
  return parseOutput(() => {
    if (value.outcome !== "not_started" && value.outcome !== "current") unavailable();
    const payload = outputRecord(value.payload, [
      "profileId",
      "runId",
      "status",
      "rejectionCode",
      "methodId",
      "methodVersion",
      "methodState",
      "profileVersion",
      "credentialVersion",
      "attestationId",
      "activationCurrent",
    ]);
    const statuses = ["pending", "leased", "attested", "rejected"] as const;
    const rejectionCodes = ["callback_mismatch", "timeout_mismatch", "stale_evidence"] as const;
    const methodStates = ["active", "disabled", "emergency_disabled"] as const;
    if (payload.status !== null && !statuses.includes(payload.status as never)) unavailable();
    if (
      payload.rejectionCode !== null
      && !rejectionCodes.includes(payload.rejectionCode as never)
    ) unavailable();
    if (payload.methodState !== null && !methodStates.includes(payload.methodState as never)) {
      unavailable();
    }
    if (typeof payload.activationCurrent !== "boolean") unavailable();
    const profileId = evidenceUuid(payload.profileId);
    const runId = nullableUuid(payload.runId);
    const methodId = nullableUuid(payload.methodId);
    const methodVersion = nullableInteger(payload.methodVersion);
    const attestationId = nullableUuid(payload.attestationId);
    const methodFieldsPresent = methodId !== null
      && methodVersion !== null
      && payload.methodState !== null;
    if (
      (methodId !== null || methodVersion !== null || payload.methodState !== null) !== methodFieldsPresent
      || (methodId !== null && methodId !== profileId)
      || (payload.status === "rejected") !== (payload.rejectionCode !== null)
      || (payload.status === "attested") !== (attestationId !== null)
      || (payload.activationCurrent === true
        && (payload.status !== "attested"
          || (payload.methodState !== "active" && payload.methodState !== "disabled")))
    ) unavailable();
    if (value.outcome === "not_started") {
      if (
        runId !== null
        || payload.status !== null
        || payload.rejectionCode !== null
        || attestationId !== null
        || payload.activationCurrent
      ) unavailable();
    } else if (runId === null || payload.status === null) {
      unavailable();
    }
    return Object.freeze({
      outcome: value.outcome,
      profileId,
      runId,
      status: payload.status as CurrentIyzicoSandboxEvidenceResult["status"],
      rejectionCode: payload.rejectionCode as CurrentIyzicoSandboxEvidenceResult["rejectionCode"],
      methodId,
      methodVersion,
      methodState: payload.methodState as CurrentIyzicoSandboxEvidenceResult["methodState"],
      profileVersion: evidenceInteger(payload.profileVersion),
      credentialVersion: evidenceInteger(payload.credentialVersion),
      attestationId,
      activationCurrent: payload.activationCurrent,
    });
  });
}

function parseClaim(value: Selected): ClaimIyzicoSandboxEvidenceResult {
  return parseOutput(() => {
    if (value.outcome !== "claimed" && value.outcome !== "operation_replayed") unavailable();
    const payload = outputRecord(value.payload, ["runId", "leaseId", "replayed"]);
    return Object.freeze({
      outcome: value.outcome,
      runId: evidenceUuid(payload.runId),
      leaseId: evidenceUuid(payload.leaseId),
      replayed: replayed(value.outcome, payload.replayed),
    });
  });
}

function parseClaimNext(value: Selected): ClaimNextIyzicoSandboxEvidenceResult {
  return parseOutput(() => {
    if (value.outcome === "none") {
      if (value.payload !== null) unavailable();
      return Object.freeze({ outcome: "none" as const });
    }
    if (value.outcome !== "claimed" && value.outcome !== "operation_replayed") unavailable();
    const payload = outputRecord(value.payload, [
      "runId",
      "storeId",
      "profileId",
      "adapterVersion",
      "candidateEvidenceDigest",
      "profileVersion",
      "credentialVersion",
      "leaseId",
      "replayed",
    ]);
    return Object.freeze({
      outcome: value.outcome,
      runId: evidenceUuid(payload.runId),
      storeId: evidenceUuid(payload.storeId),
      profileId: evidenceUuid(payload.profileId),
      adapterVersion: evidenceInteger(payload.adapterVersion),
      candidateEvidenceDigest: prefixedEvidenceDigest(payload.candidateEvidenceDigest),
      profileVersion: evidenceInteger(payload.profileVersion),
      credentialVersion: evidenceInteger(payload.credentialVersion),
      leaseId: evidenceUuid(payload.leaseId),
      replayed: replayed(value.outcome, payload.replayed),
    });
  });
}

function parseClaimedProfile(value: Selected): ClaimedIyzicoSandboxEvidenceProfileResult {
  return parseOutput(() => {
    if (value.outcome !== "current") unavailable();
    const payload = outputRecord(value.payload, [
      "storeId",
      "profileId",
      "providerCode",
      "capability",
      "publicConfig",
      "sealedCredentials",
      "profileVersion",
      "credentialVersion",
    ]);
    if (payload.providerCode !== "iyzico_iframe" || payload.capability !== "payment_processing") {
      unavailable();
    }
    return Object.freeze({
      outcome: "current" as const,
      storeId: evidenceUuid(payload.storeId),
      profileId: evidenceUuid(payload.profileId),
      providerCode: "iyzico_iframe" as const,
      capability: "payment_processing" as const,
      publicConfig: providerPublicConfig(payload.publicConfig),
      sealedCredentials: providerSealedCredential(payload.sealedCredentials),
      profileVersion: evidenceInteger(payload.profileVersion),
      credentialVersion: evidenceInteger(payload.credentialVersion),
    });
  });
}

function parseEvent(value: Selected): RecordIyzicoSandboxEvidenceEventResult {
  return parseOutput(() => {
    if (value.outcome !== "recorded" && value.outcome !== "operation_replayed") unavailable();
    const payload = outputRecord(value.payload, ["eventId", "replayed"]);
    return Object.freeze({
      outcome: value.outcome,
      eventId: evidenceUuid(payload.eventId),
      replayed: replayed(value.outcome, payload.replayed),
    });
  });
}

function parseFinalize(value: Selected): FinalizeIyzicoSandboxEvidenceResult {
  return parseOutput(() => {
    if (value.outcome !== "attested" && value.outcome !== "operation_replayed") unavailable();
    const payload = outputRecord(value.payload, ["attestationId", "matrixDigest", "replayed"]);
    return Object.freeze({
      outcome: value.outcome,
      attestationId: evidenceUuid(payload.attestationId),
      matrixDigest: prefixedEvidenceDigest(payload.matrixDigest),
      replayed: replayed(value.outcome, payload.replayed),
    });
  });
}

function parseActivation(value: Selected): ActivateIyzicoSandboxEvidenceResult {
  return parseOutput(() => {
    if (value.outcome !== "state_changed" && value.outcome !== "operation_replayed") unavailable();
    const payload = outputRecord(value.payload, [
      "id",
      "state",
      "position",
      "version",
      "updatedAt",
      "replayed",
      "activationAttestationId",
    ]);
    if (payload.state !== "active") unavailable();
    return Object.freeze({
      outcome: value.outcome,
      id: evidenceUuid(payload.id),
      state: "active" as const,
      position: evidenceInteger(payload.position, 0, 9_999),
      version: evidenceInteger(payload.version),
      updatedAt: evidenceTimestamp(payload.updatedAt),
      replayed: replayed(value.outcome, payload.replayed),
      activationAttestationId: evidenceUuid(payload.activationAttestationId),
    });
  });
}

function databaseError(outcome: string): IyzicoSandboxEvidenceErrorCode | undefined {
  return DATABASE_ERRORS.has(outcome as IyzicoSandboxEvidenceErrorCode)
    ? outcome as IyzicoSandboxEvidenceErrorCode
    : undefined;
}

async function configure(client: PostgresClientLike, value: RuntimeOptions, readOnly: boolean): Promise<void> {
  await client.query(readOnly ? "BEGIN READ ONLY" : "BEGIN ISOLATION LEVEL READ COMMITTED");
  await client.query("SELECT pg_catalog.set_config('statement_timeout',$1::text,true)", [
    `${value.timeouts.statementMs}ms`,
  ]);
  await client.query("SELECT pg_catalog.set_config('lock_timeout',$1::text,true)", [
    `${value.timeouts.lockMs}ms`,
  ]);
  await client.query(
    "SELECT pg_catalog.set_config('idle_in_transaction_session_timeout',$1::text,true)",
    [`${value.timeouts.idleTransactionMs}ms`],
  );
  await client.query(`SET LOCAL ROLE ${value.role}`);
}

async function auditCommitUnknown(value: RuntimeOptions, operation: MutationOperation): Promise<void> {
  try {
    await value.audit(Object.freeze({
      type: "iyzico_sandbox_evidence_commit_unknown",
      role: value.auditRole,
      operation,
    }));
  } catch {
    // Telemetry cannot establish durable authority.
  }
}

async function recoverMutation<Result>(
  value: RuntimeOptions,
  spec: MutationSpec<Result>,
  observed: Result,
): Promise<Result> {
  let client: PostgresClientLike | undefined;
  let active = false;
  try {
    client = await acquirePostgresClient(value.pool, value.timeouts.poolCheckoutMs);
    active = true;
    await configure(client, value, false);
    const recoveredSelected = selected(await client.query(spec.query.text, [...spec.query.values]));
    if (recoveredSelected.outcome !== "operation_replayed") commitUnknown();
    const recovered = spec.parse(recoveredSelected);
    if (!spec.sameAuthority(observed, recovered)) commitUnknown();
    try {
      await client.query("COMMIT");
    } catch {
      active = false;
      release(client, true);
      client = undefined;
      return commitUnknown();
    }
    active = false;
    release(client);
    return recovered;
  } catch {
    if (client) {
      if (active) await rollback(client);
      release(client);
    }
    return commitUnknown();
  }
}

async function mutate<Result>(value: RuntimeOptions, spec: MutationSpec<Result>): Promise<Result> {
  let client: PostgresClientLike | undefined;
  let active = false;
  let released = false;
  try {
    client = await acquirePostgresClient(value.pool, value.timeouts.poolCheckoutMs);
    active = true;
    await configure(client, value, false);
    const observedSelected = selected(await client.query(spec.query.text, [...spec.query.values]));
    if (!spec.success.includes(observedSelected.outcome)) {
      const code = databaseError(observedSelected.outcome);
      if (!code) unavailable();
      if (spec.errorPayloadMustBeNull && observedSelected.payload !== null) unavailable();
      try {
        await client.query("COMMIT");
      } catch {
        active = false;
        release(client, true);
        released = true;
        await auditCommitUnknown(value, spec.operation);
        return commitUnknown();
      }
      active = false;
      release(client);
      released = true;
      throw trustedIyzicoSandboxEvidenceError(code);
    }
    const observed = spec.parse(observedSelected);
    try {
      await client.query("COMMIT");
    } catch {
      active = false;
      release(client, true);
      released = true;
      await auditCommitUnknown(value, spec.operation);
      return recoverMutation(value, spec, observed);
    }
    active = false;
    release(client);
    released = true;
    return observed;
  } catch (error) {
    if (client && !released) {
      if (active) await rollback(client);
      release(client);
    }
    if (isTrustedIyzicoSandboxEvidenceError(error)) throw error;
    return unavailable();
  }
}

async function read<Result>(
  value: RuntimeOptions,
  query: Query,
  success: readonly string[],
  parse: (selected: Selected) => Result,
): Promise<Result> {
  let client: PostgresClientLike | undefined;
  let active = false;
  let released = false;
  try {
    client = await acquirePostgresClient(value.pool, value.timeouts.poolCheckoutMs);
    active = true;
    await configure(client, value, true);
    const observed = selected(await client.query(query.text, [...query.values]));
    if (!success.includes(observed.outcome)) {
      const code = databaseError(observed.outcome);
      if (!code || observed.payload !== null) unavailable();
      try {
        await client.query("COMMIT");
      } catch {
        active = false;
        release(client, true);
        released = true;
        return unavailable();
      }
      active = false;
      release(client);
      released = true;
      throw trustedIyzicoSandboxEvidenceError(code);
    }
    const result = parse(observed);
    try {
      await client.query("COMMIT");
    } catch {
      active = false;
      release(client, true);
      released = true;
      return unavailable();
    }
    active = false;
    release(client);
    released = true;
    return result;
  } catch (error) {
    if (client && !released) {
      if (active) await rollback(client);
      release(client);
    }
    if (isTrustedIyzicoSandboxEvidenceError(error)) throw error;
    return unavailable();
  }
}

async function preflight(value: RuntimeOptions, sql = PREFLIGHT_SQL): Promise<true> {
  let client: PostgresClientLike | undefined;
  let active = false;
  let released = false;
  try {
    client = await acquirePostgresClient(value.pool, value.timeouts.poolCheckoutMs);
    active = true;
    await configure(client, value, true);
    const row = outputRecord(oneRow(await client.query(sql)), ["ready"]);
    if (row.ready !== true) unavailable();
    try {
      await client.query("COMMIT");
    } catch {
      active = false;
      release(client, true);
      released = true;
      return unavailable();
    }
    active = false;
    release(client);
    released = true;
    return true;
  } catch (error) {
    if (client && !released) {
      if (active) await rollback(client);
      release(client);
    }
    if (isTrustedIyzicoSandboxEvidenceError(error)) throw error;
    return unavailable();
  }
}

export class PostgresIyzicoSandboxEvidenceAppRepository
implements IyzicoSandboxEvidenceActivationAppRepository {
  readonly #options: RuntimeOptions;

  constructor(value: PostgresIyzicoSandboxEvidenceAppRepositoryOptions) {
    this.#options = options(value, "celebix_saas_app", "app");
  }

  async begin(input: BeginIyzicoSandboxEvidenceInput): Promise<BeginIyzicoSandboxEvidenceResult> {
    const parsed = exactIyzicoSandboxEvidenceRecord(input, [
      "tenantContext",
      "now",
      "runId",
      "fingerprint",
      "profileId",
      "expectedProfileVersion",
      "expectedCredentialVersion",
      "candidateEvidenceDigest",
      "adapterVersion",
    ]);
    const now = evidenceDate(parsed.now);
    const authority = evidenceAuthority(parsed.tenantContext as TenantContext, now, "integrations");
    const runId = evidenceUuid(parsed.runId);
    const query = Object.freeze({
      text: BEGIN_SQL,
      values: Object.freeze([
        authority.storeId,
        authority.principalId,
        authority.membershipId,
        authority.planId,
        authority.planCode,
        authority.planVersion,
        authority.now,
        runId,
        evidenceDigest(parsed.fingerprint),
        evidenceUuid(parsed.profileId),
        evidenceInteger(parsed.expectedProfileVersion),
        evidenceInteger(parsed.expectedCredentialVersion),
        prefixedEvidenceDigest(parsed.candidateEvidenceDigest),
        evidenceInteger(parsed.adapterVersion),
      ]),
    });
    return mutate(this.#options, {
      operation: "begin",
      query,
      success: ["created", "operation_replayed"],
      parse(value) {
        const result = parseBegin(value);
        if (result.runId !== runId) unavailable();
        return result;
      },
      sameAuthority: (observed, recovered) => observed.runId === recovered.runId,
    });
  }

  async beginCurrent(
    input: BeginCurrentIyzicoSandboxEvidenceInput,
  ): Promise<BeginCurrentIyzicoSandboxEvidenceResult> {
    const parsed = exactIyzicoSandboxEvidenceRecord(input, [
      "tenantContext",
      "now",
      "runId",
      "fingerprint",
      "profileId",
      "expectedProfileVersion",
      "expectedCredentialVersion",
      "candidateEvidenceDigest",
      "adapterVersion",
    ]);
    const now = evidenceDate(parsed.now);
    const authority = evidenceAuthority(parsed.tenantContext as TenantContext, now, "integrations");
    const runId = evidenceUuid(parsed.runId);
    const profileId = evidenceUuid(parsed.profileId);
    const query = Object.freeze({
      text: BEGIN_CURRENT_SQL,
      values: Object.freeze([
        authority.storeId,
        authority.principalId,
        authority.membershipId,
        authority.planId,
        authority.planCode,
        authority.planVersion,
        authority.now,
        runId,
        evidenceDigest(parsed.fingerprint),
        profileId,
        evidenceInteger(parsed.expectedProfileVersion),
        evidenceInteger(parsed.expectedCredentialVersion),
        prefixedEvidenceDigest(parsed.candidateEvidenceDigest),
        evidenceInteger(parsed.adapterVersion),
      ]),
    });
    return mutate(this.#options, {
      operation: "begin_current",
      query,
      success: ["created", "operation_replayed"],
      parse(value) {
        const result = parseBeginCurrent(value);
        if (
          result.runId !== runId
          || result.methodId !== profileId
        ) unavailable();
        return result;
      },
      sameAuthority: (observed, recovered) => observed.runId === recovered.runId
        && observed.status === recovered.status
        && observed.methodId === recovered.methodId
        && observed.methodVersion === recovered.methodVersion
        && observed.methodState === recovered.methodState,
      errorPayloadMustBeNull: true,
    });
  }

  async current(
    input: CurrentIyzicoSandboxEvidenceInput,
  ): Promise<CurrentIyzicoSandboxEvidenceResult> {
    const parsed = exactIyzicoSandboxEvidenceRecord(input, ["tenantContext", "now", "profileId"]);
    const now = evidenceDate(parsed.now);
    const authority = evidenceAuthority(parsed.tenantContext as TenantContext, now, "integrations");
    const profileId = evidenceUuid(parsed.profileId);
    return read(
      this.#options,
      Object.freeze({
        text: CURRENT_SQL,
        values: Object.freeze([
          authority.storeId,
          authority.principalId,
          authority.membershipId,
          authority.planId,
          authority.planCode,
          authority.planVersion,
          authority.now,
          profileId,
        ]),
      }),
      ["not_started", "current"],
      (value) => {
        const result = parseCurrent(value);
        if (result.profileId !== profileId) unavailable();
        return result;
      },
    );
  }

  async activate(
    input: ActivateIyzicoSandboxEvidenceInput,
  ): Promise<ActivateIyzicoSandboxEvidenceResult> {
    const parsed = exactIyzicoSandboxEvidenceRecord(input, [
      "tenantContext",
      "now",
      "operationId",
      "fingerprint",
      "methodId",
      "expectedMethodVersion",
      "attestationId",
      "expectedProfileVersion",
    ]);
    const now = evidenceDate(parsed.now);
    const authority = evidenceAuthority(parsed.tenantContext as TenantContext, now, "integrations");
    const methodId = evidenceUuid(parsed.methodId);
    const attestationId = evidenceUuid(parsed.attestationId);
    const expectedMethodVersion = evidenceInteger(
      parsed.expectedMethodVersion,
      1,
      Number.MAX_SAFE_INTEGER - 1,
    );
    const query = Object.freeze({
      text: ACTIVATE_SQL,
      values: Object.freeze([
        authority.storeId,
        authority.principalId,
        authority.membershipId,
        authority.planId,
        authority.planCode,
        authority.planVersion,
        authority.now,
        evidenceUuid(parsed.operationId),
        evidenceDigest(parsed.fingerprint),
        methodId,
        expectedMethodVersion,
        attestationId,
        evidenceInteger(parsed.expectedProfileVersion),
      ]),
    });
    return mutate(this.#options, {
      operation: "activate",
      query,
      success: ["state_changed", "operation_replayed"],
      parse(value) {
        const result = parseActivation(value);
        if (
          result.id !== methodId
          || result.activationAttestationId !== attestationId
          || result.version !== expectedMethodVersion + 1
        ) unavailable();
        return result;
      },
      sameAuthority: (observed, recovered) => observed.id === recovered.id
        && observed.state === recovered.state
        && observed.position === recovered.position
        && observed.version === recovered.version
        && observed.updatedAt === recovered.updatedAt
        && observed.activationAttestationId === recovered.activationAttestationId,
    });
  }

  async activateCurrent(
    input: ActivateCurrentIyzicoSandboxEvidenceInput,
  ): Promise<ActivateCurrentIyzicoSandboxEvidenceResult> {
    const parsed = exactIyzicoSandboxEvidenceRecord(input, [
      "tenantContext",
      "now",
      "operationId",
      "fingerprint",
      "methodId",
      "expectedMethodVersion",
    ]);
    const now = evidenceDate(parsed.now);
    const authority = evidenceAuthority(parsed.tenantContext as TenantContext, now, "integrations");
    const methodId = evidenceUuid(parsed.methodId);
    const expectedMethodVersion = evidenceInteger(
      parsed.expectedMethodVersion,
      1,
      Number.MAX_SAFE_INTEGER - 1,
    );
    const query = Object.freeze({
      text: ACTIVATE_CURRENT_SQL,
      values: Object.freeze([
        authority.storeId,
        authority.principalId,
        authority.membershipId,
        authority.planId,
        authority.planCode,
        authority.planVersion,
        authority.now,
        evidenceUuid(parsed.operationId),
        evidenceDigest(parsed.fingerprint),
        methodId,
        expectedMethodVersion,
      ]),
    });
    return mutate(this.#options, {
      operation: "activate_current",
      query,
      success: ["state_changed", "operation_replayed"],
      parse(value) {
        const result = parseActivation(value);
        if (result.id !== methodId || result.version !== expectedMethodVersion + 1) unavailable();
        return result;
      },
      sameAuthority: (observed, recovered) => observed.id === recovered.id
        && observed.state === recovered.state
        && observed.position === recovered.position
        && observed.version === recovered.version
        && observed.updatedAt === recovered.updatedAt
        && observed.activationAttestationId === recovered.activationAttestationId,
      errorPayloadMustBeNull: true,
    });
  }

  preflight(): Promise<true> {
    return preflight(this.#options);
  }

  activationRuntimePreflight(): Promise<true> {
    return preflight(this.#options, ACTIVATION_RUNTIME_PREFLIGHT_SQL);
  }
}

export class PostgresIyzicoSandboxEvidenceWorkflowRepository
implements IyzicoSandboxEvidenceActivationWorkflowRepository {
  readonly #options: RuntimeOptions;

  constructor(value: PostgresIyzicoSandboxEvidenceWorkflowRepositoryOptions) {
    this.#options = options(value, "celebix_saas_workflow", "workflow");
  }

  async claim(input: ClaimIyzicoSandboxEvidenceInput): Promise<ClaimIyzicoSandboxEvidenceResult> {
    const parsed = exactIyzicoSandboxEvidenceRecord(input, [
      "runId",
      "workerId",
      "leaseId",
      "now",
      "leaseExpiresAt",
    ]);
    const now = evidenceDate(parsed.now);
    const expiresAt = evidenceDate(parsed.leaseExpiresAt);
    evidenceLeaseWindow(now, expiresAt);
    const runId = evidenceUuid(parsed.runId);
    const leaseId = evidenceUuid(parsed.leaseId);
    const query = Object.freeze({
      text: CLAIM_SQL,
      values: Object.freeze([
        runId,
        evidenceWorker(parsed.workerId),
        leaseId,
        now,
        expiresAt,
      ]),
    });
    return mutate(this.#options, {
      operation: "claim",
      query,
      success: ["claimed", "operation_replayed"],
      parse(value) {
        const result = parseClaim(value);
        if (result.runId !== runId || result.leaseId !== leaseId) unavailable();
        return result;
      },
      sameAuthority: (observed, recovered) => observed.runId === recovered.runId
        && observed.leaseId === recovered.leaseId,
    });
  }

  async claimNext(
    input: ClaimNextIyzicoSandboxEvidenceInput,
  ): Promise<ClaimNextIyzicoSandboxEvidenceResult> {
    const parsed = exactIyzicoSandboxEvidenceRecord(input, [
      "workerId",
      "leaseId",
      "now",
      "leaseExpiresAt",
    ]);
    const now = evidenceDate(parsed.now);
    const expiresAt = evidenceDate(parsed.leaseExpiresAt);
    evidenceLeaseWindow(now, expiresAt);
    const leaseId = evidenceUuid(parsed.leaseId);
    const query = Object.freeze({
      text: CLAIM_NEXT_SQL,
      values: Object.freeze([
        evidenceWorker(parsed.workerId),
        leaseId,
        now,
        expiresAt,
      ]),
    });
    return mutate(this.#options, {
      operation: "claim_next",
      query,
      success: ["none", "claimed", "operation_replayed"],
      parse(value) {
        const result = parseClaimNext(value);
        if (result.outcome !== "none" && result.leaseId !== leaseId) unavailable();
        return result;
      },
      sameAuthority: (observed, recovered) => observed.outcome !== "none"
        && recovered.outcome !== "none"
        && observed.runId === recovered.runId
        && observed.storeId === recovered.storeId
        && observed.profileId === recovered.profileId
        && observed.adapterVersion === recovered.adapterVersion
        && observed.candidateEvidenceDigest === recovered.candidateEvidenceDigest
        && observed.profileVersion === recovered.profileVersion
        && observed.credentialVersion === recovered.credentialVersion
        && observed.leaseId === recovered.leaseId,
      errorPayloadMustBeNull: true,
    });
  }

  async claimedProfile(
    input: ClaimedIyzicoSandboxEvidenceProfileInput,
  ): Promise<ClaimedIyzicoSandboxEvidenceProfileResult> {
    const parsed = exactIyzicoSandboxEvidenceRecord(input, [
      "runId",
      "leaseId",
      "workerId",
      "now",
    ]);
    const runId = evidenceUuid(parsed.runId);
    const leaseId = evidenceUuid(parsed.leaseId);
    const workerId = evidenceWorker(parsed.workerId);
    return read(
      this.#options,
      Object.freeze({
        text: CLAIMED_PROFILE_SQL,
        values: Object.freeze([runId, leaseId, workerId, evidenceDate(parsed.now)]),
      }),
      ["current"],
      (value) => parseClaimedProfile(value),
    );
  }

  async recordEvent(
    input: RecordIyzicoSandboxEvidenceEventInput,
  ): Promise<RecordIyzicoSandboxEvidenceEventResult> {
    const parsed = exactIyzicoSandboxEvidenceRecord(input, [
      "runId",
      "leaseId",
      "workerId",
      "eventId",
      "caseKind",
      "eventKind",
      "attemptId",
      "observationDigest",
      "outcomeCode",
      "observedAt",
    ]);
    const matrix = evidenceCase(parsed.caseKind, parsed.eventKind, parsed.outcomeCode);
    const eventId = evidenceUuid(parsed.eventId);
    const query = Object.freeze({
      text: EVENT_SQL,
      values: Object.freeze([
        evidenceUuid(parsed.runId),
        evidenceUuid(parsed.leaseId),
        evidenceWorker(parsed.workerId),
        eventId,
        matrix.caseKind,
        matrix.eventKind,
        evidenceUuid(parsed.attemptId),
        evidenceDigest(parsed.observationDigest),
        matrix.outcomeCode,
        evidenceDate(parsed.observedAt),
      ]),
    });
    return mutate(this.#options, {
      operation: "record_event",
      query,
      success: ["recorded", "operation_replayed"],
      parse(value) {
        const result = parseEvent(value);
        if (result.eventId !== eventId) unavailable();
        return result;
      },
      sameAuthority: (observed, recovered) => observed.eventId === recovered.eventId,
    });
  }

  async finalize(
    input: FinalizeIyzicoSandboxEvidenceInput,
  ): Promise<FinalizeIyzicoSandboxEvidenceResult> {
    const parsed = exactIyzicoSandboxEvidenceRecord(input, [
      "runId",
      "leaseId",
      "workerId",
      "attestationId",
      "fingerprint",
      "now",
    ]);
    const attestationId = evidenceUuid(parsed.attestationId);
    const query = Object.freeze({
      text: FINALIZE_SQL,
      values: Object.freeze([
        evidenceUuid(parsed.runId),
        evidenceUuid(parsed.leaseId),
        evidenceWorker(parsed.workerId),
        attestationId,
        evidenceDigest(parsed.fingerprint),
        evidenceDate(parsed.now),
      ]),
    });
    return mutate(this.#options, {
      operation: "finalize",
      query,
      success: ["attested", "operation_replayed"],
      parse(value) {
        const result = parseFinalize(value);
        if (result.attestationId !== attestationId) unavailable();
        return result;
      },
      sameAuthority: (observed, recovered) => observed.attestationId === recovered.attestationId
        && observed.matrixDigest === recovered.matrixDigest,
    });
  }

  preflight(): Promise<true> {
    return preflight(this.#options);
  }
}
