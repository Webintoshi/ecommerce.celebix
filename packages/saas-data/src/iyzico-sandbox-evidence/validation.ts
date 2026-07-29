import { types as nodeTypes } from "node:util";

import type { TenantContext } from "@celebix/saas-contracts";

import { OrderRepositoryError } from "../orders/errors.ts";
import { merchantAuthority, type ValidatedOrderAuthority } from "../orders/validation.ts";
import {
  isTrustedIyzicoSandboxEvidenceError,
  trustedIyzicoSandboxEvidenceError,
  type IyzicoSandboxEvidenceErrorCode,
} from "./errors.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const PREFIXED_DIGEST = /^sha256:[a-f0-9]{64}$/;
const WORKER = /^[A-Za-z0-9._:-]{1,128}$/;

function fail(code: IyzicoSandboxEvidenceErrorCode = "invalid_input"): never {
  throw trustedIyzicoSandboxEvidenceError(code);
}

export function exactIyzicoSandboxEvidenceRecord(
  value: unknown,
  required: readonly string[],
  code: IyzicoSandboxEvidenceErrorCode = "invalid_input",
): Readonly<Record<string, unknown>> {
  try {
    if (
      typeof value !== "object"
      || value === null
      || Array.isArray(value)
      || nodeTypes.isProxy(value)
    ) fail(code);
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) fail(code);
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<PropertyKey, PropertyDescriptor>;
    const keys = Reflect.ownKeys(descriptors);
    if (
      keys.length !== required.length
      || keys.some((key) => typeof key !== "string" || !required.includes(key))
      || required.some((key) => !Object.hasOwn(descriptors, key))
    ) fail(code);
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of required) {
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) fail(code);
      result[key] = descriptor.value;
    }
    return Object.freeze(result);
  } catch (error) {
    if (isTrustedIyzicoSandboxEvidenceError(error)) throw error;
    return fail(code);
  }
}

export function evidenceUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) fail();
  return value;
}

export function evidenceDigest(value: unknown): string {
  if (typeof value !== "string" || !DIGEST.test(value)) fail();
  return value;
}

export function prefixedEvidenceDigest(value: unknown): string {
  if (typeof value !== "string" || !PREFIXED_DIGEST.test(value)) fail();
  return value;
}

export function evidenceInteger(value: unknown, minimum = 1, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    fail();
  }
  return value as number;
}

export function evidenceDate(value: unknown): Date {
  try {
    if (
      typeof value !== "object"
      || value === null
      || nodeTypes.isProxy(value)
      || Object.getPrototypeOf(value) !== Date.prototype
      || Reflect.ownKeys(value).length !== 0
    ) fail();
    const timestamp = Date.prototype.getTime.call(value);
    if (!Number.isFinite(timestamp)) fail();
    return Object.freeze(new Date(timestamp));
  } catch (error) {
    if (isTrustedIyzicoSandboxEvidenceError(error)) throw error;
    return fail();
  }
}

export function evidenceWorker(value: unknown): string {
  if (typeof value !== "string" || !WORKER.test(value)) fail();
  return value;
}

export function evidenceLeaseWindow(now: Date, expiresAt: Date): void {
  const start = Date.prototype.getTime.call(now);
  const end = Date.prototype.getTime.call(expiresAt);
  if (end <= start || end > start + 15 * 60_000) fail();
}

export function evidenceCase(
  caseKind: unknown,
  eventKind: unknown,
  outcomeCode: unknown,
): Readonly<{ caseKind: string; eventKind: string; outcomeCode: string }> {
  const allowed = new Set([
    "success\u0000success_captured\u0000captured",
    "decline\u0000declined\u0000declined",
    "controlled_timeout_recovery\u0000timeout_unknown\u0000unknown",
    "controlled_timeout_recovery\u0000timeout_recovered\u0000recovered",
    "callback_replay\u0000callback_original\u0000accepted",
    "callback_replay\u0000callback_replay\u0000replayed",
  ]);
  if (
    typeof caseKind !== "string"
    || typeof eventKind !== "string"
    || typeof outcomeCode !== "string"
  ) fail();
  const joined = `${caseKind as string}\u0000${eventKind as string}\u0000${outcomeCode as string}`;
  if (!allowed.has(joined)) fail();
  return Object.freeze({ caseKind, eventKind, outcomeCode });
}

export function evidenceAuthority(
  context: TenantContext,
  now: Date,
  requiredFeature: "integrations",
): ValidatedOrderAuthority {
  try {
    return merchantAuthority(context, now, requiredFeature);
  } catch (error) {
    if (error instanceof OrderRepositoryError) {
      const safe: readonly IyzicoSandboxEvidenceErrorCode[] = [
        "invalid_input",
        "unauthenticated",
        "membership_denied",
        "store_inactive",
        "feature_not_enabled",
        "durable_authority_invalid",
      ];
      if (safe.includes(error.code as IyzicoSandboxEvidenceErrorCode)) {
        return fail(error.code as IyzicoSandboxEvidenceErrorCode);
      }
    }
    return fail("durable_authority_invalid");
  }
}

export function evidenceTimestamp(value: unknown): string {
  if (typeof value !== "string") fail();
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) fail();
  return value;
}
