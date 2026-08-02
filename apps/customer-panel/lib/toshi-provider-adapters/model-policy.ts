import type { ToshiProviderModel } from "@celebix/saas-contracts";

import { ToshiProviderAdapterError } from "./types.ts";

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const ENCODER = new TextEncoder();
const MAXIMUM_RESPONSE_BYTES = 1_048_576;
const MAXIMUM_PROVIDER_MODELS = 1_000;
const MAXIMUM_PUBLIC_MODELS = 100;

function unavailable(): never {
  throw new ToshiProviderAdapterError("provider_unavailable");
}

export function plainRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) unavailable();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<PropertyKey, PropertyDescriptor>;
  if (Reflect.ownKeys(descriptors).some((key) => {
    const descriptor = descriptors[key];
    return typeof key !== "string" || !descriptor || !("value" in descriptor) || !descriptor.enumerable;
  })) unavailable();
  return value as Record<string, unknown>;
}

export function ownValue(record: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) unavailable();
  return descriptor.value;
}

export function boundedArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > MAXIMUM_PROVIDER_MODELS) unavailable();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<PropertyKey, PropertyDescriptor>;
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) unavailable();
  const result: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) unavailable();
    result.push(descriptor.value);
  }
  return result;
}

export function boundedText(value: unknown): string {
  if (
    typeof value !== "string" || value.length < 1 || value !== value.trim() ||
    CONTROL.test(value) || ENCODER.encode(value).byteLength > 160
  ) unavailable();
  return value;
}

export function finalizeModels(models: readonly ToshiProviderModel[], preferences: readonly RegExp[]): Readonly<{
  models: readonly ToshiProviderModel[];
  selectedModel: string;
}> {
  const byId = new Map<string, ToshiProviderModel>();
  for (const entry of models) {
    if (!byId.has(entry.id)) byId.set(entry.id, Object.freeze({ id: boundedText(entry.id), label: boundedText(entry.label) }));
  }
  const selected = [...byId.values()].sort((left, right) => left.id.localeCompare(right)).slice(0, MAXIMUM_PUBLIC_MODELS);
  if (selected.length === 0) throw new ToshiProviderAdapterError("model_unavailable");
  const preferred = preferences.map((pattern) => selected.find(({ id }) => pattern.test(id))).find(Boolean) ?? selected[0];
  if (!preferred) throw new ToshiProviderAdapterError("model_unavailable");
  return Object.freeze({ models: Object.freeze(selected), selectedModel: preferred.id });
}

async function responseBytes(response: Response): Promise<Uint8Array> {
  const rawLength = response.headers.get("content-length");
  if (rawLength !== null) {
    const length = Number(rawLength);
    if (!Number.isSafeInteger(length) || length < 0 || length > MAXIMUM_RESPONSE_BYTES) unavailable();
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAXIMUM_RESPONSE_BYTES) unavailable();
  return bytes;
}

async function json(response: Response): Promise<unknown> {
  if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) unavailable();
  const bytes = await responseBytes(response);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    unavailable();
  } finally {
    bytes.fill(0);
  }
}

async function quotaCode(response: Response): Promise<"rate_limited" | "quota_exceeded"> {
  try {
    const selected = plainRecord(await json(response));
    const error = plainRecord(ownValue(selected, "error"));
    const code = ownValue(error, "code");
    return code === "insufficient_quota" || code === "quota_exceeded" || code === "RESOURCE_EXHAUSTED"
      ? "quota_exceeded"
      : "rate_limited";
  } catch {
    return "rate_limited";
  }
}

export async function fetchOfficialJson(
  fetcher: ToshiProviderFetch,
  url: string,
  headers: HeadersInit,
  signal: AbortSignal,
): Promise<unknown> {
  if (typeof fetcher !== "function" || !(signal instanceof AbortSignal)) throw new ToshiProviderAdapterError("invalid_input");
  const deadline = AbortSignal.timeout(10_000);
  const composed = AbortSignal.any([signal, deadline]);
  let response: Response;
  try {
    response = await fetcher(url, Object.freeze({
      method: "GET",
      headers: Object.freeze({ accept: "application/json", ...headers }),
      redirect: "error",
      cache: "no-store",
      signal: composed,
    }));
  } catch (error) {
    if (composed.aborted || signal.aborted || deadline.aborted || (error instanceof DOMException && ["AbortError", "TimeoutError"].includes(error.name))) {
      throw new ToshiProviderAdapterError("provider_timeout");
    }
    throw new ToshiProviderAdapterError("provider_unavailable");
  }
  if (!(response instanceof Response)) unavailable();
  if (response.status === 401 || response.status === 403) throw new ToshiProviderAdapterError("credential_invalid");
  if (response.status === 429) throw new ToshiProviderAdapterError(await quotaCode(response));
  if (!response.ok) throw new ToshiProviderAdapterError("provider_unavailable");
  return json(response);
}

export async function withApiKey<T>(
  apiKey: Uint8Array,
  operation: (key: string) => Promise<T>,
): Promise<T> {
  if (!(apiKey instanceof Uint8Array) || Object.getPrototypeOf(apiKey) !== Uint8Array.prototype || apiKey.byteLength < 1 || apiKey.byteLength > 16_384) {
    throw new ToshiProviderAdapterError("credential_invalid");
  }
  const temporary = Buffer.from(apiKey);
  try {
    let key: string;
    try { key = new TextDecoder("utf-8", { fatal: true }).decode(temporary); }
    catch { throw new ToshiProviderAdapterError("credential_invalid"); }
    if (key.length < 1 || CONTROL.test(key)) throw new ToshiProviderAdapterError("credential_invalid");
    return await operation(key);
  } finally {
    temporary.fill(0);
  }
}
