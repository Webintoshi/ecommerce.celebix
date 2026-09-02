import { STORE_DOMAIN_UI_STATUSES, type AdminDomainView, type StoreDomainDnsInstruction, type StoreDomainView, type TenantContext } from "@celebix/saas-contracts";

import { StoreDomainRepositoryError } from "./errors.ts";
import type { StoreDomainOriginHealth, StoreDomainWorkflowClaim } from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const FINGERPRINT = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9._-]{1,128}$/u;
const ERROR_CODE = /^[a-z][a-z0-9_]{1,63}$/u;

function fail(code: "invalid_input" | "unavailable" = "invalid_input"): never {
  throw new StoreDomainRepositoryError(code);
}

export function exact(value: unknown, keys: readonly string[], code: "invalid_input" | "unavailable" = "invalid_input"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail(code);
  const result = value as Record<string, unknown>;
  if (Object.keys(result).sort().join(",") !== [...keys].sort().join(",")) fail(code);
  return result;
}

export function uuid(value: unknown, code: "invalid_input" | "unavailable" = "invalid_input"): string {
  if (typeof value !== "string" || !UUID.test(value)) fail(code);
  return value;
}

export function hostname(value: unknown, code: "invalid_input" | "unavailable" = "invalid_input"): string {
  if (typeof value !== "string" || value.length < 3 || value.length > 253 || !HOSTNAME.test(value)) fail(code);
  return value;
}

export function date(value: unknown): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) fail();
  return new Date(value.getTime());
}

export function version(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) fail();
  return value as number;
}

export function fingerprint(value: unknown): string {
  if (typeof value !== "string" || !FINGERPRINT.test(value)) fail();
  return value;
}

export function safeId(value: unknown, code: "invalid_input" | "unavailable" = "invalid_input"): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) fail(code);
  return value;
}

export function safeError(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !ERROR_CODE.test(value)) fail();
  return value;
}

function timestamp(value: unknown): string {
  if (typeof value !== "string" || new Date(value).toISOString() !== value) fail("unavailable");
  return value;
}

function instruction(value: unknown): StoreDomainDnsInstruction {
  const parsed = exact(value, ["type", "name", "value"], "unavailable");
  if ((parsed.type !== "CNAME" && parsed.type !== "TXT") || typeof parsed.name !== "string" || typeof parsed.value !== "string") fail("unavailable");
  if (parsed.name.length < 1 || parsed.name.length > 253 || parsed.value.length < 1 || parsed.value.length > 1024) fail("unavailable");
  return Object.freeze({ type: parsed.type, name: parsed.name, value: parsed.value });
}

export function domainView(value: unknown): StoreDomainView {
  const parsed = exact(value, [
    "schemaVersion", "id", "hostname", "hostnameType", "status", "primary", "uiStatus",
    "dnsInstructions", "verifiedAt", "version", "createdAt", "updatedAt",
  ], "unavailable");
  if (
    parsed.schemaVersion !== 1
    || (parsed.hostnameType !== "platform_subdomain" && parsed.hostnameType !== "custom_domain")
    || (parsed.status !== "pending" && parsed.status !== "active" && parsed.status !== "disabled")
    || typeof parsed.primary !== "boolean"
    || !STORE_DOMAIN_UI_STATUSES.includes(parsed.uiStatus as never)
    || !Array.isArray(parsed.dnsInstructions)
    || parsed.dnsInstructions.length > 4
    || !Number.isSafeInteger(parsed.version)
    || (parsed.version as number) < 1
  ) fail("unavailable");
  const createdAt = timestamp(parsed.createdAt);
  const updatedAt = timestamp(parsed.updatedAt);
  const verifiedAt = parsed.verifiedAt === null ? null : timestamp(parsed.verifiedAt);
  if (
    updatedAt < createdAt
    || (parsed.status === "pending" && verifiedAt !== null)
    || (parsed.status === "active" && verifiedAt === null)
    || (parsed.primary && parsed.status !== "active")
  ) fail("unavailable");
  return Object.freeze({
    schemaVersion: 1,
    id: uuid(parsed.id, "unavailable"),
    hostname: hostname(parsed.hostname, "unavailable"),
    hostnameType: parsed.hostnameType,
    status: parsed.status,
    primary: parsed.primary,
    uiStatus: parsed.uiStatus as StoreDomainView["uiStatus"],
    dnsInstructions: Object.freeze(parsed.dnsInstructions.map(instruction)),
    verifiedAt,
    version: parsed.version as number,
    createdAt,
    updatedAt,
  });
}

export function adminDomainView(value: unknown): AdminDomainView {
  const parsed = exact(value, [
    "schemaVersion", "id", "hostname", "kind", "status", "primary", "fallback", "hostnameStatus",
    "sslStatus", "dnsStatus", "originStatus", "uiStatus", "dnsInstructions", "verifiedAt", "lastCheckedAt",
    "version", "createdAt", "updatedAt",
  ], "unavailable");
  if (parsed.schemaVersion !== 1 || !["platform_subdomain", "custom_alias"].includes(String(parsed.kind))
    || !["pending_verification", "active", "disabled"].includes(String(parsed.status))
    || typeof parsed.primary !== "boolean" || typeof parsed.fallback !== "boolean"
    || !["pending", "active", "failed", "deleted"].includes(String(parsed.hostnameStatus))
    || !["pending", "active", "failed", "deleted"].includes(String(parsed.sslStatus))
    || !["pending", "ready", "mismatch"].includes(String(parsed.dnsStatus))
    || !["pending", "ready", "failed"].includes(String(parsed.originStatus))
    || !STORE_DOMAIN_UI_STATUSES.includes(parsed.uiStatus as never) || !Array.isArray(parsed.dnsInstructions)
    || parsed.dnsInstructions.length > 4 || !Number.isSafeInteger(parsed.version) || (parsed.version as number) < 1) fail("unavailable");
  const createdAt = timestamp(parsed.createdAt), updatedAt = timestamp(parsed.updatedAt);
  const verifiedAt = parsed.verifiedAt === null ? null : timestamp(parsed.verifiedAt);
  const lastCheckedAt = parsed.lastCheckedAt === null ? null : timestamp(parsed.lastCheckedAt);
  if (updatedAt < createdAt || (parsed.status === "active" && verifiedAt === null) || (parsed.primary && parsed.status !== "active")
    || (parsed.fallback !== (parsed.kind === "platform_subdomain"))) fail("unavailable");
  return Object.freeze({
    schemaVersion: 1, id: uuid(parsed.id, "unavailable"), hostname: hostname(parsed.hostname, "unavailable"),
    kind: parsed.kind as AdminDomainView["kind"], status: parsed.status as AdminDomainView["status"],
    primary: parsed.primary, fallback: parsed.fallback,
    hostnameStatus: parsed.hostnameStatus as AdminDomainView["hostnameStatus"], sslStatus: parsed.sslStatus as AdminDomainView["sslStatus"],
    dnsStatus: parsed.dnsStatus as AdminDomainView["dnsStatus"], originStatus: parsed.originStatus as AdminDomainView["originStatus"],
    uiStatus: parsed.uiStatus as AdminDomainView["uiStatus"], dnsInstructions: Object.freeze(parsed.dnsInstructions.map(instruction)),
    verifiedAt, lastCheckedAt, version: parsed.version as number, createdAt, updatedAt,
  });
}

export function authorityValues(value: unknown): readonly [string, string, string, string, string, number] {
  if (!value || typeof value !== "object") fail();
  const tenant = value as TenantContext;
  if (tenant.schemaVersion !== 1 || tenant.store?.status !== "active" || tenant.membership?.status !== "active" || tenant.entitlements?.status !== "active") fail();
  if (typeof tenant.entitlements.planCode !== "string" || tenant.entitlements.planCode.length < 1 || tenant.entitlements.planCode.length > 80) fail();
  return Object.freeze([
    uuid(tenant.store.id),
    uuid(tenant.principal.id),
    uuid(tenant.membership.id),
    uuid(tenant.entitlements.planId),
    tenant.entitlements.planCode,
    version(tenant.entitlements.version),
  ]);
}

export function workflowClaim(value: unknown): StoreDomainWorkflowClaim {
  const parsed = exact(value, [
    "domainId", "storeId", "hostname", "providerHostnameId", "attemptCount", "leaseId", "leaseOwner",
    "leaseExpiresAt", "requestedRemoval",
  ], "unavailable");
  if (!Number.isSafeInteger(parsed.attemptCount) || (parsed.attemptCount as number) < 1 || typeof parsed.requestedRemoval !== "boolean") fail("unavailable");
  return Object.freeze({
    domainId: uuid(parsed.domainId, "unavailable"),
    storeId: uuid(parsed.storeId, "unavailable"),
    hostname: hostname(parsed.hostname, "unavailable"),
    providerHostnameId: safeId(parsed.providerHostnameId, "unavailable"),
    attemptCount: parsed.attemptCount as number,
    leaseId: uuid(parsed.leaseId, "unavailable"),
    leaseOwner: safeId(parsed.leaseOwner, "unavailable"),
    leaseExpiresAt: timestamp(parsed.leaseExpiresAt),
    requestedRemoval: parsed.requestedRemoval,
  });
}

export function originHealth(value: unknown): StoreDomainOriginHealth {
  const parsed = exact(value, ["schemaVersion", "status", "storeId", "hostname"], "unavailable");
  if (parsed.schemaVersion !== 1 || parsed.status !== "ok") fail("unavailable");
  return Object.freeze({
    schemaVersion: 1,
    status: "ok",
    storeId: uuid(parsed.storeId, "unavailable"),
    hostname: hostname(parsed.hostname, "unavailable"),
  });
}
