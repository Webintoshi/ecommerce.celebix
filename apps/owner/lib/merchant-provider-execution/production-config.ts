import { isIP } from "node:net";

import {
  parseMerchantProviderCredentialKeyring,
  type MerchantProviderCredentialKeyring,
} from "@celebix/saas-data";

const WORKER = /^[A-Za-z0-9._-]{1,128}$/;
const DATABASE = /^[a-z][a-z0-9_]{2,62}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

type Environment = Readonly<Record<string, string | undefined>>;

export type MerchantProviderProductionConfig = Readonly<{
  database: Readonly<{ url: string; name: string }>;
  keyring: MerchantProviderCredentialKeyring;
  workerId: string;
  validation: Readonly<{
    userIp: string;
    successUrl: string;
    failureUrl: string;
  }>;
  executionAuthority: Readonly<{ environment: "test"; adapterVersion: 1; evidenceDigest: string }>;
}>;

function invalid(): never {
  throw new Error("merchant_provider_production_config_invalid");
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

function validation(source: Environment): MerchantProviderProductionConfig["validation"] {
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

export function resolveMerchantProviderProductionMode(source: Environment): "disabled" | "approved_test_validation" {
  return source.CELEBIX_MERCHANT_PROVIDER_WORKER_MODE === "approved_test_validation"
    ? "approved_test_validation"
    : "disabled";
}

export function parseMerchantProviderProductionConfig(source: Environment): MerchantProviderProductionConfig {
  if (resolveMerchantProviderProductionMode(source) !== "approved_test_validation") invalid();
  const workerId = required(source, "CELEBIX_MERCHANT_PROVIDER_WORKER_ID", 128);
  if (!WORKER.test(workerId)) invalid();
  let keyring: MerchantProviderCredentialKeyring;
  try { keyring = parseMerchantProviderCredentialKeyring(source); } catch { return invalid(); }
  const evidenceDigest = required(source, "CELEBIX_PAYTR_EXECUTION_EVIDENCE_DIGEST", 71);
  if (!/^sha256:[a-f0-9]{64}$/.test(evidenceDigest)) invalid();
  return Object.freeze({
    database: database(source), keyring, workerId, validation: validation(source),
    executionAuthority: Object.freeze({ environment: "test", adapterVersion: 1, evidenceDigest }),
  });
}
