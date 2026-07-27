import {
  MERCHANT_PROVIDER_CAPABILITIES,
  type MerchantProviderCapability,
} from "@celebix/saas-contracts";

import type {
  MerchantProviderAdapter,
  MerchantProviderAdapterRegistry,
} from "./types.ts";

const PROVIDER_CODE = /^[a-z][a-z0-9_]{0,63}$/;
const ADAPTER_KEYS = Object.freeze([
  "providerCode", "capability", "validateCredential", "execute", "reconcile",
]);

function invalid(): never {
  throw new TypeError("provider_adapter_registry_invalid");
}

function dense(value: unknown): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > 64) invalid();
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
    Object.getPrototypeOf(value) !== Object.prototype || !Object.isFrozen(value)
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
    typeof selected.validateCredential !== "function" || typeof selected.execute !== "function" ||
    typeof selected.reconcile !== "function"
  ) invalid();
  return value as MerchantProviderAdapter;
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
  });
}

export function createProductionMerchantProviderRegistry(): MerchantProviderAdapterRegistry {
  return createMerchantProviderAdapterRegistry(Object.freeze([]));
}
