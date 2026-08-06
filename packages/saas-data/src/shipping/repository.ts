import { createHash, createHmac } from "node:crypto";

import {
  parseShippingConnection,
  parseShipment,
  parseShippingQuoteSession,
  parseShippingResource,
  type Shipment,
  type ShippingConnection,
  type ShippingPackage,
  type ShippingProviderCode,
  type ShippingQuoteSession,
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
  BeginShippingQuoteInput,
  BeginShippingQuoteResult,
  BeginShippingShipmentActionInput,
  BeginShippingShipmentActionResult,
  BeginShippingShipmentInput,
  BeginShippingShipmentResult,
  CurrentShippingQuoteInput,
  CurrentShippingShipmentForOrderInput,
  CurrentShippingShipmentInput,
  CurrentShippingShipmentLabelInput,
  PostgresShippingAdminRepositoryOptions,
  RevokeShippingConnectionInput,
  SaveShippingConnectionInput,
  SaveShippingConnectionResult,
  SelectShippingResourcesInput,
  ShippingAdminRepository,
  ShippingAuthorityInput,
  ShippingConnectionSetup,
  ShippingShipmentActionKind,
  ShippingShipmentLabel,
} from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TOKEN = /^[\x21-\x7e]{16,4096}$/;
const QUOTE_CREDENTIAL = /^[A-Za-z0-9_-]{32,512}$/;
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

function packages(value: unknown): readonly ShippingPackage[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) invalid();
  const parsed = value.map((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry) || Object.keys(entry).sort().join(",") !== "depthCm,heightCm,weightKg,widthCm") invalid();
    const selected = entry as Record<string, unknown>;
    for (const key of ["heightCm", "widthCm", "depthCm", "weightKg"] as const) {
      const number = selected[key];
      if (typeof number !== "number" || !Number.isFinite(number) || number <= 0 || number > 10_000 || Math.round(number * 1_000) !== number * 1_000) invalid();
    }
    return Object.freeze({ heightCm: selected.heightCm as number, widthCm: selected.widthCm as number, depthCm: selected.depthCm as number, weightKg: selected.weightKg as number });
  });
  return Object.freeze(parsed);
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

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw unavailable();
  return value as Record<string, unknown>;
}

function parseQuoteBegin(value: unknown, credential: string, replayed: boolean): BeginShippingQuoteResult {
  const wrapper = object(value), quote = object(wrapper.quote);
  if (Object.keys(wrapper).sort().join(",") !== "jobId,quote" || Object.keys(quote).sort().join(",") !== "currency,expiresAt,options,packages,quoteId,status,version") throw unavailable();
  const expiresAt = typeof quote.expiresAt === "string" && Number.isFinite(new Date(quote.expiresAt).getTime()) ? quote.expiresAt : null;
  if (typeof wrapper.jobId !== "string" || !UUID.test(wrapper.jobId) || typeof quote.quoteId !== "string" || !UUID.test(quote.quoteId) || quote.status !== "queued" || quote.currency !== "TRY" || !expiresAt || !Array.isArray(quote.options) || quote.options.length !== 0) throw unavailable();
  return Object.freeze({ credential, quoteId: quote.quoteId, jobId: wrapper.jobId, expiresAt, packages: packages(quote.packages), replayed });
}

function parseQuote(value: unknown, credential: string): ShippingQuoteSession {
  const quote = object(value);
  if (typeof quote.quoteId !== "string" || !UUID.test(quote.quoteId) || !Number.isSafeInteger(quote.version)) throw unavailable();
  const { quoteId: _quoteId, version: _version, ...projection } = quote;
  try { return parseShippingQuoteSession({ credential, ...projection }); } catch { throw unavailable(); }
}

function parseShipmentBegin(value: unknown, replayed: boolean): BeginShippingShipmentResult {
  const wrapper = object(value);
  if (Object.keys(wrapper).sort().join(",") !== "jobId,shipment" || typeof wrapper.jobId !== "string" || !UUID.test(wrapper.jobId)) throw unavailable();
  try { return Object.freeze({ shipment: parseShipment(wrapper.shipment), jobId: wrapper.jobId, replayed }); } catch { throw unavailable(); }
}

function actionKind(value: unknown): ShippingShipmentActionKind {
  if (value !== "refresh" && value !== "label" && value !== "cancel" && value !== "return") invalid();
  return value;
}

function parseShipmentActionBegin(value: unknown, replayed: boolean): BeginShippingShipmentActionResult {
  const selected = object(value);
  if (Object.keys(selected).sort().join(",") !== "jobId" || typeof selected.jobId !== "string" || !UUID.test(selected.jobId)) throw unavailable();
  return Object.freeze({ jobId: selected.jobId, replayed });
}

function parseShipmentLabel(value: unknown): ShippingShipmentLabel {
  const selected = object(value);
  if (
    Object.keys(selected).sort().join(",") !== "bytesBase64,contentType,sha256,version" ||
    selected.contentType !== "image/svg+xml" || typeof selected.bytesBase64 !== "string" ||
    typeof selected.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(selected.sha256) ||
    !Number.isSafeInteger(selected.version) || (selected.version as number) < 1
  ) throw unavailable();
  let bytes: Uint8Array;
  try {
    const decoded = Buffer.from(selected.bytesBase64, "base64");
    if (decoded.byteLength < 1 || decoded.byteLength > 1_048_576 || decoded.toString("base64") !== selected.bytesBase64) throw unavailable();
    bytes = new Uint8Array(decoded);
  } catch { throw unavailable(); }
  if (createHash("sha256").update(bytes).digest("hex") !== selected.sha256) { bytes.fill(0); throw unavailable(); }
  return Object.freeze({ contentType: "image/svg+xml", bytes, sha256: selected.sha256, version: selected.version as number });
}

function quoteCredential(keyring: ShippingCredentialKeyring, storeId: string, operationId: string): string {
  const selected = keyring.keys.find(({ keyId }) => keyId === keyring.activeKeyId);
  if (!selected) throw unavailable();
  return createHmac("sha256", selected.key).update(`celebix.shipping.quote.v1\0${storeId}\0${operationId}`, "utf8").digest("base64url");
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

  private async recoverFulfillment(selected: Authority, operationId: string, operationFingerprint: string): Promise<unknown> {
    return this.transaction(true, async (client) => {
      const result = row(await client.query(
        "SELECT outcome,result_payload FROM saas.shipping_fulfillment_recover_operation($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text)",
        [...authorityValues(selected), operationId, operationFingerprint],
      ));
      if (result.outcome !== "operation_replayed") throw new ShippingAdminRepositoryError("commit_unknown");
      return result.result;
    });
  }

  async beginQuote(input: BeginShippingQuoteInput): Promise<BeginShippingQuoteResult> {
    const parsed = exact(input, ["tenantContext", "now", "orderId", "expectedOrderVersion", "packages", "operationId"]);
    const selected = authority(parsed.tenantContext, parsed.now), orderId = uuid(parsed.orderId), operationId = uuid(parsed.operationId);
    const expectedOrderVersion = version(parsed.expectedOrderVersion, 1), selectedPackages = packages(parsed.packages);
    const credential = quoteCredential(this.options.keyring, selected.storeId, operationId);
    const credentialDigest = createHash("sha256").update(credential, "utf8").digest("hex");
    const operationFingerprint = fingerprint("begin_quote", selected.storeId, { orderId, expectedOrderVersion, packages: selectedPackages });
    const quoteId = uuid(this.options.generateId()), jobId = uuid(this.options.generateId());
    try {
      return await this.transaction(false, async (client) => {
        const result = row(await client.query(
          "SELECT outcome,result_payload FROM saas.shipping_quote_begin($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::bigint,$10::jsonb,$11::uuid,$12::text,$13::uuid,$14::uuid,$15::text)",
          [...authorityValues(selected), orderId, expectedOrderVersion, JSON.stringify(selectedPackages), operationId, operationFingerprint, quoteId, jobId, credentialDigest],
        ));
        const known = this.known(result.outcome); if (known) throw known;
        if (result.outcome !== "queued" && result.outcome !== "operation_replayed") throw unavailable();
        return parseQuoteBegin(result.result, credential, result.outcome === "operation_replayed");
      });
    } catch (error) {
      if (!(error instanceof ShippingAdminRepositoryError) || error.code !== "commit_unknown") throw error;
      try { const pending = this.options.audit({ type: "shipping_commit_unknown" }); if (pending) void pending.catch(() => undefined); } catch {}
      return parseQuoteBegin(await this.recoverFulfillment(selected, operationId, operationFingerprint), credential, true);
    }
  }

  async currentQuote(input: CurrentShippingQuoteInput): Promise<ShippingQuoteSession | null> {
    const parsed = exact(input, ["tenantContext", "now", "credential"]), selected = authority(parsed.tenantContext, parsed.now);
    if (typeof parsed.credential !== "string" || !QUOTE_CREDENTIAL.test(parsed.credential)) invalid();
    const credential = parsed.credential;
    const credentialDigest = createHash("sha256").update(credential, "utf8").digest("hex");
    return this.transaction(false, async (client) => {
      const result = row(await client.query(
        "SELECT outcome,result_payload FROM saas.shipping_quote_current($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::text)",
        [...authorityValues(selected), credentialDigest],
      ));
      if (result.outcome === "not_found" && result.result === null) return null;
      const known = this.known(result.outcome); if (known) throw known;
      if (result.outcome !== "found") throw unavailable();
      const projection = object(result.result);
      if (projection.status === "queued" || projection.status === "failed" || !Array.isArray(projection.options) || projection.options.length === 0) throw new ShippingAdminRepositoryError("quote_not_ready");
      return parseQuote(projection, credential);
    });
  }

  async beginShipment(input: BeginShippingShipmentInput): Promise<BeginShippingShipmentResult> {
    const parsed = exact(input, ["tenantContext", "now", "orderId", "expectedOrderVersion", "quoteCredential", "optionId", "operationId"]);
    const selected = authority(parsed.tenantContext, parsed.now), orderId = uuid(parsed.orderId), optionId = uuid(parsed.optionId), operationId = uuid(parsed.operationId);
    const expectedOrderVersion = version(parsed.expectedOrderVersion, 1);
    if (typeof parsed.quoteCredential !== "string" || !QUOTE_CREDENTIAL.test(parsed.quoteCredential)) invalid();
    const credentialDigest = createHash("sha256").update(parsed.quoteCredential, "utf8").digest("hex");
    const operationFingerprint = fingerprint("begin_shipment", selected.storeId, { orderId, expectedOrderVersion, credentialDigest, optionId });
    const shipmentId = uuid(this.options.generateId()), jobId = uuid(this.options.generateId()), eventId = uuid(this.options.generateId());
    try {
      return await this.transaction(false, async (client) => {
        const result = row(await client.query(
          "SELECT outcome,result_payload FROM saas.shipping_shipment_begin($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::bigint,$10::text,$11::uuid,$12::uuid,$13::text,$14::uuid,$15::uuid,$16::uuid)",
          [...authorityValues(selected), orderId, expectedOrderVersion, credentialDigest, optionId, operationId, operationFingerprint, shipmentId, jobId, eventId],
        ));
        const known = this.known(result.outcome); if (known) throw known;
        if (result.outcome !== "queued" && result.outcome !== "operation_replayed") throw unavailable();
        return parseShipmentBegin(result.result, result.outcome === "operation_replayed");
      });
    } catch (error) {
      if (!(error instanceof ShippingAdminRepositoryError) || error.code !== "commit_unknown") throw error;
      try { const pending = this.options.audit({ type: "shipping_commit_unknown" }); if (pending) void pending.catch(() => undefined); } catch {}
      return parseShipmentBegin(await this.recoverFulfillment(selected, operationId, operationFingerprint), true);
    }
  }

  async currentShipment(input: CurrentShippingShipmentInput): Promise<Shipment | null> {
    const parsed = exact(input, ["tenantContext", "now", "shipmentId"]), selected = authority(parsed.tenantContext, parsed.now), shipmentId = uuid(parsed.shipmentId);
    return this.transaction(true, async (client) => {
      const result = row(await client.query(
        "SELECT outcome,result_payload FROM saas.shipping_shipment_current($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid)",
        [...authorityValues(selected), shipmentId],
      ));
      if (result.outcome === "not_found" && result.result === null) return null;
      const known = this.known(result.outcome); if (known) throw known;
      if (result.outcome !== "found") throw unavailable();
      try { return parseShipment(result.result); } catch { throw unavailable(); }
    });
  }

  async currentShipmentForOrder(input: CurrentShippingShipmentForOrderInput): Promise<Shipment | null> {
    const parsed = exact(input, ["tenantContext", "now", "orderId"]), selected = authority(parsed.tenantContext, parsed.now), orderId = uuid(parsed.orderId);
    return this.transaction(true, async (client) => {
      const result = row(await client.query(
        "SELECT outcome,result_payload FROM saas.shipping_shipment_for_order($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid)",
        [...authorityValues(selected), orderId],
      ));
      if (result.outcome === "not_found" && result.result === null) return null;
      const known = this.known(result.outcome); if (known) throw known;
      if (result.outcome !== "found") throw unavailable();
      try { return parseShipment(result.result); } catch { throw unavailable(); }
    });
  }

  async beginShipmentAction(input: BeginShippingShipmentActionInput): Promise<BeginShippingShipmentActionResult> {
    const parsed = exact(input, ["tenantContext", "now", "orderId", "shipmentId", "expectedShipmentVersion", "actionKind", "operationId"]);
    const selected = authority(parsed.tenantContext, parsed.now), orderId = uuid(parsed.orderId), shipmentId = uuid(parsed.shipmentId);
    const expectedShipmentVersion = version(parsed.expectedShipmentVersion, 1), selectedKind = actionKind(parsed.actionKind), operationId = uuid(parsed.operationId);
    const operationFingerprint = fingerprint("shipment_action", selected.storeId, { orderId, shipmentId, expectedShipmentVersion, actionKind: selectedKind });
    const jobId = uuid(this.options.generateId());
    const execute = async () => this.transaction(false, async (client) => {
      const result = row(await client.query(
        "SELECT outcome,result_payload FROM saas.shipping_shipment_action_begin($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::uuid,$10::bigint,$11::text,$12::uuid,$13::text,$14::uuid)",
        [...authorityValues(selected), orderId, shipmentId, expectedShipmentVersion, selectedKind, operationId, operationFingerprint, jobId],
      ));
      const known = this.known(result.outcome); if (known) throw known;
      if (result.outcome !== "queued" && result.outcome !== "operation_replayed") throw unavailable();
      return parseShipmentActionBegin(result.result, result.outcome === "operation_replayed");
    });
    try { return await execute(); }
    catch (error) {
      if (!(error instanceof ShippingAdminRepositoryError) || error.code !== "commit_unknown") throw error;
      try { const pending = this.options.audit({ type: "shipping_commit_unknown" }); if (pending) void pending.catch(() => undefined); } catch {}
      return this.transaction(true, async (client) => {
        const result = row(await client.query(
          "SELECT outcome,result_payload FROM saas.shipping_shipment_action_recover($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text)",
          [...authorityValues(selected), operationId, operationFingerprint],
        ));
        if (result.outcome !== "operation_replayed") throw new ShippingAdminRepositoryError("commit_unknown");
        return parseShipmentActionBegin(result.result, true);
      });
    }
  }

  async currentShipmentLabel(input: CurrentShippingShipmentLabelInput): Promise<ShippingShipmentLabel | null> {
    const parsed = exact(input, ["tenantContext", "now", "orderId", "shipmentId"]);
    const selected = authority(parsed.tenantContext, parsed.now), orderId = uuid(parsed.orderId), shipmentId = uuid(parsed.shipmentId);
    return this.transaction(true, async (client) => {
      const result = row(await client.query(
        "SELECT outcome,result_payload FROM saas.shipping_shipment_label_current($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::uuid)",
        [...authorityValues(selected), orderId, shipmentId],
      ));
      if (result.outcome === "not_found" && result.result === null) return null;
      const known = this.known(result.outcome); if (known) throw known;
      if (result.outcome !== "found") throw unavailable();
      return parseShipmentLabel(result.result);
    });
  }
}
