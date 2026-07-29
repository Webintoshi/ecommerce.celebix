import { timingSafeEqual } from "node:crypto";

import type { MerchantProviderCredentialKeyring } from "./credential-crypto.ts";

const KEY_ID = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,126}[A-Za-z0-9])?$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

type Environment = Readonly<Record<string, string | undefined>>;

export const MERCHANT_PROVIDER_CREDENTIAL_ENVIRONMENT_FIELDS = Object.freeze([
  "CELEBIX_MERCHANT_PROVIDER_CREDENTIAL_ACTIVE_KEY_ID",
  "CELEBIX_MERCHANT_PROVIDER_CREDENTIAL_KEYS",
] as const);

function invalid(): never {
  throw new Error("provider_credential_keyring_config_invalid");
}

function required(source: Environment, name: string, maximum: number): string {
  const value = source[name];
  if (
    typeof value !== "string" || value.length < 1 || value.length > maximum ||
    value !== value.trim() || CONTROL.test(value)
  ) invalid();
  return value;
}

export function parseMerchantProviderCredentialKeyring(source: Environment): MerchantProviderCredentialKeyring {
  const activeKeyId = required(source, MERCHANT_PROVIDER_CREDENTIAL_ENVIRONMENT_FIELDS[0], 128);
  if (!KEY_ID.test(activeKeyId) || activeKeyId.includes("..")) invalid();
  const serialized = required(source, MERCHANT_PROVIDER_CREDENTIAL_ENVIRONMENT_FIELDS[1], 16_384);
  if (/\s/.test(serialized)) invalid();
  const segments = serialized.split(",");
  if (segments.length < 1 || segments.length > 16 || segments.some((entry) => entry.length === 0)) invalid();
  const ids = new Set<string>();
  const retained: Array<Readonly<{ keyId: string; key: Uint8Array }>> = [];
  try {
    for (const segment of segments) {
      const separator = segment.indexOf(":");
      if (separator < 1 || separator !== segment.lastIndexOf(":")) invalid();
      const keyId = segment.slice(0, separator);
      const encoded = segment.slice(separator + 1);
      if (!KEY_ID.test(keyId) || keyId.includes("..") || ids.has(keyId) || !/^[A-Za-z0-9_-]{43}$/.test(encoded)) invalid();
      const decoded = Buffer.from(encoded, "base64url");
      try {
        if (decoded.byteLength !== 32 || decoded.toString("base64url") !== encoded) invalid();
        if (retained.some(({ key }) => timingSafeEqual(decoded, key))) invalid();
        retained.push(Object.freeze({ keyId, key: new Uint8Array(decoded) }));
        ids.add(keyId);
      } finally { decoded.fill(0); }
    }
    if (!ids.has(activeKeyId)) invalid();
    return Object.freeze({ activeKeyId, keys: Object.freeze(retained) });
  } catch {
    for (const entry of retained) entry.key.fill(0);
    return invalid();
  }
}
