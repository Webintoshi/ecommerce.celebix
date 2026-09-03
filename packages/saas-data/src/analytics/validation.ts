import {
  parseAnalyticsConnectionMutationResult,
  parseAnalyticsConnectionView,
  type AnalyticsConnectionMutationResult,
  type AnalyticsConnectionStatus,
  type AnalyticsConnectionView,
  type TenantContext,
} from "@celebix/saas-contracts";
import { AnalyticsRepositoryError } from "./errors.ts";
import type {
  AnalyticsConnectionAuthority,
  AnalyticsOutboxClaim,
  AnalyticsPendingAuthority,
  PublicAnalyticsTrackerConfig,
} from "./types.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HOST =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const HEX64 = /^[a-f0-9]{64}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
function fail(
  code: ConstructorParameters<
    typeof AnalyticsRepositoryError
  >[0] = "invalid_input",
): never {
  throw new AnalyticsRepositoryError(code);
}
export function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    fail("unavailable");
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) fail("unavailable");
  return value as Record<string, unknown>;
}
export function exact(
  value: unknown,
  keys: readonly string[],
  code: "invalid_input" | "unavailable" = "invalid_input",
) {
  let parsed: Record<string, unknown>;
  try {
    parsed = object(value);
  } catch {
    fail(code);
  }
  if (Object.keys(parsed).sort().join(",") !== [...keys].sort().join(","))
    fail(code);
  return parsed;
}
export function uuid(
  value: unknown,
  code: "invalid_input" | "unavailable" = "invalid_input",
) {
  if (typeof value !== "string" || !UUID.test(value)) fail(code);
  return value;
}
export function hostname(
  value: unknown,
  code: "invalid_input" | "unavailable" = "invalid_input",
) {
  if (
    typeof value !== "string" ||
    value.length < 3 ||
    value.length > 253 ||
    value !== value.trim() ||
    !HOST.test(value)
  )
    fail(code);
  return value;
}
export function date(value: unknown) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) fail();
  return new Date(value.getTime());
}
export function positive(
  value: unknown,
  maximum = Number.MAX_SAFE_INTEGER,
  code: "invalid_input" | "unavailable" = "invalid_input",
) {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 1 ||
    (value as number) > maximum
  )
    fail(code);
  return value as number;
}
function timestamp(value: unknown, nullable = false) {
  if (nullable && value === null) return null;
  if (
    typeof value !== "string" ||
    !ISO.test(value) ||
    new Date(value).toISOString() !== value
  )
    fail("unavailable");
  return value;
}
function status(value: unknown): AnalyticsConnectionStatus {
  if (!["pending", "active", "disabled", "failed"].includes(String(value)))
    fail("unavailable");
  return value as AnalyticsConnectionStatus;
}
export type AnalyticsAuthority = Readonly<{
  storeId: string;
  principalId: string;
  membershipId: string;
  planId: string;
  planCode: string;
  planVersion: number;
  now: Date;
}>;
export function authority(
  context: TenantContext,
  current: Date,
): AnalyticsAuthority {
  const now = date(current);
  if (!context || typeof context !== "object" || !context.principal)
    fail("unauthenticated");
  if (!context.store || context.store.status !== "active")
    fail("store_inactive");
  if (!context.membership || context.membership.status !== "active")
    fail("membership_denied");
  if (!context.entitlements || context.entitlements.status !== "active")
    fail("durable_authority_invalid");
  if (
    !Array.isArray(context.entitlements.features) ||
    !context.entitlements.features.includes("analytics")
  )
    fail("feature_not_enabled");
  try {
    const planCode = context.entitlements.planCode,
      planVersion = context.entitlements.version;
    if (
      context.schemaVersion !== 1 ||
      context.entitlements.schemaVersion !== 1 ||
      typeof planCode !== "string" ||
      planCode !== planCode.trim() ||
      !/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(planCode) ||
      !Number.isSafeInteger(planVersion) ||
      planVersion < 1
    )
      fail("durable_authority_invalid");
    const from = new Date(context.entitlements.validFrom);
    const until =
      context.entitlements.validUntil === undefined
        ? undefined
        : new Date(context.entitlements.validUntil);
    if (
      !Number.isFinite(from.getTime()) ||
      from.toISOString() !== context.entitlements.validFrom ||
      now < from ||
      (until &&
        (!Number.isFinite(until.getTime()) ||
          until.toISOString() !== context.entitlements.validUntil ||
          now >= until))
    )
      fail("durable_authority_invalid");
    return Object.freeze({
      storeId: uuid(context.store.id),
      principalId: uuid(context.principal.id),
      membershipId: uuid(context.membership.id),
      planId: uuid(context.entitlements.planId),
      planCode,
      planVersion,
      now,
    });
  } catch (error) {
    if (
      error instanceof AnalyticsRepositoryError &&
      error.code !== "invalid_input"
    )
      throw error;
    fail("durable_authority_invalid");
  }
}
export function authorityValues(value: AnalyticsAuthority) {
  return [
    value.storeId,
    value.principalId,
    value.membershipId,
    value.planId,
    value.planCode,
    value.planVersion,
    value.now,
  ];
}
export function connectionAuthority(
  value: unknown,
): AnalyticsConnectionAuthority {
  const p = exact(
    value,
    [
      "connectionId",
      "websiteId",
      "hostname",
      "status",
      "version",
      "lastVerifiedAt",
      "updatedAt",
      "replayed",
    ],
    "unavailable",
  );
  return Object.freeze({
    connectionId: uuid(p.connectionId, "unavailable"),
    websiteId: uuid(p.websiteId, "unavailable"),
    hostname: hostname(p.hostname, "unavailable"),
    status: status(p.status),
    version: positive(p.version, Number.MAX_SAFE_INTEGER, "unavailable"),
    lastVerifiedAt: timestamp(p.lastVerifiedAt, true),
  });
}
export function connectionView(value: unknown): AnalyticsConnectionView {
  try {
    return parseAnalyticsConnectionView(value);
  } catch {
    fail("unavailable");
  }
}
export function projectConnection(value: unknown): AnalyticsConnectionView {
  const parsed = connectionAuthority(value);
  try {
    return parseAnalyticsConnectionView({
      schemaVersion: 1,
      provider: "umami",
      status: parsed.status,
      configured: true,
      hostname: parsed.hostname,
      version: parsed.version,
      lastVerifiedAt: parsed.lastVerifiedAt,
    });
  } catch {
    fail("unavailable");
  }
}
export function pending(
  value: unknown,
  outcome: "pending" | "active",
  replayed: boolean,
): AnalyticsPendingAuthority {
  const parsed = connectionAuthority(value);
  return Object.freeze({ ...parsed, outcome, replayed });
}
export function mutation(
  value: unknown,
  replayed: boolean,
): AnalyticsConnectionMutationResult {
  const p = exact(
    value,
    [
      "connectionId",
      "websiteId",
      "hostname",
      "status",
      "version",
      "lastVerifiedAt",
      "updatedAt",
      "replayed",
    ],
    "unavailable",
  );
  try {
    return parseAnalyticsConnectionMutationResult({
      status: p.status,
      version: p.version,
      updatedAt: p.updatedAt,
      replayed,
    });
  } catch {
    fail("unavailable");
  }
}
export function tracker(value: unknown): PublicAnalyticsTrackerConfig {
  const p = exact(value, ["websiteId", "hostname"], "unavailable");
  return Object.freeze({
    websiteId: uuid(p.websiteId, "unavailable"),
    hostname: hostname(p.hostname, "unavailable"),
  });
}
export function claim(value: unknown): AnalyticsOutboxClaim {
  const p = exact(
    value,
    [
      "eventId",
      "leaseToken",
      "websiteId",
      "hostname",
      "attemptCount",
      "payload",
    ],
    "unavailable",
  );
  if (typeof p.leaseToken !== "string" || !HEX64.test(p.leaseToken))
    fail("unavailable");
  const raw = object(p.payload);
  let payload: AnalyticsOutboxClaim["payload"];
  if (raw.name === "purchase") {
    const keys = Object.keys(raw), selected = raw;
    if (
      !["name", "valueCents", "currency", "source"].every((key) => keys.includes(key)) ||
      keys.some((key) => !["name", "valueCents", "currency", "source", "anonymousSessionRef"].includes(key)) ||
      !Number.isSafeInteger(selected.valueCents) ||
      (selected.valueCents as number) < 0 ||
      typeof selected.currency !== "string" ||
      !/^[A-Z]{3}$/.test(selected.currency) ||
      ![
        "storefront",
        "quick_link",
        "marketplace",
        "manual_import",
        "manual",
      ].includes(String(selected.source)) ||
      (selected.anonymousSessionRef !== undefined &&
        (typeof selected.anonymousSessionRef !== "string" ||
          !/^h1_[a-f0-9]{64}$/.test(selected.anonymousSessionRef)))
    )
      fail("unavailable");
    payload = Object.freeze({
      name: "purchase",
      valueCents: selected.valueCents as number,
      currency: selected.currency,
      source: selected.source as
        | "storefront"
        | "quick_link"
        | "marketplace"
        | "manual_import"
        | "manual",
      ...(typeof selected.anonymousSessionRef === "string"
        ? { anonymousSessionRef: selected.anonymousSessionRef }
        : {}),
    });
  } else {
    const selected = exact(
        raw,
        ["name", "schemaVersion", "currency", "valueMinor"],
        "unavailable",
      ),
      names = [
        "payment_failed",
        "refund",
        "order_cancelled",
        "cart_abandoned",
        "cart_resumed",
        "cart_recovered",
        "recovery_message_queued",
        "recovery_message_sent",
        "recovery_message_failed",
      ] as const;
    if (
      !names.includes(selected.name as (typeof names)[number]) ||
      selected.schemaVersion !== 1 ||
      !Number.isSafeInteger(selected.valueMinor) ||
      (selected.valueMinor as number) < 0 ||
      typeof selected.currency !== "string" ||
      !/^[A-Z]{3}$/.test(selected.currency)
    )
      fail("unavailable");
    payload = Object.freeze({
      name: selected.name as (typeof names)[number],
      schemaVersion: 1,
      currency: selected.currency,
      valueMinor: selected.valueMinor as number,
    });
  }
  return Object.freeze({
    eventId: uuid(p.eventId, "unavailable"),
    leaseToken: p.leaseToken,
    websiteId: uuid(p.websiteId, "unavailable"),
    hostname: hostname(p.hostname, "unavailable"),
    attemptCount: positive(p.attemptCount, 10, "unavailable"),
    payload,
  });
}
export function lease(value: unknown) {
  if (typeof value !== "string" || !HEX64.test(value)) fail();
  return value;
}
