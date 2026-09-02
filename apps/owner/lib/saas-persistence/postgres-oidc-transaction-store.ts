import { PANEL_OIDC_CALLBACK_URL } from "../../../../packages/platform-config/src/saas.ts";
import { parseExactAdminHttpsOrigin } from "@celebix/saas-data";
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
const REGISTRATION_SCHEMA_VERSION = 1;
const PANEL_LOGIN_SCHEMA_VERSION = 2;
const KEY_ID = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,62}[A-Za-z0-9])?$/;
const DIGEST = /^[a-f0-9]{64}$/;

interface StoredOidcPayload extends Omit<OidcAuthorizationTransaction, "state"> {}

function callback(value: unknown, expectedCallbackAuthority: string): string {
  const parsed = requiredString(value, 2048);
  if (parsed === expectedCallbackAuthority) return parsed;
  throw new OidcFlowError("oidc_invalid_callback", "OIDC callback URL is invalid.");
}

function payload(value: unknown, expectedCallbackAuthority: string, schemaVersion: number): StoredOidcPayload {
  if (schemaVersion !== REGISTRATION_SCHEMA_VERSION && schemaVersion !== PANEL_LOGIN_SCHEMA_VERSION) throw new IdentityPersistenceError();
  const required = [
    "nonce", "codeVerifier", "redirectUri", "returnTo", "expectedIssuer", "expectedAudience", "createdAt", "expiresAt",
  ];
  const row = exactObject(value, required, schemaVersion === PANEL_LOGIN_SCHEMA_VERSION ? ["panelLoginBinding", "panelLoginDestinationHostname"] : []);
  const createdAt = canonicalTimestamp(row.createdAt);
  const expiresAt = canonicalTimestamp(row.expiresAt);
  if (Date.parse(expiresAt) <= Date.parse(createdAt)) throw new OidcFlowError("oidc_invalid_state", "OIDC transaction is invalid.");
  if (row.returnTo !== (schemaVersion === PANEL_LOGIN_SCHEMA_VERSION ? "/login" : "/kayit")) {
    throw new OidcFlowError("oidc_invalid_state", "OIDC transaction is invalid.");
  }
  const nonce = requiredString(row.nonce, 512);
  const codeVerifier = requiredString(row.codeVerifier, 512);
  if (
    !/^[A-Za-z0-9_-]{16,512}$/.test(nonce) ||
    !/^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier)
  ) {
    throw new OidcFlowError("oidc_invalid_state", "OIDC transaction is invalid.");
  }
  let panelLoginBinding: Readonly<{ keyId: string; digest: string }> | undefined;
  let panelLoginDestinationHostname: string | undefined;
  if (schemaVersion === PANEL_LOGIN_SCHEMA_VERSION) {
    const binding = exactObject(row.panelLoginBinding, ["keyId", "digest"]);
    const keyId = requiredString(binding.keyId, 64);
    const digest = requiredString(binding.digest, 64);
    if (!KEY_ID.test(keyId) || keyId.includes("..") || !DIGEST.test(digest)) {
      throw new OidcFlowError("oidc_invalid_state", "OIDC transaction is invalid.");
    }
    panelLoginBinding = Object.freeze({ keyId, digest });
    panelLoginDestinationHostname = requiredString(row.panelLoginDestinationHostname, 253);
    try {
      if (parseExactAdminHttpsOrigin(`https://${panelLoginDestinationHostname}`).hostname !== panelLoginDestinationHostname) {
        throw new Error("invalid");
      }
    } catch {
      throw new OidcFlowError("oidc_invalid_state", "OIDC transaction is invalid.");
    }
  }
  return {
    nonce,
    codeVerifier,
    redirectUri: callback(row.redirectUri, expectedCallbackAuthority),
    returnTo: schemaVersion === PANEL_LOGIN_SCHEMA_VERSION ? "/login" : "/kayit",
    expectedIssuer: requiredString(row.expectedIssuer, 2048),
    expectedAudience: requiredString(row.expectedAudience, 512),
    createdAt,
    expiresAt,
    ...(panelLoginBinding ? { panelLoginBinding } : {}),
    ...(panelLoginDestinationHostname ? { panelLoginDestinationHostname } : {}),
  };
}

function transaction(value: unknown, expectedCallbackAuthority: string): { value: OidcAuthorizationTransaction; schemaVersion: number } {
  const row = exactObject(value, [
    "state", "nonce", "codeVerifier", "redirectUri", "returnTo", "expectedIssuer", "expectedAudience", "createdAt", "expiresAt",
  ], ["panelLoginBinding", "panelLoginDestinationHostname"]);
  const state = requiredString(row.state, 1024);
  if (state.length < 16) throw new OidcFlowError("oidc_invalid_state", "OIDC transaction is invalid.");
  const schemaVersion = row.panelLoginBinding === undefined ? REGISTRATION_SCHEMA_VERSION : PANEL_LOGIN_SCHEMA_VERSION;
  if ((row.panelLoginBinding === undefined) !== (row.panelLoginDestinationHostname === undefined)) {
    throw new OidcFlowError("oidc_invalid_state", "OIDC transaction is invalid.");
  }
  if ((schemaVersion === PANEL_LOGIN_SCHEMA_VERSION) !== state.startsWith("plogin_")) {
    throw new OidcFlowError("oidc_invalid_state", "OIDC transaction is invalid.");
  }
  return { schemaVersion, value: { state, ...payload({
    nonce: row.nonce,
    codeVerifier: row.codeVerifier,
    redirectUri: row.redirectUri,
    returnTo: row.returnTo,
    expectedIssuer: row.expectedIssuer,
    expectedAudience: row.expectedAudience,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    ...(row.panelLoginBinding === undefined ? {} : { panelLoginBinding: row.panelLoginBinding }),
    ...(row.panelLoginDestinationHostname === undefined ? {} : { panelLoginDestinationHostname: row.panelLoginDestinationHostname }),
  }, expectedCallbackAuthority, schemaVersion) } };
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

function persistedTimestamp(value: unknown): string {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new IdentityPersistenceError();
    return value.toISOString();
  }
  return canonicalTimestamp(value);
}

export class PostgresOidcTransactionStore implements OidcTransactionStore {
  private readonly options: IdentityStoreDependencies;
  private readonly callbackAuthority: string;

  constructor(options: IdentityStoreDependencies, authorities?: { callbackAuthority: string }) {
    this.options = validateDependencies(options);
    this.callbackAuthority = authorities?.callbackAuthority ?? PANEL_OIDC_CALLBACK_URL;
    try {
      const parsed = new URL(this.callbackAuthority);
      if (
        parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port ||
        parsed.pathname !== "/auth/callback" || parsed.search || parsed.hash ||
        `${parsed.origin}${parsed.pathname}` !== this.callbackAuthority
      ) throw new Error("invalid");
    } catch { throw new IdentityPersistenceError(); }
  }

  async save(input: OidcAuthorizationTransaction): Promise<void> {
    const validatedTransaction = transaction(input, this.callbackAuthority);
    const validated = validatedTransaction.value;
    const schemaVersion = validatedTransaction.schemaVersion;
    const digest = this.options.stateDigester.digest(validated.state);
    const { state: _state, ...stored } = validated;
    const sealed = this.options.payloadCipher.encrypt({
      binding: { purpose: PURPOSE, stateDigest: digest, schemaVersion },
      payload: stored,
    });
    await withIdentityTransaction(this.options, "oidc", async (client) => {
      try {
        await client.query(
          "INSERT INTO saas.oidc_transactions (state_digest, payload_ciphertext, payload_iv, encryption_key_id, payload_schema_version, status, created_at, updated_at, expires_at) VALUES ($1, $2, $3, $4, $5, 'active', $6::timestamptz, $6::timestamptz, $7::timestamptz)",
          [digest, Buffer.from(sealed.ciphertext), Buffer.from(sealed.iv), sealed.keyId, schemaVersion, validated.createdAt, validated.expiresAt],
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
    const outcome = await withIdentityTransaction(this.options, "oidc", async (client) => {
      const selected = await client.query(
        "SELECT state_digest, payload_ciphertext, payload_iv, encryption_key_id, payload_schema_version, status, created_at, expires_at FROM saas.oidc_transactions WHERE state_digest = $1",
        [digest],
      );
      const row = selected.rows[0];
      if (!row) throw new OidcFlowError("oidc_invalid_state", "OIDC state is invalid.");
      const current = status(row.status);
      if (current === "expired") throw new OidcFlowError("oidc_state_expired", "OIDC state has expired.");
      if (current === "consumed") throw new OidcFlowError("oidc_state_replayed", "OIDC state was already consumed.");
      if (current !== "active") throw new OidcFlowError("oidc_invalid_state", "OIDC state is invalid.");

      const schemaVersion = integer(row.payload_schema_version);
      const stored = payload(this.options.payloadCipher.decrypt({
        binding: { purpose: PURPOSE, stateDigest: digest, schemaVersion },
        encrypted: encrypted(row),
      }), this.callbackAuthority, schemaVersion);
      const dbCreatedAt = persistedTimestamp(row.created_at);
      const dbExpiresAt = persistedTimestamp(row.expires_at);
      if (stored.createdAt !== dbCreatedAt || stored.expiresAt !== dbExpiresAt) throw new IdentityPersistenceError();
      const expired = Date.parse(stored.expiresAt) <= now.getTime();
      const updated = await client.query(
        "UPDATE saas.oidc_transactions SET status = $3, consumed_at = $2::timestamptz, updated_at = $2::timestamptz WHERE state_digest = $1 AND status = 'active' AND created_at = $4::timestamptz AND expires_at = $5::timestamptz RETURNING status",
        [digest, canonicalNow, expired ? "expired" : "consumed", stored.createdAt, stored.expiresAt],
      );
      if (!updated.rows[0]) {
        const classified = await client.query("SELECT status FROM saas.oidc_transactions WHERE state_digest = $1", [digest]);
        const raced = classified.rows[0];
        if (!raced) throw new OidcFlowError("oidc_invalid_state", "OIDC state is invalid.");
        const racedStatus = status(raced.status);
        if (racedStatus === "expired") throw new OidcFlowError("oidc_state_expired", "OIDC state has expired.");
        if (racedStatus === "consumed") throw new OidcFlowError("oidc_state_replayed", "OIDC state was already consumed.");
        throw new OidcFlowError("oidc_invalid_state", "OIDC state is invalid.");
      }
      return { stored, expired };
    });
    if (outcome.expired) throw new OidcFlowError("oidc_state_expired", "OIDC state has expired.");
    return { state: rawState, ...outcome.stored };
  }

  async inspectPanelLoginBinding(
    rawState: string,
    candidates: readonly Readonly<{ keyId: string; digest: string }>[],
    now: Date,
  ): Promise<"denied" | "not_panel_login" | Readonly<{ kind: "approved"; binding: Readonly<{ keyId: string; digest: string }> }>> {
    if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || !Array.isArray(candidates) || candidates.length < 1 || candidates.length > 16) {
      throw new IdentityPersistenceError();
    }
    const proofs = candidates.map((candidate) => {
      if (!candidate || typeof candidate !== "object") throw new IdentityPersistenceError();
      const keyId = requiredString(candidate.keyId, 64);
      const digest = requiredString(candidate.digest, 64);
      if (!KEY_ID.test(keyId) || keyId.includes("..") || !DIGEST.test(digest)) throw new IdentityPersistenceError();
      return Object.freeze({ keyId, digest });
    });
    const digest = this.options.stateDigester.digest(rawState);
    return withIdentityTransaction(this.options, "oidc", async (client) => {
      const selected = await client.query(
        "SELECT state_digest, payload_ciphertext, payload_iv, encryption_key_id, payload_schema_version, status, created_at, expires_at FROM saas.oidc_transactions WHERE state_digest = $1",
        [digest],
      );
      const row = selected.rows[0];
      if (!row) return "not_panel_login" as const;
      const schemaVersion = integer(row.payload_schema_version);
      if (schemaVersion === REGISTRATION_SCHEMA_VERSION) return "not_panel_login" as const;
      if (schemaVersion !== PANEL_LOGIN_SCHEMA_VERSION || status(row.status) !== "active") return "denied" as const;
      const stored = payload(this.options.payloadCipher.decrypt({
        binding: { purpose: PURPOSE, stateDigest: digest, schemaVersion },
        encrypted: encrypted(row),
      }), this.callbackAuthority, schemaVersion);
      if (
        persistedTimestamp(row.created_at) !== stored.createdAt || persistedTimestamp(row.expires_at) !== stored.expiresAt ||
        Date.parse(stored.expiresAt) <= now.getTime() || !stored.panelLoginBinding
      ) return "denied" as const;
      const matched = proofs.find((proof) =>
        proof.keyId === stored.panelLoginBinding!.keyId && proof.digest === stored.panelLoginBinding!.digest
      );
      return matched ? Object.freeze({ kind: "approved" as const, binding: matched }) : "denied" as const;
    });
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

  async expireDue(cutoff: Date, maximumRows: number): Promise<number> {
    if (!(cutoff instanceof Date) || !Number.isFinite(cutoff.getTime())) throw new IdentityPersistenceError();
    const limit = batchSize(maximumRows);
    return withIdentityTransaction(this.options, "cleanup", async (client) => {
      const result = await client.query(
        "WITH candidates AS (SELECT state_digest FROM saas.oidc_transactions WHERE status = 'active' AND expires_at <= $1::timestamptz ORDER BY expires_at, state_digest FOR UPDATE SKIP LOCKED LIMIT $2), expired AS (UPDATE saas.oidc_transactions AS transaction SET status = 'expired', consumed_at = $1::timestamptz, updated_at = $1::timestamptz FROM candidates WHERE transaction.state_digest = candidates.state_digest AND transaction.status = 'active' RETURNING transaction.state_digest) SELECT count(*)::integer AS expired_count FROM expired",
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
        "WITH candidates AS (SELECT state_digest FROM saas.oidc_transactions WHERE status IN ('consumed', 'expired', 'discarded') AND COALESCE(discarded_at, consumed_at) < $1::timestamptz ORDER BY COALESCE(discarded_at, consumed_at), state_digest FOR UPDATE SKIP LOCKED LIMIT $2), deleted AS (DELETE FROM saas.oidc_transactions AS transaction USING candidates WHERE transaction.state_digest = candidates.state_digest RETURNING transaction.state_digest) SELECT count(*)::integer AS deleted_count FROM deleted",
        [cutoff.toISOString(), limit],
      );
      const count = result.rows[0]?.deleted_count;
      if (!Number.isInteger(count) || (count as number) < 0 || (count as number) > limit) throw new IdentityPersistenceError();
      return count as number;
    });
  }
}
