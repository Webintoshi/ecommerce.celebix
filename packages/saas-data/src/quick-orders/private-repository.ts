import { types as nodeTypes } from "node:util";

import type { TenantContext } from "@celebix/saas-contracts";

import { acquirePostgresClient, type PostgresClientLike, type PostgresPoolLike } from "../postgres/pool.ts";
import {
  exposeQuickLinkError,
  isTrustedQuickLinkError,
  trustedQuickLinkError,
  type QuickOrderLinkErrorCode,
} from "./errors.ts";
import type { SealedEnvelope } from "./token-crypto.ts";
import type {
  PostgresQuickOrderLinkRepositoryOptions,
  QuickLinkAuthorityInput,
} from "./types.ts";
import {
  exactQuickLinkInput,
  quickLinkAuthority,
  quickLinkDigest,
  quickLinkSealedToken,
  quickLinkUuid,
  type ValidatedQuickLinkAuthority,
} from "./validation.ts";

export type ProviderReadiness = Readonly<{
  status: "missing" | "active" | "disabled" | "revoked";
  providerConfigId?: string;
  version?: number;
}>;

export type ConfigureQuickOrderProviderInput = QuickLinkAuthorityInput & Readonly<{
  providerConfigId: string;
  expectedVersion: number;
  operationId: string;
  configurationDigest: string;
  configurationKeyId: string;
  sealedConfiguration: SealedEnvelope;
  fingerprint: string;
}>;

export type RevokeQuickOrderProviderInput = QuickLinkAuthorityInput & Readonly<{
  providerConfigId: string;
  expectedVersion: number;
  operationId: string;
  fingerprint: string;
}>;

export interface QuickOrderPrivateRepository {
  getProviderReadiness(input: QuickLinkAuthorityInput): Promise<ProviderReadiness>;
  configureProvider(input: ConfigureQuickOrderProviderInput): Promise<ProviderReadiness & Readonly<{ status: "active" }>>;
  revokeProvider(input: RevokeQuickOrderProviderInput): Promise<ProviderReadiness & Readonly<{ status: "revoked" }>>;
  revealLinkCredential(input: QuickLinkAuthorityInput & Readonly<{ linkId: string }>): Promise<Readonly<{
    storeId: string;
    linkId: string;
    tokenDigest: string;
    sealedToken: SealedEnvelope;
    canonicalHostname: string;
    expiresAt: string;
  }>>;
  revealProviderConfiguration(input: QuickLinkAuthorityInput & Readonly<{ providerConfigId: string }>): Promise<Readonly<{
    storeId: string;
    providerConfigId: string;
    configurationDigest: string;
    sealedConfiguration: SealedEnvelope;
  }>>;
}

type Options = Readonly<PostgresQuickOrderLinkRepositoryOptions>;
type QuerySpec = Readonly<{ text: string; values: unknown[] }>;
type ProviderStatus = "active" | "disabled" | "revoked";
type ProviderOperation = "configure_provider" | "revoke_provider";
type ProviderProjection = Readonly<{
  status: ProviderStatus;
  providerConfigId: string;
  version: number;
}>;

const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.(?:\d{3}|\d{6})Z$/;

function unavailable(): never {
  throw trustedQuickLinkError("unavailable");
}

function commitUnknown(): never {
  throw trustedQuickLinkError("commit_unknown");
}

function invalid(): never {
  throw trustedQuickLinkError("invalid_input");
}

function strictRecord(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Readonly<Record<string, unknown>> {
  try {
    if (
      typeof value !== "object" || value === null || Array.isArray(value) || nodeTypes.isProxy(value)
    ) unavailable();
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) unavailable();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    const allowed = new Set([...required, ...optional]);
    if (
      keys.some((key) => typeof key !== "string" || !allowed.has(key)) ||
      required.some((key) => !Object.hasOwn(descriptors, key))
    ) unavailable();
    const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      if (typeof key !== "string") unavailable();
      const descriptor = descriptors[key];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) unavailable();
      copy[key] = descriptor.value;
    }
    return Object.freeze(copy);
  } catch (error) {
    if (isTrustedQuickLinkError(error)) throw error;
    return unavailable();
  }
}

function single(result: unknown): Readonly<{ outcome: string; resultPayload: unknown }> {
  try {
    if (typeof result !== "object" || result === null || nodeTypes.isProxy(result)) unavailable();
    const descriptors = Object.getOwnPropertyDescriptors(result);
    const rowsDescriptor = descriptors.rows;
    const rowCountDescriptor = descriptors.rowCount;
    if (!rowsDescriptor || !("value" in rowsDescriptor) || !rowCountDescriptor || !("value" in rowCountDescriptor)) unavailable();
    const rows = rowsDescriptor.value;
    if (!Array.isArray(rows) || nodeTypes.isProxy(rows) || Object.getPrototypeOf(rows) !== Array.prototype) unavailable();
    const rowDescriptors = Object.getOwnPropertyDescriptors(rows) as unknown as Record<PropertyKey, PropertyDescriptor>;
    const length = rowDescriptors.length;
    if (
      !length || !("value" in length) || length.value !== 1 || Reflect.ownKeys(rowDescriptors).length !== 2 ||
      rowCountDescriptor.value !== 1
    ) unavailable();
    const first = rowDescriptors["0"];
    if (!first || !("value" in first) || !first.enumerable) unavailable();
    const parsed = strictRecord(first.value, ["outcome", "result_payload"]);
    if (typeof parsed.outcome !== "string" || parsed.outcome.length < 1 || parsed.outcome.length > 64) unavailable();
    return Object.freeze({ outcome: parsed.outcome, resultPayload: parsed.result_payload });
  } catch (error) {
    if (isTrustedQuickLinkError(error)) throw error;
    return unavailable();
  }
}

function timeout(value: unknown): string {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 60_000) unavailable();
  return `${String(value)}ms`;
}

function integer(value: unknown, minimum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > Number.MAX_SAFE_INTEGER) invalid();
  return value as number;
}

function boundedString(value: unknown, maximum: number): string {
  if (
    typeof value !== "string" || value.length < 1 || value.length > maximum ||
    value !== value.trim() || CONTROL.test(value)
  ) invalid();
  return value;
}

function timestamp(value: unknown): string {
  if (typeof value !== "string" || !ISO_UTC.test(value)) unavailable();
  const date = new Date(value);
  const milliseconds = value.replace(/(\.\d{3})\d{3}Z$/, "$1Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== milliseconds) unavailable();
  return value;
}

function hostname(value: unknown): string {
  if (
    typeof value !== "string" || value.length < 3 || value.length > 253 ||
    value !== value.trim() || value !== value.toLowerCase() || !HOSTNAME.test(value)
  ) unavailable();
  return value;
}

function parseEnvelope(value: unknown, expectedKeyId: unknown): SealedEnvelope {
  try {
    const envelope = quickLinkSealedToken(value);
    if (typeof expectedKeyId !== "string" || envelope.keyId !== expectedKeyId) unavailable();
    return envelope;
  } catch (error) {
    if (isTrustedQuickLinkError(error) && error.code === "unavailable") throw error;
    return unavailable();
  }
}

function parseProviderProjection(value: unknown): ProviderProjection {
  const parsed = strictRecord(value, ["id", "providerKey", "status", "ready", "version", "updatedAt"]);
  let providerConfigId: string;
  try {
    providerConfigId = quickLinkUuid(parsed.id);
  } catch {
    return unavailable();
  }
  if (
    parsed.providerKey !== "paytr" ||
    (parsed.status !== "active" && parsed.status !== "disabled" && parsed.status !== "revoked") ||
    typeof parsed.ready !== "boolean" || parsed.ready !== (parsed.status === "active") ||
    !Number.isSafeInteger(parsed.version) || (parsed.version as number) < 1 ||
    (parsed.version as number) > Number.MAX_SAFE_INTEGER
  ) unavailable();
  timestamp(parsed.updatedAt);
  return Object.freeze({
    status: parsed.status,
    providerConfigId,
    version: parsed.version as number,
  });
}

function parseMissingReadiness(value: unknown): ProviderReadiness {
  const parsed = strictRecord(value, ["ready", "providerKey"]);
  if (parsed.ready !== false || parsed.providerKey !== "paytr") unavailable();
  return Object.freeze({ status: "missing" });
}

function parseReadiness(selected: Readonly<{ outcome: string; resultPayload: unknown }>): ProviderReadiness {
  if (selected.outcome === "not_configured") return parseMissingReadiness(selected.resultPayload);
  if (selected.outcome !== "found") throwOutcome(selected.outcome);
  return parseProviderProjection(selected.resultPayload);
}

function throwOutcome(outcome: string): never {
  const direct = new Set<QuickOrderLinkErrorCode>([
    "invalid_input", "unauthenticated", "membership_denied", "store_inactive",
    "feature_not_enabled", "action_denied", "quick_link_not_found", "provider_not_ready",
    "catalog_item_unavailable", "stock_unavailable", "invalid_transition", "version_conflict",
    "operation_mismatch", "durable_authority_invalid",
  ]);
  if (direct.has(outcome as QuickOrderLinkErrorCode)) throw trustedQuickLinkError(outcome as QuickOrderLinkErrorCode);
  if (outcome === "provider_not_found") throw trustedQuickLinkError("provider_not_ready");
  if (outcome === "provider_revoked") throw trustedQuickLinkError("invalid_transition");
  return unavailable();
}

function authorityValues(authority: ValidatedQuickLinkAuthority): unknown[] {
  return [
    authority.storeId,
    authority.principalId,
    authority.membershipId,
    authority.planId,
    authority.planCode,
    authority.planVersion,
    authority.now,
  ];
}

function safeRelease(client: PostgresClientLike, destroy?: boolean): void {
  try {
    client.release(destroy);
  } catch {
    // Cleanup is best effort and cannot replace the already-known outcome.
  }
}

async function rollback(client: PostgresClientLike): Promise<void> {
  try {
    await client.query("ROLLBACK");
    safeRelease(client);
  } catch {
    safeRelease(client, true);
  }
}

async function acquire(options: Options): Promise<PostgresClientLike> {
  try {
    return await acquirePostgresClient(options.pool, options.timeouts.poolCheckoutMs);
  } catch {
    return unavailable();
  }
}

async function configure(client: PostgresClientLike, options: Options): Promise<void> {
  await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [timeout(options.timeouts.statementMs)]);
  await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [timeout(options.timeouts.lockMs)]);
  await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [timeout(options.timeouts.idleTransactionMs)]);
  await client.query("SET LOCAL ROLE celebix_saas_app");
}

function emitUnknownCommitAudit(options: Options): void {
  try {
    const pending = options.audit(Object.freeze({ type: "quick_link_commit_unknown" }));
    void Promise.resolve(pending).catch(() => undefined);
  } catch {
    // Audit is observational only.
  }
}

async function execute(
  options: Options,
  spec: QuerySpec,
  readOnly: boolean,
): Promise<Readonly<{ outcome: string; resultPayload: unknown }>> {
  const client = await acquire(options);
  let began = false;
  let terminal = false;
  try {
    await client.query(readOnly ? "BEGIN READ ONLY" : "BEGIN ISOLATION LEVEL READ COMMITTED");
    began = true;
    await configure(client, options);
    const selected = single(await client.query(spec.text, spec.values));
    try {
      await client.query("COMMIT");
      terminal = true;
      safeRelease(client);
      return selected;
    } catch {
      terminal = true;
      safeRelease(client, true);
      return unavailable();
    }
  } catch (error) {
    if (began && !terminal) await rollback(client);
    else if (!terminal) safeRelease(client, true);
    if (isTrustedQuickLinkError(error)) throw error;
    return unavailable();
  }
}

function sameProvider(left: ProviderProjection, right: ProviderProjection): boolean {
  return left.status === right.status &&
    left.providerConfigId === right.providerConfigId &&
    left.version === right.version;
}

async function recoverProviderOperation(
  options: Options,
  authority: ValidatedQuickLinkAuthority,
  providerConfigId: string,
  operationId: string,
  operation: ProviderOperation,
  fingerprint: string,
  observed: ProviderProjection,
): Promise<ProviderProjection> {
  let client: PostgresClientLike;
  try {
    client = await acquirePostgresClient(options.pool, options.timeouts.poolCheckoutMs);
  } catch {
    return commitUnknown();
  }
  let terminal = false;
  try {
    await client.query("BEGIN READ ONLY");
    await configure(client, options);
    const recovered = single(await client.query(
      `SELECT outcome, result_payload FROM saas.quick_links_recover_provider_operation(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,
        $8::uuid,$9::uuid,$10::text,$11::text
      )`,
      [...authorityValues(authority), providerConfigId, operationId, operation, fingerprint],
    ));
    if (recovered.outcome !== "operation_replayed") commitUnknown();
    const parsed = parseProviderProjection(recovered.resultPayload);
    if (!sameProvider(observed, parsed)) commitUnknown();
    try {
      await client.query("COMMIT");
      terminal = true;
      safeRelease(client);
      return parsed;
    } catch {
      terminal = true;
      safeRelease(client, true);
      return commitUnknown();
    }
  } catch {
    if (!terminal) safeRelease(client, true);
    return commitUnknown();
  }
}

async function mutateProvider(
  options: Options,
  authority: ValidatedQuickLinkAuthority,
  providerConfigId: string,
  operationId: string,
  operation: ProviderOperation,
  fingerprint: string,
  expectedStatus: "active" | "revoked",
  expectedVersion: number,
  spec: QuerySpec,
): Promise<ProviderProjection> {
  const client = await acquire(options);
  let began = false;
  let terminal = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    began = true;
    await configure(client, options);
    const selected = single(await client.query(spec.text, spec.values));
    if (selected.outcome !== "committed" && selected.outcome !== "operation_replayed") throwOutcome(selected.outcome);
    const parsed = parseProviderProjection(selected.resultPayload);
    if (
      parsed.providerConfigId !== providerConfigId || parsed.status !== expectedStatus ||
      parsed.version !== expectedVersion + 1
    ) unavailable();
    try {
      await client.query("COMMIT");
      terminal = true;
      safeRelease(client);
      return parsed;
    } catch {
      terminal = true;
      safeRelease(client, true);
      emitUnknownCommitAudit(options);
      return await recoverProviderOperation(
        options, authority, providerConfigId, operationId, operation, fingerprint, parsed,
      );
    }
  } catch (error) {
    if (began && !terminal) await rollback(client);
    else if (!terminal) safeRelease(client, true);
    if (isTrustedQuickLinkError(error)) throw error;
    return unavailable();
  }
}

function expose<T>(operation: () => Promise<T>): Promise<T> {
  return operation().catch((error: unknown) => {
    throw exposeQuickLinkError(error, "unavailable");
  });
}

function validateOptions(options: PostgresQuickOrderLinkRepositoryOptions): Options {
  try {
    const selected = strictRecord(options, ["pool", "role", "timeouts", "audit"]);
    const selectedTimeouts = strictRecord(selected.timeouts, [
      "poolCheckoutMs", "statementMs", "lockMs", "idleTransactionMs",
    ]);
    if (selected.role !== "celebix_saas_app" || typeof selected.audit !== "function") unavailable();
    const timeouts = Object.freeze({
      poolCheckoutMs: selectedTimeouts.poolCheckoutMs as number,
      statementMs: selectedTimeouts.statementMs as number,
      lockMs: selectedTimeouts.lockMs as number,
      idleTransactionMs: selectedTimeouts.idleTransactionMs as number,
    });
    timeout(timeouts.poolCheckoutMs);
    timeout(timeouts.statementMs);
    timeout(timeouts.lockMs);
    timeout(timeouts.idleTransactionMs);
    return Object.freeze({
      pool: selected.pool as PostgresPoolLike,
      role: "celebix_saas_app",
      timeouts,
      audit: selected.audit as PostgresQuickOrderLinkRepositoryOptions["audit"],
    });
  } catch (error) {
    throw exposeQuickLinkError(error, "unavailable");
  }
}

export class PostgresQuickOrderPrivateRepository implements QuickOrderPrivateRepository {
  private readonly options: Options;

  constructor(options: PostgresQuickOrderLinkRepositoryOptions) {
    this.options = validateOptions(options);
  }

  getProviderReadiness(input: QuickLinkAuthorityInput): Promise<ProviderReadiness> {
    return expose(async () => {
      const parsed = exactQuickLinkInput(input, ["tenantContext", "now"]);
      const authority = quickLinkAuthority(parsed.tenantContext as TenantContext, parsed.now as Date);
      return parseReadiness(await execute(this.options, {
        text: `SELECT outcome, result_payload FROM saas.quick_links_get_provider_readiness(
          $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz
        )`,
        values: authorityValues(authority),
      }, true));
    });
  }

  configureProvider(input: ConfigureQuickOrderProviderInput): Promise<ProviderReadiness & Readonly<{ status: "active" }>> {
    return expose(async () => {
      const parsed = exactQuickLinkInput(input, [
        "tenantContext", "now", "providerConfigId", "expectedVersion", "operationId",
        "configurationDigest", "configurationKeyId", "sealedConfiguration", "fingerprint",
      ]);
      const authority = quickLinkAuthority(parsed.tenantContext as TenantContext, parsed.now as Date);
      const providerConfigId = quickLinkUuid(parsed.providerConfigId);
      const expectedVersion = integer(parsed.expectedVersion, 0);
      const operationId = quickLinkUuid(parsed.operationId);
      const configurationDigest = quickLinkDigest(parsed.configurationDigest);
      const configurationKeyId = boundedString(parsed.configurationKeyId, 128);
      const sealedConfiguration = quickLinkSealedToken(parsed.sealedConfiguration);
      if (sealedConfiguration.keyId !== configurationKeyId) invalid();
      const fingerprint = quickLinkDigest(parsed.fingerprint);
      return await mutateProvider(
        this.options, authority, providerConfigId, operationId, "configure_provider", fingerprint,
        "active", expectedVersion,
        {
          text: `SELECT outcome, result_payload FROM saas.quick_links_configure_provider(
            $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,
            $8::uuid,$9::bigint,$10::text,$11::text,$12::jsonb,$13::uuid,$14::text
          )`,
          values: [
            ...authorityValues(authority), providerConfigId, expectedVersion, configurationDigest,
            configurationKeyId, JSON.stringify(sealedConfiguration), operationId, fingerprint,
          ],
        },
      ) as ProviderReadiness & Readonly<{ status: "active" }>;
    });
  }

  revokeProvider(input: RevokeQuickOrderProviderInput): Promise<ProviderReadiness & Readonly<{ status: "revoked" }>> {
    return expose(async () => {
      const parsed = exactQuickLinkInput(input, [
        "tenantContext", "now", "providerConfigId", "expectedVersion", "operationId", "fingerprint",
      ]);
      const authority = quickLinkAuthority(parsed.tenantContext as TenantContext, parsed.now as Date);
      const providerConfigId = quickLinkUuid(parsed.providerConfigId);
      const expectedVersion = integer(parsed.expectedVersion, 1);
      const operationId = quickLinkUuid(parsed.operationId);
      const fingerprint = quickLinkDigest(parsed.fingerprint);
      return await mutateProvider(
        this.options, authority, providerConfigId, operationId, "revoke_provider", fingerprint,
        "revoked", expectedVersion,
        {
          text: `SELECT outcome, result_payload FROM saas.quick_links_revoke_provider(
            $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,
            $8::uuid,$9::bigint,$10::uuid,$11::text
          )`,
          values: [...authorityValues(authority), providerConfigId, expectedVersion, operationId, fingerprint],
        },
      ) as ProviderReadiness & Readonly<{ status: "revoked" }>;
    });
  }

  revealLinkCredential(input: QuickLinkAuthorityInput & Readonly<{ linkId: string }>): Promise<Readonly<{
    storeId: string;
    linkId: string;
    tokenDigest: string;
    sealedToken: SealedEnvelope;
    canonicalHostname: string;
    expiresAt: string;
  }>> {
    return expose(async () => {
      const parsed = exactQuickLinkInput(input, ["tenantContext", "now", "linkId"]);
      const authority = quickLinkAuthority(parsed.tenantContext as TenantContext, parsed.now as Date);
      const linkId = quickLinkUuid(parsed.linkId);
      const selected = await execute(this.options, {
        text: `SELECT outcome, result_payload FROM saas.quick_links_reveal_credential(
          $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid
        )`,
        values: [...authorityValues(authority), linkId],
      }, false);
      if (selected.outcome !== "found") throwOutcome(selected.outcome);
      const payload = strictRecord(selected.resultPayload, [
        "storeId", "linkId", "canonicalHostname", "expiresAt", "tokenDigest", "tokenKeyId", "sealedToken",
      ]);
      let storeId: string;
      let returnedLinkId: string;
      let tokenDigest: string;
      try {
        storeId = quickLinkUuid(payload.storeId);
        returnedLinkId = quickLinkUuid(payload.linkId);
        tokenDigest = quickLinkDigest(payload.tokenDigest);
      } catch {
        return unavailable();
      }
      if (storeId !== authority.storeId || returnedLinkId !== linkId) unavailable();
      const sealedToken = parseEnvelope(payload.sealedToken, payload.tokenKeyId);
      return Object.freeze({
        storeId,
        linkId: returnedLinkId,
        tokenDigest,
        sealedToken,
        canonicalHostname: hostname(payload.canonicalHostname),
        expiresAt: timestamp(payload.expiresAt),
      });
    });
  }

  revealProviderConfiguration(input: QuickLinkAuthorityInput & Readonly<{ providerConfigId: string }>): Promise<Readonly<{
    storeId: string;
    providerConfigId: string;
    configurationDigest: string;
    sealedConfiguration: SealedEnvelope;
  }>> {
    return expose(async () => {
      const parsed = exactQuickLinkInput(input, ["tenantContext", "now", "providerConfigId"]);
      const authority = quickLinkAuthority(parsed.tenantContext as TenantContext, parsed.now as Date);
      const providerConfigId = quickLinkUuid(parsed.providerConfigId);
      const selected = await execute(this.options, {
        text: `SELECT outcome, result_payload FROM saas.quick_links_reveal_provider_configuration(
          $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid
        )`,
        values: [...authorityValues(authority), providerConfigId],
      }, false);
      if (selected.outcome !== "found") throwOutcome(selected.outcome);
      const payload = strictRecord(selected.resultPayload, [
        "storeId", "providerConfigId", "version", "configurationDigest",
        "configurationKeyId", "sealedConfiguration",
      ]);
      let storeId: string;
      let returnedProviderConfigId: string;
      let configurationDigest: string;
      try {
        storeId = quickLinkUuid(payload.storeId);
        returnedProviderConfigId = quickLinkUuid(payload.providerConfigId);
        configurationDigest = quickLinkDigest(payload.configurationDigest);
      } catch {
        return unavailable();
      }
      if (
        storeId !== authority.storeId || returnedProviderConfigId !== providerConfigId ||
        !Number.isSafeInteger(payload.version) || (payload.version as number) < 1
      ) unavailable();
      const sealedConfiguration = parseEnvelope(payload.sealedConfiguration, payload.configurationKeyId);
      return Object.freeze({
        storeId,
        providerConfigId: returnedProviderConfigId,
        configurationDigest,
        sealedConfiguration,
      });
    });
  }
}
