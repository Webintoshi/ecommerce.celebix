import { types as nodeTypes } from "node:util";

import {
  parseCheckoutDeliveryInput,
  parseCheckoutSubmitInput,
  type CheckoutDeliveryInput,
  type CheckoutSubmitInput,
} from "@celebix/saas-contracts";

import {
  isTrustedPublicCheckoutError,
  trustedPublicCheckoutError,
} from "./errors.ts";
import type {
  BeginHostedCheckoutInput,
  GetCheckoutPolicyInput,
  GetCheckoutStatusInput,
  IssueCheckoutNonceInput,
  RecoverCheckoutOperationInput,
  SubmitBuiltInCheckoutInput,
  UpdateCheckoutDeliveryInput,
} from "./types.ts";

type InputRecord = Readonly<Record<string, unknown>>;

const HOSTNAME =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const DIGEST = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DISCOUNT = /^[A-Z0-9][A-Z0-9_-]{0,63}$/;
const POLICY_TYPES = new Set([
  "distance_sales",
  "pre_information",
  "privacy",
  "returns",
  "shipping",
]);

function invalid(): never {
  throw trustedPublicCheckoutError("invalid_input");
}

function contain<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (isTrustedPublicCheckoutError(error)) throw error;
    return invalid();
  }
}

export function exactCheckoutInput(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): InputRecord {
  return contain(() => {
    if (
      typeof value !== "object" || value === null || Array.isArray(value) ||
      nodeTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
    ) invalid();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    const allowed = new Set([...required, ...optional]);
    if (
      keys.some((key) => typeof key !== "string" || !allowed.has(key)) ||
      required.some((key) => !Object.hasOwn(descriptors, key))
    ) invalid();
    const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      if (typeof key !== "string") invalid();
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
      copy[key] = descriptor.value;
    }
    return Object.freeze(copy);
  });
}

export function checkoutHostname(value: unknown): string {
  if (
    typeof value !== "string" || value.length < 3 || value.length > 253 ||
    value !== value.toLowerCase() || !HOSTNAME.test(value)
  ) invalid();
  return value;
}

export function checkoutDigest(value: unknown): string {
  if (typeof value !== "string" || !DIGEST.test(value)) invalid();
  return value;
}

export function checkoutUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) invalid();
  return value;
}

export function checkoutDate(value: unknown): Date {
  return contain(() => {
    if (
      !(value instanceof Date) || nodeTypes.isProxy(value) ||
      Object.getPrototypeOf(value) !== Date.prototype ||
      Reflect.ownKeys(Object.getOwnPropertyDescriptors(value)).length !== 0
    ) invalid();
    const milliseconds = Date.prototype.getTime.call(value);
    if (!Number.isFinite(milliseconds)) invalid();
    return Object.freeze(new Date(milliseconds)) as Date;
  });
}

export function issueCheckoutNonceInput(value: unknown): IssueCheckoutNonceInput {
  const parsed = exactCheckoutInput(value, ["hostname", "credentialDigest", "now"]);
  return Object.freeze({
    hostname: checkoutHostname(parsed.hostname),
    credentialDigest: checkoutDigest(parsed.credentialDigest),
    now: checkoutDate(parsed.now),
  });
}

function safeDelivery(value: unknown): CheckoutDeliveryInput {
  return contain(() => {
    const delivery = parseCheckoutDeliveryInput(value);
    if (
      delivery.email !== delivery.email.toLowerCase() ||
      delivery.shippingId !== "standard" ||
      (delivery.discountCode !== null && !DISCOUNT.test(delivery.discountCode))
    ) invalid();
    return delivery;
  });
}

function safeSubmission(value: unknown): CheckoutSubmitInput {
  return contain(() => parseCheckoutSubmitInput(value));
}

export function updateCheckoutDeliveryInput(value: unknown): UpdateCheckoutDeliveryInput {
  const parsed = exactCheckoutInput(value, ["hostname", "credentialDigest", "now", "delivery"]);
  return Object.freeze({
    hostname: checkoutHostname(parsed.hostname),
    credentialDigest: checkoutDigest(parsed.credentialDigest),
    now: checkoutDate(parsed.now),
    delivery: safeDelivery(parsed.delivery),
  });
}

function submitInput(
  value: unknown,
): SubmitBuiltInCheckoutInput {
  const parsed = exactCheckoutInput(value, ["hostname", "credentialDigest", "now", "submission"]);
  return Object.freeze({
    hostname: checkoutHostname(parsed.hostname),
    credentialDigest: checkoutDigest(parsed.credentialDigest),
    now: checkoutDate(parsed.now),
    submission: safeSubmission(parsed.submission),
  });
}

export function submitBuiltInCheckoutInput(value: unknown): SubmitBuiltInCheckoutInput {
  return submitInput(value);
}

export function beginHostedCheckoutInput(value: unknown): BeginHostedCheckoutInput {
  const parsed = exactCheckoutInput(value, [
    "hostname", "credentialDigest", "now", "submission", "attemptId",
    "callbackBindingDigest",
  ]);
  const base = submitInput(Object.freeze({
    hostname: parsed.hostname,
    credentialDigest: parsed.credentialDigest,
    now: parsed.now,
    submission: parsed.submission,
  }));
  return contain(() => {
    return Object.freeze({
      ...base,
      attemptId: checkoutUuid(parsed.attemptId),
      callbackBindingDigest: checkoutDigest(parsed.callbackBindingDigest),
    });
  });
}

export function getCheckoutStatusInput(value: unknown): GetCheckoutStatusInput {
  return issueCheckoutNonceInput(value);
}

export function getCheckoutPolicyInput(value: unknown): GetCheckoutPolicyInput {
  const parsed = exactCheckoutInput(value, ["hostname", "policyType", "now"]);
  if (typeof parsed.policyType !== "string" || !POLICY_TYPES.has(parsed.policyType)) invalid();
  return Object.freeze({
    hostname: checkoutHostname(parsed.hostname),
    policyType: parsed.policyType as GetCheckoutPolicyInput["policyType"],
    now: checkoutDate(parsed.now),
  });
}

export function recoverCheckoutOperationInput(
  value: unknown,
): RecoverCheckoutOperationInput {
  const parsed = exactCheckoutInput(value, [
    "hostname",
    "credentialDigest",
    "operationId",
    "fingerprint",
    "checkoutNonce",
    "now",
  ]);
  const submissionProbe = {
    cartVersion: 1,
    checkoutNonce: parsed.checkoutNonce,
    operationId: parsed.operationId,
    paymentMethodId: "00000000-0000-4000-8000-000000000000",
    identityNumber: null,
    consents: { distanceSales: true, preInformation: true },
  };
  safeSubmission(submissionProbe);
  return Object.freeze({
    hostname: checkoutHostname(parsed.hostname),
    credentialDigest: checkoutDigest(parsed.credentialDigest),
    operationId: checkoutUuid(parsed.operationId),
    fingerprint: checkoutDigest(parsed.fingerprint),
    checkoutNonce: parsed.checkoutNonce as string,
    now: checkoutDate(parsed.now),
  });
}
