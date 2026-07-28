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
  BeginIyzicoSandboxEvidenceInput,
  BeginIyzicoSandboxEvidenceResult,
  ClaimIyzicoSandboxEvidenceInput,
  ClaimIyzicoSandboxEvidenceResult,
  FinalizeIyzicoSandboxEvidenceInput,
  FinalizeIyzicoSandboxEvidenceResult,
  IyzicoSandboxEvidenceAppRepository,
  IyzicoSandboxEvidenceAuditEvent,
  IyzicoSandboxEvidenceWorkflowRepository,
  PostgresIyzicoSandboxEvidenceAppRepositoryOptions,
  PostgresIyzicoSandboxEvidenceWorkflowRepositoryOptions,
  RecordIyzicoSandboxEvidenceEventInput,
  RecordIyzicoSandboxEvidenceEventResult,
} from "./types.ts";
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
}>;

const DATABASE_ERRORS = new Set<IyzicoSandboxEvidenceErrorCode>(
  IYZICO_SANDBOX_EVIDENCE_ERROR_CODES.filter(
    (code) => code !== "unavailable" && code !== "commit_unknown",
  ),
);

const BEGIN_SQL = "SELECT outcome,result_payload FROM saas.iyzico_iframe_tenant_evidence_begin($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint,$12::bigint,$13::text,$14::integer)";
const CLAIM_SQL = "SELECT outcome,result_payload FROM saas.iyzico_iframe_tenant_evidence_claim($1::uuid,$2::text,$3::uuid,$4::timestamptz,$5::timestamptz)";
const EVENT_SQL = "SELECT outcome,result_payload FROM saas.iyzico_iframe_tenant_evidence_record_event($1::uuid,$2::uuid,$3::text,$4::uuid,$5::text,$6::text,$7::uuid,$8::text,$9::text,$10::timestamptz)";
const FINALIZE_SQL = "SELECT outcome,result_payload FROM saas.iyzico_iframe_tenant_evidence_finalize($1::uuid,$2::uuid,$3::text,$4::uuid,$5::text,$6::timestamptz)";
const ACTIVATE_SQL = "SELECT outcome,result_payload FROM saas.iyzico_iframe_tenant_evidence_activate($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint,$12::uuid,$13::bigint)";
const PREFLIGHT_SQL = "SELECT saas.iyzico_iframe_tenant_evidence_preflight() AS ready";

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

async function preflight(value: RuntimeOptions): Promise<true> {
  let client: PostgresClientLike | undefined;
  let active = false;
  let released = false;
  try {
    client = await acquirePostgresClient(value.pool, value.timeouts.poolCheckoutMs);
    active = true;
    await configure(client, value, true);
    const row = outputRecord(oneRow(await client.query(PREFLIGHT_SQL)), ["ready"]);
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
implements IyzicoSandboxEvidenceAppRepository {
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

  preflight(): Promise<true> {
    return preflight(this.#options);
  }
}

export class PostgresIyzicoSandboxEvidenceWorkflowRepository
implements IyzicoSandboxEvidenceWorkflowRepository {
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
