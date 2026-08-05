import type {
  CloudflareCustomHostnameErrorCode,
  CloudflareForSaaSConfig,
  CustomHostnameProvider,
  ProviderHostnameSnapshot,
  ProviderHostnameStatus,
  ProviderValidationInstruction,
} from "./types.ts";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const SAFE_ID = /^[A-Za-z0-9._-]{1,128}$/u;
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const SNAPSHOT_KEYS = Object.freeze(new Set([
  "id", "hostname", "status", "ssl", "ownership_verification", "ownership_verification_http",
  "verification_errors", "created_at", "custom_metadata", "custom_origin_server", "custom_origin_sni",
]));
const SSL_KEYS = Object.freeze(new Set([
  "id", "status", "method", "type", "validation_records", "settings", "wildcard", "bundle_method",
  "certificate_authority", "custom_certificate", "custom_csr_id", "custom_key", "dcv_delegation_records",
  "expires_on", "hosts", "issuer", "serial_number", "signature", "uploaded_on", "validation_errors",
]));
const RECORD_KEYS = Object.freeze(new Set([
  "status", "txt_name", "txt_value", "http_url", "http_body", "cname", "cname_target", "emails",
]));

export class CloudflareCustomHostnameError extends Error {
  readonly code: CloudflareCustomHostnameErrorCode;
  readonly retryable: boolean;
  constructor(code: CloudflareCustomHostnameErrorCode, retryable = false) {
    super(`cloudflare_custom_hostname_${code}`);
    this.name = "CloudflareCustomHostnameError";
    this.code = code;
    this.retryable = retryable;
  }
}

function failure(code: CloudflareCustomHostnameErrorCode, retryable = false): CloudflareCustomHostnameError {
  return new CloudflareCustomHostnameError(code, retryable);
}

function ordinary(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw failure("malformed_response");
  }
  return value as Record<string, unknown>;
}

function allowed(value: Record<string, unknown>, keys: ReadonlySet<string>): void {
  if (Object.keys(value).some((key) => !keys.has(key))) throw failure("malformed_response");
}

function safeText(value: unknown, max: number): string {
  if (typeof value !== "string" || value.length < 1 || value.length > max || value !== value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw failure("malformed_response");
  }
  return value;
}

function safeIdentifier(value: unknown): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) throw failure("malformed_response");
  return value;
}

function exactHostname(value: unknown, code: "invalid_input" | "malformed_response" = "malformed_response"): string {
  if (typeof value !== "string" || value.length > 253 || !HOSTNAME.test(value)) throw failure(code);
  return value;
}

function providerStatus(value: unknown, ssl: boolean): ProviderHostnameStatus {
  if (value === "active" || value === "active_redeploying") return "active";
  if (value === "deleted") return "deleted";
  const pending = ssl
    ? ["initializing", "pending", "pending_validation", "pending_issuance", "pending_deployment", "pending_deletion", "pending_expiration", "pending_cleanup", "staging_deployment", "staging_active", "deactivating", "backup_issued", "holding_deployment"]
    : ["pending", "pending_deletion", "pending_migration", "pending_provisioned", "test_pending", "provisioned"];
  if (pending.includes(String(value))) return "pending";
  const failed = ssl
    ? ["failed", "expired", "inactive", "initializing_timed_out", "validation_timed_out", "issuance_timed_out", "deployment_timed_out", "deletion_timed_out"]
    : ["blocked", "moved", "pending_blocked", "test_blocked", "test_failed"];
  if (failed.includes(String(value))) return "failed";
  throw failure("malformed_response");
}

function ownership(value: unknown): ProviderValidationInstruction | null {
  if (value === undefined || value === null) return null;
  const selected = ordinary(value);
  if (Object.keys(selected).sort().join(",") !== "name,type,value") throw failure("malformed_response");
  if (selected.type !== "txt") throw failure("malformed_response");
  return Object.freeze({ type: "txt", name: safeText(selected.name, 253), value: safeText(selected.value, 1024) });
}

function certificateRecord(value: unknown): ProviderValidationInstruction {
  const selected = ordinary(value);
  allowed(selected, RECORD_KEYS);
  const txtName = selected.txt_name;
  const txtValue = selected.txt_value;
  if (txtName !== undefined || txtValue !== undefined) {
    return Object.freeze({ type: "txt", name: safeText(txtName, 253), value: safeText(txtValue, 1024) });
  }
  const httpUrl = selected.http_url;
  const httpBody = selected.http_body;
  if (httpUrl !== undefined || httpBody !== undefined) {
    const url = safeText(httpUrl, 2048);
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw failure("malformed_response"); }
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.username || parsed.password || parsed.hash) throw failure("malformed_response");
    return Object.freeze({ type: "http", name: url, value: safeText(httpBody, 1024) });
  }
  const cname = selected.cname;
  const cnameTarget = selected.cname_target;
  if (cname !== undefined || cnameTarget !== undefined) {
    return Object.freeze({ type: "cname", name: safeText(cname, 253), value: safeText(cnameTarget, 253) });
  }
  throw failure("malformed_response");
}

function snapshot(value: unknown): ProviderHostnameSnapshot {
  const selected = ordinary(value);
  allowed(selected, SNAPSHOT_KEYS);
  const ssl = ordinary(selected.ssl);
  allowed(ssl, SSL_KEYS);
  const validation = ssl.validation_records === undefined ? [] : ssl.validation_records;
  if (!Array.isArray(validation) || validation.length > 4) throw failure("malformed_response");
  return Object.freeze({
    providerHostnameId: safeIdentifier(selected.id),
    hostname: exactHostname(selected.hostname),
    hostnameStatus: providerStatus(selected.status, false),
    sslStatus: providerStatus(ssl.status, true),
    ownershipValidation: ownership(selected.ownership_verification),
    certificateValidation: Object.freeze(validation.map(certificateRecord)),
  });
}

function config(value: CloudflareForSaaSConfig): Readonly<CloudflareForSaaSConfig & { apiBaseUrl: string }> {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).sort().join(",") !== "apiBaseUrl,apiToken,minimumTlsVersion,timeoutMs,zoneId") {
    throw failure("invalid_input");
  }
  if (!SAFE_ID.test(value.zoneId) || typeof value.apiToken !== "string" || value.apiToken.length < 8 || value.apiToken.length > 2048 || /\s/u.test(value.apiToken)) {
    throw failure("invalid_input");
  }
  let base: URL;
  try { base = new URL(value.apiBaseUrl); } catch { throw failure("invalid_input"); }
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || (base.pathname !== "/client/v4" && base.pathname !== "/client/v4/")) {
    throw failure("invalid_input");
  }
  if (value.minimumTlsVersion !== "1.2" || !Number.isSafeInteger(value.timeoutMs) || value.timeoutMs < 100 || value.timeoutMs > 30_000) {
    throw failure("invalid_input");
  }
  return Object.freeze({ ...value, apiBaseUrl: base.href.replace(/\/$/u, "") });
}

function httpError(status: number): CloudflareCustomHostnameError {
  if (status === 404) return failure("not_found");
  if (status === 409) return failure("duplicate");
  if (status === 429) return failure("rate_limited", true);
  if (status >= 500) return failure("unavailable", true);
  if (status >= 400) return failure("invalid_input");
  return failure("malformed_response");
}

async function envelope(response: Response): Promise<unknown> {
  if (!response.ok) throw httpError(response.status);
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") throw failure("malformed_response");
  let raw: string;
  try { raw = await response.text(); } catch { throw failure("unavailable", true); }
  if (raw.length < 2 || raw.length > 1_048_576) throw failure("malformed_response");
  let decoded: unknown;
  try { decoded = JSON.parse(raw); } catch { throw failure("malformed_response"); }
  const root = ordinary(decoded);
  const rootKeys = Object.keys(root).sort().join(",");
  if (rootKeys !== "errors,messages,result,success" && rootKeys !== "errors,messages,result,result_info,success") throw failure("malformed_response");
  if (root.success !== true || !Array.isArray(root.errors) || root.errors.length !== 0 || !Array.isArray(root.messages)) throw failure("malformed_response");
  return root.result;
}

export function createCloudflareCustomHostnameProvider(
  rawConfig: CloudflareForSaaSConfig,
  fetchImpl: FetchLike = globalThis.fetch,
): CustomHostnameProvider {
  const selected = config(rawConfig);
  if (typeof fetchImpl !== "function") throw failure("invalid_input");
  const base = `${selected.apiBaseUrl}/zones/${encodeURIComponent(selected.zoneId)}/custom_hostnames`;

  async function request(path: string, init: RequestInit): Promise<unknown> {
    try {
      const response = await fetchImpl(`${base}${path}`, {
        ...init,
        headers: Object.freeze({
          accept: "application/json",
          authorization: `Bearer ${selected.apiToken}`,
          "content-type": "application/json",
        }),
        signal: AbortSignal.timeout(selected.timeoutMs),
      });
      return await envelope(response);
    } catch (caught) {
      if (caught instanceof CloudflareCustomHostnameError) throw caught;
      throw failure("unavailable", true);
    }
  }

  return Object.freeze({
    async create(rawHostname: string) {
      const hostname = exactHostname(rawHostname, "invalid_input");
      const result = await request("", {
        method: "POST",
        body: JSON.stringify({
          hostname,
          ssl: { method: "http", type: "dv", settings: { min_tls_version: selected.minimumTlsVersion } },
        }),
      });
      const parsed = snapshot(result);
      if (parsed.hostname !== hostname) throw failure("malformed_response");
      return parsed;
    },
    async get(rawProviderHostnameId: string) {
      if (!SAFE_ID.test(rawProviderHostnameId)) throw failure("invalid_input");
      return snapshot(await request(`/${encodeURIComponent(rawProviderHostnameId)}`, { method: "GET" }));
    },
    async find(rawHostname: string) {
      const hostname = exactHostname(rawHostname, "invalid_input");
      const result = await request(`?hostname=${encodeURIComponent(hostname)}&page=1&per_page=2`, { method: "GET" });
      if (!Array.isArray(result) || result.length > 2) throw failure("malformed_response");
      const matches = result.map(snapshot).filter((item) => item.hostname === hostname);
      if (matches.length > 1) throw failure("malformed_response");
      return matches[0] ?? null;
    },
    async remove(rawProviderHostnameId: string) {
      if (!SAFE_ID.test(rawProviderHostnameId)) throw failure("invalid_input");
      const result = ordinary(await request(`/${encodeURIComponent(rawProviderHostnameId)}`, { method: "DELETE" }));
      if (Object.keys(result).join(",") !== "id" || result.id !== rawProviderHostnameId) throw failure("malformed_response");
      return Object.freeze({ deleted: true as const });
    },
  });
}
