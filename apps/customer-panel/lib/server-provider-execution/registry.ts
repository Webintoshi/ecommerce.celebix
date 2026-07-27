import {
  MERCHANT_PROVIDER_CAPABILITIES,
  parseMerchantProviderDescriptor,
  type MerchantAdminJson,
  type MerchantProviderCapability,
} from "@celebix/saas-contracts";

export interface MerchantProviderRegistryEntry {
  readonly providerCode: string;
  readonly capability: MerchantProviderCapability;
  readonly label: string;
  readonly publicFields: readonly Readonly<{ key: string; label: string }>[];
  readonly credentialFields: readonly Readonly<{ key: string; label: string; secret: true }>[];
  parsePublicConfig(value: unknown): Readonly<Record<string, MerchantAdminJson>>;
  parseCredential(value: unknown): Uint8Array;
  maskAccountReference(value: Readonly<Record<string, MerchantAdminJson>>): string;
}

export interface MerchantProviderRegistry {
  readonly size: number;
  get(providerCode: string, capability: MerchantProviderCapability): MerchantProviderRegistryEntry | null;
}

const INSTANCES = new WeakSet<object>();
const ENTRY_KEYS = Object.freeze([
  "capability", "credentialFields", "label", "maskAccountReference", "parseCredential",
  "parsePublicConfig", "providerCode", "publicFields",
]);

function invalid(): never { throw new Error("customer_panel_provider_registry_invalid"); }

function dataObject(value: unknown, required: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== required.length || keys.some((key) => typeof key !== "string" || !required.includes(key)) || required.some((key) => !Object.hasOwn(descriptors, key))) invalid();
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== "string") invalid();
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    result[key] = descriptor.value;
  }
  return result;
}

function denseFrozenArray(value: unknown, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || !Object.isFrozen(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) invalid();
  const result: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    result.push(descriptor.value);
  }
  return result;
}

function denseInputArray(value: unknown, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) invalid();
  const result: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    result.push(descriptor.value);
  }
  return result;
}

function validateEntry(value: unknown, accessObjects: Set<object>): MerchantProviderRegistryEntry {
  if (!Object.isFrozen(value)) invalid();
  const parsed = dataObject(value, ENTRY_KEYS);
  if (typeof parsed.parsePublicConfig !== "function" || typeof parsed.parseCredential !== "function" || typeof parsed.maskAccountReference !== "function") invalid();
  const publicFields = denseFrozenArray(parsed.publicFields, 32);
  const credentialFields = denseFrozenArray(parsed.credentialFields, 32);
  for (const field of [...publicFields, ...credentialFields]) {
    if (typeof field !== "object" || field === null || !Object.isFrozen(field) || accessObjects.has(field)) invalid();
    accessObjects.add(field);
  }
  const descriptor = parseMerchantProviderDescriptor({
    providerCode: parsed.providerCode,
    capability: parsed.capability,
    label: parsed.label,
    publicFields,
    credentialFields,
  });
  if (!MERCHANT_PROVIDER_CAPABILITIES.includes(descriptor.capability)) invalid();
  return value as MerchantProviderRegistryEntry;
}

export function createCustomerPanelProviderRegistry(entries: readonly MerchantProviderRegistryEntry[]): MerchantProviderRegistry {
  try {
    const selected = denseInputArray(entries, 64);
    const accessObjects = new Set<object>();
    const byKey = new Map<string, MerchantProviderRegistryEntry>();
    for (const candidate of selected) {
      if (typeof candidate !== "object" || candidate === null || accessObjects.has(candidate)) invalid();
      accessObjects.add(candidate);
      const entry = validateEntry(candidate, accessObjects);
      const key = `${entry.providerCode}\u0000${entry.capability}`;
      if (byKey.has(key)) invalid();
      byKey.set(key, entry);
    }
    const registry = Object.freeze({
      size: byKey.size,
      get(providerCode: string, capability: MerchantProviderCapability) {
        if (typeof providerCode !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(providerCode) || !MERCHANT_PROVIDER_CAPABILITIES.includes(capability)) return null;
        return byKey.get(`${providerCode}\u0000${capability}`) ?? null;
      },
    });
    INSTANCES.add(registry);
    return registry;
  } catch {
    return invalid();
  }
}

export function isCustomerPanelProviderRegistry(value: unknown): value is MerchantProviderRegistry {
  return typeof value === "object" && value !== null && INSTANCES.has(value);
}
