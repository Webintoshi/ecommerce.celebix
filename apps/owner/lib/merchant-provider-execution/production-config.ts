import { isIP } from "node:net";
import { types as nodeTypes } from "node:util";

import {
  IYZICO_APPROVED_EXECUTION_AUTHORITY,
  PAYTR_APPROVED_EXECUTION_AUTHORITIES,
} from "@celebix/payment-adapters";
import type { PaymentProviderExecutionAuthority } from "@celebix/saas-contracts";
import {
  parseMerchantProviderCredentialKeyring,
  type MerchantProviderCredentialKeyring,
  type MerchantProviderValidationIdentity,
} from "@celebix/saas-data";

const WORKER = /^[A-Za-z0-9._-]{1,128}$/;
const DATABASE = /^[a-z][a-z0-9_]{2,62}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const PROVIDERS = Object.freeze(["iyzico_iframe", "paytr_iframe"] as const);

type Environment = Readonly<Record<string, string | undefined>>;
export type MerchantProviderProductionProviderCode = typeof PROVIDERS[number];
export type MerchantProviderExecutionAuthorityMap = Readonly<Record<
MerchantProviderProductionProviderCode,
Readonly<PaymentProviderExecutionAuthority> | null
>>;
export type MerchantProviderVerificationIdentityMap = Readonly<Record<
MerchantProviderProductionProviderCode,
readonly Readonly<MerchantProviderValidationIdentity>[]
>>;

export type MerchantProviderProductionConfig = Readonly<{
  database: Readonly<{ url: string; name: string }>;
  keyring: MerchantProviderCredentialKeyring;
  workerId: string;
  paytrValidation: Readonly<{
    userIp: string;
    successUrl: string;
    failureUrl: string;
  }> | null;
  executionAuthorities: MerchantProviderExecutionAuthorityMap;
  verificationIdentities: MerchantProviderVerificationIdentityMap;
}>;

function invalid(): never {
  throw new Error("merchant_provider_production_config_invalid");
}

function record(
  value: unknown,
  keys: readonly string[],
): Readonly<Record<string, unknown>> | null {
  if (
    typeof value !== "object" || value === null || Array.isArray(value) ||
    nodeTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype ||
    !Object.isFrozen(value)
  ) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  const actual = Reflect.ownKeys(descriptors);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== "string" || !keys.includes(key))
  ) return null;
  const selected: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null;
    selected[key] = descriptor.value;
  }
  return selected;
}

function executionAuthority(value: unknown): Readonly<PaymentProviderExecutionAuthority> | null | false {
  if (value === null) return null;
  const selected = record(value, ["environment", "adapterVersion", "evidenceDigest"]);
  if (
    selected === null ||
    (selected.environment !== "test" && selected.environment !== "live") ||
    !Number.isSafeInteger(selected.adapterVersion) || (selected.adapterVersion as number) < 1 ||
    typeof selected.evidenceDigest !== "string" || !DIGEST.test(selected.evidenceDigest)
  ) return false;
  return Object.freeze({
    environment: selected.environment,
    adapterVersion: selected.adapterVersion as number,
    evidenceDigest: selected.evidenceDigest,
  });
}

function authorityMap(value: unknown): MerchantProviderExecutionAuthorityMap | null {
  const selected = record(value, PROVIDERS);
  if (selected === null) return null;
  const iyzico = executionAuthority(selected.iyzico_iframe);
  const paytr = executionAuthority(selected.paytr_iframe);
  if (iyzico === false || paytr === false) return null;
  return Object.freeze({ iyzico_iframe: iyzico, paytr_iframe: paytr });
}

function identity(value: unknown): Readonly<MerchantProviderValidationIdentity> | null {
  const selected = record(value, ["environment", "adapterVersion"]);
  if (
    selected === null ||
    (selected.environment !== "test" && selected.environment !== "live") ||
    !Number.isSafeInteger(selected.adapterVersion) || (selected.adapterVersion as number) < 1
  ) return null;
  return Object.freeze({
    environment: selected.environment,
    adapterVersion: selected.adapterVersion as number,
  });
}

function identityList(value: unknown): readonly Readonly<MerchantProviderValidationIdentity>[] | null {
  if (
    !Array.isArray(value) || nodeTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Array.prototype || !Object.isFrozen(value) || value.length > 16
  ) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) return null;
  const result: Readonly<MerchantProviderValidationIdentity>[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null;
    const selected = identity(descriptor.value);
    if (selected === null) return null;
    const key = `${selected.environment}:${selected.adapterVersion}`;
    if (seen.has(key)) return null;
    seen.add(key);
    result.push(selected);
  }
  return Object.freeze(result);
}

function identityMap(value: unknown): MerchantProviderVerificationIdentityMap | null {
  const selected = record(value, PROVIDERS);
  if (selected === null) return null;
  const iyzico = identityList(selected.iyzico_iframe);
  const paytr = identityList(selected.paytr_iframe);
  if (iyzico === null || paytr === null) return null;
  return Object.freeze({ iyzico_iframe: iyzico, paytr_iframe: paytr });
}

function required(source: Environment, name: string, maximum = 4_096): string {
  const value = source[name];
  if (
    typeof value !== "string" || value.length < 1 || value.length > maximum ||
    value !== value.trim() || CONTROL.test(value)
  ) invalid();
  return value;
}

function publicIp(value: string): string {
  if (isIP(value) !== 4) invalid();
  const [first, second, third] = value.split(".").map(Number);
  if (
    first === undefined || second === undefined || third === undefined ||
    first === 0 || first === 10 || first === 127 || first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && (third === 0 || third === 2)) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19 || (second === 51 && third === 100))) ||
    (first === 203 && second === 0 && third === 113)
  ) invalid();
  return value;
}

function database(source: Environment): Readonly<{ url: string; name: string }> {
  const name = required(source, "CELEBIX_SAAS_DATABASE_NAME", 63);
  if (!DATABASE.test(name)) invalid();
  const value = required(source, "CELEBIX_SAAS_DATABASE_URL");
  let parsed: URL;
  try { parsed = new URL(value); } catch { return invalid(); }
  if (
    (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") ||
    !parsed.username || !parsed.password || !parsed.hostname || parsed.hash ||
    decodeURIComponent(parsed.pathname) !== `/${name}` || parsed.toString() !== value
  ) invalid();
  return Object.freeze({ url: value, name });
}

function paytrValidation(source: Environment): NonNullable<MerchantProviderProductionConfig["paytrValidation"]> {
  const userIp = publicIp(required(source, "CELEBIX_PAYTR_VALIDATION_EGRESS_IP", 39));
  const origin = required(source, "CELEBIX_PAYTR_VALIDATION_ORIGIN", 256);
  let parsed: URL;
  try { parsed = new URL(origin); } catch { return invalid(); }
  const originHost = parsed.hostname.replace(/^\[|\]$/g, "");
  if (
    parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port ||
    parsed.origin !== origin || parsed.hostname === "localhost" || parsed.hostname.endsWith(".invalid") ||
    !parsed.hostname.includes(".") || isIP(originHost) !== 0
  ) invalid();
  return Object.freeze({
    userIp,
    successUrl: `${origin}/odeme/hizli/sonuc?durum=basarili`,
    failureUrl: `${origin}/odeme/hizli/sonuc?durum=basarisiz`,
  });
}

export function createMerchantProviderProductionConfigParser(
  compiledExecutionAuthorities: MerchantProviderExecutionAuthorityMap,
  compiledVerificationIdentities: MerchantProviderVerificationIdentityMap,
  dependencies?: Readonly<{
    parseKeyring(source: Environment): MerchantProviderCredentialKeyring;
  }>,
) {
  const parseKeyring = dependencies?.parseKeyring ?? parseMerchantProviderCredentialKeyring;
  const executionAuthorities = authorityMap(compiledExecutionAuthorities);
  const verificationIdentities = identityMap(compiledVerificationIdentities);
  const enabled = executionAuthorities !== null && verificationIdentities !== null && (
    PROVIDERS.some((providerCode) => executionAuthorities[providerCode] !== null) ||
    PROVIDERS.some((providerCode) => verificationIdentities[providerCode].length > 0)
  );
  function resolveMode(source: Environment): "disabled" | "approved_test_validation" {
    return enabled && source.CELEBIX_MERCHANT_PROVIDER_WORKER_MODE === "approved_test_validation"
      ? "approved_test_validation"
      : "disabled";
  }
  function parse(source: Environment): MerchantProviderProductionConfig {
    if (
      resolveMode(source) !== "approved_test_validation" ||
      executionAuthorities === null || verificationIdentities === null
    ) invalid();
    const workerId = required(source, "CELEBIX_MERCHANT_PROVIDER_WORKER_ID", 128);
    if (!WORKER.test(workerId)) invalid();
    let keyring: MerchantProviderCredentialKeyring;
    try { keyring = parseKeyring(source); } catch { return invalid(); }
    let ownershipTransferred = false;
    try {
      const paytrEnabled = executionAuthorities.paytr_iframe !== null ||
        verificationIdentities.paytr_iframe.length > 0;
      const config = Object.freeze({
        database: database(source),
        keyring,
        workerId,
        paytrValidation: paytrEnabled ? paytrValidation(source) : null,
        executionAuthorities,
        verificationIdentities,
      });
      ownershipTransferred = true;
      return config;
    } finally {
      if (!ownershipTransferred) for (const { key } of keyring.keys) key.fill(0);
    }
  }
  return Object.freeze({ resolveMode, parse });
}

function compiledExecutionAuthorities(): MerchantProviderExecutionAuthorityMap {
  return Object.freeze({
    iyzico_iframe: IYZICO_APPROVED_EXECUTION_AUTHORITY,
    paytr_iframe: PAYTR_APPROVED_EXECUTION_AUTHORITIES.test ?? PAYTR_APPROVED_EXECUTION_AUTHORITIES.live,
  });
}

function compiledVerificationIdentities(): MerchantProviderVerificationIdentityMap {
  return Object.freeze({
    iyzico_iframe: Object.freeze([
      Object.freeze({ environment: "test" as const, adapterVersion: 1 }),
      Object.freeze({ environment: "live" as const, adapterVersion: 1 }),
    ]),
    paytr_iframe: Object.freeze([
      Object.freeze({ environment: "test" as const, adapterVersion: 1 }),
      Object.freeze({ environment: "live" as const, adapterVersion: 1 }),
    ]),
  });
}

const PRODUCTION_PARSER = createMerchantProviderProductionConfigParser(
  compiledExecutionAuthorities(),
  compiledVerificationIdentities(),
);

export function resolveMerchantProviderProductionMode(
  source: Environment,
): "disabled" | "approved_test_validation" {
  return PRODUCTION_PARSER.resolveMode(source);
}

export function parseMerchantProviderProductionConfig(
  source: Environment,
): MerchantProviderProductionConfig {
  return PRODUCTION_PARSER.parse(source);
}
