const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const MASKED_KEY = /^••••[^\s\p{C}]{4}$/u;

type InputRecord = Readonly<Record<string, unknown>>;

export const TOSHI_PROVIDERS = Object.freeze([
  "openai",
  "gemini",
  "anthropic",
] as const);
export type ToshiProvider = (typeof TOSHI_PROVIDERS)[number];

export const TOSHI_PROVIDER_CONNECTION_STATUSES = Object.freeze([
  "active",
  "revoked",
] as const);
export type ToshiProviderConnectionStatus = (typeof TOSHI_PROVIDER_CONNECTION_STATUSES)[number];

export const TOSHI_PROVIDER_ERROR_CODES = Object.freeze([
  "invalid_input",
  "unauthenticated",
  "membership_denied",
  "origin_denied",
  "credential_invalid",
  "model_unavailable",
  "rate_limited",
  "quota_exceeded",
  "provider_timeout",
  "provider_unavailable",
  "version_conflict",
  "unavailable",
] as const);
export type ToshiProviderErrorCode = (typeof TOSHI_PROVIDER_ERROR_CODES)[number];

export type ToshiProviderModel = Readonly<{
  id: string;
  label: string;
}>;

export type ToshiProviderConnection = Readonly<{
  provider: ToshiProvider;
  label: string;
  status: ToshiProviderConnectionStatus;
  isDefault: boolean;
  maskedKey: string;
  selectedModel: string;
  availableModels: readonly ToshiProviderModel[];
  version: number;
  verifiedAt: string;
  updatedAt: string;
}>;

export type ToshiProviderConnectionList = Readonly<{
  items: readonly ToshiProviderConnection[];
}>;

const PROVIDER_LABELS: Readonly<Record<ToshiProvider, string>> = Object.freeze({
  openai: "OpenAI",
  gemini: "Google Gemini",
  anthropic: "Anthropic Claude",
});

function invalid(): never {
  throw new TypeError("toshi_provider_contract_invalid");
}

function exact(value: unknown, keys: readonly string[]): InputRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
  const actual = Reflect.ownKeys(descriptors);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== "string" || !keys.includes(key)) ||
    keys.some((key) => !Object.hasOwn(descriptors, key))
  ) invalid();
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of actual) {
    if (typeof key !== "string") invalid();
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) invalid();
    result[key] = descriptor.value;
  }
  return result;
}

function dense(value: unknown, minimum: number, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
  const lengthDescriptor = descriptors.length;
  if (!lengthDescriptor || !("value" in lengthDescriptor) || lengthDescriptor.enumerable) invalid();
  const length = lengthDescriptor.value;
  if (!Number.isSafeInteger(length) || length < minimum || length > maximum || Reflect.ownKeys(descriptors).length !== length + 1) invalid();
  const result: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) invalid();
    result.push(descriptor.value);
  }
  return result;
}

function boundedText(value: unknown, maximumBytes: number): string {
  if (
    typeof value !== "string" || value.length < 1 || value !== value.trim() ||
    CONTROL.test(value) || new TextEncoder().encode(value).byteLength > maximumBytes
  ) invalid();
  return value;
}

function provider(value: unknown): ToshiProvider {
  if (!TOSHI_PROVIDERS.includes(value as never)) invalid();
  return value as ToshiProvider;
}

function status(value: unknown): ToshiProviderConnectionStatus {
  if (!TOSHI_PROVIDER_CONNECTION_STATUSES.includes(value as never)) invalid();
  return value as ToshiProviderConnectionStatus;
}

function timestamp(value: unknown): string {
  const selected = boundedText(value, 64);
  const date = new Date(selected);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== selected) invalid();
  return selected;
}

function model(value: unknown): ToshiProviderModel {
  const parsed = exact(value, ["id", "label"]);
  return Object.freeze({
    id: boundedText(parsed.id, 160),
    label: boundedText(parsed.label, 160),
  });
}

export function parseToshiProviderConnection(value: unknown): ToshiProviderConnection {
  const parsed = exact(value, [
    "provider",
    "label",
    "status",
    "isDefault",
    "maskedKey",
    "selectedModel",
    "availableModels",
    "version",
    "verifiedAt",
    "updatedAt",
  ]);
  const selectedProvider = provider(parsed.provider);
  const selectedStatus = status(parsed.status);
  const label = boundedText(parsed.label, 80);
  if (label !== PROVIDER_LABELS[selectedProvider]) invalid();
  if (typeof parsed.isDefault !== "boolean" || (selectedStatus === "revoked" && parsed.isDefault)) invalid();
  if (typeof parsed.maskedKey !== "string" || !MASKED_KEY.test(parsed.maskedKey)) invalid();
  const availableModels = dense(parsed.availableModels, 1, 100).map(model);
  const ids = availableModels.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) invalid();
  const selectedModel = boundedText(parsed.selectedModel, 160);
  if (!ids.includes(selectedModel)) invalid();
  if (!Number.isSafeInteger(parsed.version) || (parsed.version as number) < 1) invalid();
  return Object.freeze({
    provider: selectedProvider,
    label,
    status: selectedStatus,
    isDefault: parsed.isDefault,
    maskedKey: parsed.maskedKey,
    selectedModel,
    availableModels: Object.freeze(availableModels),
    version: parsed.version as number,
    verifiedAt: timestamp(parsed.verifiedAt),
    updatedAt: timestamp(parsed.updatedAt),
  });
}

export function parseToshiProviderConnectionList(value: unknown): ToshiProviderConnectionList {
  const parsed = exact(value, ["items"]);
  const items = dense(parsed.items, 0, TOSHI_PROVIDERS.length).map(parseToshiProviderConnection);
  const providers = items.map(({ provider: selected }) => selected);
  if (new Set(providers).size !== providers.length || items.filter(({ isDefault }) => isDefault).length > 1) invalid();
  return Object.freeze({ items: Object.freeze(items) });
}
