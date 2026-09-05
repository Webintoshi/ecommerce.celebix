import {
  isMerchantActionAllowed,
  parsePromotionAdminAnalyticsResult,
  parsePromotionAdminListItem,
  parsePromotionCodeBatch,
  parsePromotionCodeBatchListItem,
  parsePromotionCodeBatchMutationEnvelope,
  parsePromotionConflictCheck,
  parsePromotionCsvExport,
  parsePromotionDetail,
  parsePromotionMarginCheck,
  parsePromotionMutationEnvelope,
  parsePromotionLegacyProjection,
  parsePromotionPickerResolve,
  parsePromotionSimulatorResponse,
  type PromotionAdminListQuery,
  type PromotionBatchCreateRequest,
  type PromotionBatchStatusRequest,
  type PromotionCheckRequest,
  type PromotionCreateRequest,
  type PromotionDuplicateRequest,
  type PromotionLifecycleTargetRequest,
  type PromotionPageQuery,
  type PromotionSimulationRequest,
  type PromotionTargetListQuery,
  type PromotionTargetResolveRequest,
  type PromotionUpdateRequest,
  type PromotionVersionRequest,
  type TenantContext,
} from "@celebix/saas-contracts";
import { promotionRepositoryError } from "@celebix/saas-data";

import { readOrderPanelSessionCookie } from "../order-http/request-input.ts";
import { approvedPanelMutationOriginForStore } from "../panel-origin-authority.ts";
import type { ServerPanelAccessResult } from "../server-panel-access/access.ts";
import type { ServerPromotionsRuntime } from "../server-promotions/runtime.ts";
import {
  classifyPromotionRequest,
  promotionOriginApproved,
  type PromotionRoute,
} from "./request-authority.ts";
import {
  readPromotionGetInput,
  readPromotionMutationInput,
  type PromotionGetInput,
  type PromotionMutationInput,
} from "./request-input.ts";

const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PUBLIC_CURSOR = /^[A-Za-z0-9_-]{1,2048}$/;

type Dependencies = Readonly<{
  resolveRuntime(): Promise<ServerPromotionsRuntime | null>;
  now(): Date;
  requestId(): string;
}>;
type Authorized = Readonly<{
  runtime: ServerPromotionsRuntime;
  tenantContext: TenantContext;
  now: Date;
}>;
type ParsedInput = PromotionGetInput | PromotionMutationInput;

function json(value: unknown, status = 200, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  return Response.json(value, { status, headers });
}

function error(code: string, status: number, extra?: HeadersInit): Response {
  return json({ code }, status, extra);
}

function unavailable(): Response {
  return error("promotion_unavailable", 503);
}

function accessFailure(result: Exclude<ServerPanelAccessResult, { kind: "authenticated" }>): Response {
  if (result.kind === "unauthenticated") return error("unauthenticated", 401);
  if (result.kind === "unauthorized") return error("membership_denied", 403);
  return unavailable();
}

function requiredAction(route: PromotionRoute): "read" | "manage" | "archive" {
  if (route.kind === "archive") return "archive";
  switch (route.kind) {
    case "create":
    case "update":
    case "publish":
    case "pause":
    case "resume":
    case "duplicate":
    case "code_batch_create":
    case "code_batch_status":
    case "code_batch_csv":
      return "manage";
    default:
      return "read";
  }
}

async function authorize(
  dependencies: Dependencies,
  request: Request,
  route: PromotionRoute,
): Promise<Response | Authorized> {
  const cookie = readOrderPanelSessionCookie(request);
  if (cookie.kind !== "present") return error("unauthenticated", 401);
  let runtime: ServerPromotionsRuntime | null;
  try { runtime = await dependencies.resolveRuntime(); }
  catch { return unavailable(); }
  if (runtime === null) return unavailable();
  if (route.method !== "GET" && !promotionOriginApproved(request, runtime.access.panelOrigin)) {
    return error("origin_denied", 403);
  }
  let now: Date;
  let requestId: string;
  try {
    now = dependencies.now();
    requestId = dependencies.requestId();
  } catch { return unavailable(); }
  if (
    !(now instanceof Date) || Object.getPrototypeOf(now) !== Date.prototype ||
    !Number.isFinite(Date.prototype.getTime.call(now)) || !REQUEST_ID.test(requestId)
  ) return unavailable();
  let access: ServerPanelAccessResult;
  try {
    access = await runtime.access.resolveCredential({
      hostname: request.headers.get("host"),
      credential: cookie.credential,
      requestId,
      now: new Date(Date.prototype.getTime.call(now)),
    });
  } catch { return unavailable(); }
  if (access.kind !== "authenticated") return accessFailure(access);
  if (
    route.method !== "GET" &&
    !approvedPanelMutationOriginForStore(request, runtime.access.panelOrigin, access.tenantContext.store.slug)
  ) return error("origin_denied", 403);
  try {
    const tenant = access.tenantContext;
    if (tenant.store.status !== "active") return error("store_inactive", 403);
    if (tenant.membership.status !== "active") return error("membership_denied", 403);
    if (tenant.entitlements.status !== "active" || !tenant.entitlements.features.some((feature) => feature === "promotions")) {
      return error("feature_not_enabled", 403);
    }
    if (!isMerchantActionAllowed(tenant.membership.role, `promotions.${requiredAction(route)}`)) {
      return error("membership_denied", 403);
    }
    return Object.freeze({ runtime, tenantContext: tenant, now: new Date(Date.prototype.getTime.call(now)) });
  } catch { return unavailable(); }
}

type ExactRecord = Readonly<Record<string, unknown>>;
function exactRecord(value: unknown, keys: readonly string[]): ExactRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("promotion_http_output_invalid");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError("promotion_http_output_invalid");
  const descriptors = Object.getOwnPropertyDescriptors(value), ownKeys = Reflect.ownKeys(descriptors);
  if (ownKeys.length !== keys.length || ownKeys.some((key) => typeof key !== "string" || !keys.includes(key))) {
    throw new TypeError("promotion_http_output_invalid");
  }
  const output = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) throw new TypeError("promotion_http_output_invalid");
    output[key] = descriptor.value;
  }
  return output;
}

function denseArray(value: unknown, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) {
    throw new TypeError("promotion_http_output_invalid");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) throw new TypeError("promotion_http_output_invalid");
  const output: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) throw new TypeError("promotion_http_output_invalid");
    output.push(descriptor.value);
  }
  return output;
}

function nextCursor(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !PUBLIC_CURSOR.test(value)) throw new TypeError("promotion_http_output_invalid");
  return value;
}

function publicPromotionList(value: unknown, limit: number) {
  const root = exactRecord(value, ["items", "nextCursor"]), cursor = nextCursor(root.nextCursor);
  const items = Object.freeze(denseArray(root.items, limit).map(parsePromotionAdminListItem));
  if ((cursor !== null && items.length !== limit) || new Set(items.map((item) => item.id)).size !== items.length) {
    throw new TypeError("promotion_http_output_invalid");
  }
  for (let index = 1; index < items.length; index += 1) {
    const previous = items[index - 1]!, current = items[index]!;
    if (previous.createdAt < current.createdAt || (previous.createdAt === current.createdAt && previous.id <= current.id)) {
      throw new TypeError("promotion_http_output_invalid");
    }
  }
  return Object.freeze({ items, nextCursor: cursor });
}

function publicPickerList(value: unknown, kind: PromotionTargetListQuery["kind"], limit: number) {
  const root = exactRecord(value, ["items", "nextCursor"]), cursor = nextCursor(root.nextCursor);
  const rawItems = denseArray(root.items, limit);
  const ids = rawItems.map((item) => exactRecord(item, ["kind", "id", "label", "status"]).id);
  if (ids.some((id) => typeof id !== "string")) throw new TypeError("promotion_http_output_invalid");
  const items = rawItems.length === 0
    ? Object.freeze([])
    : parsePromotionPickerResolve({ items: rawItems }, kind, ids as string[]);
  if ((cursor !== null && items.length !== limit) || items.some((item) => item.status !== "active")) {
    throw new TypeError("promotion_http_output_invalid");
  }
  return Object.freeze({ items, nextCursor: cursor });
}

function publicBatchList(value: unknown, promotionId: string, limit: number) {
  const root = exactRecord(value, ["items", "nextCursor"]), cursor = nextCursor(root.nextCursor);
  const items = Object.freeze(denseArray(root.items, limit).map(parsePromotionCodeBatchListItem));
  if (
    (cursor !== null && items.length !== limit) || items.some((item) => item.promotionId !== promotionId) ||
    new Set(items.map((item) => item.id)).size !== items.length
  ) throw new TypeError("promotion_http_output_invalid");
  for (let index = 1; index < items.length; index += 1) {
    const previous = items[index - 1]!, current = items[index]!;
    if (previous.createdAt < current.createdAt || (previous.createdAt === current.createdAt && previous.id <= current.id)) {
      throw new TypeError("promotion_http_output_invalid");
    }
  }
  return Object.freeze({ items, nextCursor: cursor });
}

function publicLegacyList(value: unknown, limit: number) {
  const root = exactRecord(value, ["items", "nextCursor"]), cursor = nextCursor(root.nextCursor);
  const items = Object.freeze(denseArray(root.items, limit).map(parsePromotionLegacyProjection));
  if ((cursor !== null && items.length !== limit) || new Set(items.map((item) => item.legacyRecordId)).size !== items.length) {
    throw new TypeError("promotion_http_output_invalid");
  }
  return Object.freeze({ items, nextCursor: cursor });
}

function targetId(route: PromotionRoute, input: ParsedInput): string | undefined {
  if ("batchId" in route) return route.batchId;
  if ("promotionId" in route) return route.promotionId;
  if (route.kind === "simulate" || route.kind === "conflicts" || route.kind === "margin") {
    const value = (input as PromotionMutationInput).value as PromotionSimulationRequest | PromotionCheckRequest;
    return "promotionId" in value ? value.promotionId : undefined;
  }
  return undefined;
}

function repositoryFailure(caught: unknown, route: PromotionRoute, input: ParsedInput): Response {
  try {
    const failure = promotionRepositoryError(caught);
    if (failure === undefined) return unavailable();
    switch (failure.code) {
      case "invalid_input": return error("invalid_input", 400);
      case "unauthenticated": return error("unauthenticated", 401);
      case "membership_denied":
      case "store_inactive":
      case "feature_not_enabled": return error(failure.code, 403);
      case "resource_not_found": return error("not_found", 404);
      case "idempotency_mismatch": return error("operation_mismatch", 409);
      case "invalid_reference":
      case "code_conflict":
      case "active_code_batches":
      case "invalid_transition":
      case "promotion_limit_reached":
      case "conflict": return error(failure.code, 409);
      case "version_conflict": {
        const expectedId = targetId(route, input);
        if (expectedId === undefined) return unavailable();
        if (route.kind === "code_batch_status") {
          const current = parsePromotionCodeBatch(failure.current);
          return current.id === expectedId ? json({ code: "version_conflict", current }, 409) : unavailable();
        }
        const current = parsePromotionDetail(failure.current);
        return current.id === expectedId ? json({ code: "version_conflict", current }, 409) : unavailable();
      }
      case "publish_blocked": {
        const readiness = parsePromotionConflictCheck(failure.readiness);
        return json({ code: "publish_blocked", readiness }, 409);
      }
      default:
        return unavailable();
    }
  } catch { return unavailable(); }
}

async function execute<T>(
  route: PromotionRoute,
  input: ParsedInput,
  operation: () => Promise<T>,
  success: (value: T) => Response,
): Promise<Response> {
  try { return success(await operation()); }
  catch (caught) { return repositoryFailure(caught, route, input); }
}

function csv(value: unknown): Response {
  const parsed = parsePromotionCsvExport(value);
  const body = `code,status\r\n${parsed.rows.map((row) => `${row.code},${row.status}\r\n`).join("")}`;
  return new Response(body, {
    status: 200,
    headers: {
      "cache-control": "no-store",
      "content-disposition": "attachment; filename=\"promotion-codes.csv\"",
      "content-type": "text/csv; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}

function promotionMutation(
  value: unknown,
  expected?: Readonly<{ id?: string; version?: number; status?: string }>,
) {
  const parsed = parsePromotionMutationEnvelope(value);
  if (
    (expected?.id !== undefined && parsed.promotion.id !== expected.id) ||
    (expected?.version !== undefined && parsed.promotion.version !== expected.version) ||
    (expected?.status !== undefined && parsed.promotion.status !== expected.status)
  ) throw new TypeError("promotion_http_output_invalid");
  return parsed;
}

function batchMutation(
  value: unknown,
  expected: Readonly<{ id?: string; promotionId?: string; version: number; status: string }>,
) {
  const parsed = parsePromotionCodeBatchMutationEnvelope(value);
  if (
    (expected.id !== undefined && parsed.batch.id !== expected.id) ||
    (expected.promotionId !== undefined && parsed.batch.promotionId !== expected.promotionId) ||
    parsed.batch.version !== expected.version || parsed.batch.status !== expected.status
  ) throw new TypeError("promotion_http_output_invalid");
  return parsed;
}

function getValue(input: ParsedInput): PromotionAdminListQuery | PromotionTargetListQuery | PromotionPageQuery | undefined {
  return (input as PromotionGetInput).value;
}

function mutationValue(input: ParsedInput): PromotionMutationInput["value"] {
  return (input as PromotionMutationInput).value;
}

function operationId(input: ParsedInput): string {
  return (input as PromotionMutationInput).operationId!;
}

async function dispatch(route: PromotionRoute, input: ParsedInput, authorized: Authorized): Promise<Response> {
  const repository = authorized.runtime.promotions;
  const authority = { tenantContext: authorized.tenantContext, now: authorized.now } as const;
  switch (route.kind) {
    case "list": {
      const { limit, ...query } = getValue(input) as PromotionAdminListQuery;
      return execute(route, input, () => repository.list({ ...authority, ...query, pageSize: limit }), (result) => json(publicPromotionList(result, limit)));
    }
    case "detail":
      return execute(route, input, () => repository.detail({ ...authority, promotionId: route.promotionId }), (result) => {
        const parsed = parsePromotionDetail(result);
        if (parsed.id !== route.promotionId) throw new TypeError("promotion_http_output_invalid");
        return json(parsed);
      });
    case "create": {
      const value = mutationValue(input) as PromotionCreateRequest;
      return execute(route, input, () => repository.create({ ...authority, operationId: operationId(input), ...value }), (result) => json(promotionMutation(result, { version: 1, status: "draft" }), 201));
    }
    case "update": {
      const value = mutationValue(input) as PromotionUpdateRequest;
      return execute(route, input, () => repository.update({ ...authority, operationId: operationId(input), promotionId: route.promotionId, ...value }), (result) => json(promotionMutation(result, { id: route.promotionId, version: value.expectedVersion + 1 })));
    }
    case "publish": {
      const value = mutationValue(input) as PromotionLifecycleTargetRequest;
      return execute(route, input, () => repository.publish({ ...authority, operationId: operationId(input), promotionId: route.promotionId, ...value }), (result) => json(promotionMutation(result, { id: route.promotionId, version: value.expectedVersion + 1, status: value.nextStatus })));
    }
    case "pause": {
      const value = mutationValue(input) as PromotionVersionRequest;
      return execute(route, input, () => repository.pause({ ...authority, operationId: operationId(input), promotionId: route.promotionId, ...value }), (result) => json(promotionMutation(result, { id: route.promotionId, version: value.expectedVersion + 1, status: "paused" })));
    }
    case "resume": {
      const value = mutationValue(input) as PromotionLifecycleTargetRequest;
      return execute(route, input, () => repository.resume({ ...authority, operationId: operationId(input), promotionId: route.promotionId, ...value }), (result) => json(promotionMutation(result, { id: route.promotionId, version: value.expectedVersion + 1, status: value.nextStatus })));
    }
    case "duplicate": {
      const value = mutationValue(input) as PromotionDuplicateRequest;
      return execute(route, input, () => repository.duplicate({ ...authority, operationId: operationId(input), promotionId: route.promotionId, ...value }), (result) => {
        const parsed = promotionMutation(result, { version: 1, status: "draft" });
        if (parsed.promotion.id === route.promotionId) throw new TypeError("promotion_http_output_invalid");
        return json(parsed, 201);
      });
    }
    case "archive": {
      const value = mutationValue(input) as PromotionVersionRequest;
      return execute(route, input, () => repository.archive({ ...authority, operationId: operationId(input), promotionId: route.promotionId, ...value }), (result) => json(promotionMutation(result, { id: route.promotionId, version: value.expectedVersion + 1, status: "archived" })));
    }
    case "simulate": {
      const value = mutationValue(input) as PromotionSimulationRequest;
      const context = Object.freeze({ ...value.context, storeId: authorized.tenantContext.store.id });
      return execute(route, input, () => repository.simulate({ ...authority, ...value, context }), (result) => json(parsePromotionSimulatorResponse(result)));
    }
    case "conflicts": {
      const value = mutationValue(input) as PromotionCheckRequest;
      return execute(route, input, () => repository.conflicts({ ...authority, ...value }), (result) => json(parsePromotionConflictCheck(result)));
    }
    case "margin": {
      const value = mutationValue(input) as PromotionCheckRequest;
      return execute(route, input, () => repository.margin({ ...authority, ...value }), (result) => json(parsePromotionMarginCheck(result)));
    }
    case "target_list": {
      const { limit, ...query } = getValue(input) as PromotionTargetListQuery;
      return execute(route, input, () => repository.listTargets({ ...authority, ...query, pageSize: limit }), (result) => json(publicPickerList(result, query.kind, limit)));
    }
    case "target_resolve": {
      const value = mutationValue(input) as PromotionTargetResolveRequest;
      return execute(route, input, () => repository.resolveTargets({ ...authority, ...value }), (result) => {
        const items = parsePromotionPickerResolve({ items: denseArray(result, value.ids.length) }, value.kind, value.ids);
        return json({ items });
      });
    }
    case "code_batch_list": {
      const { limit, ...query } = getValue(input) as PromotionPageQuery;
      return execute(route, input, () => repository.listCodeBatches({ ...authority, promotionId: route.promotionId, ...query, pageSize: limit }), (result) => json(publicBatchList(result, route.promotionId, limit)));
    }
    case "code_batch_create": {
      const value = mutationValue(input) as PromotionBatchCreateRequest;
      return execute(route, input, () => repository.createCodeBatch({ ...authority, operationId: operationId(input), promotionId: route.promotionId, ...value }), (result) => json(batchMutation(result, { promotionId: route.promotionId, version: 1, status: "active" }), 201));
    }
    case "code_batch_status": {
      const value = mutationValue(input) as PromotionBatchStatusRequest;
      return execute(route, input, () => repository.updateCodeBatchStatus({ ...authority, operationId: operationId(input), batchId: route.batchId, ...value }), (result) => json(batchMutation(result, { id: route.batchId, version: value.expectedVersion + 1, status: value.nextStatus })));
    }
    case "code_batch_csv":
      return execute(route, input, () => repository.exportCodes({ ...authority, batchId: route.batchId }), csv);
    case "analytics":
      return execute(route, input, () => repository.analytics({ ...authority, promotionId: route.promotionId }), (result) => json(parsePromotionAdminAnalyticsResult(result)));
    case "legacy": {
      const { limit, ...query } = getValue(input) as PromotionPageQuery;
      return execute(route, input, () => repository.listLegacy({ ...authority, ...query, pageSize: limit }), (result) => json(publicLegacyList(result, limit)));
    }
  }
}

export function createPromotionsHttpHandler(dependencies: Dependencies) {
  if (
    !dependencies || typeof dependencies.resolveRuntime !== "function" ||
    typeof dependencies.now !== "function" || typeof dependencies.requestId !== "function"
  ) throw new Error("promotions_http_handler_invalid");

  return async function handlePromotionsRequest(request: Request): Promise<Response> {
    const decision = classifyPromotionRequest(request);
    if (decision.kind === "invalid") return error("invalid_input", 400);
    if (decision.kind === "not_found") return error("not_found", 404);
    if (decision.kind === "method_not_allowed") return error("method_not_allowed", 405, { allow: decision.allow });
    const input = decision.route.method === "GET"
      ? readPromotionGetInput(request, decision.route)
      : await readPromotionMutationInput(request, decision.route);
    if (input.kind !== "valid") return error("invalid_input", 400);
    const authorized = await authorize(dependencies, request, decision.route);
    if (authorized instanceof Response) return authorized;
    try { return await dispatch(decision.route, input, authorized); }
    catch { return unavailable(); }
  };
}
