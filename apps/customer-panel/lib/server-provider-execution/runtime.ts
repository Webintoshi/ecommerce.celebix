import type {
  MerchantProviderCredentialKeyring,
  MerchantProviderProfileRepository,
} from "@celebix/saas-data";
import type { PaymentAdapterRegistry } from "@celebix/payment-adapters";

import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";
import {
  isCustomerPanelProviderRegistry,
  type MerchantProviderRegistry,
} from "./registry.ts";

type ApprovedAccess = ServerPanelAccessRuntime & Readonly<{
  readiness: Readonly<{ mode: "approved_staging" }>;
  panelOrigin: string;
}>;

export type ServerProviderExecutionRuntime = Readonly<{
  access: ApprovedAccess;
  profiles: MerchantProviderProfileRepository;
  keyring: MerchantProviderCredentialKeyring;
  registry: MerchantProviderRegistry;
  adapters: PaymentAdapterRegistry;
}>;

type StoredKeyring = Readonly<{
  activeKeyId: string;
  keys: readonly Readonly<{ keyId: string; key: Uint8Array }>[];
}>;

const RUNTIMES = new WeakMap<ServerPanelAccessRuntime, ServerProviderExecutionRuntime>();
const METHODS = Object.freeze(["list", "save", "disable", "revoke"] as const);
const KEY_ID = /^[A-Za-z0-9._-]{1,128}$/;
const ARRAY_TAG_GETTER = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), Symbol.toStringTag)!.get as (this: ArrayBufferView) => string | undefined;

function invalid(): never { throw new Error("server_provider_execution_runtime_invalid"); }

function profileFacade(repository: MerchantProviderProfileRepository): MerchantProviderProfileRepository {
  if (!repository || typeof repository !== "object" || METHODS.some((method) => typeof repository[method] !== "function")) invalid();
  return Object.freeze(Object.fromEntries(METHODS.map((method) => [method, repository[method].bind(repository)])) as unknown as MerchantProviderProfileRepository);
}

function copyKey(value: unknown): Uint8Array {
  if (typeof value !== "object" || value === null || Reflect.apply(ARRAY_TAG_GETTER, value, []) !== "Uint8Array") invalid();
  const copy = Reflect.apply(Uint8Array.prototype.slice, value, []) as Uint8Array;
  if (copy.byteLength !== 32) { copy.fill(0); invalid(); }
  return copy;
}


function exactDataObject(value: unknown, required: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
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

function denseFrozenKeys(value: unknown): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || !Object.isFrozen(value) || value.length < 1 || value.length > 16) invalid();
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

function storeKeyring(value: MerchantProviderCredentialKeyring): StoredKeyring {
  if (!value || typeof value !== "object" || !Object.isFrozen(value)) invalid();
  const parsed = exactDataObject(value, ["activeKeyId", "keys"]);
  if (typeof parsed.activeKeyId !== "string" || !KEY_ID.test(parsed.activeKeyId)) invalid();
  const candidates = denseFrozenKeys(parsed.keys);
  const keys: Array<Readonly<{ keyId: string; key: Uint8Array }>> = [];
  try {
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== "object" || !Object.isFrozen(candidate)) invalid();
      const parsedCandidate = exactDataObject(candidate, ["keyId", "key"]);
      if (typeof parsedCandidate.keyId !== "string" || !KEY_ID.test(parsedCandidate.keyId)) invalid();
      const key = copyKey(parsedCandidate.key);
      if (keys.some((entry) => entry.keyId === parsedCandidate.keyId || entry.key.every((byte, index) => byte === key[index]))) {
        key.fill(0);
        invalid();
      }
      keys.push(Object.freeze({ keyId: parsedCandidate.keyId, key }));
    }
    if (!keys.some((entry) => entry.keyId === parsed.activeKeyId)) invalid();
    return Object.freeze({ activeKeyId: parsed.activeKeyId, keys: Object.freeze(keys) });
  } catch (error) {
    for (const entry of keys) entry.key.fill(0);
    throw error;
  }
}

function snapshotKeyring(value: StoredKeyring): MerchantProviderCredentialKeyring {
  return Object.freeze({
    activeKeyId: value.activeKeyId,
    keys: Object.freeze(value.keys.map((entry) => Object.freeze({ keyId: entry.keyId, key: entry.key.slice() }))),
  });
}

function adapterRegistry(
  value: PaymentAdapterRegistry,
  registry: MerchantProviderRegistry,
): PaymentAdapterRegistry {
  if (
    !value || typeof value !== "object" || !Object.isFrozen(value) ||
    !Number.isSafeInteger(value.size) || value.size < 0 ||
    typeof value.packet !== "function" || typeof value.adapter !== "function"
  ) invalid();
  const paymentCodes = registry.codes("payment_processing");
  if (value.size !== paymentCodes.length) invalid();
  for (const providerCode of paymentCodes) {
    const adapter = value.adapter(providerCode);
    const packet = value.packet(providerCode);
    if (
      adapter === null || packet === null || adapter.packet !== packet ||
      packet.providerCode !== providerCode ||
      registry.get(providerCode, "payment_processing") === null
    ) invalid();
  }
  return value;
}

export function registerServerProviderExecutionRuntime(
  access: ServerPanelAccessRuntime,
  profiles: MerchantProviderProfileRepository,
  keyring: MerchantProviderCredentialKeyring,
  registry: MerchantProviderRegistry,
  adapters: PaymentAdapterRegistry,
): void {
  try {
    if (!access || access.readiness.mode !== "approved_staging" || access.panelOrigin === null || RUNTIMES.has(access) || !isCustomerPanelProviderRegistry(registry)) invalid();
    const selectedProfiles = profileFacade(profiles);
    const selectedKeyring = storeKeyring(keyring);
    const selectedAdapters = adapterRegistry(adapters, registry);
    const runtime = Object.freeze({
      access: access as ApprovedAccess,
      profiles: selectedProfiles,
      get keyring() { return snapshotKeyring(selectedKeyring); },
      registry,
      adapters: selectedAdapters,
    });
    RUNTIMES.set(access, runtime);
  } catch { invalid(); }
}

export function resolveServerProviderExecutionRuntime(access: ServerPanelAccessRuntime): ServerProviderExecutionRuntime | null {
  try {
    if (!access || access.readiness.mode !== "approved_staging" || access.panelOrigin === null) return null;
    return RUNTIMES.get(access) ?? null;
  } catch { return null; }
}
