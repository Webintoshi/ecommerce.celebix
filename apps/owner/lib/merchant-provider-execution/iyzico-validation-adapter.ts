import { types as nodeTypes } from "node:util";

import {
  validateIyzicoCredentialWithTransport,
  type ProviderTransport,
} from "@celebix/payment-adapters";

import type { MerchantProviderVerificationAdapter } from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const OPTION_KEYS = Object.freeze([
  "validationIdentity", "transport", "validationReference", "validationRandomKey",
  "validationTimeoutMs",
]);
const PUBLIC_KEYS = Object.freeze(["environment"]);
const CREDENTIAL_KEYS = Object.freeze(["apiKey", "secretKey"]);

export type IyzicoValidationAdapterOptions = Readonly<{
  validationIdentity: Readonly<{ environment: "test" | "live"; adapterVersion: 1 }>;
  transport: ProviderTransport;
  validationReference(): string;
  validationRandomKey(): string;
  validationTimeoutMs: number;
}>;

function invalid(): never {
  throw new TypeError("iyzico_validation_adapter_invalid");
}

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    typeof value !== "object" || value === null || Array.isArray(value) || nodeTypes.isProxy(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
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

function text(value: unknown): string {
  if (
    typeof value !== "string" || value.length < 1 || value.length > 256 ||
    value !== value.trim() || /[\u0000-\u001f\u007f-\u009f]/.test(value)
  ) invalid();
  return value;
}

function duplicateJsonKeys(value: string): boolean {
  let cursor = 0;
  let depth = 0;
  const whitespace = () => {
    while (/\s/.test(value[cursor] ?? "")) cursor += 1;
  };
  const jsonString = (): string => {
    const start = cursor;
    cursor += 1;
    while (cursor < value.length) {
      if (value[cursor] === "\\") {
        cursor += 2;
        continue;
      }
      if (value[cursor] === "\"") {
        cursor += 1;
        return JSON.parse(value.slice(start, cursor)) as string;
      }
      cursor += 1;
    }
    return invalid();
  };
  const jsonValue = (): boolean => {
    whitespace();
    if (value[cursor] === "{") return jsonObject();
    if (value[cursor] === "[") {
      depth += 1;
      if (depth > 64) return true;
      cursor += 1;
      whitespace();
      if (value[cursor] === "]") {
        cursor += 1;
        depth -= 1;
        return false;
      }
      while (cursor < value.length) {
        if (jsonValue()) return true;
        whitespace();
        if (value[cursor] === "]") {
          cursor += 1;
          depth -= 1;
          return false;
        }
        if (value[cursor] !== ",") return true;
        cursor += 1;
      }
      return true;
    }
    if (value[cursor] === "\"") {
      jsonString();
      return false;
    }
    while (cursor < value.length && !/[\s,}\]]/.test(value[cursor]!)) cursor += 1;
    return false;
  };
  const jsonObject = (): boolean => {
    depth += 1;
    if (depth > 64) return true;
    cursor += 1;
    whitespace();
    if (value[cursor] === "}") {
      cursor += 1;
      depth -= 1;
      return false;
    }
    const keys = new Set<string>();
    while (cursor < value.length) {
      whitespace();
      if (value[cursor] !== "\"") return true;
      const key = jsonString();
      if (keys.has(key)) return true;
      keys.add(key);
      whitespace();
      if (value[cursor] !== ":") return true;
      cursor += 1;
      if (jsonValue()) return true;
      whitespace();
      if (value[cursor] === "}") {
        cursor += 1;
        depth -= 1;
        return false;
      }
      if (value[cursor] !== ",") return true;
      cursor += 1;
    }
    return true;
  };
  try {
    whitespace();
    const duplicate = jsonValue();
    whitespace();
    return duplicate || cursor !== value.length;
  } catch {
    return true;
  }
}

function credentialBytes(value: unknown): { apiKey: string; secretKey: string } {
  if (
    !nodeTypes.isUint8Array(value) || nodeTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Uint8Array.prototype ||
    value.byteLength < 1 || value.byteLength > 16_384
  ) invalid();
  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(value);
  const canonical = new TextEncoder().encode(decoded);
  try {
    if (
      canonical.byteLength !== value.byteLength ||
      canonical.some((byte, index) => byte !== value[index])
    ) invalid();
    if (duplicateJsonKeys(decoded)) invalid();
    const parsed = exact(JSON.parse(decoded) as unknown, CREDENTIAL_KEYS);
    return { apiKey: text(parsed.apiKey), secretKey: text(parsed.secretKey) };
  } finally {
    canonical.fill(0);
  }
}

export function createIyzicoValidationAdapter(
  options: IyzicoValidationAdapterOptions,
): MerchantProviderVerificationAdapter {
  const parsed = exact(options, OPTION_KEYS);
  const validationIdentity = exact(parsed.validationIdentity, ["environment", "adapterVersion"]);
  if (
    (validationIdentity.environment !== "test" && validationIdentity.environment !== "live") ||
    validationIdentity.adapterVersion !== 1
  ) invalid();
  const transport = parsed.transport as ProviderTransport;
  if (
    !transport || typeof transport !== "object" || typeof transport.request !== "function" ||
    typeof parsed.validationReference !== "function" ||
    typeof parsed.validationRandomKey !== "function" ||
    !Number.isSafeInteger(parsed.validationTimeoutMs) ||
    (parsed.validationTimeoutMs as number) < 100 ||
    (parsed.validationTimeoutMs as number) > 5_000
  ) invalid();
  const environment = validationIdentity.environment;
  const validationReference = parsed.validationReference as () => string;
  const validationRandomKey = parsed.validationRandomKey as () => string;
  const validationTimeoutMs = parsed.validationTimeoutMs as number;
  return Object.freeze({
    providerCode: "iyzico_iframe",
    capability: "payment_processing" as const,
    validationIdentity: Object.freeze({ environment, adapterVersion: 1 }),
    async validateCredential(input: Parameters<MerchantProviderVerificationAdapter["validateCredential"]>[0]) {
      let credential: Uint8Array | undefined;
      let privateValues: { apiKey: string; secretKey: string } | undefined;
      try {
        const selected = exact(input, ["credential", "publicConfig"]);
        if (
          !nodeTypes.isUint8Array(selected.credential) || nodeTypes.isProxy(selected.credential) ||
          Object.getPrototypeOf(selected.credential) !== Uint8Array.prototype
        ) invalid();
        credential = selected.credential as Uint8Array;
        const publicConfig = exact(selected.publicConfig, PUBLIC_KEYS);
        if (publicConfig.environment !== environment) invalid();
        privateValues = credentialBytes(credential);
        const reference = validationReference();
        if (!UUID.test(reference)) invalid();
        return await validateIyzicoCredentialWithTransport(transport, Object.freeze({
          environment,
          credential: privateValues,
          validationReference: reference,
          signal: AbortSignal.timeout(validationTimeoutMs),
          randomKey: validationRandomKey,
        }));
      } catch {
        return Object.freeze({ kind: "rejected" as const, outcomeCode: "invalid_validation_request" });
      } finally {
        if (privateValues !== undefined) {
          privateValues.apiKey = "";
          privateValues.secretKey = "";
        }
        credential?.fill(0);
      }
    },
  });
}
