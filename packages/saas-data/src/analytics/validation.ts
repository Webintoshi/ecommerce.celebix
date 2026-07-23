import { ANALYTICS_PERIODS, type AnalyticsPeriod, type TenantContext } from "@celebix/saas-contracts";
import { AnalyticsRepositoryError } from "./errors.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function fail(code: ConstructorParameters<typeof AnalyticsRepositoryError>[0] = "invalid_input"): never { throw new AnalyticsRepositoryError(code); }
function id(value: unknown): string { if (typeof value !== "string" || !UUID.test(value)) fail("durable_authority_invalid"); return value; }
function record(value: unknown): Record<string, unknown> { if (typeof value !== "object" || value === null || Array.isArray(value)) fail(); const prototype = Object.getPrototypeOf(value); if (prototype !== Object.prototype && prototype !== null) fail(); return value as Record<string, unknown>; }
export function exactAnalyticsInput(value: unknown): Readonly<Record<string, unknown>> { const parsed = record(value), keys = Object.keys(parsed); if (keys.length !== 3 || !keys.includes("tenantContext") || !keys.includes("now") || !keys.includes("period")) fail(); return parsed; }
export function analyticsPeriod(value: unknown): AnalyticsPeriod { if (typeof value !== "string" || !ANALYTICS_PERIODS.includes(value as AnalyticsPeriod)) fail(); return value as AnalyticsPeriod; }
export type AnalyticsAuthority = Readonly<{ storeId: string; principalId: string; membershipId: string; planId: string; planCode: string; planVersion: number; now: Date }>;
export function analyticsAuthority(context: TenantContext, currentTime: Date): AnalyticsAuthority {
  if (!(currentTime instanceof Date) || !Number.isFinite(currentTime.getTime())) fail();
  try {
    if (!context || context.schemaVersion !== 1 || !context.principal) fail("unauthenticated");
    if (!context.store || context.store.status !== "active") fail("store_inactive");
    if (!context.membership || context.membership.status !== "active") fail("membership_denied");
    const entitlements = context.entitlements;
    if (!entitlements || entitlements.schemaVersion !== 1 || entitlements.status !== "active" || !Array.isArray(entitlements.features) || !entitlements.features.includes("analytics")) fail("feature_not_enabled");
    if (!Number.isSafeInteger(entitlements.version) || entitlements.version < 1 || typeof entitlements.planCode !== "string" || entitlements.planCode.length < 1 || entitlements.planCode.length > 64 || entitlements.planCode !== entitlements.planCode.trim() || typeof entitlements.validFrom !== "string") fail("durable_authority_invalid");
    const validFrom = new Date(entitlements.validFrom), validUntil = entitlements.validUntil === undefined ? undefined : new Date(entitlements.validUntil);
    if (!Number.isFinite(validFrom.getTime()) || validFrom.toISOString() !== entitlements.validFrom || currentTime < validFrom || (validUntil !== undefined && (!Number.isFinite(validUntil.getTime()) || validUntil.toISOString() !== entitlements.validUntil || currentTime >= validUntil))) fail("durable_authority_invalid");
    return Object.freeze({ storeId: id(context.store.id), principalId: id(context.principal.id), membershipId: id(context.membership.id), planId: id(entitlements.planId), planCode: entitlements.planCode, planVersion: entitlements.version, now: new Date(currentTime.getTime()) });
  } catch (error) { if (error instanceof AnalyticsRepositoryError) throw error; fail("durable_authority_invalid"); }
}
export function analyticsAuthorityValues(authority: AnalyticsAuthority): unknown[] { return [authority.storeId, authority.principalId, authority.membershipId, authority.planId, authority.planCode, authority.planVersion, authority.now]; }
