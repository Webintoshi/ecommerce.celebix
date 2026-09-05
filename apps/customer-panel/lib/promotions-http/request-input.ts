import {
  parsePromotionAdminListQuery,
  parsePromotionAnalyticsQuery,
  parsePromotionBatchCreateRequest,
  parsePromotionBatchStatusRequest,
  parsePromotionCheckRequest,
  parsePromotionCreateRequest,
  parsePromotionDuplicateRequest,
  parsePromotionLifecycleTargetRequest,
  parsePromotionPageQuery,
  parsePromotionSimulationRequest,
  parsePromotionTargetListQuery,
  parsePromotionTargetResolveRequest,
  parsePromotionUpdateRequest,
  parsePromotionVersionRequest,
  type PromotionAdminListQuery,
  type PromotionAnalyticsQuery,
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
} from "@celebix/saas-contracts";

import type { PromotionRoute } from "./request-authority.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const QUERY_MAXIMUM_BYTES = 4_096;
const UTF8 = new TextEncoder();
const INVALID = Object.freeze({ kind: "invalid" as const });
type Invalid = typeof INVALID;

const BODY_LIMITS = Object.freeze({
  create: 393_216,
  update: 393_216,
  publish: 8_192,
  pause: 8_192,
  resume: 8_192,
  duplicate: 786_432,
  archive: 8_192,
  simulate: 655_360,
  conflicts: 393_216,
  margin: 393_216,
  target_resolve: 32_768,
  code_batch_create: 16_384,
  code_batch_status: 8_192,
} as const);

type MutationKind = keyof typeof BODY_LIMITS;
type PromotionMutationValue =
  | PromotionCreateRequest | PromotionUpdateRequest | PromotionVersionRequest
  | PromotionLifecycleTargetRequest | PromotionDuplicateRequest | PromotionSimulationRequest
  | PromotionCheckRequest | PromotionTargetResolveRequest | PromotionBatchCreateRequest
  | PromotionBatchStatusRequest;

export type PromotionMutationInput = Readonly<{
  kind: "valid";
  operationId?: string;
  value: PromotionMutationValue;
}>;

export type PromotionGetInput = Readonly<{
  kind: "valid";
  value?: PromotionAdminListQuery | PromotionTargetListQuery | PromotionPageQuery | PromotionAnalyticsQuery;
}>;

const DURABLE_MUTATIONS = new Set<MutationKind>([
  "create", "update", "publish", "pause", "resume", "duplicate", "archive",
  "code_batch_create", "code_batch_status",
]);

function jsonContentType(request: Request): boolean {
  const value = request.headers.get("content-type");
  return value !== null && !value.includes(",") &&
    /^application\/json(?:\s*;\s*charset=(?:utf-8|"utf-8"))?$/iu.test(value) &&
    request.headers.get("transfer-encoding") === null;
}

async function boundedJson(request: Request, maximum: number): Promise<unknown | null> {
  if (!jsonContentType(request) || request.body === null) return null;
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^(?:0|[1-9]\d*)$/u.test(declared) || Number(declared) > maximum)) return null;
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      if (!(next.value instanceof Uint8Array)) return null;
      total += next.value.byteLength;
      if (total > maximum) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(new Uint8Array(next.value));
    }
  } catch {
    return null;
  }
  if (total === 0 || (declared !== null && Number(declared) !== total)) return null;
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
}

function parseMutation(kind: MutationKind, value: unknown): PromotionMutationValue {
  switch (kind) {
    case "create": return parsePromotionCreateRequest(value);
    case "update": return parsePromotionUpdateRequest(value);
    case "publish":
    case "resume": return parsePromotionLifecycleTargetRequest(value);
    case "pause":
    case "archive": return parsePromotionVersionRequest(value);
    case "duplicate": return parsePromotionDuplicateRequest(value);
    case "simulate": return parsePromotionSimulationRequest(value);
    case "conflicts":
    case "margin": return parsePromotionCheckRequest(value);
    case "target_resolve": return parsePromotionTargetResolveRequest(value);
    case "code_batch_create": return parsePromotionBatchCreateRequest(value);
    case "code_batch_status": return parsePromotionBatchStatusRequest(value);
  }
}

export async function readPromotionMutationInput(
  request: Request,
  route: PromotionRoute,
): Promise<Invalid | PromotionMutationInput> {
  if (!(route.kind in BODY_LIMITS) || request.method !== route.method) return INVALID;
  const kind = route.kind as MutationKind;
  const operationId = request.headers.get("idempotency-key");
  const durable = DURABLE_MUTATIONS.has(kind);
  if ((durable && (operationId === null || !UUID.test(operationId))) || (!durable && operationId !== null)) return INVALID;
  const raw = await boundedJson(request, BODY_LIMITS[kind]);
  if (raw === null) return INVALID;
  try {
    const value = parseMutation(kind, raw);
    return Object.freeze({ kind: "valid" as const, ...(durable ? { operationId: operationId! } : {}), value });
  } catch {
    return INVALID;
  }
}

function rawQuery(request: Request): readonly [string, string][] | null {
  let url: URL;
  try { url = new URL(request.url); } catch { return null; }
  const raw = url.search.startsWith("?") ? url.search.slice(1) : url.search;
  if (
    UTF8.encode(raw).byteLength > QUERY_MAXIMUM_BYTES ||
    (raw !== "" && (raw.startsWith("&") || raw.endsWith("&") || raw.includes("&&")))
  ) return null;
  const output: [string, string][] = [], seen = new Set<string>();
  for (const part of raw === "" ? [] : raw.split("&")) {
    const separator = part.indexOf("=");
    if (separator < 1) return null;
    const rawKey = part.slice(0, separator), rawValue = part.slice(separator + 1);
    if (rawKey.includes("%") || rawKey.includes("+")) return null;
    let value: string;
    try { value = decodeURIComponent(rawValue.replaceAll("+", " ")); } catch { return null; }
    if (seen.has(rawKey)) return null;
    seen.add(rawKey);
    output.push([rawKey, value]);
  }
  return output;
}

function canonicalLimit(value: string | undefined, maximum: number): number | null {
  if (value === undefined) return 20;
  if (!/^(?:[1-9]|[1-9]\d|100)$/u.test(value)) return null;
  const selected = Number(value);
  return selected <= maximum ? selected : null;
}

function commaSet(value: string): readonly string[] | null {
  if (value.length === 0 || value.includes(" ") || value.startsWith(",") || value.endsWith(",") || value.includes(",,")) return null;
  const entries = value.split(",");
  return new Set(entries).size === entries.length ? entries : null;
}

function listQuery(parameters: Map<string, string>): PromotionAdminListQuery | null {
  if ([...parameters.keys()].some((key) => ![
    "limit", "cursor", "search", "effectiveStatuses", "triggerKinds", "benefitKinds", "audienceModes",
    "scheduleFrom", "scheduleTo",
  ].includes(key))) return null;
  const limit = canonicalLimit(parameters.get("limit"), 100);
  if (limit === null) return null;
  const value: Record<string, unknown> = { limit };
  for (const key of ["cursor", "search", "scheduleFrom", "scheduleTo"] as const) {
    if (parameters.has(key)) value[key] = parameters.get(key)!;
  }
  for (const key of ["effectiveStatuses", "triggerKinds", "benefitKinds", "audienceModes"] as const) {
    if (!parameters.has(key)) continue;
    const entries = commaSet(parameters.get(key)!);
    if (entries === null) return null;
    value[key] = entries;
  }
  try { return parsePromotionAdminListQuery(value); } catch { return null; }
}

function pickerQuery(parameters: Map<string, string>): PromotionTargetListQuery | null {
  if ([...parameters.keys()].some((key) => !["kind", "limit", "cursor", "search"].includes(key)) || !parameters.has("kind")) return null;
  const limit = canonicalLimit(parameters.get("limit"), 50);
  if (limit === null) return null;
  try {
    return parsePromotionTargetListQuery({
      kind: parameters.get("kind"), limit,
      ...(parameters.has("cursor") ? { cursor: parameters.get("cursor") } : {}),
      ...(parameters.has("search") ? { search: parameters.get("search") } : {}),
    });
  } catch { return null; }
}

function pageQuery(parameters: Map<string, string>): PromotionPageQuery | null {
  if ([...parameters.keys()].some((key) => !["limit", "cursor"].includes(key))) return null;
  const limit = canonicalLimit(parameters.get("limit"), 100);
  if (limit === null) return null;
  try { return parsePromotionPageQuery({ limit, ...(parameters.has("cursor") ? { cursor: parameters.get("cursor") } : {}) }); }
  catch { return null; }
}

function analyticsQuery(parameters: Map<string, string>): PromotionAnalyticsQuery | null {
  if (parameters.size !== 1 || !parameters.has("days")) return null;
  const days = parameters.get("days");
  if (!/^(7|30|90)$/.test(days ?? "")) return null;
  try { return parsePromotionAnalyticsQuery({ days: Number(days) }); }
  catch { return null; }
}

export function readPromotionGetInput(request: Request, route: PromotionRoute): Invalid | PromotionGetInput {
  try {
    if (
      route.method !== "GET" || request.method !== "GET" || request.body !== null ||
      request.headers.get("content-type") !== null || request.headers.get("content-length") !== null ||
      request.headers.get("transfer-encoding") !== null || request.headers.get("idempotency-key") !== null
    ) return INVALID;
    const entries = rawQuery(request);
    if (entries === null) return INVALID;
    const parameters = new Map(entries);
    let value: PromotionAdminListQuery | PromotionTargetListQuery | PromotionPageQuery | PromotionAnalyticsQuery | null | undefined;
    if (route.kind === "list") value = listQuery(parameters);
    else if (route.kind === "target_list") value = pickerQuery(parameters);
    else if (route.kind === "code_batch_list" || route.kind === "legacy") value = pageQuery(parameters);
    else if (route.kind === "analytics" || route.kind === "overview") value = analyticsQuery(parameters);
    else value = entries.length === 0 ? undefined : null;
    if (value === null) return INVALID;
    return Object.freeze({ kind: "valid" as const, ...(value === undefined ? {} : { value }) });
  } catch {
    return INVALID;
  }
}
