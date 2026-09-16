import {
  STORE_ADMIN_INVITATION_DELIVERY_STATUSES,
  STORE_ADMIN_INVITATION_ROLES,
  STORE_ADMIN_INVITATION_STATUSES,
  type StoreAdminInvitationActionIntent,
  type StoreAdminInvitationDeliveryStatus,
  type StoreAdminInvitationRole,
  type StoreAdminInvitationSendIntent,
  type StoreAdminInvitationStatus,
  type StoreAdminInvitationView,
} from "./types.ts";

const INVALID = "invalid_store_admin_invitation";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const ANGLE_BRACKET = /[<>]/;
const LOCAL_PART = /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/;
const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function invalid(): never {
  throw new TypeError(INVALID);
}

function guarded<T>(operation: () => T): T {
  try {
    return operation();
  } catch {
    return invalid();
  }
}

function exactRecord(value: unknown, expectedKeys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expectedKeys.length || keys.some((key) => typeof key !== "string" || !expectedKeys.includes(key))) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (expectedKeys.some((key) => {
    const descriptor = descriptors[key];
    return !descriptor || !descriptor.enumerable || !("value" in descriptor);
  })) invalid();
  return Object.fromEntries(expectedKeys.map((key) => [key, descriptors[key]!.value]));
}

function uuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) invalid();
  return value;
}

function positiveInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) invalid();
  return value;
}

function displayName(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 160 || value !== value.trim() || CONTROL.test(value) || ANGLE_BRACKET.test(value)) invalid();
  return value;
}

function timestamp(value: unknown): string {
  if (typeof value !== "string" || !ISO_UTC.test(value)) invalid();
  const canonical = value.endsWith("Z") && !value.includes(".") ? `${value.slice(0, -1)}.000Z` : value;
  const parsed = new Date(canonical);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== canonical) invalid();
  return canonical;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) invalid();
  return value as T;
}

export function normalizeStoreAdminInvitationEmail(value: unknown): string {
  return guarded(() => {
    if (typeof value !== "string") invalid();
    const trimmed = value.replace(/^ +| +$/g, "");
    if (trimmed.length < 3 || trimmed.length > 254 || CONTROL.test(trimmed) || /[^\x20-\x7e]/.test(trimmed)) invalid();
    const normalized = trimmed.toLowerCase();
    const parts = normalized.split("@");
    if (parts.length !== 2) invalid();
    const [local, domain] = parts;
    if (!local || local.length > 64 || !LOCAL_PART.test(local) || local.startsWith(".") || local.endsWith(".") || local.includes("..")) invalid();
    const labels = domain?.split(".") ?? [];
    if (labels.length < 2 || domain.length > 253 || labels.some((label) => !DOMAIN_LABEL.test(label))) invalid();
    return normalized;
  });
}

export function parseStoreAdminInvitationView(value: unknown): StoreAdminInvitationView {
  return guarded(() => {
    const parsed = exactRecord(value, ["id", "sourceRecordId", "email", "displayName", "role", "status", "deliveryStatus", "expiresAt", "createdAt", "updatedAt", "version", "generation"]);
    const deliveryStatus = parsed.deliveryStatus === null
      ? null
      : enumValue(parsed.deliveryStatus, STORE_ADMIN_INVITATION_DELIVERY_STATUSES) as StoreAdminInvitationDeliveryStatus;
    return Object.freeze({
      id: uuid(parsed.id),
      sourceRecordId: uuid(parsed.sourceRecordId),
      email: normalizeStoreAdminInvitationEmail(parsed.email),
      displayName: displayName(parsed.displayName),
      role: enumValue(parsed.role, STORE_ADMIN_INVITATION_ROLES) as StoreAdminInvitationRole,
      status: enumValue(parsed.status, STORE_ADMIN_INVITATION_STATUSES) as StoreAdminInvitationStatus,
      deliveryStatus,
      expiresAt: timestamp(parsed.expiresAt),
      createdAt: timestamp(parsed.createdAt),
      updatedAt: timestamp(parsed.updatedAt),
      version: positiveInteger(parsed.version),
      generation: positiveInteger(parsed.generation),
    });
  });
}

export function parseStoreAdminInvitationSendIntent(value: unknown): StoreAdminInvitationSendIntent {
  return guarded(() => {
    const parsed = exactRecord(value, ["sourceRecordId", "expectedRecordVersion", "operationId"]);
    return Object.freeze({
      sourceRecordId: uuid(parsed.sourceRecordId),
      expectedRecordVersion: positiveInteger(parsed.expectedRecordVersion),
      operationId: uuid(parsed.operationId),
    });
  });
}

export function parseStoreAdminInvitationActionIntent(value: unknown): StoreAdminInvitationActionIntent {
  return guarded(() => {
    const parsed = exactRecord(value, ["invitationId", "expectedVersion", "operationId"]);
    return Object.freeze({
      invitationId: uuid(parsed.invitationId),
      expectedVersion: positiveInteger(parsed.expectedVersion),
      operationId: uuid(parsed.operationId),
    });
  });
}
