import { types as nodeTypes } from "node:util";

import {
  parseQuickOrderLinkDetail,
  parseQuickOrderLinkListItem,
  parseQuickOrderLinkMutationResult,
  type QuickOrderLinkDetail,
  type QuickOrderLinkListItem,
  type QuickOrderLinkMutationResult,
  type TenantContext,
} from "@celebix/saas-contracts";

import { acquirePostgresClient, type PostgresClientLike, type PostgresPoolLike } from "../postgres/pool.ts";
import { quickOrderFingerprint } from "./canonical.ts";
import {
  decodeQuickLinkCursor,
  encodeQuickLinkCursor,
  normalizeQuickLinkTimestamp,
  parseQuickLinkDatabaseCursor,
} from "./cursor.ts";
import {
  QUICK_LINK_ERROR_CODES,
  QuickOrderLinkRepositoryError,
  isTrustedQuickLinkError,
  trustedQuickLinkError,
  type QuickOrderLinkErrorCode,
} from "./errors.ts";
import type {
  CancelQuickLinkInput,
  CreateQuickLinkInput,
  DuplicateQuickLinkInput,
  GetQuickLinkInput,
  ListQuickLinksInput,
  ListQuickLinksResult,
  PostgresQuickOrderLinkRepositoryOptions,
  QuickLinkOperationKind,
  QuickOrderLinkRepository,
} from "./types.ts";
import {
  exactQuickLinkInput,
  quickLinkAddress,
  quickLinkAuthority,
  quickLinkComponentCents,
  quickLinkCustomerName,
  quickLinkDigest,
  quickLinkEmail,
  quickLinkExpiryHours,
  quickLinkItemIds,
  quickLinkItems,
  quickLinkLabel,
  quickLinkNote,
  quickLinkPageSize,
  quickLinkPhone,
  quickLinkSealedToken,
  quickLinkStatusFilter,
  quickLinkUuid,
  quickLinkVersion,
  type ValidatedQuickLinkAuthority,
} from "./validation.ts";

type QuerySpec = Readonly<{ text: string; values: unknown[] }>;
type MutationParser = (value: unknown, replayed: boolean) => QuickOrderLinkMutationResult;
type RepositoryOptions = Readonly<PostgresQuickOrderLinkRepositoryOptions>;
const ERROR_CODES = new Set<string>(QUICK_LINK_ERROR_CODES);

function unavailable(): QuickOrderLinkRepositoryError {
  return trustedQuickLinkError("unavailable");
}

function commitUnknown(): QuickOrderLinkRepositoryError {
  return trustedQuickLinkError("commit_unknown");
}

function timeout(value: number): string {
  if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) throw unavailable();
  return `${value}ms`;
}

function strictRecord(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw unavailable();
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw unavailable();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    const allowed = new Set([...required, ...optional]);
    if (
      keys.some((key) => typeof key !== "string" || !allowed.has(key)) ||
      required.some((key) => !Object.hasOwn(descriptors, key))
    ) throw unavailable();
    const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      if (typeof key !== "string") throw unavailable();
      const descriptor = descriptors[key];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw unavailable();
      copy[key] = descriptor.value;
    }
    return copy;
  } catch (error) {
    if (isTrustedQuickLinkError(error)) throw error;
    throw unavailable();
  }
}

function strictDenseArray(value: unknown, maximum: number): readonly unknown[] {
  try {
    if (
      !Array.isArray(value) ||
      nodeTypes.isProxy(value) ||
      Object.getPrototypeOf(value) !== Array.prototype
    ) throw unavailable();
    const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
    const lengthDescriptor = descriptors.length;
    if (
      !lengthDescriptor ||
      !("value" in lengthDescriptor) ||
      lengthDescriptor.enumerable ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      (lengthDescriptor.value as number) < 0 ||
      (lengthDescriptor.value as number) > maximum
    ) throw unavailable();
    const length = lengthDescriptor.value as number;
    if (Reflect.ownKeys(descriptors).length !== length + 1) throw unavailable();
    const copy: unknown[] = new Array(length);
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw unavailable();
      copy[index] = descriptor.value;
    }
    return Object.freeze(copy);
  } catch (error) {
    if (isTrustedQuickLinkError(error)) throw error;
    throw unavailable();
  }
}

function single(result: Readonly<{ rows: unknown[]; rowCount?: number | null }>): Readonly<{
  outcome: string;
  resultPayload: unknown;
}> {
  try {
    if (result.rowCount !== 1 || result.rows.length !== 1) throw unavailable();
    const parsed = strictRecord(result.rows[0], ["outcome", "result_payload"]);
    if (typeof parsed.outcome !== "string" || parsed.outcome.length < 1 || parsed.outcome.length > 64) throw unavailable();
    return Object.freeze({ outcome: parsed.outcome, resultPayload: parsed.result_payload });
  } catch (error) {
    if (isTrustedQuickLinkError(error)) throw error;
    throw unavailable();
  }
}

function safeListItem(value: unknown): QuickOrderLinkListItem {
  try { return parseQuickOrderLinkListItem(value); }
  catch { throw unavailable(); }
}

function safeDetail(value: unknown): QuickOrderLinkDetail {
  try { return parseQuickOrderLinkDetail(value); }
  catch { throw unavailable(); }
}

function safeMutation(value: unknown, replayed: boolean): QuickOrderLinkMutationResult {
  try {
    const parsed = strictRecord(value, ["id", "status", "version", "expiresAt", "updatedAt"]);
    return parseQuickOrderLinkMutationResult(Object.freeze({
      id: parsed.id,
      status: parsed.status,
      version: parsed.version,
      expiresAt: parsed.expiresAt,
      updatedAt: parsed.updatedAt,
      replayed,
    }));
  } catch {
    throw unavailable();
  }
}

function samePersistedMutation(
  observed: QuickOrderLinkMutationResult,
  recovered: QuickOrderLinkMutationResult,
): boolean {
  return (
    recovered.id === observed.id &&
    recovered.status === observed.status &&
    recovered.version === observed.version &&
    recovered.expiresAt === observed.expiresAt &&
    recovered.updatedAt === observed.updatedAt
  );
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
  try { client.release(destroy); }
  catch { /* Cleanup cannot alter an already-known repository outcome. */ }
}

async function configure(client: PostgresClientLike, options: RepositoryOptions): Promise<void> {
  await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [timeout(options.timeouts.statementMs)]);
  await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [timeout(options.timeouts.lockMs)]);
  await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [timeout(options.timeouts.idleTransactionMs)]);
  await client.query("SET LOCAL ROLE celebix_saas_app");
}

async function rollback(client: PostgresClientLike): Promise<void> {
  try {
    await client.query("ROLLBACK");
    safeRelease(client);
  } catch {
    safeRelease(client, true);
  }
}

function emitUnknownCommitAudit(options: RepositoryOptions): void {
  try {
    const pending = options.audit(Object.freeze({ type: "quick_link_commit_unknown" }));
    void Promise.resolve(pending).catch(() => undefined);
  } catch { /* Audit is observational and cannot change transaction authority. */ }
}

function expectedError(outcome: string): QuickOrderLinkRepositoryError | undefined {
  return ERROR_CODES.has(outcome) && !["operation_replayed", "unavailable", "commit_unknown"].includes(outcome)
    ? trustedQuickLinkError(outcome as QuickOrderLinkErrorCode)
    : undefined;
}

async function acquire(options: RepositoryOptions): Promise<PostgresClientLike> {
  try {
    return await acquirePostgresClient(options.pool, options.timeouts.poolCheckoutMs);
  } catch {
    throw unavailable();
  }
}

async function read<T>(
  options: RepositoryOptions,
  spec: QuerySpec,
  expectedOutcome: string,
  parser: (value: unknown) => T,
): Promise<T> {
  const client = await acquire(options);
  let began = false;
  let terminal = false;
  try {
    await client.query("BEGIN READ ONLY");
    began = true;
    await configure(client, options);
    const result = single(await client.query(spec.text, spec.values));
    const expected = expectedError(result.outcome);
    if (expected) throw expected;
    if (result.outcome !== expectedOutcome) throw unavailable();
    const parsed = parser(result.resultPayload);
    try {
      await client.query("COMMIT");
      terminal = true;
      safeRelease(client);
    } catch {
      terminal = true;
      safeRelease(client, true);
      throw unavailable();
    }
    return parsed;
  } catch (error) {
    if (began && !terminal) await rollback(client);
    else if (!began && !terminal) safeRelease(client, true);
    if (isTrustedQuickLinkError(error)) throw error;
    throw unavailable();
  }
}

async function recover(
  options: RepositoryOptions,
  authority: ValidatedQuickLinkAuthority,
  operationId: string,
  operation: QuickLinkOperationKind,
  fingerprint: string,
  parser: MutationParser,
  observed: QuickOrderLinkMutationResult,
): Promise<QuickOrderLinkMutationResult> {
  let client: PostgresClientLike;
  try {
    client = await acquire(options);
  } catch {
    throw commitUnknown();
  }
  let terminal = false;
  try {
    await client.query("BEGIN READ ONLY");
    await configure(client, options);
    const recovered = single(await client.query(
      `SELECT outcome, result_payload FROM saas.quick_links_recover_operation(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,
        $8::uuid,$9::text,$10::text
      )`,
      [...authorityValues(authority), operationId, operation, fingerprint],
    ));
    if (recovered.outcome !== "operation_replayed") throw commitUnknown();
    const parsed = parser(recovered.resultPayload, true);
    if (!samePersistedMutation(observed, parsed)) throw commitUnknown();
    try {
      await client.query("COMMIT");
      terminal = true;
      safeRelease(client);
      return parsed;
    } catch {
      terminal = true;
      safeRelease(client, true);
      throw commitUnknown();
    }
  } catch {
    if (!terminal) safeRelease(client, true);
    throw commitUnknown();
  }
}

async function mutate(
  options: RepositoryOptions,
  authority: ValidatedQuickLinkAuthority,
  operationId: string,
  operation: QuickLinkOperationKind,
  fingerprint: string,
  spec: QuerySpec,
  parser: MutationParser,
): Promise<QuickOrderLinkMutationResult> {
  const client = await acquire(options);
  let began = false;
  let terminal = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    began = true;
    await configure(client, options);
    const mutation = single(await client.query(spec.text, spec.values));
    const expected = expectedError(mutation.outcome);
    if (expected) throw expected;
    if (mutation.outcome !== "committed" && mutation.outcome !== "operation_replayed") throw unavailable();
    const parsed = parser(mutation.resultPayload, mutation.outcome === "operation_replayed");
    try {
      await client.query("COMMIT");
      terminal = true;
      safeRelease(client);
      return parsed;
    } catch {
      terminal = true;
      safeRelease(client, true);
      emitUnknownCommitAudit(options);
      return await recover(options, authority, operationId, operation, fingerprint, parser, parsed);
    }
  } catch (error) {
    if (began && !terminal) await rollback(client);
    else if (!began && !terminal) safeRelease(client, true);
    if (isTrustedQuickLinkError(error)) throw error;
    throw unavailable();
  }
}

function compareListOrder(previous: QuickOrderLinkListItem, current: QuickOrderLinkListItem): void {
  const previousTime = normalizeQuickLinkTimestamp(previous.createdAt);
  const currentTime = normalizeQuickLinkTimestamp(current.createdAt);
  if (previousTime < currentTime || (previousTime === currentTime && previous.id <= current.id)) throw unavailable();
}

export class PostgresQuickOrderLinkRepository implements QuickOrderLinkRepository {
  private readonly options: RepositoryOptions;

  constructor(options: PostgresQuickOrderLinkRepositoryOptions) {
    try {
      const selected = strictRecord(options, ["pool", "role", "timeouts", "audit"]);
      const selectedTimeouts = strictRecord(selected.timeouts, [
        "poolCheckoutMs", "statementMs", "lockMs", "idleTransactionMs",
      ]);
      if (selected.role !== "celebix_saas_app" || typeof selected.audit !== "function") throw unavailable();
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
      this.options = Object.freeze({
        pool: selected.pool as PostgresPoolLike,
        role: "celebix_saas_app",
        timeouts,
        audit: selected.audit as PostgresQuickOrderLinkRepositoryOptions["audit"],
      });
    } catch (error) {
      if (isTrustedQuickLinkError(error)) throw error;
      throw unavailable();
    }
  }

  async list(input: ListQuickLinksInput): Promise<ListQuickLinksResult> {
    const exact = exactQuickLinkInput(input, ["tenantContext", "now", "pageSize"], ["cursor", "status"]);
    const authority = quickLinkAuthority(exact.tenantContext as TenantContext, exact.now as Date);
    const pageSize = quickLinkPageSize(exact.pageSize);
    const status = quickLinkStatusFilter(exact.status);
    const cursor = decodeQuickLinkCursor(exact.cursor as string | undefined, authority.storeId, status);
    return read(this.options, {
      text: `SELECT outcome, result_payload FROM saas.quick_links_list(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,
        $8::text,$9::bigint,$10::timestamptz,$11::uuid
      )`,
      values: [
        ...authorityValues(authority), status ?? null, pageSize,
        cursor?.createdAt ?? null, cursor?.id ?? null,
      ],
    }, "listed", (value) => {
      const envelope = strictRecord(value, ["items"], ["nextCursor"]);
      const rawItems = strictDenseArray(envelope.items, pageSize);
      const parsedItems: QuickOrderLinkListItem[] = new Array(rawItems.length);
      for (let index = 0; index < rawItems.length; index += 1) {
        parsedItems[index] = safeListItem(rawItems[index]);
      }
      const items = Object.freeze(parsedItems);
      for (let index = 1; index < items.length; index += 1) compareListOrder(items[index - 1]!, items[index]!);
      if (!Object.hasOwn(envelope, "nextCursor")) return Object.freeze({ items });
      if (items.length !== pageSize || items.length === 0) throw unavailable();
      let databaseCursor;
      try { databaseCursor = parseQuickLinkDatabaseCursor(envelope.nextCursor, items.at(-1)!); }
      catch { throw unavailable(); }
      return Object.freeze({ items, nextCursor: encodeQuickLinkCursor(authority.storeId, status, databaseCursor) });
    });
  }

  async get(input: GetQuickLinkInput): Promise<QuickOrderLinkDetail> {
    const exact = exactQuickLinkInput(input, ["tenantContext", "now", "linkId"]);
    const authority = quickLinkAuthority(exact.tenantContext as TenantContext, exact.now as Date);
    const linkId = quickLinkUuid(exact.linkId);
    return read(this.options, {
      text: `SELECT outcome, result_payload FROM saas.quick_links_get(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid
      )`,
      values: [...authorityValues(authority), linkId],
    }, "found", (value) => {
      const result = safeDetail(value);
      if (result.id !== linkId) throw unavailable();
      return result;
    });
  }

  async create(input: CreateQuickLinkInput): Promise<QuickOrderLinkMutationResult> {
    const exact = exactQuickLinkInput(input, [
      "tenantContext", "now", "operationId", "linkId", "items", "providerConfigId",
      "customerName", "customerEmail", "shippingAddress", "billingAddress", "shippingCents",
      "discountCents", "expiryHours", "tokenDigest", "sealedToken",
    ], ["customerPhone", "customerNote", "internalLabel"]);
    const authority = quickLinkAuthority(exact.tenantContext as TenantContext, exact.now as Date);
    const operationId = quickLinkUuid(exact.operationId);
    const linkId = quickLinkUuid(exact.linkId);
    const items = quickLinkItems(exact.items);
    const providerConfigId = quickLinkUuid(exact.providerConfigId);
    const customerName = quickLinkCustomerName(exact.customerName);
    const customerEmail = quickLinkEmail(exact.customerEmail);
    const customerPhone = exact.customerPhone === undefined ? undefined : quickLinkPhone(exact.customerPhone);
    const shippingAddress = quickLinkAddress(exact.shippingAddress);
    const billingAddress = quickLinkAddress(exact.billingAddress);
    const customerNote = exact.customerNote === undefined ? undefined : quickLinkNote(exact.customerNote);
    const internalLabel = exact.internalLabel === undefined ? undefined : quickLinkLabel(exact.internalLabel);
    const shippingCents = quickLinkComponentCents(exact.shippingCents);
    const discountCents = quickLinkComponentCents(exact.discountCents);
    const expiryHours = quickLinkExpiryHours(exact.expiryHours);
    const tokenDigest = quickLinkDigest(exact.tokenDigest);
    const sealedToken = quickLinkSealedToken(exact.sealedToken);
    const fingerprint = quickOrderFingerprint("create", authority.storeId, {
      customerName,
      customerEmail,
      customerPhone: customerPhone ?? null,
      shippingAddress,
      billingAddress,
      customerNote: customerNote ?? null,
      internalLabel: internalLabel ?? null,
      shippingCents,
      discountCents,
      expiryHours,
      items: items.map(({ variantId, quantity }) => ({ variantId, quantity })),
      providerConfigId,
    });
    const parser: MutationParser = (value, replayed) => {
      const result = safeMutation(value, replayed);
      if ((!replayed && result.id !== linkId) || result.status !== "active" || result.version !== 1) throw unavailable();
      return result;
    };
    return mutate(this.options, authority, operationId, "create", fingerprint, {
      text: `SELECT outcome, result_payload FROM saas.quick_links_create(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,
        $8::uuid,$9::uuid[],$10::uuid[],$11::bigint[],$12::uuid,
        $13::text,$14::text,$15::text,$16::jsonb,$17::jsonb,$18::text,$19::text,
        $20::bigint,$21::bigint,$22::bigint,$23::text,$24::text,$25::jsonb,$26::uuid,$27::text
      )`,
      values: [
        ...authorityValues(authority), linkId,
        items.map(({ itemId }) => itemId), items.map(({ variantId }) => variantId), items.map(({ quantity }) => quantity),
        providerConfigId, customerName, customerEmail, customerPhone ?? null,
        JSON.stringify(shippingAddress), JSON.stringify(billingAddress), customerNote ?? null, internalLabel ?? null,
        shippingCents, discountCents, expiryHours, tokenDigest, sealedToken.keyId, JSON.stringify(sealedToken),
        operationId, fingerprint,
      ],
    }, parser);
  }

  async cancel(input: CancelQuickLinkInput): Promise<QuickOrderLinkMutationResult> {
    const exact = exactQuickLinkInput(input, ["tenantContext", "now", "linkId", "operationId", "expectedVersion"]);
    const authority = quickLinkAuthority(exact.tenantContext as TenantContext, exact.now as Date);
    const linkId = quickLinkUuid(exact.linkId);
    const operationId = quickLinkUuid(exact.operationId);
    const expectedVersion = quickLinkVersion(exact.expectedVersion);
    const fingerprint = quickOrderFingerprint("cancel", authority.storeId, { linkId, expectedVersion });
    const parser: MutationParser = (value, replayed) => {
      const result = safeMutation(value, replayed);
      if (result.id !== linkId || result.status !== "cancelled" || result.version !== expectedVersion + 1) throw unavailable();
      return result;
    };
    return mutate(this.options, authority, operationId, "cancel", fingerprint, {
      text: `SELECT outcome, result_payload FROM saas.quick_links_cancel(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,
        $8::uuid,$9::bigint,$10::uuid,$11::text
      )`,
      values: [...authorityValues(authority), linkId, expectedVersion, operationId, fingerprint],
    }, parser);
  }

  async duplicate(input: DuplicateQuickLinkInput): Promise<QuickOrderLinkMutationResult> {
    const exact = exactQuickLinkInput(input, [
      "tenantContext", "now", "linkId", "operationId", "newLinkId", "newItemIds", "tokenDigest", "sealedToken",
    ]);
    const authority = quickLinkAuthority(exact.tenantContext as TenantContext, exact.now as Date);
    const sourceLinkId = quickLinkUuid(exact.linkId);
    const operationId = quickLinkUuid(exact.operationId);
    const newLinkId = quickLinkUuid(exact.newLinkId);
    if (newLinkId === sourceLinkId) throw trustedQuickLinkError("invalid_input");
    const newItemIds = quickLinkItemIds(exact.newItemIds);
    const tokenDigest = quickLinkDigest(exact.tokenDigest);
    const sealedToken = quickLinkSealedToken(exact.sealedToken);
    const fingerprint = quickOrderFingerprint("duplicate", authority.storeId, { sourceLinkId });
    const parser: MutationParser = (value, replayed) => {
      const result = safeMutation(value, replayed);
      if ((!replayed && result.id !== newLinkId) || result.status !== "active" || result.version !== 1) throw unavailable();
      return result;
    };
    return mutate(this.options, authority, operationId, "duplicate", fingerprint, {
      text: `SELECT outcome, result_payload FROM saas.quick_links_duplicate(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,
        $8::uuid,$9::uuid,$10::uuid[],$11::text,$12::text,$13::jsonb,$14::uuid,$15::text
      )`,
      values: [
        ...authorityValues(authority), sourceLinkId, newLinkId, [...newItemIds], tokenDigest,
        sealedToken.keyId, JSON.stringify(sealedToken), operationId, fingerprint,
      ],
    }, parser);
  }
}
