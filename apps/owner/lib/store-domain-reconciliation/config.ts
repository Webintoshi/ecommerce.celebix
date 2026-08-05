import { isIP } from "node:net";

import type { CloudflareForSaaSConfig, StorefrontHostnamePolicy } from "@celebix/saas-domain-core";

type Environment = Readonly<Record<string, string | undefined>>;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const WORKER = /^[A-Za-z0-9._-]{1,128}$/u;
const DATABASE = /^[a-z][a-z0-9_]{2,62}$/u;

export type StoreDomainWorkerConfig = Readonly<{
  database: Readonly<{ url: string; name: string }>;
  cloudflare: CloudflareForSaaSConfig;
  hostnamePolicy: StorefrontHostnamePolicy;
  workerId: string;
}>;

function invalid(): never { throw new Error("store_domain_worker_config_invalid"); }
function required(source: Environment, key: string, maximum = 4096): string {
  const value = source[key];
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || value !== value.trim() || CONTROL.test(value)) invalid();
  return value;
}
function hostname(value: string): string {
  if (value !== value.toLowerCase() || value.length > 253 || !HOSTNAME.test(value)) invalid();
  return value;
}
function isPrivateHost(value: string): boolean {
  const ipKind = isIP(value);
  if (ipKind === 0) return !value.includes(".") || value.endsWith(".internal") || value.endsWith(".local");
  if (ipKind === 6) return value === "::1" || value.toLowerCase().startsWith("fc") || value.toLowerCase().startsWith("fd");
  const parts = value.split(".").map(Number);
  const [first, second] = parts;
  return first === 10 || first === 127 || (first === 169 && second === 254) || (first === 172 && second !== undefined && second >= 16 && second <= 31) || (first === 192 && second === 168);
}
function database(source: Environment): StoreDomainWorkerConfig["database"] {
  const value = required(source, "CELEBIX_SAAS_DATABASE_URL");
  let parsed: URL;
  try { parsed = new URL(value); } catch { return invalid(); }
  const name = decodeURIComponent(parsed.pathname.slice(1));
  if ((parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") || !parsed.username || !parsed.password || !parsed.hostname
      || parsed.hash || parsed.search || parsed.pathname !== `/${name}` || !DATABASE.test(name) || !isPrivateHost(parsed.hostname) || parsed.toString() !== value) invalid();
  return Object.freeze({ url: value, name });
}

export function resolveStoreDomainWorkerMode(source: Environment): "enabled" | "disabled" {
  const value = source.CELEBIX_STORE_DOMAIN_WORKER_ENABLED;
  if (value === undefined || value === "false") return "disabled";
  if (value === "true") return "enabled";
  return invalid();
}

export function parseStoreDomainWorkerConfig(source: Environment): StoreDomainWorkerConfig {
  if (resolveStoreDomainWorkerMode(source) !== "enabled") invalid();
  const apiToken = required(source, "CLOUDFLARE_SAAS_API_TOKEN", 2048);
  if (/\s/u.test(apiToken) || apiToken.length < 8) invalid();
  const zoneId = required(source, "CLOUDFLARE_SAAS_ZONE_ID", 128);
  if (!WORKER.test(zoneId)) invalid();
  const apiBaseUrl = source.CLOUDFLARE_SAAS_API_BASE_URL ?? "https://api.cloudflare.com/client/v4";
  let api: URL;
  try { api = new URL(apiBaseUrl); } catch { return invalid(); }
  if (api.href !== "https://api.cloudflare.com/client/v4") invalid();
  const reservedSuffixes = required(source, "CELEBIX_CUSTOM_DOMAIN_RESERVED_SUFFIXES", 1024).split(",").map(hostname);
  if (reservedSuffixes.length < 1 || reservedSuffixes.length > 16 || new Set(reservedSuffixes).size !== reservedSuffixes.length) invalid();
  const cnameTarget = hostname(required(source, "CELEBIX_CUSTOM_DOMAIN_CNAME_TARGET", 253));
  if (!reservedSuffixes.some((suffix) => cnameTarget === suffix || cnameTarget.endsWith(`.${suffix}`))) invalid();
  const workerId = required(source, "CELEBIX_STORE_DOMAIN_WORKER_ID", 128);
  if (!WORKER.test(workerId)) invalid();
  return Object.freeze({
    database: database(source),
    cloudflare: Object.freeze({ zoneId, apiToken, apiBaseUrl, minimumTlsVersion: "1.2", timeoutMs: 5_000 }),
    hostnamePolicy: Object.freeze({ reservedSuffixes: Object.freeze(reservedSuffixes), cnameTarget }),
    workerId,
  });
}
