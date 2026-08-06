import { createHash } from "node:crypto";

import {
  parseShippingConnection,
  parseShippingResource,
  type ShippingConnection,
  type ShippingProviderCode,
  type ShippingResource,
  type TenantContext,
} from "@celebix/saas-contracts";

import { acquirePostgresClient, type PostgresClientLike } from "../postgres/pool.ts";
import { sealShippingCredential, type ShippingCredentialKeyring } from "./credential-crypto.ts";
import {
  SHIPPING_ADMIN_ERROR_CODES,
  ShippingAdminRepositoryError,
  type ShippingAdminErrorCode,
} from "./errors.ts";
import type {
  PostgresShippingAdminRepositoryOptions,
  RevokeShippingConnectionInput,
  SaveShippingConnectionInput,
  SaveShippingConnectionResult,
  SelectShippingResourcesInput,
  ShippingAdminRepository,
  ShippingAuthorityInput,
  ShippingConnectionSetup,
} from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TOKEN = /^[\x21-\x7e]{16,4096}$/;
const CODES = new Set<string>(SHIPPING_ADMIN_ERROR_CODES);
type Authority = Readonly<{
  storeId: string; principalId: string; membershipId: string; planId: string;
  planCode: string; planVersion: number; now: string;
}>;
type Result = Readonly<{ outcome: string; result: unknown }>;

function unavailable(): ShippingAdminRepositoryError { return new ShippingAdminRepositoryError("unavailable"); }
function invalid(): never { throw new ShippingAdminRepositoryError("invalid_input"); }

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  const ownKeys = Reflect.ownKeys(descriptors);
  if (ownKeys.length !== keys.length || ownKeys.some((key) => typeof key !== "string" || !keys.includes(key)) || keys.some((key) => !Object.hasOwn(descriptors, key))) invalid();
  const parsed: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of ownKeys) {
    if (typeof key !== "string") invalid();
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    parsed[key] = descriptor.value;
  }
  return parsed;
}

function uuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) invalid();
  return value;
}

function version(value: unknown, minimum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) invalid();
  return value as number;
}

function date(value: unknown): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) invalid();
  return new Date(value.getTime());
}

function provider(value: unknown): ShippingProviderCode {
  if (value !== "basit_kargo") invalid();
  return value;
}

function authority(context: unknown, selectedNow: unknown): Authority {
  if (typeof context !== "object" || context === null || Array.isArray(context)) invalid();
  const tenant = context as TenantContext;
  const now = date(selectedNow);
  if (
    tenant.schemaVersion !== 1 || tenant.store?.status !== "active" || tenant.membership?.status !== "active" ||
    tenant.entitlements?.status !== "active" || !tenant.entitlements.features.includes("integrations")
  ) invalid();
  return Object.freeze({
    storeId: uuid(tenant.store.id), principalId: uuid(tenant.principal.id), membershipId: uuid(tenant.membership.id),
    planId: uuid(tenant.entitlements.planId), planCode: tenant.entitlements.planCode,
    planVersion: version(tenant.entitlements.version, 1), now: now.toISOString(),
  });
}

function authorityValues(value: Authority): unknown[] {
  return [value.storeId, value.principalId, value.membershipId, value.planId, value.planCode, value.planVersion, value.now];
}

function timeout(value: number): string {
  if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) throw unavailable();
  return `${value}ms`;
}

function row(query: Readonly<{ rows: unknown[]; rowCount?: number | null }>): Result {
  if (query.rowCount !== 1 || query.rows.length !== 1) throw unavailable();
  const selected = query.rows[0];
  if (typeof selected !== "object" || selected === null || Array.isArray(selected)) throw unavailable();
  const parsed = selected as Record<string, unknown>;
  if (Object.keys(parsed).sort().join(",") !== "outcome,result_payload" || typeof parsed.outcome !== "string") throw unavailable();
  return Object.freeze({ outcome: parsed.outcome, result: parsed.result_payload });
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`).join(",")}}`;
}

function fingerprint(kind: string, storeId: string, value: unknown): string {
  return createHash("sha256").update(stable({ kind, storeId, value }), "utf8").digest("hex");
}

function parseConnection(value: unknown): ShippingConnection {
  try { return parseShippingConnection(value); } catch { throw unavailable(); }
}

type PrivateSetup = ShippingConnectionSetup & Readonly<{ profileId: string; credentialVersion: number; version: number }>;

function parseSetup(value: unknown): PrivateSetup {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw unavailable();
  const parsed = value as Record<string, unknown>;
  if (Object.keys(parsed).sort().join(",") !== "connection,credentialVersion,profileId,resources,version" || !Array.isArray(parsed.resources) || parsed.resources.length > 300) throw unavailable();
  let resources: readonly ShippingResource[];
  try { resources = Object.freeze(parsed.resources.map(parseShippingResource)); } catch { throw unavailable(); }
  const connection = parseConnection(parsed.connection);
  const profileId = typeof parsed.profileId === "string" && UUID.test(parsed.profileId) ? parsed.profileId : null;
  if (!profileId || !Number.isSafeInteger(parsed.credentialVersion) || (parsed.credentialVersion as number) < 1 || !Number.isSafeInteger(parsed.version) || (parsed.version as number) < 1) throw unavailable();
  if (connection.credentialVersion !== parsed.credentialVersion || connection.version !== parsed.version) throw unavailable();
  return Object.freeze({ profileId, credentialVersion: parsed.credentialVersion as number, version: parsed.version as number, connection, resources });
}

function copyKeyring(value: ShippingCredentialKeyring): ShippingCredentialKeyring {
  try {
    if (typeof value !== "object" || value === null || !Array.isArray(value.keys) || typeof value.activeKeyId !== "string") throw unavailable();
    const keys = value.keys.map((entry) => Object.freeze({ keyId: entry.keyId, key: new Uint8Array(entry.key) }));
    return Object.freeze({ activeKeyId: value.activeKeyId, keys: Object.freeze(keys) });
  } catch { throw unavailable(); }
}

export class PostgresShippingAdminRepository implements ShippingAdminRepository {
  private readonly options: Omit<PostgresShippingAdminRepositoryOptions, "keyring"> & Readonly<{ keyring: ShippingCredentialKeyring }>;

  constructor(options: PostgresShippingAdminRepositoryOptions) {
    try {
      if (!options || typeof options !== "object" || options.role !== "celebix_saas_app" || typeof options.generateId !== "function" || typeof options.audit !== "function" || !options.pool || typeof options.pool.connect !== "function") throw unavailable();
      for (const selected of Object.values(options.timeouts)) timeout(selected);
      this.options = Object.freeze({ ...options, timeouts: Object.freeze({ ...options.timeouts }), keyring: copyKeyring(options.keyring) });
    } catch (error) { if (error instanceof ShippingAdminRepositoryError) throw error; throw unavailable(); }
  }

  private async acquire(): Promise<PostgresClientLike> {
    try { return await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs); }
    catch { throw unavailable(); }
  }

  private async configure(client: PostgresClientLike): Promise<void> {
    await client.query("SELECT pg_catalog.set_config('statement_timeout',$1,true)", [timeout(this.options.timeouts.statementMs)]);
    await client.query("SELECT pg_catalog.set_config('lock_timeout',$1,true)", [timeout(this.options.timeouts.lockMs)]);
    await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout',$1,true)", [timeout(this.options.timeouts.idleTransactionMs)]);
    await client.query("SET LOCAL ROLE celebix_saas_app");
  }

  private known(outcome: string): ShippingAdminRepositoryError | null {
    return CODES.has(outcome) ? new ShippingAdminRepositoryError(outcome as ShippingAdminErrorCode) : null;
  }

  private async transaction<T>(readOnly: boolean, operation: (client: PostgresClientLike) => Promise<T>): Promise<T> {
    const client = await this.acquire();
    let began = false, terminal = false;
    try {
      await client.query(readOnly ? "BEGIN READ ONLY" : "BEGIN ISOLATION LEVEL READ COMMITTED");
      began = true;
      await this.configure(client);
      const result = await operation(client);
      try { await client.query("COMMIT"); terminal = true; client.release(); return result; }
      catch { terminal = true; client.release(true); throw new ShippingAdminRepositoryError("commit_unknown"); }
    } catch (error) {
      if (began && !terminal) {
        try { await client.query("ROLLBACK"); client.release(); } catch { client.release(true); }
      } else if (!terminal) client.release(true);
      if (error instanceof ShippingAdminRepositoryError) throw error;
      throw unavailable();
    }
  }

  private async setupPrivate(selected: Authority, providerCode: ShippingProviderCode): Promise<PrivateSetup | null> {
    return this.transaction(true, async (client) => {
      const result = row(await client.query(
        "SELECT outcome,result_payload FROM saas.shipping_connection_setup($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::text)",
        [...authorityValues(selected), providerCode],
      ));
      if (result.outcome === "not_found" && result.result === null) return null;
      const known = this.known(result.outcome);
      if (known) throw known;
      if (result.outcome !== "found") throw unavailable();
      return parseSetup(result.result);
    });
  }

  async current(input: ShippingAuthorityInput): Promise<ShippingConnection | null> {
    const parsed = exact(input, ["tenantContext", "now", "providerCode"]);
    const selected = authority(parsed.tenantContext, parsed.now);
    const providerCode = provider(parsed.providerCode);
    return this.transaction(true, async (client) => {
      const result = row(await client.query(
        "SELECT outcome,result_payload FROM saas.shipping_connection_current($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::text)",
        [...authorityValues(selected), providerCode],
      ));
      if (result.outcome === "not_found" && result.result === null) return null;
      const known = this.known(result.outcome);
      if (known) throw known;
      if (result.outcome !== "found") throw unavailable();
      return parseConnection(result.result);
    });
  }

  async setup(input: ShippingAuthorityInput): Promise<ShippingConnectionSetup | null> {
    const parsed = exact(input, ["tenantContext", "now", "providerCode"]);
    const selected = await this.setupPrivate(authority(parsed.tenantContext, parsed.now), provider(parsed.providerCode));
    return selected === null ? null : Object.freeze({ connection: selected.connection, resources: selected.resources });
  }

  private async recover(selected: Authority, operationId: string, operationFingerprint: string): Promise<ShippingConnection> {
    try {
      return await this.transaction(true, async (client) => {
        const result = row(await client.query(
          "SELECT outcome,result_payload FROM saas.shipping_connection_recover_operation($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text)",
          [...authorityValues(selected), operationId, operationFingerprint],
        ));
        if (result.outcome !== "operation_replayed") throw new ShippingAdminRepositoryError("commit_unknown");
        return parseConnection(result.result);
      });
    } catch { throw new ShippingAdminRepositoryError("commit_unknown"); }
  }

  private async mutation(selected: Authority, operationId: string, operationFingerprint: string, expectedOutcome: string, sql: string, values: unknown[]): Promise<ShippingConnection> {
    try {
      return await this.transaction(false, async (client) => {
        const result = row(await client.query(sql, values));
        const known = this.known(result.outcome);
        if (known) throw known;
        if (result.outcome !== expectedOutcome && result.outcome !== "operation_replayed") throw unavailable();
        return parseConnection(result.result);
      });
    } catch (error) {
      if (!(error instanceof ShippingAdminRepositoryError) || error.code !== "commit_unknown") throw error;
      try { const pending = this.options.audit({ type: "shipping_commit_unknown" }); if (pending) void pending.catch(() => undefined); } catch {}
      return this.recover(selected, operationId, operationFingerprint);
    }
  }

  async saveConnection(input: SaveShippingConnectionInput): Promise<SaveShippingConnectionResult> {
    const parsed = exact(input, ["tenantContext", "now", "providerCode", "operationId", "token"]);
    const selected = authority(parsed.tenantContext, parsed.now);
    const providerCode = provider(parsed.providerCode);
    const operationId = uuid(parsed.operationId);
    if (typeof parsed.token !== "string" || !TOKEN.test(parsed.token)) invalid();
    const existing = await this.setupPrivate(selected, providerCode);
    const profileId = existing?.profileId ?? uuid(this.options.generateId());
    const validationJobId = uuid(this.options.generateId());
    const credentialVersion = (existing?.credentialVersion ?? 0) + 1;
    const expectedVersion = existing?.version ?? 0;
    const tokenBytes = new TextEncoder().encode(parsed.token);
    try {
      const credentialDigest = createHash("sha256").update(tokenBytes).digest("hex");
      const sealed = sealShippingCredential({ plaintext: tokenBytes, storeId: selected.storeId, profileId, providerCode, credentialVersion, keyring: this.options.keyring });
      const operationFingerprint = fingerprint("save", selected.storeId, { profileId, providerCode, credentialDigest, credentialVersion, expectedVersion });
      const connection = await this.mutation(selected, operationId, operationFingerprint, "saved",
        "SELECT outcome,result_payload FROM saas.shipping_connection_save($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::uuid,$12::text,$13::jsonb,$14::text,$15::text,$16::bigint)",
        [...authorityValues(selected), operationId, operationFingerprint, profileId, validationJobId, providerCode, JSON.stringify(sealed), credentialDigest, sealed.keyId, expectedVersion]);
      return Object.freeze({ connection, validationJobId });
    } finally { tokenBytes.fill(0); }
  }

  async selectResources(input: SelectShippingResourcesInput): Promise<ShippingConnection> {
    const parsed = exact(input, ["tenantContext", "now", "providerCode", "operationId", "brandResourceId", "addressResourceId", "codDeliveredMarksPaid"]);
    const selected = authority(parsed.tenantContext, parsed.now);
    const providerCode = provider(parsed.providerCode);
    const operationId = uuid(parsed.operationId), brand = uuid(parsed.brandResourceId), address = uuid(parsed.addressResourceId);
    if (typeof parsed.codDeliveredMarksPaid !== "boolean") invalid();
    const setup = await this.setupPrivate(selected, providerCode);
    if (!setup) throw new ShippingAdminRepositoryError("not_found");
    const operationFingerprint = fingerprint("select_resources", selected.storeId, { profileId: setup.profileId, brand, address, cod: parsed.codDeliveredMarksPaid, expectedVersion: setup.version });
    return this.mutation(selected, operationId, operationFingerprint, "selected",
      "SELECT outcome,result_payload FROM saas.shipping_connection_select_resources($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::uuid,$12::uuid,$13::boolean,$14::bigint)",
      [...authorityValues(selected), operationId, operationFingerprint, setup.profileId, brand, address, parsed.codDeliveredMarksPaid, setup.version]);
  }

  async revokeConnection(input: RevokeShippingConnectionInput): Promise<ShippingConnection> {
    const parsed = exact(input, ["tenantContext", "now", "providerCode", "operationId"]);
    const selected = authority(parsed.tenantContext, parsed.now);
    const providerCode = provider(parsed.providerCode), operationId = uuid(parsed.operationId);
    const setup = await this.setupPrivate(selected, providerCode);
    if (!setup) throw new ShippingAdminRepositoryError("not_found");
    const operationFingerprint = fingerprint("revoke", selected.storeId, { profileId: setup.profileId, expectedVersion: setup.version });
    return this.mutation(selected, operationId, operationFingerprint, "revoked",
      "SELECT outcome,result_payload FROM saas.shipping_connection_revoke($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint)",
      [...authorityValues(selected), operationId, operationFingerprint, setup.profileId, setup.version]);
  }
}
