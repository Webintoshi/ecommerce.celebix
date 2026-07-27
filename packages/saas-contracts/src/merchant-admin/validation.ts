import {
  MERCHANT_ADMIN_EVENT_KINDS,
  MERCHANT_ADMIN_PROVIDER_ACTIONS,
  MERCHANT_ADMIN_PROVIDER_JOB_STATUSES,
  MERCHANT_ADMIN_PROVIDER_RECORD_KINDS,
  MERCHANT_ADMIN_RECORD_KINDS,
  MERCHANT_PROVIDER_CAPABILITIES,
  MERCHANT_PROVIDER_PROFILE_STATUSES,
  type MerchantAdminEvent,
  type MerchantAdminJson,
  type MerchantAdminMutationResult,
  type MerchantAdminProviderAction,
  type MerchantAdminProviderJob,
  type MerchantAdminProviderJobMutationResult,
  type MerchantAdminProviderJobStatus,
  type MerchantAdminProviderRecordKind,
  type MerchantAdminRecord,
  type MerchantProviderCapability,
  type MerchantProviderCredentialFieldDescriptor,
  type MerchantProviderDescriptor,
  type MerchantProviderFieldDescriptor,
  type MerchantProviderProfile,
  type MerchantProviderProfileStatus,
} from "./types.ts";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, CONTROL = /[\u0000-\u001f\u007f-\u009f]/, EDGE = /^[\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]|[\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]$/, KEY = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/, FORBIDDEN = /(?:secret|password|credential|private|token|api.?key)/i;
const ENCODER = new TextEncoder(), SURROGATE = /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/;
function invalid(): never { throw new Error("merchant_admin_contract_invalid"); }
function bytes(value: string) { return ENCODER.encode(value).byteLength; }
function object(value: unknown) { if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid(); const keys = Reflect.ownKeys(value); if (keys.some((key) => typeof key !== "string")) invalid(); const descriptors = Object.getOwnPropertyDescriptors(value); if (keys.some((key) => { const descriptor = descriptors[key as string]; return !descriptor || !descriptor.enumerable || !("value" in descriptor); })) invalid(); return Object.fromEntries((keys as string[]).map((key) => [key, descriptors[key]!.value])) as Record<string, unknown>; }
function exact(value: unknown, required: readonly string[], optional: readonly string[] = []) { const parsed = object(value), allowed = new Set([...required, ...optional]); if (required.some((key) => !Object.hasOwn(parsed, key)) || Object.keys(parsed).some((key) => !allowed.has(key))) invalid(); return parsed; }
function text(value: unknown, min: number, max: number) { if (typeof value !== "string" || bytes(value) < min || bytes(value) > max || EDGE.test(value) || CONTROL.test(value) || SURROGATE.test(value)) invalid(); return value; }
function integer(value: unknown, min = 0) { if (!Number.isSafeInteger(value) || (value as number) < min) invalid(); return value as number; }
function timestamp(value: unknown) { const result = text(value, 24, 24); if (new Date(result).toISOString() !== result) invalid(); return result; }
function uuid(value: unknown) { const result = text(value, 36, 36); if (!UUID.test(result)) invalid(); return result; }
function array(value: unknown, depth: number): readonly MerchantAdminJson[] { if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > 100) invalid(); const keys = Reflect.ownKeys(value), descriptors = Object.getOwnPropertyDescriptors(value); if (keys.length !== value.length + 1 || !Object.hasOwn(descriptors, "length")) invalid(); const result: MerchantAdminJson[] = []; for (let index = 0; index < value.length; index += 1) { const key = String(index), descriptor = descriptors[key]; if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid(); result.push(json(descriptor.value, depth + 1)); } return Object.freeze(result); }
function canonicalJson(value: MerchantAdminJson): string { if (value === null) return "null"; if (typeof value === "boolean" || typeof value === "number") return String(value); if (typeof value === "string") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(canonicalJson).join(", ")}]`; const objectValue = value as Readonly<Record<string, MerchantAdminJson>>, keys = Object.keys(objectValue).sort((left, right) => { const a = ENCODER.encode(left), b = ENCODER.encode(right); if (a.byteLength !== b.byteLength) return a.byteLength - b.byteLength; for (let index = 0; index < a.byteLength; index += 1) if (a[index] !== b[index]) return a[index]! - b[index]!; return 0; }); return `{${keys.map((key) => `${JSON.stringify(key)}: ${canonicalJson(objectValue[key]!)}`).join(", ")}}`; }
function json(value: unknown, depth = 0): MerchantAdminJson { if (depth > 6) invalid(); if (value === null || typeof value === "boolean") return value; if (typeof value === "number") { if (!Number.isSafeInteger(value)) invalid(); return value; } if (typeof value === "string") return text(value, 0, 4000); if (Array.isArray(value)) return array(value, depth); const parsed = object(value), keys = Object.keys(parsed); if (keys.length > 64 || keys.some((key) => !KEY.test(key) || FORBIDDEN.test(key))) invalid(); const result = Object.freeze(Object.fromEntries(keys.map((key) => [key, json(parsed[key], depth + 1)]))) as Readonly<Record<string, MerchantAdminJson>>; if (depth === 0 && bytes(canonicalJson(result)) > 16_384) invalid(); return result; }
function kind(value: unknown): MerchantAdminRecord["kind"] { if (!MERCHANT_ADMIN_RECORD_KINDS.includes(value as never)) invalid(); return value as MerchantAdminRecord["kind"]; }
function status(value: unknown): MerchantAdminRecord["status"] { if (!["draft", "active", "archived"].includes(String(value))) invalid(); return value as MerchantAdminRecord["status"]; }
function providerAction(value: unknown): MerchantAdminProviderAction { if (!MERCHANT_ADMIN_PROVIDER_ACTIONS.includes(value as never)) invalid(); return value as MerchantAdminProviderAction; }
function providerStatus(value: unknown): MerchantAdminProviderJobStatus { if (!MERCHANT_ADMIN_PROVIDER_JOB_STATUSES.includes(value as never)) invalid(); return value as MerchantAdminProviderJobStatus; }
function providerKind(value: unknown): MerchantAdminProviderRecordKind { if (!MERCHANT_ADMIN_PROVIDER_RECORD_KINDS.includes(value as never)) invalid(); return value as MerchantAdminProviderRecordKind; }
function providerPair(rawKind: unknown, rawAction: unknown) { const recordKind = providerKind(rawKind), action = providerAction(rawAction); const expected: MerchantAdminProviderAction = recordKind === "marketplace_connection" ? "synchronization" : recordKind === "invoice_integration" ? "reconciliation" : recordKind === "indexing_request" ? "indexing" : "delivery"; if (action !== expected) invalid(); return { recordKind, action } as const; }
const PROVIDER_CODE = /^[a-z][a-z0-9_]{0,63}$/;
const PROVIDER_EXECUTION_FIELDS = Object.freeze([
  "profileId", "providerCode", "credentialVersion", "attempt", "safeProviderReference", "outcomeCode",
] as const);
function providerCode(value: unknown): string { const result = text(value, 1, 64); if (!PROVIDER_CODE.test(result)) invalid(); return result; }
function providerCapability(value: unknown): MerchantProviderCapability { if (!MERCHANT_PROVIDER_CAPABILITIES.includes(value as never)) invalid(); return value as MerchantProviderCapability; }
function providerProfileStatus(value: unknown): MerchantProviderProfileStatus { if (!MERCHANT_PROVIDER_PROFILE_STATUSES.includes(value as never)) invalid(); return value as MerchantProviderProfileStatus; }
function nullableText(value: unknown, min: number, max: number): string | null { return value === null ? null : text(value, min, max); }
function nullableUuid(value: unknown): string | null { return value === null ? null : uuid(value); }
function nullableInteger(value: unknown, min: number): number | null { return value === null ? null : integer(value, min); }
function nullableTimestamp(value: unknown): string | null { return value === null ? null : timestamp(value); }
function providerField(value: unknown): Readonly<MerchantProviderFieldDescriptor> { const parsed = exact(value, ["key", "label"]); return Object.freeze({ key: providerCode(parsed.key), label: text(parsed.label, 1, 120) }); }
function providerCredentialField(value: unknown): Readonly<MerchantProviderCredentialFieldDescriptor> { const parsed = exact(value, ["key", "label", "secret"]); if (parsed.secret !== true) invalid(); return Object.freeze({ key: providerCode(parsed.key), label: text(parsed.label, 1, 120), secret: true }); }
function descriptorFields<T>(value: unknown, parser: (entry: unknown) => T): readonly T[] { if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > 32) invalid(); const keys = Reflect.ownKeys(value), descriptors = Object.getOwnPropertyDescriptors(value); if (keys.length !== value.length + 1 || !Object.hasOwn(descriptors, "length")) invalid(); const result: T[] = []; for (let index = 0; index < value.length; index += 1) { const descriptor = descriptors[String(index)]; if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid(); result.push(parser(descriptor.value)); } return Object.freeze(result); }
function providerExecutionFields(parsed: Record<string, unknown>, status: MerchantAdminProviderJobStatus) {
  const present = PROVIDER_EXECUTION_FIELDS.filter((field) => Object.hasOwn(parsed, field));
  if (present.length === 0) {
    if (status !== "awaiting_provider_activation" && status !== "cancelled") invalid();
    return Object.freeze({ profileId: null, providerCode: null, credentialVersion: null, attempt: 0, safeProviderReference: null, outcomeCode: null });
  }
  if (present.length !== PROVIDER_EXECUTION_FIELDS.length) invalid();
  const profileId = nullableUuid(parsed.profileId), code = parsed.providerCode === null ? null : providerCode(parsed.providerCode), credentialVersion = nullableInteger(parsed.credentialVersion, 1);
  if ((profileId === null) !== (code === null) || (profileId === null) !== (credentialVersion === null)) invalid();
  const outcomeCode = parsed.outcomeCode === null ? null : providerCode(parsed.outcomeCode);
  const attempt = integer(parsed.attempt), safeProviderReference = nullableText(parsed.safeProviderReference, 1, 256), beforeExecution = status === "awaiting_provider_activation", cancelled = status === "cancelled", pendingResult = status === "queued" || status === "leased";
  if ((!beforeExecution && !cancelled && profileId === null) || (beforeExecution && (profileId !== null || attempt !== 0)) || (status === "leased" && attempt < 1)) invalid();
  if ((beforeExecution || pendingResult || cancelled) && (safeProviderReference !== null || outcomeCode !== null)) invalid();
  if (!["awaiting_provider_activation", "queued", "leased", "cancelled"].includes(status) && (attempt < 1 || outcomeCode === null)) invalid();
  return Object.freeze({ profileId, providerCode: code, credentialVersion, attempt, safeProviderReference, outcomeCode });
}
export function parseMerchantAdminRecord(value: unknown): MerchantAdminRecord { const parsed = exact(value, ["id", "kind", "name", "config", "status", "version", "createdAt", "updatedAt"]), config = json(parsed.config); if (typeof config !== "object" || config === null || Array.isArray(config)) invalid(); return Object.freeze({ id: uuid(parsed.id), kind: kind(parsed.kind), name: text(parsed.name, 1, 160), config: config as Readonly<Record<string, MerchantAdminJson>>, status: status(parsed.status), version: integer(parsed.version, 1), createdAt: timestamp(parsed.createdAt), updatedAt: timestamp(parsed.updatedAt) }); }
export function parseMerchantAdminMutationResult(value: unknown): MerchantAdminMutationResult { const parsed = exact(value, ["id", "kind", "status", "version", "updatedAt", "replayed"]); if (typeof parsed.replayed !== "boolean") invalid(); return Object.freeze({ id: uuid(parsed.id), kind: kind(parsed.kind), status: status(parsed.status), version: integer(parsed.version, 1), updatedAt: timestamp(parsed.updatedAt), replayed: parsed.replayed }); }
export function parseMerchantAdminConfig(value: unknown): Readonly<Record<string, MerchantAdminJson>> { const result = json(value); if (typeof result !== "object" || result === null || Array.isArray(result)) invalid(); return result as Readonly<Record<string, MerchantAdminJson>>; }
export function parseMerchantAdminEvent(value: unknown): MerchantAdminEvent { const parsed = exact(value, ["id", "recordId", "recordKind", "eventKind", "summary", "occurredAt"]), summary = json(parsed.summary); if (!MERCHANT_ADMIN_EVENT_KINDS.includes(parsed.eventKind as never) || typeof summary !== "object" || summary === null || Array.isArray(summary)) invalid(); return Object.freeze({ id: uuid(parsed.id), recordId: uuid(parsed.recordId), recordKind: kind(parsed.recordKind), eventKind: parsed.eventKind as MerchantAdminEvent["eventKind"], summary: summary as Readonly<Record<string, MerchantAdminJson>>, occurredAt: timestamp(parsed.occurredAt) }); }
export function parseMerchantProviderDescriptor(value: unknown): MerchantProviderDescriptor { const parsed = exact(value, ["providerCode", "capability", "label", "publicFields", "credentialFields"]), publicFields = descriptorFields(parsed.publicFields, providerField), credentialFields = descriptorFields(parsed.credentialFields, providerCredentialField), fieldKeys = [...publicFields, ...credentialFields].map((field) => field.key); if (new Set(fieldKeys).size !== fieldKeys.length) invalid(); return Object.freeze({ providerCode: providerCode(parsed.providerCode), capability: providerCapability(parsed.capability), label: text(parsed.label, 1, 120), publicFields, credentialFields }); }
export function parseMerchantProviderProfile(value: unknown): MerchantProviderProfile { const parsed = exact(value, ["id", "providerCode", "capability", "publicConfig", "maskedAccountReference", "status", "credentialVersion", "version", "lastValidatedAt", "createdAt", "updatedAt"]), publicConfig = json(parsed.publicConfig); if (typeof publicConfig !== "object" || publicConfig === null || Array.isArray(publicConfig) || bytes(canonicalJson(publicConfig)) > 8_192) invalid(); const createdAt = timestamp(parsed.createdAt), updatedAt = timestamp(parsed.updatedAt), lastValidatedAt = nullableTimestamp(parsed.lastValidatedAt); if (updatedAt < createdAt || (lastValidatedAt !== null && (lastValidatedAt < createdAt || lastValidatedAt > updatedAt))) invalid(); return Object.freeze({ id: uuid(parsed.id), providerCode: providerCode(parsed.providerCode), capability: providerCapability(parsed.capability), publicConfig: publicConfig as Readonly<Record<string, MerchantAdminJson>>, maskedAccountReference: text(parsed.maskedAccountReference, 1, 160), status: providerProfileStatus(parsed.status), credentialVersion: integer(parsed.credentialVersion, 1), version: integer(parsed.version, 1), lastValidatedAt, createdAt, updatedAt }); }
export function parseMerchantAdminProviderJob(value: unknown): MerchantAdminProviderJob { const parsed = exact(value, ["id", "recordId", "recordKind", "action", "status", "version", "requestedAt", "updatedAt"], PROVIDER_EXECUTION_FIELDS), pair = providerPair(parsed.recordKind, parsed.action), status = providerStatus(parsed.status), execution = providerExecutionFields(parsed, status); return Object.freeze({ id: uuid(parsed.id), recordId: uuid(parsed.recordId), ...pair, status, ...execution, version: integer(parsed.version, 1), requestedAt: timestamp(parsed.requestedAt), updatedAt: timestamp(parsed.updatedAt) }); }
export function parseMerchantAdminProviderJobMutationResult(value: unknown): MerchantAdminProviderJobMutationResult { const parsed = exact(value, ["id", "recordId", "recordKind", "action", "status", "version", "updatedAt", "replayed"], PROVIDER_EXECUTION_FIELDS), pair = providerPair(parsed.recordKind, parsed.action), status = providerStatus(parsed.status), execution = providerExecutionFields(parsed, status); if (typeof parsed.replayed !== "boolean") invalid(); return Object.freeze({ id: uuid(parsed.id), recordId: uuid(parsed.recordId), ...pair, status, ...execution, version: integer(parsed.version, 1), updatedAt: timestamp(parsed.updatedAt), replayed: parsed.replayed }); }
