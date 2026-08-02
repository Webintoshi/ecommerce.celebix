import {
  parseToshiProviderConnection,
  parseToshiProviderConnectionList,
  type ToshiProviderConnection,
} from "@celebix/saas-contracts";

import { acquirePostgresClient, type PostgresClientLike } from "../postgres/pool.ts";
import {
  exactToshiInput,
  toshiAuthority,
  toshiDigest,
  toshiFingerprint,
  toshiMaskedKey,
  toshiModels,
  toshiProvider,
  toshiSealedCredential,
  toshiSelectedModel,
  toshiUuid,
  toshiVersion,
} from "./canonical.ts";
import {
  TOSHI_PROVIDER_REPOSITORY_ERROR_CODES,
  ToshiProviderRepositoryError,
  type ToshiProviderRepositoryErrorCode,
} from "./errors.ts";
import type {
  ConnectToshiProviderInput,
  GetToshiProviderAuthorityInput,
  GetToshiProviderConnectionIdentityInput,
  PostgresToshiProviderRepositoryOptions,
  RevokeToshiProviderInput,
  SelectToshiProviderModelInput,
  SetDefaultToshiProviderInput,
  ToshiProviderAuthorityInput,
  ToshiProviderConnectionIdentity,
  ToshiProviderCredentialAuthority,
  ToshiProviderRepository,
} from "./types.ts";

type Authority = ReturnType<typeof toshiAuthority>;
type Spec = Readonly<{ text: string; values: unknown[] }>;
const CODES = new Set<string>(TOSHI_PROVIDER_REPOSITORY_ERROR_CODES);

function unavailable(): ToshiProviderRepositoryError {
  return new ToshiProviderRepositoryError("unavailable");
}

function timeout(value: number): string {
  if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) throw unavailable();
  return `${value}ms`;
}

function release(client: PostgresClientLike, destroy = false): void {
  try { client.release(destroy || undefined); } catch {}
}

function payload(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw unavailable();
  const result = value as Record<string, unknown>;
  if (Object.keys(result).sort().join(",") !== [...keys].sort().join(",")) throw unavailable();
  return result;
}

function row(value: Readonly<{ rows: unknown[]; rowCount?: number | null }>): Readonly<{ outcome: string; result: unknown }> {
  if (value.rowCount !== 1 || value.rows.length !== 1) throw unavailable();
  const parsed = payload(value.rows[0], ["outcome", "result_payload"]);
  if (typeof parsed.outcome !== "string") throw unavailable();
  return Object.freeze({ outcome: parsed.outcome, result: parsed.result_payload });
}

function authorityValues(authority: Authority): unknown[] {
  return [authority.storeId, authority.principalId, authority.membershipId, authority.planId, authority.planCode, authority.planVersion, authority.now];
}

function connection(value: unknown): ToshiProviderConnection {
  try { return parseToshiProviderConnection(value); } catch { throw unavailable(); }
}

function identity(value: unknown): ToshiProviderConnectionIdentity {
  const parsed = payload(value, ["configId", "credentialVersion", "version"]);
  try {
    return Object.freeze({
      configId: toshiUuid(parsed.configId),
      credentialVersion: toshiVersion(parsed.credentialVersion, 1),
      version: toshiVersion(parsed.version, 1),
    });
  } catch { throw unavailable(); }
}

function credentialAuthority(value: unknown): ToshiProviderCredentialAuthority {
  const parsed = payload(value, ["configId", "provider", "selectedModel", "sealedCredentials", "credentialVersion", "version"]);
  try {
    return Object.freeze({
      configId: toshiUuid(parsed.configId),
      provider: toshiProvider(parsed.provider),
      selectedModel: toshiSelectedModel(parsed.selectedModel),
      sealedCredentials: toshiSealedCredential(parsed.sealedCredentials),
      credentialVersion: toshiVersion(parsed.credentialVersion, 1),
      version: toshiVersion(parsed.version, 1),
    });
  } catch { throw unavailable(); }
}

export class PostgresToshiProviderRepository implements ToshiProviderRepository {
  private readonly options: PostgresToshiProviderRepositoryOptions;

  constructor(options: PostgresToshiProviderRepositoryOptions) {
    try {
      if (
        !options || typeof options !== "object" || Array.isArray(options) ||
        Object.keys(options).sort().join(",") !== "audit,pool,role,timeouts" ||
        options.role !== "celebix_saas_app" || typeof options.audit !== "function" ||
        !options.pool || typeof options.pool.connect !== "function" ||
        !options.timeouts || Object.keys(options.timeouts).sort().join(",") !== "idleTransactionMs,lockMs,poolCheckoutMs,statementMs"
      ) throw unavailable();
      for (const value of Object.values(options.timeouts)) timeout(value);
      this.options = Object.freeze({ ...options, timeouts: Object.freeze({ ...options.timeouts }) });
    } catch (error) {
      if (error instanceof ToshiProviderRepositoryError) throw error;
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

  private expected(outcome: string): ToshiProviderRepositoryError | undefined {
    return CODES.has(outcome)
      ? new ToshiProviderRepositoryError(outcome as ToshiProviderRepositoryErrorCode)
      : undefined;
  }

  private async rollback(client: PostgresClientLike): Promise<void> {
    try { await client.query("ROLLBACK"); release(client); } catch { release(client, true); }
  }

  private async readOutcome<T>(spec: Spec, parser: (selected: Readonly<{ outcome: string; result: unknown }>) => T): Promise<T> {
    const client = await this.acquire();
    let began = false;
    let terminal = false;
    try {
      await client.query("BEGIN READ ONLY");
      began = true;
      await this.configure(client);
      const result = row(await client.query(spec.text, spec.values));
      const parsed = parser(result);
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
      if (error instanceof ToshiProviderRepositoryError) throw error;
      throw unavailable();
    }
  }

  private read<T>(spec: Spec, expected: string, parser: (value: unknown) => T): Promise<T> {
    return this.readOutcome(spec, (result) => {
      const known = this.expected(result.outcome);
      if (known) throw known;
      if (result.outcome !== expected) throw unavailable();
      return parser(result.result);
    });
  }

  private audit(): void {
    try {
      const pending = this.options.audit({ type: "toshi_provider_commit_unknown" });
      if (pending) void pending.catch(() => undefined);
    } catch {}
  }

  private recover(authority: Authority, operationId: string, fingerprint: string, observed: ToshiProviderConnection): Promise<ToshiProviderConnection> {
    return this.read({
      text: "SELECT outcome,result_payload FROM saas.toshi_provider_recover_operation($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text)",
      values: [...authorityValues(authority), operationId, fingerprint],
    }, "operation_replayed", (value) => {
      const parsed = connection(value);
      if (JSON.stringify(parsed) !== JSON.stringify(observed)) throw unavailable();
      return parsed;
    });
  }

  private async mutate(authority: Authority, operationId: string, fingerprint: string, expected: string, spec: Spec, validate: (value: ToshiProviderConnection) => boolean): Promise<ToshiProviderConnection> {
    const client = await this.acquire();
    let began = false;
    let terminal = false;
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      began = true;
      await this.configure(client);
      const result = row(await client.query(spec.text, spec.values));
      const known = this.expected(result.outcome);
      if (known) throw known;
      if (result.outcome !== expected && result.outcome !== "operation_replayed") throw unavailable();
      const parsed = connection(result.result);
      if (!validate(parsed)) throw unavailable();
      try {
        await client.query("COMMIT");
        terminal = true;
        release(client);
        return parsed;
      } catch {
        terminal = true;
        release(client, true);
        this.audit();
        return await this.recover(authority, operationId, fingerprint, parsed);
      }
    } catch (error) {
      if (began && !terminal) await this.rollback(client);
      else if (!began && !terminal) release(client, true);
      if (error instanceof ToshiProviderRepositoryError) throw error;
      throw unavailable();
    }
  }

  async list(input: ToshiProviderAuthorityInput): Promise<readonly ToshiProviderConnection[]> {
    const parsed = exactToshiInput(input, ["tenantContext", "now"]);
    const authority = toshiAuthority(parsed.tenantContext as never, parsed.now as Date);
    return this.read({
      text: "SELECT outcome,result_payload FROM saas.toshi_provider_list($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz)",
      values: authorityValues(authority),
    }, "listed", (value) => {
      try { return parseToshiProviderConnectionList(value).items; } catch { throw unavailable(); }
    });
  }

  async getConnectionIdentity(input: GetToshiProviderConnectionIdentityInput): Promise<ToshiProviderConnectionIdentity | null> {
    const parsed = exactToshiInput(input, ["tenantContext", "now", "provider"]);
    const authority = toshiAuthority(parsed.tenantContext as never, parsed.now as Date);
    const provider = toshiProvider(parsed.provider);
    return this.readOutcome({
      text: "SELECT outcome,result_payload FROM saas.toshi_provider_connection_identity($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::text)",
      values: [...authorityValues(authority), provider],
    }, (result) => {
      const known = this.expected(result.outcome);
      if (known) throw known;
      if (result.outcome === "not_found" && result.result === null) return null;
      if (result.outcome !== "found") throw unavailable();
      return identity(result.result);
    });
  }

  async connect(input: ConnectToshiProviderInput): Promise<ToshiProviderConnection> {
    const parsed = exactToshiInput(input, ["tenantContext", "now", "operationId", "configId", "provider", "sealedCredentials", "credentialDigest", "credentialVersion", "maskedKey", "selectedModel", "availableModels", "expectedVersion"]);
    const authority = toshiAuthority(parsed.tenantContext as never, parsed.now as Date);
    const operationId = toshiUuid(parsed.operationId);
    const configId = toshiUuid(parsed.configId);
    const provider = toshiProvider(parsed.provider);
    const sealedCredentials = toshiSealedCredential(parsed.sealedCredentials);
    const credentialDigest = toshiDigest(parsed.credentialDigest);
    const credentialVersion = toshiVersion(parsed.credentialVersion, 1);
    const maskedKey = toshiMaskedKey(parsed.maskedKey);
    const availableModels = toshiModels(parsed.availableModels);
    const selectedModel = toshiSelectedModel(parsed.selectedModel, availableModels);
    const expectedVersion = toshiVersion(parsed.expectedVersion, 0);
    const fingerprint = toshiFingerprint("connect", authority.storeId, { configId, provider, credentialDigest, credentialVersion, maskedKey, selectedModel, availableModels, expectedVersion });
    return this.mutate(authority, operationId, fingerprint, "connected", {
      text: "SELECT outcome,result_payload FROM saas.toshi_provider_connect($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::text,$12::jsonb,$13::text,$14::bigint,$15::text,$16::text,$17::jsonb,$18::bigint)",
      values: [...authorityValues(authority), operationId, fingerprint, configId, provider, JSON.stringify(sealedCredentials), credentialDigest, credentialVersion, maskedKey, selectedModel, JSON.stringify(availableModels), expectedVersion],
    }, (value) => value.provider === provider && value.status === "active" && value.version === expectedVersion + 1);
  }

  async selectModel(input: SelectToshiProviderModelInput): Promise<ToshiProviderConnection> {
    const parsed = exactToshiInput(input, ["tenantContext", "now", "operationId", "provider", "selectedModel", "expectedVersion"]);
    const authority = toshiAuthority(parsed.tenantContext as never, parsed.now as Date);
    const operationId = toshiUuid(parsed.operationId);
    const provider = toshiProvider(parsed.provider);
    const selectedModel = toshiSelectedModel(parsed.selectedModel);
    const expectedVersion = toshiVersion(parsed.expectedVersion, 1);
    const fingerprint = toshiFingerprint("select_model", authority.storeId, { provider, selectedModel, expectedVersion });
    return this.mutate(authority, operationId, fingerprint, "updated", {
      text: "SELECT outcome,result_payload FROM saas.toshi_provider_select_model($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::text,$11::text,$12::bigint)",
      values: [...authorityValues(authority), operationId, fingerprint, provider, selectedModel, expectedVersion],
    }, (value) => value.provider === provider && value.status === "active" && value.selectedModel === selectedModel && value.version === expectedVersion + 1);
  }

  private versionedMutation(kind: "set_default" | "revoke", input: SetDefaultToshiProviderInput | RevokeToshiProviderInput): Promise<ToshiProviderConnection> {
    const parsed = exactToshiInput(input, ["tenantContext", "now", "operationId", "provider", "expectedVersion"]);
    const authority = toshiAuthority(parsed.tenantContext as never, parsed.now as Date);
    const operationId = toshiUuid(parsed.operationId);
    const provider = toshiProvider(parsed.provider);
    const expectedVersion = toshiVersion(parsed.expectedVersion, 1);
    const fingerprint = toshiFingerprint(kind, authority.storeId, { provider, expectedVersion });
    const functionName = kind === "set_default" ? "toshi_provider_set_default" : "toshi_provider_revoke";
    const outcome = kind === "set_default" ? "updated" : "revoked";
    return this.mutate(authority, operationId, fingerprint, outcome, {
      text: `SELECT outcome,result_payload FROM saas.${functionName}($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::text,$11::bigint)`,
      values: [...authorityValues(authority), operationId, fingerprint, provider, expectedVersion],
    }, (value) => value.provider === provider && value.version === expectedVersion + 1 && (kind === "set_default" ? value.status === "active" && value.isDefault : value.status === "revoked" && !value.isDefault));
  }

  setDefault(input: SetDefaultToshiProviderInput): Promise<ToshiProviderConnection> {
    return this.versionedMutation("set_default", input);
  }

  revoke(input: RevokeToshiProviderInput): Promise<ToshiProviderConnection> {
    return this.versionedMutation("revoke", input);
  }

  async getAuthority(input: GetToshiProviderAuthorityInput): Promise<ToshiProviderCredentialAuthority> {
    const parsed = exactToshiInput(input, ["tenantContext", "now", "provider"]);
    const authority = toshiAuthority(parsed.tenantContext as never, parsed.now as Date);
    const provider = parsed.provider === null ? null : toshiProvider(parsed.provider);
    return this.read({
      text: "SELECT outcome,result_payload FROM saas.toshi_provider_get_authority($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::text)",
      values: [...authorityValues(authority), provider],
    }, "found", credentialAuthority);
  }
}
