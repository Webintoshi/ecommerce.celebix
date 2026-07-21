import { timingSafeEqual } from "node:crypto";

import {
  parseCanonicalPaytrConfiguration,
  serializeCanonicalPaytrConfiguration,
  type CanonicalPaytrConfiguration,
  type QuickLinkKeyring,
} from "@celebix/saas-data";

type Environment = Record<string, string | undefined>;

const KEY_ID = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,126}[A-Za-z0-9])?$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

export const QUICK_LINK_SERVER_ENVIRONMENT_FIELDS = Object.freeze([
  "CELEBIX_SAAS_AUTH_MODE",
  "CELEBIX_DEPLOYMENT_TIER",
  "CELEBIX_QUICK_ORDER_ACTIVE_KEY_ID",
  "CELEBIX_QUICK_ORDER_KEYS",
  "CELEBIX_PAYTR_STAGING_MERCHANT_ID",
  "CELEBIX_PAYTR_STAGING_MERCHANT_KEY",
  "CELEBIX_PAYTR_STAGING_MERCHANT_SALT",
  "CELEBIX_PAYTR_STAGING_CALLBACK_URL",
  "CELEBIX_PAYTR_STAGING_TEST_MODE",
] as const);

export type QuickLinkServerConfig = Readonly<{
  keyring: QuickLinkKeyring;
  paytrConfiguration: CanonicalPaytrConfiguration;
}>;

function invalid(): never {
  throw new Error("quick_link_server_config_invalid");
}

function required(source: Environment, field: string, maximum: number): string {
  const value = source[field];
  if (
    typeof value !== "string" || value.length < 1 || value.length > maximum ||
    value !== value.trim() || CONTROL.test(value)
  ) invalid();
  return value;
}

function parseKeyring(source: Environment): QuickLinkKeyring {
  const activeKeyId = required(source, "CELEBIX_QUICK_ORDER_ACTIVE_KEY_ID", 128);
  if (!KEY_ID.test(activeKeyId) || activeKeyId.includes("..")) invalid();
  const serialized = required(source, "CELEBIX_QUICK_ORDER_KEYS", 16_384);
  if (/\s/.test(serialized)) invalid();
  const segments = serialized.split(",");
  if (segments.length < 1 || segments.length > 64 || segments.some((segment) => segment.length === 0)) invalid();
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
    for (const { key } of retained) key.fill(0);
    return invalid();
  }
}

function parsePaytrConfiguration(source: Environment): CanonicalPaytrConfiguration {
  if (required(source, "CELEBIX_PAYTR_STAGING_TEST_MODE", 1) !== "1") invalid();
  try {
    const selected: CanonicalPaytrConfiguration = Object.freeze({
      version: 1,
      merchantId: required(source, "CELEBIX_PAYTR_STAGING_MERCHANT_ID", 128),
      merchantKey: required(source, "CELEBIX_PAYTR_STAGING_MERCHANT_KEY", 256),
      merchantSalt: required(source, "CELEBIX_PAYTR_STAGING_MERCHANT_SALT", 256),
      callbackUrl: required(source, "CELEBIX_PAYTR_STAGING_CALLBACK_URL", 2_048),
      testMode: 1,
    });
    return parseCanonicalPaytrConfiguration(serializeCanonicalPaytrConfiguration(selected));
  } catch { return invalid(); }
}

export function resolveQuickLinkServerMode(source: Environment): "disabled" | "approved_staging" {
  try {
    return source?.CELEBIX_SAAS_AUTH_MODE === "approved_staging" && source.CELEBIX_DEPLOYMENT_TIER === "staging"
      ? "approved_staging"
      : "disabled";
  } catch { return "disabled"; }
}

export function parseQuickLinkServerConfig(source: Environment): QuickLinkServerConfig {
  try {
    if (!source || typeof source !== "object" || Array.isArray(source)) invalid();
    const keys = Object.keys(source);
    if (
      keys.length !== QUICK_LINK_SERVER_ENVIRONMENT_FIELDS.length ||
      keys.some((key) => !QUICK_LINK_SERVER_ENVIRONMENT_FIELDS.includes(key as never)) ||
      resolveQuickLinkServerMode(source) !== "approved_staging"
    ) invalid();
    return Object.freeze({
      keyring: parseKeyring(source),
      paytrConfiguration: parsePaytrConfiguration(source),
    });
  } catch { return invalid(); }
}
