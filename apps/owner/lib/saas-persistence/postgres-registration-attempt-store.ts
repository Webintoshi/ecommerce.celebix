import type { CreateStarterTenantInput } from "@celebix/saas-contracts";

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
import {
  buildVerifiedTenantAuthority,
  parseVerifiedIdentitySnapshot,
  type VerifiedIdentitySnapshot,
} from "./verified-identity.ts";

const PURPOSE = "saas.registration_workflows";
const SCHEMA_VERSION = 1;
const VERIFIED_IDENTITY_PURPOSE = "saas.registration_verified_identities";
const VERIFIED_IDENTITY_SCHEMA_VERSION = 1;
const TERMINAL_STATUSES = new Set(["session_created", "failed", "expired", "cancelled"]);
type WorkflowStatus = RegistrationAttempt["status"];

export interface StoredRegistrationPayload {
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
  verifiedIdentity?: VerifiedIdentitySnapshot;
  tenantInput?: CreateStarterTenantInput;
}

export interface VerifiedRegistrationAuthority extends PersistentRegistrationWorkflow {
  canonicalFingerprint: string;
  verifiedIdentity: VerifiedIdentitySnapshot;
  tenantInput: CreateStarterTenantInput;
}

export interface RecordVerifiedIdentityInput {
  attemptId: string;
  expectedVersion: number;
  identity: unknown;
  now: Date;
}

export type RecordVerifiedIdentityOutcome = {
  kind: "recorded" | "already_recorded";
  authority: VerifiedRegistrationAuthority;
};

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
  if (parsed.locale !== "tr" || parsed.currency !== "TRY") throw new IdentityPersistenceError();
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

function persistedTimestamp(value: unknown): string {
  const parsed = timestamp(value);
  if (!parsed) throw new IdentityPersistenceError();
  return parsed;
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

const WORKFLOW_WITH_IDENTITY_SELECT = `SELECT
  workflow.attempt_id, workflow.state_digest, workflow.payload_ciphertext, workflow.payload_iv,
  workflow.encryption_key_id, workflow.payload_schema_version, workflow.status, workflow.version,
  workflow.canonical_fingerprint, workflow.requested_at, workflow.created_at, workflow.expires_at,
  workflow.consumed_at, workflow.terminal_at, workflow.failure_code,
  snapshot.attempt_id AS verified_attempt_id,
  snapshot.canonical_fingerprint AS verified_canonical_fingerprint,
  snapshot.payload_ciphertext AS verified_payload_ciphertext,
  snapshot.payload_iv AS verified_payload_iv,
  snapshot.encryption_key_id AS verified_encryption_key_id,
  snapshot.payload_schema_version AS verified_payload_schema_version,
  snapshot.recorded_at AS verified_recorded_at
FROM saas.registration_workflows AS workflow
LEFT JOIN saas.registration_verified_identities AS snapshot ON snapshot.attempt_id = workflow.attempt_id`;

function sameVerifiedIdentity(left: VerifiedIdentitySnapshot, right: VerifiedIdentitySnapshot): boolean {
  return left.issuer === right.issuer &&
    left.subject === right.subject &&
    left.email === right.email &&
    left.emailVerified === right.emailVerified &&
    left.displayName === right.displayName;
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
    const outcome = await withIdentityTransaction(this.options, "registration", async (client) => {
      const selected = await client.query(
        "SELECT attempt_id, state_digest, payload_ciphertext, payload_iv, encryption_key_id, payload_schema_version, status, requested_at, created_at, expires_at, consumed_at FROM saas.registration_workflows WHERE state_digest = $1",
        [digest],
      );
      const row = selected.rows[0];
      if (!row) throw new RegistrationPersistenceError("registration_attempt_missing");
      const current = status(row.status);
      if (current === "expired") throw new RegistrationPersistenceError("registration_attempt_expired");
      if (current !== "awaiting_identity" || row.consumed_at !== null) {
        throw new RegistrationPersistenceError("registration_attempt_replayed");
      }
      const recordId = requiredString(row.attempt_id, 160);
      const stored = payload(this.options.payloadCipher.decrypt({
        binding: { purpose: PURPOSE, stateDigest: digest, schemaVersion: integer(row.payload_schema_version), recordId },
        encrypted: encrypted(row),
      }));
      if (
        stored.id !== recordId ||
        stored.requestedAt !== persistedTimestamp(row.requested_at) ||
        stored.createdAt !== persistedTimestamp(row.created_at) ||
        stored.expiresAt !== persistedTimestamp(row.expires_at)
      ) throw new IdentityPersistenceError();
      const expired = Date.parse(stored.expiresAt) <= now.getTime();
      const updated = await client.query(
        "UPDATE saas.registration_workflows SET consumed_at = $2::timestamptz, status = $3, terminal_at = CASE WHEN $3 = 'expired' THEN $2::timestamptz ELSE terminal_at END, version = CASE WHEN $3 = 'expired' THEN version + 1 ELSE version END, updated_at = $2::timestamptz WHERE state_digest = $1 AND status = 'awaiting_identity' AND consumed_at IS NULL AND requested_at = $4::timestamptz AND created_at = $5::timestamptz AND expires_at = $6::timestamptz RETURNING status",
        [digest, canonicalNow, expired ? "expired" : "awaiting_identity", stored.requestedAt, stored.createdAt, stored.expiresAt],
      );
      if (!updated.rows[0]) {
        const classified = await client.query("SELECT status, consumed_at FROM saas.registration_workflows WHERE state_digest = $1", [digest]);
        const raced = classified.rows[0];
        if (!raced) throw new RegistrationPersistenceError("registration_attempt_missing");
        if (status(raced.status) === "expired") throw new RegistrationPersistenceError("registration_attempt_expired");
        throw new RegistrationPersistenceError("registration_attempt_replayed");
      }
      return { stored, expired };
    });
    if (outcome.expired) throw new RegistrationPersistenceError("registration_attempt_expired");
    return { ...outcome.stored, state: rawState, status: "awaiting_identity" };
  }

  async load(attemptId: string): Promise<PersistentRegistrationWorkflow> {
    const id = requiredString(attemptId, 160);
    return withIdentityTransaction(this.options, "registration", async (client) => {
      const result = await client.query(
        `${WORKFLOW_WITH_IDENTITY_SELECT} WHERE workflow.attempt_id = $1`,
        [id],
      );
      if (!result.rows[0]) throw new RegistrationPersistenceError("registration_attempt_missing");
      return this.parseLoadedWorkflow(result.rows[0]);
    });
  }

  async loadVerified(attemptId: string): Promise<VerifiedRegistrationAuthority> {
    const workflow = await this.load(attemptId);
    if (!workflow.canonicalFingerprint || !workflow.verifiedIdentity || !workflow.tenantInput) {
      throw new RegistrationPersistenceError("registration_verified_identity_missing");
    }
    return workflow as VerifiedRegistrationAuthority;
  }

  async recordVerifiedIdentity(input: RecordVerifiedIdentityInput): Promise<RecordVerifiedIdentityOutcome> {
    const attemptId = requiredString(input.attemptId, 160);
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) throw new IdentityPersistenceError();
    if (!(input.now instanceof Date) || !Number.isFinite(input.now.getTime())) throw new IdentityPersistenceError();
    const verifiedIdentity = parseVerifiedIdentitySnapshot(input.identity);

    return withIdentityTransaction(this.options, "registration", async (client) => {
      const selected = await client.query(
        `${WORKFLOW_WITH_IDENTITY_SELECT} WHERE workflow.attempt_id = $1 FOR UPDATE OF workflow`,
        [attemptId],
      );
      if (!selected.rows[0]) throw new RegistrationPersistenceError("registration_attempt_missing");
      let selectedRow = selected.rows[0];
      const workflow = this.parseWorkflow(selectedRow);

      if (workflow.status === "identity_verified") {
        if (selectedRow.verified_attempt_id == null) {
          const refreshed = await client.query(
            `${WORKFLOW_WITH_IDENTITY_SELECT} WHERE workflow.attempt_id = $1`,
            [attemptId],
          );
          if (!refreshed.rows[0]) throw new RegistrationPersistenceError("registration_attempt_missing");
          selectedRow = refreshed.rows[0];
        }
        const existing = await this.parseVerifiedAuthority(selectedRow);
        const candidate = await buildVerifiedTenantAuthority(verifiedIdentity, workflow.attempt);
        if (
          !sameVerifiedIdentity(existing.verifiedIdentity, verifiedIdentity) ||
          existing.canonicalFingerprint !== candidate.canonicalFingerprint
        ) {
          throw new RegistrationPersistenceError("registration_verified_identity_conflict");
        }
        return { kind: "already_recorded", authority: existing };
      }

      if (workflow.status !== "awaiting_identity") {
        throw new RegistrationPersistenceError("registration_workflow_invalid_transition");
      }
      if (!workflow.consumedAt) throw new RegistrationPersistenceError("registration_identity_not_consumed");
      if (workflow.version !== input.expectedVersion) throw new RegistrationPersistenceError("registration_workflow_conflict");
      if (workflow.canonicalFingerprint || selected.rows[0].verified_attempt_id != null) throw new IdentityPersistenceError();

      const authority = await buildVerifiedTenantAuthority(verifiedIdentity, workflow.attempt);
      const sealed = this.options.payloadCipher.encrypt({
        binding: {
          purpose: VERIFIED_IDENTITY_PURPOSE,
          stateDigest: authority.canonicalFingerprint,
          schemaVersion: VERIFIED_IDENTITY_SCHEMA_VERSION,
          recordId: attemptId,
        },
        payload: verifiedIdentity,
      });
      try {
        await client.query(
          "INSERT INTO saas.registration_verified_identities (attempt_id, canonical_fingerprint, payload_ciphertext, payload_iv, encryption_key_id, payload_schema_version, recorded_at) VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)",
          [attemptId, authority.canonicalFingerprint, Buffer.from(sealed.ciphertext), Buffer.from(sealed.iv), sealed.keyId, VERIFIED_IDENTITY_SCHEMA_VERSION, input.now.toISOString()],
        );
      } catch (error) {
        if ((error as { code?: unknown })?.code === "23505") {
          throw new RegistrationPersistenceError("registration_verified_identity_conflict");
        }
        throw error;
      }
      const updated = await client.query(
        "UPDATE saas.registration_workflows SET status = 'identity_verified', version = version + 1, canonical_fingerprint = $2, updated_at = $3::timestamptz WHERE attempt_id = $1 AND status = 'awaiting_identity' AND consumed_at IS NOT NULL AND version = $4 AND canonical_fingerprint IS NULL RETURNING attempt_id, state_digest, payload_ciphertext, payload_iv, encryption_key_id, payload_schema_version, status, version, canonical_fingerprint, requested_at, created_at, expires_at, consumed_at, terminal_at, failure_code",
        [attemptId, authority.canonicalFingerprint, input.now.toISOString(), input.expectedVersion],
      );
      if (!updated.rows[0]) throw new RegistrationPersistenceError("registration_workflow_conflict");
      const transitioned = this.parseWorkflow(updated.rows[0]);
      return {
        kind: "recorded",
        authority: {
          ...transitioned,
          canonicalFingerprint: authority.canonicalFingerprint,
          verifiedIdentity,
          tenantInput: authority.input,
        },
      };
    });
  }
  async markTenantCreated(input: RegistrationTransitionInput) { return this.transition(input, "tenant_created"); }
  async markSessionCreated(input: RegistrationTransitionInput) { return this.transition(input, "session_created"); }
  async markFailed(input: RegistrationTransitionInput & { failureCode: string }) {
    return this.transition(input, "failed", undefined, requiredString(input.failureCode, 64));
  }
  async markExpired(input: RegistrationTransitionInput) { return this.transition(input, "expired"); }
  async markCancelled(input: RegistrationTransitionInput) { return this.transition(input, "cancelled"); }

  async expireDue(cutoff: Date, maximumRows: number): Promise<number> {
    if (!(cutoff instanceof Date) || !Number.isFinite(cutoff.getTime())) throw new IdentityPersistenceError();
    const limit = batchSize(maximumRows);
    return withIdentityTransaction(this.options, "cleanup", async (client) => {
      const result = await client.query(
        "WITH candidates AS (SELECT attempt_id FROM saas.registration_workflows WHERE status IN ('awaiting_identity', 'identity_verified') AND expires_at <= $1::timestamptz ORDER BY expires_at, attempt_id FOR UPDATE SKIP LOCKED LIMIT $2), expired AS (UPDATE saas.registration_workflows AS workflow SET status = 'expired', version = version + 1, terminal_at = $1::timestamptz, updated_at = $1::timestamptz FROM candidates WHERE workflow.attempt_id = candidates.attempt_id AND workflow.status IN ('awaiting_identity', 'identity_verified') RETURNING workflow.attempt_id) SELECT count(*)::integer AS expired_count FROM expired",
        [cutoff.toISOString(), limit],
      );
      const count = result.rows[0]?.expired_count;
      if (!Number.isInteger(count) || (count as number) < 0 || (count as number) > limit) throw new IdentityPersistenceError();
      return count as number;
    });
  }

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
    if (
      stored.id !== id ||
      stored.requestedAt !== persistedTimestamp(row.requested_at) ||
      stored.createdAt !== persistedTimestamp(row.created_at) ||
      stored.expiresAt !== persistedTimestamp(row.expires_at)
    ) throw new IdentityPersistenceError();
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

  private async parseLoadedWorkflow(row: Record<string, unknown>): Promise<PersistentRegistrationWorkflow> {
    const workflow = this.parseWorkflow(row);
    const hasSnapshot = row.verified_attempt_id !== null && row.verified_attempt_id !== undefined;
    const requiresSnapshot = workflow.canonicalFingerprint !== undefined ||
      ["identity_verified", "tenant_created", "session_created"].includes(workflow.status);
    if (!requiresSnapshot) {
      if (hasSnapshot) throw new IdentityPersistenceError();
      return workflow;
    }
    return this.parseVerifiedAuthority(row);
  }

  private async parseVerifiedAuthority(row: Record<string, unknown>): Promise<VerifiedRegistrationAuthority> {
    const workflow = this.parseWorkflow(row);
    const attemptId = requiredString(row.verified_attempt_id, 160);
    if (attemptId !== workflow.attempt.id || !workflow.canonicalFingerprint) throw new IdentityPersistenceError();
    const snapshotFingerprint = requiredString(row.verified_canonical_fingerprint, 64);
    if (!/^[a-f0-9]{64}$/.test(snapshotFingerprint) || snapshotFingerprint !== workflow.canonicalFingerprint) {
      throw new IdentityPersistenceError();
    }
    persistedTimestamp(row.verified_recorded_at);
    const schemaVersion = integer(row.verified_payload_schema_version);
    if (schemaVersion !== VERIFIED_IDENTITY_SCHEMA_VERSION) throw new IdentityPersistenceError();
    const decoded = this.options.payloadCipher.decrypt({
      binding: {
        purpose: VERIFIED_IDENTITY_PURPOSE,
        stateDigest: snapshotFingerprint,
        schemaVersion,
        recordId: attemptId,
      },
      encrypted: {
        keyId: requiredString(row.verified_encryption_key_id, 128),
        iv: byteValue(row.verified_payload_iv),
        ciphertext: byteValue(row.verified_payload_ciphertext),
      },
    });
    const verifiedIdentity = parseVerifiedIdentitySnapshot(decoded);
    const authority = await buildVerifiedTenantAuthority(verifiedIdentity, workflow.attempt);
    if (authority.canonicalFingerprint !== snapshotFingerprint) throw new IdentityPersistenceError();
    return {
      ...workflow,
      canonicalFingerprint: snapshotFingerprint,
      verifiedIdentity,
      tenantInput: authority.input,
    };
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
        "UPDATE saas.registration_workflows SET status = $4, version = version + 1, canonical_fingerprint = CASE WHEN $4 = 'identity_verified' AND $5::text IS NOT NULL THEN $5 ELSE canonical_fingerprint END, failure_code = CASE WHEN $4 = 'failed' THEN $6 ELSE NULL END, terminal_at = CASE WHEN $4 IN ('session_created', 'failed', 'expired', 'cancelled') THEN $3::timestamptz ELSE NULL END, updated_at = $3::timestamptz WHERE attempt_id = $1 AND status = $2 AND version = $7 AND ($4 <> 'tenant_created' OR canonical_fingerprint IS NOT NULL) RETURNING attempt_id, state_digest, payload_ciphertext, payload_iv, encryption_key_id, payload_schema_version, status, version, canonical_fingerprint, requested_at, created_at, expires_at, consumed_at, terminal_at, failure_code",
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
