import {
  MERCHANT_PROVIDER_CAPABILITIES,
  type MerchantProviderCapability,
} from "@celebix/saas-contracts";
import type { ProviderTransport } from "@celebix/payment-adapters";
import type { MerchantProviderValidationIdentity } from "@celebix/saas-data";
import { types as nodeTypes } from "node:util";

import type {
  MerchantProviderAdapter,
  MerchantProviderAdapterRegistry,
  MerchantProviderVerificationAdapter,
  MerchantProviderVerificationAdapterRegistry,
} from "./types.ts";
import type {
  MerchantProviderExecutionAuthorityMap,
  MerchantProviderVerificationIdentityMap,
} from "./production-config.ts";
import {
  createIyzicoExecutionValidationAdapter,
  createIyzicoValidationAdapter,
} from "./iyzico-validation-adapter.ts";
import {
  createPaytrExecutionValidationAdapter,
  createPaytrValidationAdapter,
  type PaytrExecutionValidationAdapterOptions,
} from "./paytr-validation-adapter.ts";

const PROVIDER_CODE = /^[a-z][a-z0-9_]{0,63}$/;
const ADAPTER_KEYS = Object.freeze([
  "providerCode", "capability", "executionAuthority", "validateCredential", "execute", "reconcile",
]);
const VERIFICATION_ADAPTER_KEYS = Object.freeze([
  "providerCode", "capability", "validationIdentity", "validateCredential",
]);
const PRODUCTION_OPTION_KEYS = Object.freeze([
  "executionAuthorities", "verificationIdentities", "transport", "paytrValidation",
  "validationReference", "validationRandomKey", "validationTimeoutMs",
]);
const DIGEST = /^sha256:[a-f0-9]{64}$/;

function invalid(): never {
  throw new TypeError("provider_adapter_registry_invalid");
}

function frozenRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    typeof value !== "object" || value === null || Array.isArray(value) || nodeTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype || !Object.isFrozen(value)
  ) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  const actual = Reflect.ownKeys(descriptors);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== "string" || !keys.includes(key))
  ) invalid();
  const selected: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    selected[key] = descriptor.value;
  }
  return selected;
}

function dense(value: unknown): readonly unknown[] {
  if (
    !Array.isArray(value) || nodeTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Array.prototype || value.length > 64
  ) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) invalid();
  const result: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    result.push(descriptor.value);
  }
  return result;
}

function adapter(value: unknown): MerchantProviderAdapter {
  if (
    typeof value !== "object" || value === null || Array.isArray(value) ||
    nodeTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype || !Object.isFrozen(value)
  ) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length !== ADAPTER_KEYS.length ||
    keys.some((key) => typeof key !== "string" || !ADAPTER_KEYS.includes(key))
  ) invalid();
  const selected: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of ADAPTER_KEYS) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    selected[key] = descriptor.value;
  }
  if (
    typeof selected.providerCode !== "string" || !PROVIDER_CODE.test(selected.providerCode) ||
    !MERCHANT_PROVIDER_CAPABILITIES.includes(selected.capability as never) ||
    typeof selected.executionAuthority !== "object" || selected.executionAuthority === null ||
    typeof selected.validateCredential !== "function" || typeof selected.execute !== "function" ||
    typeof selected.reconcile !== "function"
  ) invalid();
  const authority = selected.executionAuthority as Record<string, unknown>;
  if (
    Object.keys(authority).sort().join(",") !== "adapterVersion,environment,evidenceDigest" ||
    (authority.environment !== "test" && authority.environment !== "live") ||
    !Number.isSafeInteger(authority.adapterVersion) || (authority.adapterVersion as number) < 1 ||
    typeof authority.evidenceDigest !== "string" || !DIGEST.test(authority.evidenceDigest)
  ) invalid();
  return value as MerchantProviderAdapter;
}

function validationIdentityKey(value: unknown, frozen: boolean): string | null {
  if (
    typeof value !== "object" || value === null || Array.isArray(value) || nodeTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype || (frozen && !Object.isFrozen(value))
  ) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  if (
    Reflect.ownKeys(descriptors).length !== 2 ||
    !["environment", "adapterVersion"].every((key) => {
      const descriptor = descriptors[key];
      return descriptor?.enumerable === true && "value" in descriptor;
    })
  ) return null;
  const environment = descriptors.environment?.value;
  const version = descriptors.adapterVersion?.value;
  if (
    (environment !== "test" && environment !== "live") ||
    !Number.isSafeInteger(version) || (version as number) < 1
  ) return null;
  return `${environment}:${version}`;
}

function verificationAdapter(value: unknown): MerchantProviderVerificationAdapter {
  if (
    typeof value !== "object" || value === null || Array.isArray(value) || nodeTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype || !Object.isFrozen(value)
  ) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length !== VERIFICATION_ADAPTER_KEYS.length ||
    keys.some((key) => typeof key !== "string" || !VERIFICATION_ADAPTER_KEYS.includes(key))
  ) invalid();
  const selected: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of VERIFICATION_ADAPTER_KEYS) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    selected[key] = descriptor.value;
  }
  if (
    typeof selected.providerCode !== "string" || !PROVIDER_CODE.test(selected.providerCode) ||
    !MERCHANT_PROVIDER_CAPABILITIES.includes(selected.capability as never) ||
    validationIdentityKey(selected.validationIdentity, true) === null ||
    typeof selected.validateCredential !== "function"
  ) invalid();
  return value as MerchantProviderVerificationAdapter;
}

export function createMerchantProviderAdapterRegistry(
  adapters: readonly MerchantProviderAdapter[],
): MerchantProviderAdapterRegistry {
  const selected = dense(adapters).map(adapter);
  const entries = new Map<string, MerchantProviderAdapter>();
  for (const entry of selected) {
    const key = `${entry.providerCode}:${entry.capability}`;
    if (entries.has(key)) invalid();
    entries.set(key, entry);
  }
  return Object.freeze({
    size: entries.size,
    get(providerCode: string, capability: MerchantProviderCapability): MerchantProviderAdapter | null {
      if (!PROVIDER_CODE.test(providerCode) || !MERCHANT_PROVIDER_CAPABILITIES.includes(capability as never)) return null;
      return entries.get(`${providerCode}:${capability}`) ?? null;
    },
    list(): readonly MerchantProviderAdapter[] { return Object.freeze([...selected]); },
  });
}

export function createMerchantProviderVerificationAdapterRegistry(
  adapters: readonly MerchantProviderVerificationAdapter[],
): MerchantProviderVerificationAdapterRegistry {
  const selected = dense(adapters).map(verificationAdapter);
  const entries = new Map<string, MerchantProviderVerificationAdapter>();
  for (const entry of selected) {
    const identity = validationIdentityKey(entry.validationIdentity, true);
    if (identity === null) invalid();
    const key = `${entry.providerCode}:${entry.capability}:${identity}`;
    if (entries.has(key)) invalid();
    entries.set(key, entry);
  }
  return Object.freeze({
    size: entries.size,
    get(
      providerCode: string,
      capability: MerchantProviderCapability,
      validationIdentity: Readonly<MerchantProviderValidationIdentity>,
    ): MerchantProviderVerificationAdapter | null {
      const identity = validationIdentityKey(validationIdentity, false);
      if (
        !PROVIDER_CODE.test(providerCode) ||
        !MERCHANT_PROVIDER_CAPABILITIES.includes(capability as never) || identity === null
      ) return null;
      return entries.get(`${providerCode}:${capability}:${identity}`) ?? null;
    },
    list(): readonly MerchantProviderVerificationAdapter[] { return Object.freeze([...selected]); },
  });
}

export function createProductionMerchantProviderRegistry(
  options: PaytrExecutionValidationAdapterOptions,
): MerchantProviderAdapterRegistry {
  return createMerchantProviderAdapterRegistry(Object.freeze([
    createPaytrExecutionValidationAdapter(options),
  ]));
}

export type ProductionMerchantProviderRegistriesOptions = Readonly<{
  executionAuthorities: MerchantProviderExecutionAuthorityMap;
  verificationIdentities: MerchantProviderVerificationIdentityMap;
  transport: ProviderTransport;
  paytrValidation: Readonly<{
    userIp: string;
    successUrl: string;
    failureUrl: string;
  }> | null;
  validationReference(): string;
  validationRandomKey(): string;
  validationTimeoutMs: number;
}>;

export function createProductionMerchantProviderRegistries(
  options: ProductionMerchantProviderRegistriesOptions,
): Readonly<{
  execution: MerchantProviderAdapterRegistry;
  verification: MerchantProviderVerificationAdapterRegistry;
}> {
  const selected = frozenRecord(options, PRODUCTION_OPTION_KEYS);
  const authorities = frozenRecord(selected.executionAuthorities, ["iyzico_iframe", "paytr_iframe"]);
  const identities = frozenRecord(selected.verificationIdentities, ["iyzico_iframe", "paytr_iframe"]);
  if (!Object.isFrozen(identities.iyzico_iframe) || !Object.isFrozen(identities.paytr_iframe)) invalid();
  const iyzicoIdentities = dense(identities.iyzico_iframe);
  const paytrIdentities = dense(identities.paytr_iframe);
  const execution: MerchantProviderAdapter[] = [];
  const verification: MerchantProviderVerificationAdapter[] = [];
  const iyzicoAuthority = authorities.iyzico_iframe as MerchantProviderExecutionAuthorityMap["iyzico_iframe"];
  if (iyzicoAuthority !== null) {
    if (iyzicoAuthority.environment !== "test" || iyzicoAuthority.adapterVersion !== 1) invalid();
    execution.push(createIyzicoExecutionValidationAdapter(Object.freeze({
      executionAuthority: Object.freeze({
        environment: "test" as const,
        adapterVersion: 1 as const,
        evidenceDigest: iyzicoAuthority.evidenceDigest,
      }),
      transport: selected.transport as ProviderTransport,
      validationReference: selected.validationReference as () => string,
      validationRandomKey: selected.validationRandomKey as () => string,
      validationTimeoutMs: selected.validationTimeoutMs as number,
    })));
  }
  const paytrAuthority = authorities.paytr_iframe as MerchantProviderExecutionAuthorityMap["paytr_iframe"];
  const paytrRequired = paytrAuthority !== null || paytrIdentities.length > 0;
  if (paytrRequired !== (selected.paytrValidation !== null)) invalid();
  const paytrValidation = paytrRequired
    ? frozenRecord(selected.paytrValidation, ["userIp", "successUrl", "failureUrl"])
    : null;
  if (paytrAuthority !== null && paytrValidation !== null) {
    if (paytrAuthority.adapterVersion !== 1) invalid();
    execution.push(createPaytrExecutionValidationAdapter(Object.freeze({
      executionAuthority: Object.freeze({
        environment: paytrAuthority.environment,
        adapterVersion: 1 as const,
        evidenceDigest: paytrAuthority.evidenceDigest,
      }),
      transport: selected.transport as ProviderTransport,
      validationReference: selected.validationReference as () => string,
      validationTimeoutMs: selected.validationTimeoutMs as number,
      validationUserIp: paytrValidation.userIp as string,
      validationSuccessUrl: paytrValidation.successUrl as string,
      validationFailureUrl: paytrValidation.failureUrl as string,
    })));
  }
  for (const validationIdentity of iyzicoIdentities) {
    if (!Object.isFrozen(validationIdentity)) invalid();
    const parsedIdentity = validationIdentity as Readonly<MerchantProviderValidationIdentity>;
    if (parsedIdentity.adapterVersion !== 1) invalid();
    verification.push(createIyzicoValidationAdapter(Object.freeze({
      validationIdentity: parsedIdentity as Readonly<{
        environment: "test" | "live";
        adapterVersion: 1;
      }>,
      transport: selected.transport as ProviderTransport,
      validationReference: selected.validationReference as () => string,
      validationRandomKey: selected.validationRandomKey as () => string,
      validationTimeoutMs: selected.validationTimeoutMs as number,
    })));
  }
  for (const validationIdentity of paytrIdentities) {
    if (!Object.isFrozen(validationIdentity) || paytrValidation === null) invalid();
    const parsedIdentity = validationIdentity as Readonly<MerchantProviderValidationIdentity>;
    if (parsedIdentity.adapterVersion !== 1) invalid();
    verification.push(createPaytrValidationAdapter(Object.freeze({
      validationIdentity: parsedIdentity as Readonly<{
        environment: "test" | "live";
        adapterVersion: 1;
      }>,
      transport: selected.transport as ProviderTransport,
      validationReference: selected.validationReference as () => string,
      validationTimeoutMs: selected.validationTimeoutMs as number,
      validationUserIp: paytrValidation.userIp as string,
      validationSuccessUrl: paytrValidation.successUrl as string,
      validationFailureUrl: paytrValidation.failureUrl as string,
    })));
  }
  return Object.freeze({
    execution: createMerchantProviderAdapterRegistry(Object.freeze(execution)),
    verification: createMerchantProviderVerificationAdapterRegistry(Object.freeze(verification)),
  });
}
