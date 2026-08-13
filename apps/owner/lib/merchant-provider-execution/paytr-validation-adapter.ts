import { types as nodeTypes } from "node:util";

import {
  validatePaytrIframeCredentialWithTransport,
  type ProviderTransport,
} from "@celebix/payment-adapters";

import type {
  MerchantProviderAdapter,
  MerchantProviderVerificationAdapter,
} from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const EXECUTION_OPTION_KEYS = Object.freeze([
  "executionAuthority",
  "transport", "validationFailureUrl", "validationReference", "validationSuccessUrl",
  "validationTimeoutMs", "validationUserIp",
]);
const VERIFICATION_OPTION_KEYS = Object.freeze([
  "validationIdentity",
  "transport", "validationFailureUrl", "validationReference", "validationSuccessUrl",
  "validationTimeoutMs", "validationUserIp",
]);
const PUBLIC_KEYS = Object.freeze(["environment", "merchantId"]);
const CREDENTIAL_KEYS = Object.freeze(["merchantKey", "merchantSalt"]);

type PaytrValidationDependencies = Readonly<{
  transport: ProviderTransport;
  validationReference(): string;
  validationTimeoutMs: number;
  validationUserIp: string;
  validationSuccessUrl: string;
  validationFailureUrl: string;
}>;

export type PaytrExecutionValidationAdapterOptions = PaytrValidationDependencies & Readonly<{
  executionAuthority: Readonly<{
    environment: "test" | "live";
    adapterVersion: 1;
    evidenceDigest: string;
  }>;
}>;

export type PaytrValidationAdapterOptions = PaytrValidationDependencies & Readonly<{
  validationIdentity: Readonly<{
    environment: "test" | "live";
    adapterVersion: 1;
  }>;
}>;

function invalid(): never {
  throw new TypeError("paytr_validation_adapter_invalid");
}

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    typeof value !== "object" || value === null || Array.isArray(value) || nodeTypes.isProxy(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  ) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  const actual = Reflect.ownKeys(descriptors);
  if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key))) invalid();
  const selected: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    selected[key] = descriptor.value;
  }
  return selected;
}

function text(value: unknown, maximum: number): string {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || value !== value.trim() || /[\u0000-\u001f\u007f-\u009f]/.test(value)) invalid();
  return value;
}

function credentialBytes(value: unknown): { merchantKey: string; merchantSalt: string } {
  if (!nodeTypes.isUint8Array(value) || nodeTypes.isProxy(value) || Object.getPrototypeOf(value) !== Uint8Array.prototype || value.byteLength < 1 || value.byteLength > 16_384) invalid();
  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(value);
  const canonical = new TextEncoder().encode(decoded);
  try {
    if (canonical.byteLength !== value.byteLength || canonical.some((byte, index) => byte !== value[index])) invalid();
    const parsed = exact(JSON.parse(decoded) as unknown, CREDENTIAL_KEYS);
    return { merchantKey: text(parsed.merchantKey, 256), merchantSalt: text(parsed.merchantSalt, 256) };
  } finally {
    canonical.fill(0);
  }
}

function createCredentialValidator(
  parsed: Record<string, unknown>,
  environment: "test" | "live",
): MerchantProviderVerificationAdapter["validateCredential"] {
  const transport = parsed.transport as ProviderTransport;
  if (!transport || typeof transport !== "object" || typeof transport.request !== "function" || typeof parsed.validationReference !== "function" || !Number.isSafeInteger(parsed.validationTimeoutMs) || (parsed.validationTimeoutMs as number) < 100 || (parsed.validationTimeoutMs as number) > 5_000) invalid();
  const validationReference = parsed.validationReference as () => string;
  const validationTimeoutMs = parsed.validationTimeoutMs as number;
  const validationUserIp = text(parsed.validationUserIp, 39);
  const validationSuccessUrl = text(parsed.validationSuccessUrl, 400);
  const validationFailureUrl = text(parsed.validationFailureUrl, 400);
  return async (input) => {
    try {
      const selected = exact(input, ["credential", "publicConfig"]);
      const publicConfig = exact(selected.publicConfig, PUBLIC_KEYS);
      if (publicConfig.environment !== environment) invalid();
      const merchantId = text(publicConfig.merchantId, 128);
      const privateValues = credentialBytes(selected.credential);
      const reference = validationReference();
      if (!UUID.test(reference)) invalid();
      return await validatePaytrIframeCredentialWithTransport(transport, Object.freeze({
        environment,
        credential: { merchantId, ...privateValues },
        validationReference: reference,
        userIp: validationUserIp,
        successUrl: validationSuccessUrl,
        failureUrl: validationFailureUrl,
        signal: AbortSignal.timeout(validationTimeoutMs),
      }));
    } catch {
      return Object.freeze({ kind: "rejected" as const, outcomeCode: "invalid_validation_request" });
    }
  };
}

export function createPaytrExecutionValidationAdapter(
  options: PaytrExecutionValidationAdapterOptions,
): MerchantProviderAdapter {
  const parsed = exact(options, EXECUTION_OPTION_KEYS);
  const executionAuthority = exact(parsed.executionAuthority, ["environment", "adapterVersion", "evidenceDigest"]);
  if (
    (executionAuthority.environment !== "test" && executionAuthority.environment !== "live") ||
    executionAuthority.adapterVersion !== 1 ||
    typeof executionAuthority.evidenceDigest !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(executionAuthority.evidenceDigest)
  ) invalid();
  const environment = executionAuthority.environment;
  const validateCredential = createCredentialValidator(parsed, environment);
  const inert = Object.freeze(async () => Object.freeze({
    kind: "permanently_failed" as const,
    outcomeCode: "payment_capability_not_queued",
  }));
  return Object.freeze({
    providerCode: "paytr_iframe",
    capability: "payment_processing" as const,
    executionAuthority: Object.freeze({
      environment, adapterVersion: 1 as const,
      evidenceDigest: executionAuthority.evidenceDigest,
    }),
    validateCredential,
    execute: inert,
    reconcile: inert,
  });
}

export function createPaytrValidationAdapter(
  options: PaytrValidationAdapterOptions,
): MerchantProviderVerificationAdapter {
  const parsed = exact(options, VERIFICATION_OPTION_KEYS);
  const validationIdentity = exact(parsed.validationIdentity, ["environment", "adapterVersion"]);
  if (
    (validationIdentity.environment !== "test" && validationIdentity.environment !== "live") ||
    validationIdentity.adapterVersion !== 1
  ) invalid();
  const environment = validationIdentity.environment;
  return Object.freeze({
    providerCode: "paytr_iframe",
    capability: "payment_processing" as const,
    validationIdentity: Object.freeze({ environment, adapterVersion: 1 as const }),
    validateCredential: createCredentialValidator(parsed, environment),
  });
}
