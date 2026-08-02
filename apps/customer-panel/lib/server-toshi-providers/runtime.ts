import type {
  MerchantProviderCredentialKeyring,
  ToshiProviderRepository,
} from "@celebix/saas-data";
import { TOSHI_PROVIDERS, type ToshiProvider } from "@celebix/saas-contracts";

import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";
import type {
  ToshiProviderAdapterRegistry,
  ToshiProviderVerificationAdapter,
} from "../toshi-provider-adapters/types.ts";

type ApprovedAccess = ServerPanelAccessRuntime & Readonly<{
  readiness: Readonly<{ mode: "approved_staging" }>;
  panelOrigin: string;
}>;

export type ServerToshiProviderRuntime = Readonly<{
  readiness: Readonly<{ mode: "approved_staging" }>;
  access: ApprovedAccess;
  repository: ToshiProviderRepository;
  keyring: MerchantProviderCredentialKeyring;
  adapters: ToshiProviderAdapterRegistry;
}>;

type StoredKeyring = Readonly<{
  activeKeyId: string;
  keys: readonly Readonly<{ keyId: string; key: Uint8Array }>[];
}>;

const RUNTIMES = new WeakMap<ServerPanelAccessRuntime, ServerToshiProviderRuntime>();
const METHODS = Object.freeze(["list", "getConnectionIdentity", "connect", "selectModel", "setDefault", "revoke", "getAuthority"] as const);
const KEY_ID = /^[A-Za-z0-9._-]{1,128}$/;
const ARRAY_TAG_GETTER = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype),
  Symbol.toStringTag,
)!.get as (this: ArrayBufferView) => string | undefined;

function invalid(): never { throw new Error("server_toshi_provider_runtime_invalid"); }

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<PropertyKey, PropertyDescriptor>;
  const actual = Reflect.ownKeys(descriptors);
  if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key)) || keys.some((key) => !Object.hasOwn(descriptors, key))) invalid();
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of actual) {
    if (typeof key !== "string") invalid();
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    result[key] = descriptor.value;
  }
  return result;
}

function repositoryFacade(repository: ToshiProviderRepository): ToshiProviderRepository {
  if (!repository || typeof repository !== "object" || METHODS.some((method) => typeof repository[method] !== "function")) invalid();
  return Object.freeze(Object.fromEntries(METHODS.map((method) => [method, repository[method].bind(repository)])) as unknown as ToshiProviderRepository);
}

function keyringStore(value: MerchantProviderCredentialKeyring): StoredKeyring {
  if (!value || !Object.isFrozen(value)) invalid();
  const parsed = exact(value, ["activeKeyId", "keys"]);
  if (typeof parsed.activeKeyId !== "string" || !KEY_ID.test(parsed.activeKeyId)) invalid();
  if (!Array.isArray(parsed.keys) || !Object.isFrozen(parsed.keys) || parsed.keys.length < 1 || parsed.keys.length > 16) invalid();
  const keys: Array<Readonly<{ keyId: string; key: Uint8Array }>> = [];
  try {
    for (const raw of parsed.keys) {
      if (!raw || !Object.isFrozen(raw)) invalid();
      const entry = exact(raw, ["keyId", "key"]);
      if (typeof entry.keyId !== "string" || !KEY_ID.test(entry.keyId) || keys.some(({ keyId }) => keyId === entry.keyId)) invalid();
      if (typeof entry.key !== "object" || entry.key === null || Reflect.apply(ARRAY_TAG_GETTER, entry.key, []) !== "Uint8Array") invalid();
      const key = Reflect.apply(Uint8Array.prototype.slice, entry.key, []) as Uint8Array;
      if (key.byteLength !== 32 || keys.some((selected) => selected.key.every((byte, index) => byte === key[index]))) { key.fill(0); invalid(); }
      keys.push(Object.freeze({ keyId: entry.keyId, key }));
    }
    if (!keys.some(({ keyId }) => keyId === parsed.activeKeyId)) invalid();
    return Object.freeze({ activeKeyId: parsed.activeKeyId, keys: Object.freeze(keys) });
  } catch (error) {
    for (const entry of keys) entry.key.fill(0);
    throw error;
  }
}

function keyringSnapshot(value: StoredKeyring): MerchantProviderCredentialKeyring {
  return Object.freeze({
    activeKeyId: value.activeKeyId,
    keys: Object.freeze(value.keys.map((entry) => Object.freeze({ keyId: entry.keyId, key: entry.key.slice() }))),
  });
}

function adapterFacade(value: ToshiProviderAdapterRegistry): ToshiProviderAdapterRegistry {
  if (!value || typeof value !== "object" || !Object.isFrozen(value) || typeof value.get !== "function") invalid();
  const adapters = new Map<string, ToshiProviderVerificationAdapter>();
  for (const provider of TOSHI_PROVIDERS) {
    const selected = value.get(provider);
    if (!selected || typeof selected !== "object" || !Object.isFrozen(selected) || selected.provider !== provider || typeof selected.verify !== "function") invalid();
    adapters.set(provider, Object.freeze({ provider, verify: selected.verify.bind(selected) }));
  }
  return Object.freeze({
    get(provider: ToshiProvider) {
      const selected = adapters.get(provider);
      if (!selected) invalid();
      return selected;
    },
  });
}

export function registerServerToshiProviderRuntime(
  access: ServerPanelAccessRuntime,
  repository: ToshiProviderRepository,
  keyring: MerchantProviderCredentialKeyring,
  adapters: ToshiProviderAdapterRegistry,
): ServerToshiProviderRuntime {
  try {
    if (!access || access.readiness.mode !== "approved_staging" || access.panelOrigin === null || RUNTIMES.has(access)) invalid();
    const selectedRepository = repositoryFacade(repository);
    const selectedKeyring = keyringStore(keyring);
    const selectedAdapters = adapterFacade(adapters);
    const runtime: ServerToshiProviderRuntime = Object.freeze({
      readiness: Object.freeze({ mode: "approved_staging" as const }),
      access: access as ApprovedAccess,
      repository: selectedRepository,
      get keyring() { return keyringSnapshot(selectedKeyring); },
      adapters: selectedAdapters,
    });
    RUNTIMES.set(access, runtime);
    return runtime;
  } catch { return invalid(); }
}

export function resolveServerToshiProviderRuntime(access: ServerPanelAccessRuntime): ServerToshiProviderRuntime | null {
  try {
    if (!access || access.readiness.mode !== "approved_staging" || access.panelOrigin === null) return null;
    return RUNTIMES.get(access) ?? null;
  } catch { return null; }
}
