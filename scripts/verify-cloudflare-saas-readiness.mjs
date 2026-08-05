import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";

const API_BASE_URL = "https://api.cloudflare.com/client/v4";
const BODY_LIMIT = 32_768;
const TIMEOUT_MS = 5_000;
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?[.])+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const IDENTIFIER = /^[a-f0-9]{32}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;

const UNAVAILABLE = Object.freeze({
  zone: "unavailable",
  customHostnameQuota: "unavailable",
  fallbackOrigin: "unavailable",
  cnameTarget: "unavailable",
  tunnel: "unavailable",
  storefront: "unhealthy",
});

function invalid() {
  throw new Error("custom_domain_readiness_config_invalid");
}

function required(source, key, maximum = 2_048) {
  const value = source?.[key];
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || value !== value.trim() || CONTROL.test(value)) invalid();
  return value;
}

function hostname(value) {
  if (typeof value !== "string" || value.length < 3 || value.length > 253 || value !== value.trim() || value !== value.toLowerCase() || !HOSTNAME.test(value)) invalid();
  return value;
}

function underSuffix(value, suffix) {
  return value.endsWith(suffix) && value.length > suffix.length;
}

function stagingInfrastructureHostname(value) {
  const suffix = ".celebix.site";
  if (!underSuffix(value, suffix)) return false;
  const label = value.slice(0, -suffix.length);
  return !label.includes(".") && label.endsWith("-staging") && label.length > "-staging".length;
}

export function parseReadinessConfig(source) {
  const deploymentTier = required(source, "CELEBIX_DEPLOYMENT_TIER", 10);
  if (deploymentTier !== "staging" && deploymentTier !== "production") invalid();
  const apiToken = required(source, "CLOUDFLARE_SAAS_API_TOKEN");
  if (apiToken.length < 8 || /\s/u.test(apiToken)) invalid();
  const accountId = required(source, "CLOUDFLARE_SAAS_ACCOUNT_ID", 32);
  const zoneId = required(source, "CLOUDFLARE_SAAS_ZONE_ID", 32);
  const tunnelId = required(source, "CLOUDFLARE_SAAS_TUNNEL_ID", 36);
  if (!IDENTIFIER.test(accountId) || !IDENTIFIER.test(zoneId) || !UUID.test(tunnelId)) invalid();
  const fallbackOrigin = hostname(required(source, "CELEBIX_CUSTOM_DOMAIN_FALLBACK_ORIGIN", 253));
  const cnameTarget = hostname(required(source, "CELEBIX_CUSTOM_DOMAIN_CNAME_TARGET", 253));
  const storefrontProbeHostname = hostname(required(source, "CELEBIX_CUSTOM_DOMAIN_STOREFRONT_PROBE_HOSTNAME", 253));
  const storefrontProbeStoreId = required(source, "CELEBIX_CUSTOM_DOMAIN_STOREFRONT_PROBE_STORE_ID", 36);
  if (!UUID.test(storefrontProbeStoreId)) invalid();
  const hostsMatchTier = deploymentTier === "staging"
    ? stagingInfrastructureHostname(fallbackOrigin)
      && stagingInfrastructureHostname(cnameTarget)
      && underSuffix(storefrontProbeHostname, ".saas-staging.celebix.site")
    : [fallbackOrigin, cnameTarget, storefrontProbeHostname].every((value) => underSuffix(value, ".celebix.site"));
  if (!hostsMatchTier || fallbackOrigin === cnameTarget || storefrontProbeHostname === fallbackOrigin || storefrontProbeHostname === cnameTarget) invalid();
  const rawLimit = required(source, "CELEBIX_CLOUDFLARE_CUSTOM_HOSTNAME_LIMIT", 5);
  if (!/^[1-9][0-9]{0,4}$/u.test(rawLimit)) invalid();
  const customHostnameLimit = Number(rawLimit);
  if (!Number.isSafeInteger(customHostnameLimit) || customHostnameLimit > 50_000) invalid();
  return Object.freeze({ deploymentTier, apiToken, accountId, zoneId, tunnelId, fallbackOrigin, cnameTarget, storefrontProbeHostname, storefrontProbeStoreId, customHostnameLimit });
}

async function boundedJson(response) {
  if (!(response instanceof Response) || !response.body) throw new Error("readiness_response_invalid");
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > BODY_LIMIT) throw new Error("readiness_response_invalid");
      chunks.push(Buffer.from(next.value));
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (!response.ok) throw new Error("readiness_response_invalid");
  let value;
  try { value = JSON.parse(Buffer.concat(chunks, total).toString("utf8")); } catch { throw new Error("readiness_response_invalid"); }
  return value;
}

async function getJson(url, headers, fetchImpl) {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), TIMEOUT_MS);
  deadline.unref?.();
  try {
    return await boundedJson(await fetchImpl(new Request(url, { method: "GET", redirect: "manual", headers, signal: controller.signal })));
  } finally {
    clearTimeout(deadline);
  }
}

function cloudflareResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.success !== true || !Array.isArray(value.errors) || value.errors.length !== 0 || !("result" in value)) throw new Error("readiness_response_invalid");
  return value;
}

function publicAddress(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.address !== "string" || (value.family !== 4 && value.family !== 6) || isIP(value.address) !== value.family) return false;
  if (value.family === 6) {
    const lower = value.address.toLowerCase();
    return lower !== "::" && lower !== "::1" && !lower.startsWith("fc") && !lower.startsWith("fd") && !lower.startsWith("fe8") && !lower.startsWith("fe9") && !lower.startsWith("fea") && !lower.startsWith("feb");
  }
  const [first, second] = value.address.split(".").map(Number);
  return first !== 0 && first !== 10 && first !== 127 && !(first === 169 && second === 254) && !(first === 172 && second >= 16 && second <= 31) && !(first === 192 && second === 168) && !(first >= 224);
}

function apiUrl(pathname, search = undefined) {
  const selected = new URL(`${API_BASE_URL}${pathname}`);
  if (search) for (const [key, value] of Object.entries(search)) selected.searchParams.set(key, value);
  return selected;
}

export async function verifyReadiness(rawConfig, dependencies = {}) {
  const config = Object.freeze({ ...rawConfig });
  const fetchImpl = dependencies.fetch ?? globalThis.fetch;
  const resolveDns = dependencies.resolveDns ?? ((selected) => lookup(selected, { all: true, verbatim: true }));
  if (typeof fetchImpl !== "function" || typeof resolveDns !== "function") return UNAVAILABLE;
  const headers = Object.freeze({ authorization: `Bearer ${config.apiToken}`, accept: "application/json", "user-agent": "Celebix-Custom-Domain-Readiness/1" });
  const api = async (pathname, search) => cloudflareResult(await getJson(apiUrl(pathname, search), headers, fetchImpl));

  const zone = async () => {
    try {
      const envelope = await api(`/zones/${config.zoneId}`);
      return envelope.result?.id === config.zoneId && envelope.result?.status === "active" ? "active" : "inactive";
    } catch { return "unavailable"; }
  };
  const quota = async () => {
    try {
      const envelope = await api(`/zones/${config.zoneId}/custom_hostnames`, { page: "1", per_page: "5" });
      const count = envelope.result_info?.total_count;
      if (!Array.isArray(envelope.result) || !Number.isSafeInteger(count) || count < 0) return "unavailable";
      return count < config.customHostnameLimit ? "ready" : "exhausted";
    } catch { return "unavailable"; }
  };
  const fallback = async () => {
    try {
      const result = (await api(`/zones/${config.zoneId}/custom_hostnames/fallback_origin`)).result;
      if (result?.origin !== config.fallbackOrigin) return "mismatch";
      return result?.status === "active" ? "active" : "inactive";
    } catch { return "unavailable"; }
  };
  const target = async () => {
    try {
      const [envelope, addresses] = await Promise.all([
        api(`/zones/${config.zoneId}/dns_records`, { type: "CNAME", name: config.cnameTarget, per_page: "5" }),
        resolveDns(config.cnameTarget),
      ]);
      if (!Array.isArray(envelope.result) || !Array.isArray(addresses) || addresses.length < 1 || !addresses.every(publicAddress)) return "mismatch";
      const matches = envelope.result.filter((record) => record && typeof record === "object" && !Array.isArray(record) && record.type === "CNAME" && record.name === config.cnameTarget && record.content === config.fallbackOrigin && record.proxied === true);
      return matches.length === 1 && envelope.result.length === 1 ? "ready" : "mismatch";
    } catch { return "unavailable"; }
  };
  const tunnel = async () => {
    try {
      const [tunnelEnvelope, connectionsEnvelope] = await Promise.all([
        api(`/accounts/${config.accountId}/cfd_tunnel/${config.tunnelId}`),
        api(`/accounts/${config.accountId}/cfd_tunnel/${config.tunnelId}/connections`),
      ]);
      const status = tunnelEnvelope.result?.id === config.tunnelId ? tunnelEnvelope.result?.status : undefined;
      if (!Array.isArray(connectionsEnvelope.result) || !["healthy", "degraded", "down", "inactive"].includes(status)) return "unavailable";
      const activeReplicas = new Set(connectionsEnvelope.result.filter((connection) => connection && typeof connection === "object" && !Array.isArray(connection) && UUID.test(connection.id) && connection.is_pending_reconnect === false).map((connection) => connection.id)).size;
      if (status === "down" || status === "inactive") return status;
      return status === "healthy" && activeReplicas >= 2 ? "healthy" : "degraded";
    } catch { return "unavailable"; }
  };
  const storefront = async () => {
    try {
      const payload = await getJson(new URL(`https://${config.storefrontProbeHostname}/api/health`), Object.freeze({ accept: "application/json", "user-agent": "Celebix-Custom-Domain-Readiness/1" }), fetchImpl);
      return payload
        && typeof payload === "object"
        && !Array.isArray(payload)
        && Object.keys(payload).sort().join(",") === "hostname,schemaVersion,status,storeId"
        && payload.schemaVersion === 1
        && payload.status === "ok"
        && payload.storeId === config.storefrontProbeStoreId
        && payload.hostname === config.storefrontProbeHostname
        ? "healthy"
        : "unhealthy";
    } catch { return "unhealthy"; }
  };

  const [zoneStatus, quotaStatus, fallbackStatus, targetStatus, tunnelStatus, storefrontStatus] = await Promise.all([zone(), quota(), fallback(), target(), tunnel(), storefront()]);
  return Object.freeze({ zone: zoneStatus, customHostnameQuota: quotaStatus, fallbackOrigin: fallbackStatus, cnameTarget: targetStatus, tunnel: tunnelStatus, storefront: storefrontStatus });
}

function ready(result) {
  return result.zone === "active" && result.customHostnameQuota === "ready" && result.fallbackOrigin === "active" && result.cnameTarget === "ready" && result.tunnel === "healthy" && result.storefront === "healthy";
}

async function main() {
  let result = UNAVAILABLE;
  try { result = await verifyReadiness(parseReadinessConfig(process.env)); } catch { result = UNAVAILABLE; }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!ready(result)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
