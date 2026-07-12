import { PANEL_OIDC_CALLBACK_URL } from "../../../../packages/platform-config/src/saas.ts";
import {
  OidcFlowError,
  type OidcAuthorizationTransaction,
  type OidcTransactionStore,
} from "../self-serve-oidc.ts";
import type { EncryptedPayload } from "./identity-crypto.ts";
import {
  IdentityPersistenceError,
  batchSize,
  byteValue,
  canonicalTimestamp,
  exactObject,
  requiredString,
  validateDependencies,
  withIdentityTransaction,
  type IdentityStoreDependencies,
} from "./postgres-identity-common.ts";

const PURPOSE = "saas.oidc_transactions";
const SCHEMA_VERSION = 1;

interface StoredOidcPayload extends Omit<OidcAuthorizationTransaction, "state"> {}

function callback(value: unknown): string {
  const parsed = requiredString(value, 2048);
  if (parsed === PANEL_OIDC_CALLBACK_URL) return parsed;
  try {
    const url = new URL(parsed);
    if (
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]") &&
      url.pathname === "/auth/callback" && !url.search && !url.hash && !url.username && !url.password
    ) return parsed;
  } catch { /* controlled below */ }
  throw new OidcFlowError("oidc_invalid_callback", "OIDC callback URL is invalid.");
}

function payload(value: unknown): StoredOidcPayload {
  const row = exactObject(value, [
    "nonce", "codeVerifier", "redirectUri", "returnTo", "expectedIssuer", "expectedAudience", "createdAt", "expiresAt",
  ]);
  const createdAt = canonicalTimestamp(row.createdAt);
  const expiresAt = canonicalTimestamp(row.expiresAt);
  if (Date.parse(expiresAt) <= Date.parse(createdAt)) throw new OidcFlowError("oidc_invalid_state", "OIDC transaction is invalid.");
  if (row.returnTo !== "/kayit") throw new OidcFlowError("oidc_invalid_state", "OIDC transaction is invalid.");
  const nonce = requiredString(row.nonce, 512);
  const codeVerifier = requiredString(row.codeVerifier, 512);
  if (nonce.length < 16 || codeVerifier.length < 43 || codeVerifier.length > 128) {
    throw new OidcFlowError("oidc_invalid_state", "OIDC transaction is invalid.");
  }
  return {
    nonce,
    codeVerifier,
    redirectUri: callback(row.redirectUri),
    returnTo: "/kayit",
    expectedIssuer: requiredString(row.expectedIssuer, 2048),
    expectedAudience: requiredString(row.expectedAudience, 512),
    createdAt,
    expiresAt,
  };
}

function transaction(value: unknown): OidcAuthorizationTransaction {
  const row = exactObject(value, [
    "state", "nonce", "codeVerifier", "redirectUri", "returnTo", "expectedIssuer", "expectedAudience", "createdAt", "expiresAt",
  ]);
  const state = requiredString(row.state, 1024);
  if (state.length < 16) throw new OidcFlowError("oidc_invalid_state", "OIDC transaction is invalid.");
  return { state, ...payload({
    nonce: row.nonce,
    codeVerifier: row.codeVerifier,
    redirectUri: row.redirectUri,
    returnTo: row.returnTo,
    expectedIssuer: row.expectedIssuer,
    expectedAudience: row.expectedAudience,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  }) };
}

function integer(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (!Number.isSafeInteger(parsed) || (parsed as number) < 1) throw new IdentityPersistenceError();
  return parsed as number;
}

function encrypted(row: Record<string, unknown>): EncryptedPayload {
  return {
    keyId: requiredString(row.encryption_key_id, 128),
    iv: byteValue(row.payload_iv),
    ciphertext: byteValue(row.payload_ciphertext),
  };
}

function status(value: unknown): "active" | "consumed" | "expired" | "discarded" {
  const parsed = requiredString(value);
  if (parsed !== "active" && parsed !== "consumed" && parsed !== "expired" && parsed !== "discarded") {
    throw new IdentityPersistenceError();
  }
  return parsed;
}

export class PostgresOidcTransactionStore implements OidcTransactionStore {
  private readonly options: IdentityStoreDependencies;

  constructor(options: IdentityStoreDependencies) {
    this.options = validateDependencies(options);
  }

  async save(input: OidcAuthorizationTransaction): Promise<void> {
    const validated = transaction(input);
    const digest = this.options.stateDigester.digest(validated.state);
    const { state: _state, ...stored } = validated;
    const sealed = this.options.payloadCipher.encrypt({
      binding: { purpose: PURPOSE, stateDigest: digest, schemaVersion: SCHEMA_VERSION },
      payload: stored,
    });
    await withIdentityTransaction(this.options, "oidc", async (client) => {
      try {
        await client.query(
          "INSERT INTO saas.oidc_transactions (state_digest, payload_ciphertext, payload_iv, encryption_key_id, payload_schema_version, status, created_at, updated_at, expires_at) VALUES ($1, $2, $3, $4, $5, 'active', $6::timestamptz, $6::timestamptz, $7::timestamptz)",
          [digest, Buffer.from(sealed.ciphertext), Buffer.from(sealed.iv), sealed.keyId, SCHEMA_VERSION, validated.createdAt, validated.expiresAt],
        );
      } catch (error) {
        if ((error as { code?: unknown })?.code === "23505") {
          throw new OidcFlowError("oidc_invalid_state", "OIDC state is invalid.");
        }
        throw error;
      }
    });
  }

  async consume(rawState: string, now: Date): Promise<OidcAuthorizationTransaction> {
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new IdentityPersistenceError();
    const digest = this.options.stateDigester.digest(rawState);
    const canonicalNow = now.toISOString();
    const row = await withIdentityTransaction(this.options, "oidc", async (client) => {
      const result = await client.query(
        "UPDATE saas.oidc_transactions SET status = CASE WHEN expires_at <= $2::timestamptz THEN 'expired' ELSE 'consumed' END, consumed_at = $2::timestamptz, updated_at = $2::timestamptz WHERE state_digest = $1 AND status = 'active' RETURNING state_digest, payload_ciphertext, payload_iv, encryption_key_id, payload_schema_version, status",
        [digest, canonicalNow],
      );
      const updated = result.rows[0];
      if (!updated) {
        const classified = await client.query("SELECT status FROM saas.oidc_transactions WHERE state_digest = $1", [digest]);
        const existing = classified.rows[0];
        if (!existing) throw new OidcFlowError("oidc_invalid_state", "OIDC state is invalid.");
        const current = status(existing.status);
        if (current === "consumed" || current === "expired") {
          if (current === "expired") throw new OidcFlowError("oidc_state_expired", "OIDC state has expired.");
          throw new OidcFlowError("oidc_state_replayed", "OIDC state was already consumed.");
        }
        throw new OidcFlowError("oidc_invalid_state", "OIDC state is invalid.");
      }
      return updated;
    });
    if (status(row.status) === "expired") throw new OidcFlowError("oidc_state_expired", "OIDC state has expired.");
    const decoded = this.options.payloadCipher.decrypt({
      binding: { purpose: PURPOSE, stateDigest: digest, schemaVersion: integer(row.payload_schema_version) },
      encrypted: encrypted(row),
    });
    return { state: rawState, ...payload(decoded) };
  }

  async discard(rawState: string): Promise<void> {
    const digest = this.options.stateDigester.digest(rawState);
    const now = this.options.clock().toISOString();
    await withIdentityTransaction(this.options, "oidc", async (client) => {
      await client.query(
        "UPDATE saas.oidc_transactions SET status = 'discarded', discarded_at = $2::timestamptz, updated_at = $2::timestamptz WHERE state_digest = $1 AND status = 'active'",
        [digest, now],
      );
    });
  }

  async cleanupTerminal(cutoff: Date, maximumRows: number): Promise<number> {
    if (!(cutoff instanceof Date) || !Number.isFinite(cutoff.getTime())) throw new IdentityPersistenceError();
    const limit = batchSize(maximumRows);
    return withIdentityTransaction(this.options, "cleanup", async (client) => {
      const result = await client.query(
        "WITH candidates AS (SELECT state_digest FROM saas.oidc_transactions WHERE status IN ('consumed', 'expired', 'discarded') AND COALESCE(discarded_at, consumed_at) < $1::timestamptz ORDER BY COALESCE(discarded_at, consumed_at), state_digest FOR UPDATE SKIP LOCKED LIMIT $2), deleted AS (DELETE FROM saas.oidc_transactions AS transaction USING candidates WHERE transaction.state_digest = candidates.state_digest RETURNING transaction.state_digest) SELECT count(*)::integer AS deleted_count FROM deleted",
        [cutoff.toISOString(), limit],
      );
      const count = result.rows[0]?.deleted_count;
      if (!Number.isInteger(count) || (count as number) < 0 || (count as number) > limit) throw new IdentityPersistenceError();
      return count as number;
    });
  }
}
