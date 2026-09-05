import {
  parsePromotionAdminAnalyticsResult,
  parsePromotionAnalyticsDetailResult,
  parsePromotionAdminListPage,
  parsePromotionCodeBatch,
  parsePromotionCodeBatchList,
  parsePromotionConflictCheck,
  parsePromotionCsvExport,
  parsePromotionDetail,
  parsePromotionLegacyProjection,
  parsePromotionLegacyPage,
  parsePromotionMarginCheck,
  parsePromotionPickerList,
  parsePromotionPickerResolve,
  parsePromotionOverviewResult,
  parsePromotionSimulatorResponse,
  type PromotionDetail,
  type PromotionLegacyProjection,
  type TenantContext,
} from "@celebix/saas-contracts";
import { acquirePostgresClient, type PostgresClientLike } from "../postgres/pool.ts";
import type { ValidatedOrderAuthority } from "../orders/validation.ts";
import { equalPromotionProjection, promotionCursorBinding, promotionFingerprint, type PromotionOperationKind } from "./canonical.ts";
import { promotionFailure, promotionRepositoryErrorCode, type PromotionRepositoryErrorCode } from "./errors.ts";
import type {
  ArchivePromotionInput,
  CheckPromotionInput,
  CreatePromotionCodeBatchInput,
  CreatePromotionInput,
  DuplicatePromotionInput,
  ExportPromotionCodesInput,
  ListPromotionCodeBatchesInput,
  ListPromotionLegacyInput,
  ListPromotionPickerInput,
  ListPromotionsInput,
  PausePromotionInput,
  PostgresPromotionRepositoryOptions,
  PromotionAnalyticsResult,
  PromotionCodeBatchPage,
  PromotionCodeBatchMutationResult,
  PromotionCodeCsvExport,
  PromotionConflictCheck,
  PromotionLegacyPage,
  PromotionListResult,
  PromotionMarginCheck,
  PromotionMutationResult,
  PromotionPickerItem,
  PromotionPickerListResult,
  PromotionRepository,
  PublishPromotionInput,
  ResolvePromotionPickerInput,
  ResumePromotionInput,
  SimulatePromotionInput,
  UpdatePromotionCodeBatchStatusInput,
  UpdatePromotionInput,
} from "./types.ts";
import {
  exactPromotionInput,
  promotionAudienceModes,
  promotionBatchPrefix,
  promotionBatchStatus,
  promotionAuthority,
  promotionBenefitKinds,
  promotionCodes,
  promotionContext,
  promotionEffectiveStatuses,
  promotionIds,
  promotionInteger,
  promotionName,
  promotionOptionalExpiry,
  promotionPageSize,
  promotionPickerKind,
  promotionRule,
  promotionScheduleRange,
  promotionSearch,
  promotionTimestamp,
  promotionTriggerKinds,
  promotionUuid,
  promotionVersion,
  type PromotionAuthorityAction,
  type ValidatedPromotionAuthority,
} from "./validation.ts";

const SQL = Object.freeze({
  timezone: "SELECT outcome,result_payload FROM saas.promotion_store_timezone_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz)",
  storefrontOrigin: "SELECT outcome,result_payload FROM saas.promotion_storefront_origin_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz)",
  list: "SELECT outcome,result_payload FROM saas.promotion_list_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::text,$9::text[],$10::text[],$11::text[],$12::text[],$13::timestamptz,$14::timestamptz,$15::integer,$16::timestamptz,$17::timestamptz,$18::uuid)",
  detail: "SELECT outcome,result_payload FROM saas.promotion_detail_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid)",
  create: "SELECT outcome,result_payload FROM saas.promotion_create_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::text,$12::jsonb)",
  update: "SELECT outcome,result_payload FROM saas.promotion_update_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint,$12::text,$13::jsonb)",
  lifecycle: "SELECT outcome,result_payload FROM saas.promotion_lifecycle_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint,$12::text)",
  duplicate: "SELECT outcome,result_payload FROM saas.promotion_duplicate_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::uuid,$12::bigint,$13::text,$14::text[])",
  simulate: "SELECT outcome,result_payload FROM saas.promotion_simulate_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::jsonb,$9::jsonb)",
  conflicts: "SELECT outcome,result_payload FROM saas.promotion_conflicts_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::bigint,$10::jsonb)",
  margin: "SELECT outcome,result_payload FROM saas.promotion_margin_check_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::bigint,$10::jsonb)",
  pickerList: "SELECT outcome,result_payload FROM saas.promotion_picker_list_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::text,$9::text,$10::integer,$11::text,$12::uuid)",
  pickerResolve: "SELECT outcome,result_payload FROM saas.promotion_picker_resolve_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::text,$9::uuid[])",
  createBatch: "SELECT outcome,result_payload FROM saas.promotion_create_code_batch_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::uuid,$12::integer,$13::text,$14::integer,$15::integer,$16::timestamptz)",
  batchStatus: "SELECT outcome,result_payload FROM saas.promotion_code_batch_status_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint,$12::text)",
  batchList: "SELECT outcome,result_payload FROM saas.promotion_code_batch_list_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::integer,$10::timestamptz,$11::timestamptz,$12::uuid)",
  csv: "SELECT outcome,result_payload FROM saas.promotion_codes_csv_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid)",
  analytics: "SELECT outcome,result_payload FROM saas.promotion_analytics_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid)",
  analyticsDetail: "SELECT outcome,result_payload FROM saas.promotion_analytics_v2($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::integer)",
  overview: "SELECT outcome,result_payload FROM saas.promotion_overview_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::integer)",
  legacy: "SELECT outcome,result_payload FROM saas.promotion_legacy_list_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::integer,$9::timestamptz,$10::timestamptz,$11::uuid)",
  legacyResolve: "SELECT outcome,result_payload FROM saas.promotion_legacy_resolve_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid)",
  recover: "SELECT outcome,result_payload FROM saas.promotion_recover_operation_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::text)",
});

const AUTHORITY_FAILURES = Object.freeze([
  "invalid_input", "durable_authority_invalid", "store_inactive", "membership_denied", "feature_not_enabled",
] as const);
const OPERATION_FAILURES = Object.freeze([...AUTHORITY_FAILURES, "operation_mismatch", "operation_result_invalid"] as const);
const RECOVERY_FAILURES = OPERATION_FAILURES;
function acceptedFailures(...outcomes: readonly string[]): readonly string[] {
  return Object.freeze([...AUTHORITY_FAILURES, ...outcomes]);
}
const UTF8 = new TextEncoder();
const MICROSECOND_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

type ResultRow = Readonly<{ outcome: string; result: unknown }>;
type CursorAnchor = Readonly<{ snapshotAt: string; createdAt: string; id: string }>;
type PickerCursorAnchor = Readonly<{ sortKey: string; id: string }>;
type FailureParser = (outcome: string, value: unknown) => Error;

function unavailable(): Error { return promotionFailure("unavailable"); }
function timeout(value: unknown): string {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 60_000) throw unavailable();
  return `${value}ms`;
}
function release(client: PostgresClientLike, destroy = false): void {
  try { client.release(destroy || undefined); } catch { /* terminal */ }
}
function authorityValues(authority: ValidatedOrderAuthority): unknown[] {
  return [authority.storeId, authority.principalId, authority.membershipId, authority.planId, authority.planCode, authority.planVersion, authority.now];
}
function exactObject(value: unknown, keys: readonly string[]): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw unavailable();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw unavailable();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).map(String).sort().join(",") !== [...keys].sort().join(",")) throw unavailable();
  const copied = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw unavailable();
    copied[key] = descriptor.value;
  }
  return copied;
}
function denseArray(value: unknown, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) throw unavailable();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) throw unavailable();
  const copied: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw unavailable();
    copied.push(descriptor.value);
  }
  return copied;
}
function selectedRow(result: Readonly<{ rows: unknown[]; rowCount?: number | null }>): ResultRow {
  try {
    const root = Object.getOwnPropertyDescriptors(result), rowsDescriptor = root.rows, countDescriptor = root.rowCount;
    if (!rowsDescriptor || !("value" in rowsDescriptor) || !countDescriptor || !("value" in countDescriptor) || countDescriptor.value !== 1) throw unavailable();
    const rows = rowsDescriptor.value;
    if (!Array.isArray(rows) || Object.getPrototypeOf(rows) !== Array.prototype || rows.length !== 1) throw unavailable();
    const descriptors = Object.getOwnPropertyDescriptors(rows), item = descriptors["0"];
    if (Reflect.ownKeys(descriptors).length !== 2 || !item || !("value" in item) || !item.enumerable) throw unavailable();
    const row = exactObject(item.value, ["outcome", "result_payload"]);
    if (typeof row.outcome !== "string" || row.outcome.length < 1 || row.outcome.length > 64) throw unavailable();
    return Object.freeze({ outcome: row.outcome, result: row.result_payload });
  } catch (error) {
    if (promotionRepositoryErrorCode(error)) throw error;
    throw unavailable();
  }
}
function parseUtc(value: unknown, millisecondsOnly = false): string {
  if (typeof value !== "string" || !(millisecondsOnly ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) : MICROSECOND_UTC.test(value))) throw unavailable();
  const millisecondValue = millisecondsOnly ? value : `${value.slice(0, 23)}Z`;
  const parsed = new Date(millisecondValue);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== millisecondValue) throw unavailable();
  return value;
}
function integer(value: unknown, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) throw unavailable();
  return value as number;
}
function text(value: unknown, minimum: number, maximum: number): string {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum || value !== value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) throw unavailable();
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw unavailable();
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) throw unavailable();
  }
  return value;
}
function currency(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value)) throw unavailable();
  return value;
}
function uuid(value: unknown): string {
  try { return promotionUuid(value); } catch { throw unavailable(); }
}
function encodeCursor(storeId: string, kind: string, query: unknown, anchor: unknown): string {
  const value = { version: 1, kind, binding: promotionCursorBinding(storeId, kind, query, anchor), anchor };
  const encoded = Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  if (encoded.length > 2_048) throw unavailable();
  return encoded;
}
function decodeCursor(value: unknown, storeId: string, kind: string, query: unknown): Readonly<Record<string, unknown>> | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length < 1 || value.length > 2_048 || !/^[A-Za-z0-9_-]+$/.test(value)) throw promotionFailure("invalid_input");
  try {
    const bytes = Buffer.from(value, "base64url");
    if (bytes.toString("base64url") !== value || bytes.length > 1_536) throw promotionFailure("invalid_input");
    const root = exactPromotionInput(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)), ["version", "kind", "binding", "anchor"]);
    if (root.version !== 1 || root.kind !== kind || typeof root.binding !== "string" || !/^[a-f0-9]{64}$/.test(root.binding)) throw promotionFailure("invalid_input");
    const anchor = exactPromotionInput(root.anchor, kind === "promotion_picker" ? ["sortKey", "id"] : ["snapshotAt", "createdAt", "id"]);
    if (root.binding !== promotionCursorBinding(storeId, kind, query, anchor)) throw promotionFailure("invalid_input");
    return anchor;
  } catch (error) {
    if (promotionRepositoryErrorCode(error)) throw error;
    throw promotionFailure("invalid_input");
  }
}

function parseBatch(value: unknown) {
  try { return parsePromotionCodeBatch(value); } catch { throw unavailable(); }
}

export class PostgresPromotionRepository implements PromotionRepository {
  private readonly options: PostgresPromotionRepositoryOptions;
  constructor(options: PostgresPromotionRepositoryOptions) {
    try {
      if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).sort().join(",") !== "audit,pool,role,timeouts,uuid" || options.role !== "celebix_saas_app" || typeof options.uuid !== "function" || typeof options.audit !== "function" || !options.timeouts || Object.keys(options.timeouts).sort().join(",") !== "idleTransactionMs,lockMs,poolCheckoutMs,statementMs") throw unavailable();
      Object.values(options.timeouts).forEach(timeout);
      this.options = Object.freeze({ ...options, timeouts: Object.freeze({ ...options.timeouts }) });
    } catch (error) {
      if (promotionRepositoryErrorCode(error)) throw error;
      throw unavailable();
    }
  }
  private async acquire(): Promise<PostgresClientLike> {
    try { return await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs); } catch { throw unavailable(); }
  }
  async timezone(input: Parameters<PromotionRepository["timezone"]>[0]): Promise<string> {
    const { authority } = this.validated(input, ["tenantContext", "now"]);
    return this.read(SQL.timezone, authorityValues(authority), "listed", (value) => {
      const projection = exactObject(value, ["timezone"]), timezone = projection.timezone;
      if (typeof timezone !== "string" || timezone.length < 1 || timezone.length > 64) throw unavailable();
      try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }); } catch { throw unavailable(); }
      return timezone;
    }, AUTHORITY_FAILURES);
  }
  async storefrontOrigin(input: Parameters<PromotionRepository["storefrontOrigin"]>[0]): Promise<string | null> {
    const { authority } = this.validated(input, ["tenantContext", "now"]);
    return this.read(SQL.storefrontOrigin, authorityValues(authority), "listed", (value) => {
      const projection = exactObject(value, ["origin"]), origin = projection.origin;
      if (origin === null) return null;
      if (typeof origin !== "string" || origin.length > 261) throw unavailable();
      try { const parsed = new URL(origin); if (parsed.protocol !== "https:" || parsed.origin !== origin || parsed.username || parsed.password || parsed.port || !/^[a-z0-9.-]{3,253}$/.test(parsed.hostname)) throw unavailable(); }
      catch { throw unavailable(); }
      return origin;
    }, AUTHORITY_FAILURES);
  }
  private async query(client: PostgresClientLike, query: string, values?: unknown[]) {
    try { return await client.query(query, values); } catch { throw unavailable(); }
  }
  private async configure(client: PostgresClientLike): Promise<void> {
    await this.query(client, "SELECT pg_catalog.set_config('statement_timeout', $1, true)", [timeout(this.options.timeouts.statementMs)]);
    await this.query(client, "SELECT pg_catalog.set_config('lock_timeout', $1, true)", [timeout(this.options.timeouts.lockMs)]);
    await this.query(client, "SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [timeout(this.options.timeouts.idleTransactionMs)]);
    await this.query(client, "SET LOCAL ROLE celebix_saas_app");
  }
  private mapped(outcome: string, value: unknown, allowedFailures: readonly string[], failureParser?: FailureParser): Error | undefined {
    if (!allowedFailures.includes(outcome)) return undefined;
    if (outcome === "version_conflict" || outcome === "publish_blocked") {
      if (!failureParser) return unavailable();
      try { return failureParser(outcome, value); } catch { return unavailable(); }
    }
    const aliases: Record<string, PromotionRepositoryErrorCode> = {
      not_found: "resource_not_found",
      operation_mismatch: "idempotency_mismatch",
    };
    return promotionFailure(aliases[outcome] ?? outcome as PromotionRepositoryErrorCode);
  }
  private async rollback(client: PostgresClientLike, destroy = false): Promise<void> {
    try { await this.query(client, "ROLLBACK"); release(client, destroy); } catch { release(client, true); }
  }
  private async transact<T>(mode: "read" | "write", textValue: string, values: unknown[], success: readonly string[], parser: (value: unknown, outcome: string) => T, allowedFailures: readonly string[], failureParser?: FailureParser, destroyOnFailure = false): Promise<T> {
    const client = await this.acquire(); let began = false, terminal = false;
    try {
      await this.query(client, mode === "read" ? "BEGIN READ ONLY" : "BEGIN ISOLATION LEVEL READ COMMITTED"); began = true;
      await this.configure(client);
      const selected = selectedRow(await this.query(client, textValue, values));
      const known = this.mapped(selected.outcome, selected.result, allowedFailures, failureParser);
      if (known) throw known;
      if (!success.includes(selected.outcome)) throw unavailable();
      const parsed = parser(selected.result, selected.outcome);
      try { await this.query(client, "COMMIT"); terminal = true; release(client); } catch { terminal = true; release(client, true); throw unavailable(); }
      return parsed;
    } catch (error) {
      if (began && !terminal) await this.rollback(client, destroyOnFailure);
      else if (!began && !terminal) release(client, true);
      if (promotionRepositoryErrorCode(error)) throw error;
      throw unavailable();
    }
  }
  private read<T>(textValue: string, values: unknown[], success: string, parser: (value: unknown) => T, allowedFailures: readonly string[], failureParser?: FailureParser): Promise<T> {
    return this.transact("read", textValue, values, [success], (value) => parser(value), allowedFailures, failureParser);
  }
  private emitUnknown(): void {
    try { const pending = this.options.audit({ type: "promotion_commit_unknown" }); if (pending) void pending.catch(() => undefined); } catch { /* observational */ }
  }
  private parseDetail(value: unknown): PromotionDetail {
    try { return parsePromotionDetail(value); } catch { throw unavailable(); }
  }
  private async recover<T>(authority: ValidatedOrderAuthority, operationId: string, kind: PromotionOperationKind, fingerprint: string, observed: T, parser: (value: unknown) => T): Promise<T> {
    return this.transact("write", SQL.recover, [...authorityValues(authority), operationId, kind, fingerprint], ["operation_replayed"], (value) => {
      const parsed = parser(value);
      if (!equalPromotionProjection(parsed, observed)) throw unavailable();
      return parsed;
    }, RECOVERY_FAILURES, undefined, true);
  }
  private async mutate<T>(authority: ValidatedOrderAuthority, operationId: string, kind: PromotionOperationKind, fingerprint: string, textValue: string, values: unknown[], success: string, parser: (value: unknown, replayed: boolean) => T, allowedFailures: readonly string[], failureParser?: FailureParser): Promise<Readonly<{ value: T; replayed: boolean }>> {
    const client = await this.acquire(); let began = false, terminal = false;
    try {
      await this.query(client, "BEGIN ISOLATION LEVEL READ COMMITTED"); began = true;
      await this.configure(client);
      const selected = selectedRow(await this.query(client, textValue, values));
      const known = this.mapped(selected.outcome, selected.result, allowedFailures, failureParser);
      if (known) throw known;
      if (selected.outcome !== success && selected.outcome !== "operation_replayed") throw unavailable();
      const replayed = selected.outcome === "operation_replayed";
      const parsed = parser(selected.result, replayed);
      try { await this.query(client, "COMMIT"); terminal = true; release(client); return Object.freeze({ value: parsed, replayed }); }
      catch {
        terminal = true; release(client, true); this.emitUnknown();
        const recovered = await this.recover(authority, operationId, kind, fingerprint, parsed, (value) => parser(value, true));
        return Object.freeze({ value: recovered, replayed: true });
      }
    } catch (error) {
      if (began && !terminal) await this.rollback(client);
      else if (!began && !terminal) release(client, true);
      if (promotionRepositoryErrorCode(error)) throw error;
      throw unavailable();
    }
  }
  private validated(value: unknown, required: readonly string[], optional: readonly string[] = [], action: PromotionAuthorityAction = "read"): Readonly<{ input: Readonly<Record<string, unknown>>; authority: ValidatedPromotionAuthority }> {
    const input = exactPromotionInput(value, required, optional);
    return { input, authority: promotionAuthority(input.tenantContext as TenantContext, input.now as Date, action) };
  }
  private generatedId(): string {
    try { return promotionUuid(this.options.uuid()); } catch { throw unavailable(); }
  }
  private detailFailure(id: string, outcome: string, value: unknown): Error {
    if (outcome === "version_conflict") {
      const current = this.parseDetail(value);
      if (current.id !== id) throw unavailable();
      return promotionFailure("version_conflict", { current });
    }
    if (outcome === "publish_blocked") {
      try { return promotionFailure("publish_blocked", { readiness: parsePromotionConflictCheck(value) }); }
      catch { throw unavailable(); }
    }
    throw unavailable();
  }

  async list(input: ListPromotionsInput): Promise<PromotionListResult> {
    const { input: raw, authority } = this.validated(input, ["tenantContext", "now", "pageSize"], ["cursor", "search", "effectiveStatuses", "triggerKinds", "benefitKinds", "audienceModes", "scheduleFrom", "scheduleTo"]);
    const pageSize = promotionPageSize(raw.pageSize), search = promotionSearch(raw.search);
    const effectiveStatuses = promotionEffectiveStatuses(raw.effectiveStatuses), triggerKinds = promotionTriggerKinds(raw.triggerKinds);
    const benefitKinds = promotionBenefitKinds(raw.benefitKinds), audienceModes = promotionAudienceModes(raw.audienceModes);
    const schedule = promotionScheduleRange(raw.scheduleFrom, raw.scheduleTo);
    const query = Object.freeze({ pageSize, search: search ?? null, effectiveStatuses, triggerKinds, benefitKinds, audienceModes, scheduleFrom: schedule.from, scheduleTo: schedule.to });
    const cursor = decodeCursor(raw.cursor, authority.storeId, "promotion_list", query);
    const snapshotAt = cursor?.snapshotAt === undefined ? null : parseUtc(cursor.snapshotAt);
    const afterCreatedAt = cursor?.createdAt === undefined ? null : parseUtc(cursor.createdAt);
    const afterId = cursor?.id === undefined ? null : uuid(cursor.id);
    return this.read(SQL.list, [...authorityValues(authority), search ?? null, [...effectiveStatuses], [...triggerKinds], [...benefitKinds], [...audienceModes], schedule.from, schedule.to, pageSize, snapshotAt, afterCreatedAt, afterId], "listed", (value) => {
      let page: ReturnType<typeof parsePromotionAdminListPage>;
      try { page = parsePromotionAdminListPage(value, pageSize); } catch { throw unavailable(); }
      const databaseSnapshot = page.snapshotAt, expectedSnapshot = snapshotAt ?? `${authority.now.toISOString().slice(0, 23)}000Z`;
      if (databaseSnapshot !== expectedSnapshot || databaseSnapshot > `${authority.now.toISOString().slice(0, 23)}000Z`) throw unavailable();
      if (!page.hasMore) return Object.freeze({ items: page.items, nextCursor: null });
      return Object.freeze({ items: page.items, nextCursor: encodeCursor(authority.storeId, "promotion_list", query, { snapshotAt: databaseSnapshot, createdAt: page.cursorAnchor!.createdAt, id: page.cursorAnchor!.id }) });
    }, AUTHORITY_FAILURES);
  }

  async detail(input: Parameters<PromotionRepository["detail"]>[0]): Promise<PromotionDetail> {
    const { input: raw, authority } = this.validated(input, ["tenantContext", "now", "promotionId"]), id = promotionUuid(raw.promotionId);
    return this.read(SQL.detail, [...authorityValues(authority), id], "found", (value) => {
      const parsed = this.parseDetail(value);
      if (parsed.id !== id) throw unavailable();
      return parsed;
    }, acceptedFailures("not_found"));
  }

  async create(input: CreatePromotionInput): Promise<PromotionMutationResult> {
    const { input: raw, authority } = this.validated(input, ["tenantContext", "now", "operationId", "name", "ruleDocument"], [], "manage_draft");
    const operationId = promotionUuid(raw.operationId), name = promotionName(raw.name), ruleDocument = promotionRule(raw.ruleDocument), id = this.generatedId();
    const fingerprint = promotionFingerprint("create", authority.storeId, { name, ruleDocument });
    const mutated = await this.mutate(authority, operationId, "create", fingerprint, SQL.create, [...authorityValues(authority), operationId, fingerprint, id, name, JSON.stringify(ruleDocument)], "created", (value, replayed) => {
      const parsed = this.parseDetail(value);
      if ((!replayed && parsed.id !== id) || parsed.status !== "draft" || parsed.version !== 1) throw unavailable();
      return parsed;
    }, acceptedFailures("operation_mismatch", "operation_result_invalid", "invalid_reference", "conflict", "code_conflict"));
    return Object.freeze({ promotion: mutated.value, replayed: mutated.replayed });
  }

  async update(input: UpdatePromotionInput): Promise<PromotionMutationResult> {
    const { input: raw, authority } = this.validated(input, ["tenantContext", "now", "operationId", "promotionId", "expectedVersion", "name", "ruleDocument"], [], "manage_draft");
    const operationId = promotionUuid(raw.operationId), id = promotionUuid(raw.promotionId), expectedVersion = promotionVersion(raw.expectedVersion), name = promotionName(raw.name), ruleDocument = promotionRule(raw.ruleDocument);
    const fingerprint = promotionFingerprint("update", authority.storeId, { id, expectedVersion, name, ruleDocument });
    const mutated = await this.mutate(authority, operationId, "update", fingerprint, SQL.update, [...authorityValues(authority), operationId, fingerprint, id, expectedVersion, name, JSON.stringify(ruleDocument)], "updated", (value) => {
      const parsed = this.parseDetail(value);
      if (parsed.id !== id || parsed.version !== expectedVersion + 1) throw unavailable();
      return parsed;
    }, acceptedFailures("operation_mismatch", "operation_result_invalid", "not_found", "version_conflict", "invalid_reference", "invalid_transition", "projection_unavailable", "publish_blocked", "active_code_batches", "code_conflict"), (outcome, value) => this.detailFailure(id, outcome, value));
    return Object.freeze({ promotion: mutated.value, replayed: mutated.replayed });
  }

  private async lifecycle(input: PublishPromotionInput | PausePromotionInput | ResumePromotionInput | ArchivePromotionInput, forcedStatus: "paused" | "archived" | null): Promise<PromotionMutationResult> {
    const action: PromotionAuthorityAction = forcedStatus === "archived" ? "archive" : "publish";
    const { input: raw, authority } = this.validated(input, ["tenantContext", "now", "operationId", "promotionId", "expectedVersion"], forcedStatus === null ? ["nextStatus"] : [], action);
    const operationId = promotionUuid(raw.operationId), id = promotionUuid(raw.promotionId), expectedVersion = promotionVersion(raw.expectedVersion);
    const nextStatus = forcedStatus ?? raw.nextStatus;
    if (nextStatus !== "active" && nextStatus !== "scheduled" && nextStatus !== "paused" && nextStatus !== "archived") throw promotionFailure("invalid_input");
    const kind: PromotionOperationKind = nextStatus === "archived" ? "archive" : "lifecycle";
    const fingerprint = promotionFingerprint(kind, authority.storeId, { id, expectedVersion, nextStatus });
    const lifecycleFailures = nextStatus === "active" || nextStatus === "scheduled"
      ? acceptedFailures("operation_mismatch", "operation_result_invalid", "not_found", "version_conflict", "invalid_transition", "invalid_reference", "promotion_limit_reached", "projection_unavailable", "publish_blocked")
      : acceptedFailures("operation_mismatch", "operation_result_invalid", "not_found", "version_conflict", "invalid_transition");
    const mutated = await this.mutate(authority, operationId, kind, fingerprint, SQL.lifecycle, [...authorityValues(authority), operationId, fingerprint, id, expectedVersion, nextStatus], "updated", (value) => {
      const parsed = this.parseDetail(value);
      if (parsed.id !== id || parsed.version !== expectedVersion + 1 || parsed.status !== nextStatus) throw unavailable();
      return parsed;
    }, lifecycleFailures, (outcome, value) => this.detailFailure(id, outcome, value));
    return Object.freeze({ promotion: mutated.value, replayed: mutated.replayed });
  }
  publish(input: PublishPromotionInput): Promise<PromotionMutationResult> { return this.lifecycle(input, null); }
  pause(input: PausePromotionInput): Promise<PromotionMutationResult> { return this.lifecycle(input, "paused"); }
  resume(input: ResumePromotionInput): Promise<PromotionMutationResult> { return this.lifecycle(input, null); }
  archive(input: ArchivePromotionInput): Promise<PromotionMutationResult> { return this.lifecycle(input, "archived"); }

  async duplicate(input: DuplicatePromotionInput): Promise<PromotionMutationResult> {
    const { input: raw, authority } = this.validated(input, ["tenantContext", "now", "operationId", "promotionId", "expectedVersion", "name", "codes"], [], "manage_draft");
    const operationId = promotionUuid(raw.operationId), sourcePromotionId = promotionUuid(raw.promotionId), expectedVersion = promotionVersion(raw.expectedVersion);
    const name = promotionName(raw.name), codes = promotionCodes(raw.codes, 10_000), destinationId = this.generatedId();
    const fingerprint = promotionFingerprint("duplicate", authority.storeId, { sourcePromotionId, expectedVersion, name, codes });
    const mutated = await this.mutate(authority, operationId, "duplicate", fingerprint, SQL.duplicate,
      [...authorityValues(authority), operationId, fingerprint, destinationId, sourcePromotionId, expectedVersion, name, [...codes]], "created", (value, replayed) => {
        const parsed = this.parseDetail(value);
        if ((!replayed && parsed.id !== destinationId) || parsed.version !== 1 || parsed.status !== "draft" || parsed.name !== name) throw unavailable();
        return parsed;
      }, acceptedFailures("operation_mismatch", "operation_result_invalid", "not_found", "version_conflict", "invalid_reference", "conflict", "code_conflict"), (outcome, value) => this.detailFailure(sourcePromotionId, outcome, value));
    return Object.freeze({ promotion: mutated.value, replayed: mutated.replayed });
  }

  async simulate(input: SimulatePromotionInput): Promise<ReturnType<typeof parsePromotionSimulatorResponse>> {
    const { input: raw, authority } = this.validated(input, ["tenantContext", "now", "promotionId", "expectedVersion", "name", "ruleDocument", "context"]);
    const id = promotionUuid(raw.promotionId), expectedVersion = raw.expectedVersion === null ? null : promotionVersion(raw.expectedVersion);
    const name = promotionName(raw.name), ruleDocument = promotionRule(raw.ruleDocument), context = promotionContext(raw.context, authority.storeId);
    return this.read(SQL.simulate, [...authorityValues(authority), JSON.stringify({ id, expectedVersion, name, ruleDocument }), JSON.stringify(context)], "simulated", (value) => {
      try { return parsePromotionSimulatorResponse(value); } catch { throw unavailable(); }
    }, acceptedFailures("conflict", "not_found", "version_conflict", "invalid_reference"), (outcome, value) => this.detailFailure(id, outcome, value));
  }

  private checkInput(input: CheckPromotionInput): Readonly<{ authority: ValidatedPromotionAuthority; id: string | null; expectedVersion: number | null; ruleDocument: ReturnType<typeof promotionRule> }> {
    const { input: raw, authority } = this.validated(input, ["tenantContext", "now", "ruleDocument"], ["promotionId", "expectedVersion"]);
    if (Object.hasOwn(raw, "promotionId") !== Object.hasOwn(raw, "expectedVersion")) throw promotionFailure("invalid_input");
    const id = Object.hasOwn(raw, "promotionId") ? promotionUuid(raw.promotionId) : null;
    const expectedVersion = Object.hasOwn(raw, "expectedVersion") ? promotionVersion(raw.expectedVersion) : null;
    return Object.freeze({ authority, id, expectedVersion, ruleDocument: promotionRule(raw.ruleDocument) });
  }
  async conflicts(input: CheckPromotionInput): Promise<PromotionConflictCheck> {
    const checked = this.checkInput(input);
    return this.read(SQL.conflicts, [...authorityValues(checked.authority), checked.id, checked.expectedVersion, JSON.stringify(checked.ruleDocument)], "checked", (value) => {
      try { return parsePromotionConflictCheck(value); } catch { throw unavailable(); }
    },
      acceptedFailures("not_found", "version_conflict", "projection_unavailable"),
      (outcome, value) => checked.id === null ? unavailable() : this.detailFailure(checked.id, outcome, value));
  }
  async margin(input: CheckPromotionInput): Promise<PromotionMarginCheck> {
    const checked = this.checkInput(input);
    return this.read(SQL.margin, [...authorityValues(checked.authority), checked.id, checked.expectedVersion, JSON.stringify(checked.ruleDocument)], "checked", (value) => {
      try { return parsePromotionMarginCheck(value); } catch { throw unavailable(); }
    },
      acceptedFailures("not_found", "version_conflict", "projection_unavailable"),
      (outcome, value) => checked.id === null ? unavailable() : this.detailFailure(checked.id, outcome, value));
  }

  async listTargets(input: ListPromotionPickerInput): Promise<PromotionPickerListResult> {
    const { input: raw, authority } = this.validated(input, ["tenantContext", "now", "kind", "pageSize"], ["cursor", "search"]);
    const kind = promotionPickerKind(raw.kind), pageSize = promotionPageSize(raw.pageSize, 50), search = promotionSearch(raw.search);
    const query = Object.freeze({ kind, pageSize, search: search ?? null });
    const cursor = decodeCursor(raw.cursor, authority.storeId, "promotion_picker", query);
    const afterSortKey = cursor?.sortKey === undefined ? null : text(cursor.sortKey, 1, 500);
    const afterId = cursor?.id === undefined ? null : uuid(cursor.id);
    return this.read(SQL.pickerList, [...authorityValues(authority), kind, search ?? null, pageSize, afterSortKey, afterId], "listed", (value) => {
      let page: ReturnType<typeof parsePromotionPickerList>;
      try { page = parsePromotionPickerList(value, kind, pageSize); } catch { throw unavailable(); }
      if (!page.hasMore) return Object.freeze({ items: page.items, nextCursor: null });
      return Object.freeze({ items: page.items, nextCursor: encodeCursor(authority.storeId, "promotion_picker", query, page.cursorAnchor) });
    }, AUTHORITY_FAILURES);
  }
  async resolveTargets(input: ResolvePromotionPickerInput): Promise<readonly PromotionPickerItem[]> {
    const { input: raw, authority } = this.validated(input, ["tenantContext", "now", "kind", "ids"]);
    const kind = promotionPickerKind(raw.kind), ids = promotionIds(raw.ids, 500);
    return this.read(SQL.pickerResolve, [...authorityValues(authority), kind, [...ids]], "resolved", (value) => {
      try { return parsePromotionPickerResolve(value, kind, ids); } catch { throw unavailable(); }
    }, AUTHORITY_FAILURES);
  }

  async createCodeBatch(input: CreatePromotionCodeBatchInput): Promise<PromotionCodeBatchMutationResult> {
    const { input: raw, authority } = this.validated(input, ["tenantContext", "now", "operationId", "promotionId", "count", "prefix", "codeLength", "perCustomerUsage", "expiresAt"], [], "publish");
    const operationId = promotionUuid(raw.operationId), promotionId = promotionUuid(raw.promotionId), count = promotionInteger(raw.count, 1, 10_000);
    const prefix = promotionBatchPrefix(raw.prefix), codeLength = promotionInteger(raw.codeLength, 16, 64), perCustomerUsage = promotionInteger(raw.perCustomerUsage, 1, 1_000_000);
    if (codeLength - prefix.length < 16) throw promotionFailure("invalid_input");
    const expiresAt = promotionOptionalExpiry(raw.expiresAt, authority.now), batchId = this.generatedId();
    const expiresAtText = expiresAt?.toISOString() ?? null;
    const fingerprint = promotionFingerprint("code_batch", authority.storeId, { promotionId, count, prefix, codeLength, perCustomerUsage, expiresAt: expiresAtText });
    const mutated = await this.mutate(authority, operationId, "code_batch", fingerprint, SQL.createBatch,
      [...authorityValues(authority), operationId, fingerprint, batchId, promotionId, count, prefix, codeLength, perCustomerUsage, expiresAt], "created", (value, replayed) => {
        const parsed = parseBatch(value);
        if ((!replayed && parsed.id !== batchId) || parsed.promotionId !== promotionId || parsed.version !== 1 || parsed.status !== "active" || parsed.count !== count || parsed.prefix !== prefix || parsed.codeLength !== codeLength || parsed.perCustomerUsage !== perCustomerUsage || parsed.expiresAt !== expiresAtText) throw unavailable();
        return parsed;
      }, acceptedFailures("operation_mismatch", "operation_result_invalid", "not_found", "code_conflict"));
    return Object.freeze({ batch: mutated.value, replayed: mutated.replayed });
  }
  async updateCodeBatchStatus(input: UpdatePromotionCodeBatchStatusInput): Promise<PromotionCodeBatchMutationResult> {
    const { input: raw, authority } = this.validated(input, ["tenantContext", "now", "operationId", "batchId", "expectedVersion", "nextStatus"], [], "publish");
    const operationId = promotionUuid(raw.operationId), batchId = promotionUuid(raw.batchId), expectedVersion = promotionVersion(raw.expectedVersion), nextStatus = promotionBatchStatus(raw.nextStatus);
    const fingerprint = promotionFingerprint("code_batch_status", authority.storeId, { batchId, expectedVersion, nextStatus });
    const mutated = await this.mutate(authority, operationId, "code_batch_status", fingerprint, SQL.batchStatus,
      [...authorityValues(authority), operationId, fingerprint, batchId, expectedVersion, nextStatus], "updated", (value) => {
        const parsed = parseBatch(value);
        if (parsed.id !== batchId || parsed.version !== expectedVersion + 1 || parsed.status !== nextStatus) throw unavailable();
        return parsed;
      }, acceptedFailures("operation_mismatch", "operation_result_invalid", "not_found", "projection_unavailable", "version_conflict", "invalid_transition"), (outcome, value) => {
        if (outcome !== "version_conflict") throw unavailable();
        const current = parseBatch(value);
        if (current.id !== batchId) throw unavailable();
        return promotionFailure("version_conflict", { current });
      });
    return Object.freeze({ batch: mutated.value, replayed: mutated.replayed });
  }
  async listCodeBatches(input: ListPromotionCodeBatchesInput): Promise<PromotionCodeBatchPage> {
    const { input: raw, authority } = this.validated(input, ["tenantContext", "now", "promotionId", "pageSize"], ["cursor"]);
    const promotionId = promotionUuid(raw.promotionId), pageSize = promotionPageSize(raw.pageSize);
    const query = Object.freeze({ promotionId, pageSize });
    const cursor = decodeCursor(raw.cursor, authority.storeId, "promotion_code_batches", query);
    const snapshotAt = cursor?.snapshotAt === undefined ? null : parseUtc(cursor.snapshotAt, true);
    const afterCreatedAt = cursor?.createdAt === undefined ? null : parseUtc(cursor.createdAt, true);
    const afterId = cursor?.id === undefined ? null : uuid(cursor.id);
    return this.read(SQL.batchList, [...authorityValues(authority), promotionId, pageSize, snapshotAt === null ? null : new Date(snapshotAt), afterCreatedAt === null ? null : new Date(afterCreatedAt), afterId], "listed", (value) => {
      let page: ReturnType<typeof parsePromotionCodeBatchList>;
      try { page = parsePromotionCodeBatchList(value); } catch { throw unavailable(); }
      const expectedSnapshot = snapshotAt ?? authority.now.toISOString();
      if (page.snapshotAt !== expectedSnapshot || page.items.length > pageSize || (page.hasMore && page.items.length !== pageSize) || page.items.some((item) => item.promotionId !== promotionId)) throw unavailable();
      const nextCursor = page.hasMore
        ? encodeCursor(authority.storeId, "promotion_code_batches", query, { snapshotAt: page.snapshotAt, createdAt: page.cursorAnchor!.createdAt, id: page.cursorAnchor!.id })
        : null;
      return Object.freeze({ items: page.items, nextCursor });
    }, acceptedFailures("not_found", "projection_unavailable"));
  }
  async exportCodes(input: ExportPromotionCodesInput): Promise<PromotionCodeCsvExport> {
    const { input: raw, authority } = this.validated(input, ["tenantContext", "now", "batchId"], [], "export_codes");
    const batchId = promotionUuid(raw.batchId);
    return this.read(SQL.csv, [...authorityValues(authority), batchId], "exported", (value) => {
      try { return parsePromotionCsvExport(value); } catch { throw unavailable(); }
    }, acceptedFailures("not_found", "projection_unavailable"));
  }
  async analytics(input: Parameters<PromotionRepository["analytics"]>[0]): Promise<PromotionAnalyticsResult> {
    const { input: raw, authority } = this.validated(input, ["tenantContext", "now", "promotionId"]), promotionId = promotionUuid(raw.promotionId);
    return this.read(SQL.analytics, [...authorityValues(authority), promotionId], "listed", (value) => {
      try { return parsePromotionAdminAnalyticsResult(value); } catch { throw unavailable(); }
    }, acceptedFailures("not_found"));
  }
  async analyticsDetail(input: Parameters<PromotionRepository["analyticsDetail"]>[0]) {
    const { input: raw, authority } = this.validated(input, ["tenantContext", "now", "promotionId", "days"]);
    const promotionId = promotionUuid(raw.promotionId), days = promotionInteger(raw.days, 7, 90);
    if (days !== 7 && days !== 30 && days !== 90) throw unavailable();
    return this.read(SQL.analyticsDetail, [...authorityValues(authority), promotionId, days], "listed", (value) => {
      try { const result = parsePromotionAnalyticsDetailResult(value); if (result.periodDays !== days) throw unavailable(); return result; }
      catch { throw unavailable(); }
    }, acceptedFailures("not_found", "projection_unavailable"));
  }
  async overview(input: Parameters<PromotionRepository["overview"]>[0]) {
    const { input: raw, authority } = this.validated(input, ["tenantContext", "now", "days"]);
    const days = promotionInteger(raw.days, 7, 90);
    if (days !== 7 && days !== 30 && days !== 90) throw unavailable();
    return this.read(SQL.overview, [...authorityValues(authority), days], "listed", (value) => {
      try { const result = parsePromotionOverviewResult(value); if (result.periodDays !== days) throw unavailable(); return result; }
      catch { throw unavailable(); }
    }, acceptedFailures("projection_unavailable"));
  }
  async listLegacy(input: ListPromotionLegacyInput): Promise<PromotionLegacyPage> {
    const { input: raw, authority } = this.validated(input, ["tenantContext", "now", "pageSize"], ["cursor"]), pageSize = promotionPageSize(raw.pageSize);
    const query = Object.freeze({ pageSize }), cursor = decodeCursor(raw.cursor, authority.storeId, "promotion_legacy", query);
    const snapshotAt = cursor?.snapshotAt === undefined ? null : parseUtc(cursor.snapshotAt, true);
    const afterCreatedAt = cursor?.createdAt === undefined ? null : parseUtc(cursor.createdAt, true);
    const afterId = cursor?.id === undefined ? null : uuid(cursor.id);
    return this.read(SQL.legacy, [...authorityValues(authority), pageSize, snapshotAt === null ? null : new Date(snapshotAt), afterCreatedAt === null ? null : new Date(afterCreatedAt), afterId], "listed", (value) => {
      let page: ReturnType<typeof parsePromotionLegacyPage>;
      try { page = parsePromotionLegacyPage(value, pageSize); } catch { throw unavailable(); }
      const databaseSnapshot = page.snapshotAt, expectedSnapshot = snapshotAt ?? authority.now.toISOString();
      if (databaseSnapshot !== expectedSnapshot) throw unavailable();
      if (!page.hasMore) return Object.freeze({ items: page.items, nextCursor: null });
      return Object.freeze({ items: page.items, nextCursor: encodeCursor(authority.storeId, "promotion_legacy", query, { snapshotAt: databaseSnapshot, createdAt: page.cursorAnchor!.createdAt, id: page.cursorAnchor!.id }) });
    }, acceptedFailures("projection_unavailable"));
  }
  async resolveLegacy(input: Parameters<PromotionRepository["resolveLegacy"]>[0]): Promise<PromotionLegacyProjection> {
    const { input: raw, authority } = this.validated(input, ["tenantContext", "now", "legacyRecordId"]);
    const legacyRecordId = promotionUuid(raw.legacyRecordId);
    return this.read(SQL.legacyResolve, [...authorityValues(authority), legacyRecordId], "resolved", (value) => {
      try {
        const projection = parsePromotionLegacyProjection(value);
        if (projection.legacyRecordId !== legacyRecordId) throw unavailable();
        return projection;
      } catch {
        throw unavailable();
      }
    }, acceptedFailures("not_found"));
  }
}
