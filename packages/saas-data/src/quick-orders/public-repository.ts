import { types as nodeTypes } from "node:util";

import {
  parseCheckoutState,
  parseQuickOrderPublicQuote,
  type CheckoutState,
  type QuickOrderPublicQuote,
} from "../../../saas-contracts/src/quick-orders/index.ts";

import {
  acquirePostgresClient,
  type PostgresClientLike,
  type PostgresPoolLike,
  type PostgresTimeoutOptions,
} from "../postgres/pool.ts";
import {
  exposeQuickLinkError,
  isTrustedQuickLinkError,
  trustedQuickLinkError,
  type QuickOrderLinkErrorCode,
} from "./errors.ts";
import {
  exactQuickLinkInput,
  quickLinkDigest,
  quickLinkNow,
  quickLinkUuid,
} from "./validation.ts";

export type ClaimRedemptionInput = Readonly<{
  hostname: string;
  tokenDigest: string;
  redemptionId: string;
  redemptionDigest: string;
  now: Date;
  expiresAt: Date;
}>;

export type ResolveRedemptionInput = Readonly<{
  hostname: string;
  redemptionDigest: string;
  now: Date;
}>;

export interface PublicQuickOrderRepository {
  claimRedemption(input: ClaimRedemptionInput): Promise<QuickOrderPublicQuote>;
  resolveRedemption(input: ResolveRedemptionInput): Promise<QuickOrderPublicQuote>;
  getStatus(input: ResolveRedemptionInput): Promise<CheckoutState>;
  revokeRedemption(input: ResolveRedemptionInput & Readonly<{
    operationId: string;
    fingerprint: string;
  }>): Promise<void>;
}

type WorkflowOptions = Readonly<{
  pool: PostgresPoolLike;
  role: "celebix_saas_workflow";
  timeouts: PostgresTimeoutOptions;
  audit: (event: Readonly<{ type: "quick_link_commit_unknown" }>) => void | Promise<void>;
}>;
type QuerySpec = Readonly<{ text: string; values: unknown[] }>;
type Selected = Readonly<{ outcome: string; resultPayload: unknown }>;
type RedemptionProjection = Readonly<{
  canonicalHostname: string;
  redemptionExpiresAt: string;
  redemptionExpiresAtMilliseconds: number;
  quote: QuickOrderPublicQuote;
}>;

const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.(?:\d{3}|\d{6})Z$/;
const MAXIMUM_REDEMPTION_MILLISECONDS = 15 * 60_000;

function unavailable(): never {
  throw trustedQuickLinkError("unavailable");
}

function invalid(): never {
  throw trustedQuickLinkError("invalid_input");
}

function commitUnknown(): never {
  throw trustedQuickLinkError("commit_unknown");
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

function single(result: unknown): Selected {
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

function hostname(value: unknown, failure: "invalid_input" | "unavailable" = "invalid_input"): string {
  if (
    typeof value !== "string" || value.length < 3 || value.length > 253 ||
    value !== value.trim() || value !== value.toLowerCase() || !HOSTNAME.test(value)
  ) throw trustedQuickLinkError(failure);
  return value;
}

function timestamp(value: unknown): Readonly<{ text: string; milliseconds: number }> {
  if (typeof value !== "string" || !ISO_UTC.test(value)) unavailable();
  const parsed = new Date(value);
  const millisecondsText = value.replace(/(\.\d{3})\d{3}Z$/, "$1Z");
  const milliseconds = parsed.getTime();
  if (!Number.isFinite(milliseconds) || parsed.toISOString() !== millisecondsText) unavailable();
  return Object.freeze({ text: value, milliseconds });
}

function safeQuote(value: unknown): QuickOrderPublicQuote {
  try {
    return parseQuickOrderPublicQuote(value);
  } catch {
    return unavailable();
  }
}

function safeState(value: unknown): CheckoutState {
  try {
    return parseCheckoutState(value);
  } catch {
    return unavailable();
  }
}

function parseProjection(
  value: unknown,
  expectedHostname: string,
  now: Date,
  expectedExpiry?: Date,
): RedemptionProjection {
  const parsed = strictRecord(value, ["canonicalHostname", "redemptionExpiresAt", "quote"]);
  const canonicalHostname = hostname(parsed.canonicalHostname, "unavailable");
  const expiration = timestamp(parsed.redemptionExpiresAt);
  if (
    canonicalHostname !== expectedHostname || expiration.milliseconds <= now.getTime() ||
    (expectedExpiry !== undefined && expiration.milliseconds !== expectedExpiry.getTime())
  ) unavailable();
  return Object.freeze({
    canonicalHostname,
    redemptionExpiresAt: expiration.text,
    redemptionExpiresAtMilliseconds: expiration.milliseconds,
    quote: safeQuote(parsed.quote),
  });
}

function sameProjection(left: RedemptionProjection, right: RedemptionProjection): boolean {
  return left.canonicalHostname === right.canonicalHostname &&
    left.redemptionExpiresAtMilliseconds === right.redemptionExpiresAtMilliseconds &&
    JSON.stringify(left.quote) === JSON.stringify(right.quote);
}

function parseRevoked(value: unknown): void {
  const parsed = strictRecord(value, ["status"]);
  if (parsed.status !== "revoked") unavailable();
}

function throwOutcome(outcome: string): never {
  const direct = new Set<QuickOrderLinkErrorCode>([
    "invalid_input", "unauthenticated", "membership_denied", "store_inactive",
    "feature_not_enabled", "action_denied", "quick_link_not_found", "provider_not_ready",
    "catalog_item_unavailable", "stock_unavailable", "invalid_transition", "version_conflict",
    "operation_mismatch", "durable_authority_invalid",
  ]);
  if (direct.has(outcome as QuickOrderLinkErrorCode)) throw trustedQuickLinkError(outcome as QuickOrderLinkErrorCode);
  return unavailable();
}

function safeRelease(client: PostgresClientLike, destroy?: boolean): void {
  try {
    client.release(destroy);
  } catch {
    // Cleanup is best effort and cannot alter repository authority.
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

async function acquire(options: WorkflowOptions): Promise<PostgresClientLike> {
  try {
    return await acquirePostgresClient(options.pool, options.timeouts.poolCheckoutMs);
  } catch {
    return unavailable();
  }
}

async function configure(client: PostgresClientLike, options: WorkflowOptions): Promise<void> {
  await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [timeout(options.timeouts.statementMs)]);
  await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [timeout(options.timeouts.lockMs)]);
  await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [timeout(options.timeouts.idleTransactionMs)]);
  await client.query("SET LOCAL ROLE celebix_saas_workflow");
}

function emitUnknownCommitAudit(options: WorkflowOptions): void {
  try {
    const pending = options.audit(Object.freeze({ type: "quick_link_commit_unknown" }));
    void Promise.resolve(pending).catch(() => undefined);
  } catch {
    // Audit is observational only.
  }
}

async function read(options: WorkflowOptions, spec: QuerySpec): Promise<Selected> {
  const client = await acquire(options);
  let began = false;
  let terminal = false;
  try {
    await client.query("BEGIN READ ONLY");
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

async function recoverClaim(
  options: WorkflowOptions,
  hostnameValue: string,
  redemptionDigest: string,
  now: Date,
  observed: RedemptionProjection,
): Promise<RedemptionProjection> {
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
      "SELECT outcome, result_payload FROM saas.quick_links_resolve_redemption($1::text,$2::text,$3::timestamptz)",
      [hostnameValue, redemptionDigest, now],
    ));
    if (recovered.outcome !== "found") commitUnknown();
    const parsed = parseProjection(recovered.resultPayload, hostnameValue, now);
    if (!sameProjection(observed, parsed)) commitUnknown();
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

async function claim(
  options: WorkflowOptions,
  values: Readonly<{
    hostname: string;
    tokenDigest: string;
    redemptionId: string;
    redemptionDigest: string;
    now: Date;
    expiresAt: Date;
  }>,
): Promise<RedemptionProjection> {
  const client = await acquire(options);
  let began = false;
  let terminal = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    began = true;
    await configure(client, options);
    const selected = single(await client.query(
      `SELECT outcome, result_payload FROM saas.quick_links_claim_redemption(
        $1::text,$2::text,$3::uuid,$4::text,$5::timestamptz,$6::timestamptz
      )`,
      [values.hostname, values.tokenDigest, values.redemptionId, values.redemptionDigest, values.now, values.expiresAt],
    ));
    if (selected.outcome !== "claimed") throwOutcome(selected.outcome);
    const observed = parseProjection(selected.resultPayload, values.hostname, values.now, values.expiresAt);
    try {
      await client.query("COMMIT");
      terminal = true;
      safeRelease(client);
      return observed;
    } catch {
      terminal = true;
      safeRelease(client, true);
      emitUnknownCommitAudit(options);
      return await recoverClaim(options, values.hostname, values.redemptionDigest, values.now, observed);
    }
  } catch (error) {
    if (began && !terminal) await rollback(client);
    else if (!terminal) safeRelease(client, true);
    if (isTrustedQuickLinkError(error)) throw error;
    return unavailable();
  }
}

async function recoverRevoke(
  options: WorkflowOptions,
  values: Readonly<{
    hostname: string;
    redemptionDigest: string;
    operationId: string;
    fingerprint: string;
    now: Date;
  }>,
): Promise<void> {
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
      `SELECT outcome, result_payload FROM saas.quick_links_recover_redemption_revoke(
        $1::text,$2::text,$3::uuid,$4::text,$5::timestamptz
      )`,
      [values.hostname, values.redemptionDigest, values.operationId, values.fingerprint, values.now],
    ));
    if (recovered.outcome !== "operation_replayed") commitUnknown();
    parseRevoked(recovered.resultPayload);
    try {
      await client.query("COMMIT");
      terminal = true;
      safeRelease(client);
      return;
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

async function revoke(
  options: WorkflowOptions,
  values: Readonly<{
    hostname: string;
    redemptionDigest: string;
    operationId: string;
    fingerprint: string;
    now: Date;
  }>,
): Promise<void> {
  const client = await acquire(options);
  let began = false;
  let terminal = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    began = true;
    await configure(client, options);
    const selected = single(await client.query(
      `SELECT outcome, result_payload FROM saas.quick_links_revoke_redemption(
        $1::text,$2::text,$3::uuid,$4::text,$5::timestamptz
      )`,
      [values.hostname, values.redemptionDigest, values.operationId, values.fingerprint, values.now],
    ));
    if (selected.outcome !== "committed" && selected.outcome !== "operation_replayed") throwOutcome(selected.outcome);
    parseRevoked(selected.resultPayload);
    try {
      await client.query("COMMIT");
      terminal = true;
      safeRelease(client);
      return;
    } catch {
      terminal = true;
      safeRelease(client, true);
      emitUnknownCommitAudit(options);
      return await recoverRevoke(options, values);
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

function validateOptions(options: WorkflowOptions): WorkflowOptions {
  try {
    const selected = strictRecord(options, ["pool", "role", "timeouts", "audit"]);
    const selectedTimeouts = strictRecord(selected.timeouts, [
      "poolCheckoutMs", "statementMs", "lockMs", "idleTransactionMs",
    ]);
    if (selected.role !== "celebix_saas_workflow" || typeof selected.audit !== "function") unavailable();
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
      role: "celebix_saas_workflow",
      timeouts,
      audit: selected.audit as WorkflowOptions["audit"],
    });
  } catch (error) {
    throw exposeQuickLinkError(error, "unavailable");
  }
}

export class PostgresPublicQuickOrderRepository implements PublicQuickOrderRepository {
  private readonly options: WorkflowOptions;

  constructor(options: WorkflowOptions) {
    this.options = validateOptions(options);
  }

  claimRedemption(input: ClaimRedemptionInput): Promise<QuickOrderPublicQuote> {
    return expose(async () => {
      const parsed = exactQuickLinkInput(input, [
        "hostname", "tokenDigest", "redemptionId", "redemptionDigest", "now", "expiresAt",
      ]);
      const hostnameValue = hostname(parsed.hostname);
      const tokenDigest = quickLinkDigest(parsed.tokenDigest);
      const redemptionId = quickLinkUuid(parsed.redemptionId);
      const redemptionDigest = quickLinkDigest(parsed.redemptionDigest);
      const now = quickLinkNow(parsed.now);
      const expiresAt = quickLinkNow(parsed.expiresAt);
      const lifetime = expiresAt.getTime() - now.getTime();
      if (lifetime <= 0 || lifetime > MAXIMUM_REDEMPTION_MILLISECONDS) invalid();
      return (await claim(this.options, {
        hostname: hostnameValue,
        tokenDigest,
        redemptionId,
        redemptionDigest,
        now,
        expiresAt,
      })).quote;
    });
  }

  resolveRedemption(input: ResolveRedemptionInput): Promise<QuickOrderPublicQuote> {
    return expose(async () => {
      const parsed = exactQuickLinkInput(input, ["hostname", "redemptionDigest", "now"]);
      const hostnameValue = hostname(parsed.hostname);
      const redemptionDigest = quickLinkDigest(parsed.redemptionDigest);
      const now = quickLinkNow(parsed.now);
      const selected = await read(this.options, {
        text: "SELECT outcome, result_payload FROM saas.quick_links_resolve_redemption($1::text,$2::text,$3::timestamptz)",
        values: [hostnameValue, redemptionDigest, now],
      });
      if (selected.outcome !== "found") throwOutcome(selected.outcome);
      return parseProjection(selected.resultPayload, hostnameValue, now).quote;
    });
  }

  getStatus(input: ResolveRedemptionInput): Promise<CheckoutState> {
    return expose(async () => {
      const parsed = exactQuickLinkInput(input, ["hostname", "redemptionDigest", "now"]);
      const hostnameValue = hostname(parsed.hostname);
      const redemptionDigest = quickLinkDigest(parsed.redemptionDigest);
      const now = quickLinkNow(parsed.now);
      const selected = await read(this.options, {
        text: "SELECT outcome, result_payload FROM saas.checkout_get_redemption_status($1::text,$2::text,$3::timestamptz)",
        values: [hostnameValue, redemptionDigest, now],
      });
      if (selected.outcome !== "found") throwOutcome(selected.outcome);
      return safeState(selected.resultPayload);
    });
  }

  revokeRedemption(input: ResolveRedemptionInput & Readonly<{
    operationId: string;
    fingerprint: string;
  }>): Promise<void> {
    return expose(async () => {
      const parsed = exactQuickLinkInput(input, [
        "hostname", "redemptionDigest", "now", "operationId", "fingerprint",
      ]);
      const values = Object.freeze({
        hostname: hostname(parsed.hostname),
        redemptionDigest: quickLinkDigest(parsed.redemptionDigest),
        operationId: quickLinkUuid(parsed.operationId),
        fingerprint: quickLinkDigest(parsed.fingerprint),
        now: quickLinkNow(parsed.now),
      });
      await revoke(this.options, values);
    });
  }
}
