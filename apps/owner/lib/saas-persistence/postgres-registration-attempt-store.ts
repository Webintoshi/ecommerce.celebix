import type { RegistrationAttempt, RegistrationAttemptStore } from "../self-serve-registration-orchestrator.ts";
import type { ValidatedRegistrationDetails } from "../self-serve-identity.ts";
import type { EncryptedPayload } from "./identity-crypto.ts";
import {
  IdentityPersistenceError,
  RegistrationPersistenceError,
  batchSize,
  byteValue,
  canonicalTimestamp,
  exactObject,
  requiredString,
  validateDependencies,
  withIdentityTransaction,
  type IdentityPostgresClient,
  type IdentityStoreDependencies,
} from "./postgres-identity-common.ts";

const PURPOSE = "saas.registration_workflows";
const SCHEMA_VERSION = 1;
const TERMINAL_STATUSES = new Set(["session_created", "failed", "expired", "cancelled"]);
type WorkflowStatus = RegistrationAttempt["status"];

interface StoredRegistrationPayload {
  id: string;
  details: ValidatedRegistrationDetails;
  idempotencyKey: string;
  requestedAt: string;
  createdAt: string;
  expiresAt: string;
}

export interface PersistentRegistrationWorkflow {
  attempt: StoredRegistrationPayload;
  status: WorkflowStatus;
  version: number;
  canonicalFingerprint?: string;
  consumedAt?: string;
  terminalAt?: string;
  failureCode?: string;
}

export interface RegistrationTransitionInput {
  attemptId: string;
  expectedStatus: WorkflowStatus;
  expectedVersion: number;
  now: Date;
}

function details(value: unknown): ValidatedRegistrationDetails {
  const row = exactObject(
    value,
    ["storeName", "storeSlug", "locale", "currency", "themeKey", "privacyAcceptedAt"],
    ["marketingAcceptedAt"],
  );
  const parsed: ValidatedRegistrationDetails = {
    storeName: requiredString(row.storeName, 160),
    storeSlug: requiredString(row.storeSlug, 48),
    locale: requiredString(row.locale, 16),
    currency: requiredString(row.currency, 3),
    themeKey: requiredString(row.themeKey, 64),
    privacyAcceptedAt: canonicalTimestamp(row.privacyAcceptedAt),
  };
  if (row.marketingAcceptedAt !== undefined) parsed.marketingAcceptedAt = canonicalTimestamp(row.marketingAcceptedAt);
  return parsed;
}

function payload(value: unknown): StoredRegistrationPayload {
  const row = exactObject(value, ["id", "details", "idempotencyKey", "requestedAt", "createdAt", "expiresAt"]);
  const parsed = {
    id: requiredString(row.id, 160),
    details: details(row.details),
    idempotencyKey: requiredString(row.idempotencyKey, 160),
    requestedAt: canonicalTimestamp(row.requestedAt),
    createdAt: canonicalTimestamp(row.createdAt),
    expiresAt: canonicalTimestamp(row.expiresAt),
  };
  if (!/^attempt_[A-Za-z0-9_-]{16,128}$/.test(parsed.id) || !/^[A-Za-z0-9_-]{16,128}$/.test(parsed.idempotencyKey)) {
    throw new IdentityPersistenceError();
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parsed.details.storeSlug) || !/^[A-Z]{3}$/.test(parsed.details.currency)) {
    throw new IdentityPersistenceError();
  }
  if (Date.parse(parsed.expiresAt) <= Date.parse(parsed.createdAt)) throw new IdentityPersistenceError();
  return parsed;
}

function attempt(value: unknown): RegistrationAttempt {
  const row = exactObject(
    value,
    ["id", "state", "details", "idempotencyKey", "requestedAt", "status", "createdAt", "expiresAt"],
    ["canonicalFingerprint"],
  );
  const status = requiredString(row.status) as WorkflowStatus;
  if (!["awaiting_identity", "identity_verified", "tenant_created", "session_created", "failed", "expired", "cancelled"].includes(status)) {
    throw new IdentityPersistenceError();
  }
  const base = payload({
    id: row.id,
    details: row.details,
    idempotencyKey: row.idempotencyKey,
    requestedAt: row.requestedAt,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  });
  const rawState = requiredString(row.state, 1024);
  if (rawState.length < 16) throw new IdentityPersistenceError();
  const parsed: RegistrationAttempt = { ...base, state: rawState, status };
  if (row.canonicalFingerprint !== undefined) {
    const fingerprint = requiredString(row.canonicalFingerprint, 64);
    if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new IdentityPersistenceError();
    parsed.canonicalFingerprint = fingerprint;
  }
  return parsed;
}

function timestamp(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return value.toISOString();
  return canonicalTimestamp(value);
}

function integer(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (!Number.isSafeInteger(parsed) || (parsed as number) < 1) throw new IdentityPersistenceError();
  return parsed as number;
}

function status(value: unknown): WorkflowStatus {
  const parsed = requiredString(value) as WorkflowStatus;
  if (!["awaiting_identity", "identity_verified", "tenant_created", "session_created", "failed", "expired", "cancelled"].includes(parsed)) {
    throw new IdentityPersistenceError();
  }
  return parsed;
}

function encrypted(row: Record<string, unknown>): EncryptedPayload {
  return {
    keyId: requiredString(row.encryption_key_id, 128),
    iv: byteValue(row.payload_iv),
    ciphertext: byteValue(row.payload_ciphertext),
  };
}

export class PostgresRegistrationAttemptStore implements RegistrationAttemptStore {
  private readonly options: IdentityStoreDependencies;

  constructor(options: IdentityStoreDependencies) {
    this.options = validateDependencies(options);
  }

  async save(input: RegistrationAttempt): Promise<void> {
    const validated = attempt(input);
    if (validated.status !== "awaiting_identity" || validated.canonicalFingerprint !== undefined) throw new IdentityPersistenceError();
    const digest = this.options.stateDigester.digest(validated.state);
    const stored: StoredRegistrationPayload = {
      id: validated.id,
      details: validated.details,
      idempotencyKey: validated.idempotencyKey,
      requestedAt: validated.requestedAt,
      createdAt: validated.createdAt,
      expiresAt: validated.expiresAt,
    };
    const sealed = this.options.payloadCipher.encrypt({
      binding: { purpose: PURPOSE, stateDigest: digest, schemaVersion: SCHEMA_VERSION, recordId: validated.id },
      payload: stored,
    });
    await withIdentityTransaction(this.options, "registration", async (client) => {
      try {
        await client.query(
          "INSERT INTO saas.registration_workflows (attempt_id, state_digest, payload_ciphertext, payload_iv, encryption_key_id, payload_schema_version, status, version, requested_at, created_at, updated_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6, 'awaiting_identity', 1, $7::timestamptz, $8::timestamptz, $8::timestamptz, $9::timestamptz)",
          [validated.id, digest, Buffer.from(sealed.ciphertext), Buffer.from(sealed.iv), sealed.keyId, SCHEMA_VERSION, validated.requestedAt, validated.createdAt, validated.expiresAt],
        );
      } catch (error) {
        if ((error as { code?: unknown })?.code === "23505") throw new RegistrationPersistenceError("registration_attempt_conflict");
        throw error;
      }
    });
  }

  async consume(rawState: string, now = this.options.clock()): Promise<RegistrationAttempt> {
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new IdentityPersistenceError();
    const digest = this.options.stateDigester.digest(rawState);
    const canonicalNow = now.toISOString();
    const row = await withIdentityTransaction(this.options, "registration", async (client) => {
      const result = await client.query(
        "UPDATE saas.registration_workflows SET consumed_at = $2::timestamptz, status = CASE WHEN expires_at <= $2::timestamptz THEN 'expired' ELSE status END, terminal_at = CASE WHEN expires_at <= $2::timestamptz THEN $2::timestamptz ELSE terminal_at END, version = CASE WHEN expires_at <= $2::timestamptz THEN version + 1 ELSE version END, updated_at = $2::timestamptz WHERE state_digest = $1 AND status = 'awaiting_identity' AND consumed_at IS NULL RETURNING attempt_id, state_digest, payload_ciphertext, payload_iv, encryption_key_id, payload_schema_version, status",
        [digest, canonicalNow],
      );
      const updated = result.rows[0];
      if (!updated) {
        const classified = await client.query(
          "SELECT status, consumed_at FROM saas.registration_workflows WHERE state_digest = $1",
          [digest],
        );
        if (!classified.rows[0]) throw new RegistrationPersistenceError("registration_attempt_missing");
        throw new RegistrationPersistenceError("registration_attempt_replayed");
      }
      return updated;
    });
    if (status(row.status) === "expired") throw new RegistrationPersistenceError("registration_attempt_expired");
    const recordId = requiredString(row.attempt_id, 160);
    const decoded = this.options.payloadCipher.decrypt({
      binding: { purpose: PURPOSE, stateDigest: digest, schemaVersion: integer(row.payload_schema_version), recordId },
      encrypted: encrypted(row),
    });
    const stored = payload(decoded);
    if (stored.id !== recordId) throw new IdentityPersistenceError();
    return { ...stored, state: rawState, status: status(row.status) };
  }

  async load(attemptId: string): Promise<PersistentRegistrationWorkflow> {
    const id = requiredString(attemptId, 160);
    return withIdentityTransaction(this.options, "registration", async (client) => {
      const result = await client.query(
        "SELECT attempt_id, state_digest, payload_ciphertext, payload_iv, encryption_key_id, payload_schema_version, status, version, canonical_fingerprint, consumed_at, terminal_at, failure_code FROM saas.registration_workflows WHERE attempt_id = $1",
        [id],
      );
      if (!result.rows[0]) throw new RegistrationPersistenceError("registration_attempt_missing");
      return this.parseWorkflow(result.rows[0]);
    });
  }

  async markIdentityVerified(input: RegistrationTransitionInput & { canonicalFingerprint?: string }) {
    return this.transition(input, "identity_verified", input.canonicalFingerprint);
  }
  async markTenantCreated(input: RegistrationTransitionInput) { return this.transition(input, "tenant_created"); }
  async markSessionCreated(input: RegistrationTransitionInput) { return this.transition(input, "session_created"); }
  async markFailed(input: RegistrationTransitionInput & { failureCode: string }) {
    return this.transition(input, "failed", undefined, requiredString(input.failureCode, 64));
  }
  async markExpired(input: RegistrationTransitionInput) { return this.transition(input, "expired"); }
  async markCancelled(input: RegistrationTransitionInput) { return this.transition(input, "cancelled"); }

  async cleanupTerminal(cutoff: Date, maximumRows: number): Promise<number> {
    if (!(cutoff instanceof Date) || !Number.isFinite(cutoff.getTime())) throw new IdentityPersistenceError();
    const limit = batchSize(maximumRows);
    return withIdentityTransaction(this.options, "cleanup", async (client) => {
      const result = await client.query(
        "WITH candidates AS (SELECT attempt_id FROM saas.registration_workflows WHERE status IN ('session_created', 'failed', 'expired', 'cancelled') AND terminal_at < $1::timestamptz ORDER BY terminal_at, attempt_id FOR UPDATE SKIP LOCKED LIMIT $2), deleted AS (DELETE FROM saas.registration_workflows AS workflow USING candidates WHERE workflow.attempt_id = candidates.attempt_id RETURNING workflow.attempt_id) SELECT count(*)::integer AS deleted_count FROM deleted",
        [cutoff.toISOString(), limit],
      );
      const count = result.rows[0]?.deleted_count;
      if (!Number.isInteger(count) || (count as number) < 0 || (count as number) > limit) throw new IdentityPersistenceError();
      return count as number;
    });
  }

  private parseWorkflow(row: Record<string, unknown>): PersistentRegistrationWorkflow {
    const id = requiredString(row.attempt_id, 160);
    const digest = requiredString(row.state_digest, 64);
    const decoded = this.options.payloadCipher.decrypt({
      binding: { purpose: PURPOSE, stateDigest: digest, schemaVersion: integer(row.payload_schema_version), recordId: id },
      encrypted: encrypted(row),
    });
    const stored = payload(decoded);
    if (stored.id !== id) throw new IdentityPersistenceError();
    const workflow: PersistentRegistrationWorkflow = { attempt: stored, status: status(row.status), version: integer(row.version) };
    if (row.canonical_fingerprint !== null && row.canonical_fingerprint !== undefined) {
      const fingerprint = requiredString(row.canonical_fingerprint, 64);
      if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new IdentityPersistenceError();
      workflow.canonicalFingerprint = fingerprint;
    }
    const consumedAt = timestamp(row.consumed_at);
    const terminalAt = timestamp(row.terminal_at);
    if (consumedAt) workflow.consumedAt = consumedAt;
    if (terminalAt) workflow.terminalAt = terminalAt;
    if (row.failure_code !== null && row.failure_code !== undefined) workflow.failureCode = requiredString(row.failure_code, 64);
    return workflow;
  }

  private async transition(
    input: RegistrationTransitionInput,
    next: WorkflowStatus,
    fingerprint?: string,
    failureCode?: string,
  ): Promise<PersistentRegistrationWorkflow> {
    const attemptId = requiredString(input.attemptId, 160);
    const expected = status(input.expectedStatus);
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) throw new IdentityPersistenceError();
    if (!(input.now instanceof Date) || !Number.isFinite(input.now.getTime())) throw new IdentityPersistenceError();
    const allowed: Record<WorkflowStatus, readonly WorkflowStatus[]> = {
      awaiting_identity: ["identity_verified", "failed", "expired", "cancelled"],
      identity_verified: ["tenant_created", "failed", "expired", "cancelled"],
      tenant_created: ["session_created", "failed", "cancelled"],
      session_created: [], failed: [], expired: [], cancelled: [],
    };
    if (!allowed[expected].includes(next) || TERMINAL_STATUSES.has(expected)) {
      throw new RegistrationPersistenceError("registration_workflow_invalid_transition");
    }
    let canonicalFingerprint = fingerprint;
    if (canonicalFingerprint !== undefined && !/^[a-f0-9]{64}$/.test(canonicalFingerprint)) throw new IdentityPersistenceError();
    return withIdentityTransaction(this.options, "registration", async (client: IdentityPostgresClient) => {
      const result = await client.query(
        "UPDATE saas.registration_workflows SET status = $4, version = version + 1, canonical_fingerprint = CASE WHEN $4 = 'identity_verified' AND $5::text IS NOT NULL THEN $5 ELSE canonical_fingerprint END, failure_code = CASE WHEN $4 = 'failed' THEN $6 ELSE NULL END, terminal_at = CASE WHEN $4 IN ('session_created', 'failed', 'expired', 'cancelled') THEN $3::timestamptz ELSE NULL END, updated_at = $3::timestamptz WHERE attempt_id = $1 AND status = $2 AND version = $7 AND ($4 <> 'tenant_created' OR canonical_fingerprint IS NOT NULL) RETURNING attempt_id, state_digest, payload_ciphertext, payload_iv, encryption_key_id, payload_schema_version, status, version, canonical_fingerprint, consumed_at, terminal_at, failure_code",
        [attemptId, expected, input.now.toISOString(), next, canonicalFingerprint ?? null, failureCode ?? null, input.expectedVersion],
      );
      if (!result.rows[0]) {
        const current = await client.query("SELECT status, version FROM saas.registration_workflows WHERE attempt_id = $1", [attemptId]);
        if (!current.rows[0]) throw new RegistrationPersistenceError("registration_attempt_missing");
        const currentStatus = status(current.rows[0].status);
        if (currentStatus !== expected || integer(current.rows[0].version) !== input.expectedVersion) {
          throw new RegistrationPersistenceError("registration_workflow_conflict");
        }
        throw new RegistrationPersistenceError("registration_workflow_invalid_transition");
      }
      return this.parseWorkflow(result.rows[0]);
    });
  }
}
