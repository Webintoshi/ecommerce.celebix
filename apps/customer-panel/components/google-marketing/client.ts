import {
  parseGoogleMarketingConnection,
  parseGoogleMarketingService,
  type GoogleMarketingConnection,
  type GoogleMarketingOverview,
  type GoogleMarketingResourceOption,
  type GoogleMarketingResources,
  type GoogleMarketingSelection,
  type GoogleMarketingService,
} from "@celebix/saas-contracts";

export type ApplyInput = Readonly<{ service: GoogleMarketingService; expectedVersion: number; selection: GoogleMarketingSelection }>;
export type DisconnectInput = Readonly<{ service: GoogleMarketingService; expectedVersion: number }>;
const SAFE_CODES = new Set(["invalid_input", "membership_denied", "store_inactive", "durable_authority_invalid", "feature_not_enabled", "oauth_unconfigured", "crypto_unavailable", "oauth_denied", "oauth_state_invalid", "needs_reconnect", "provider_denied", "provider_timeout", "provider_unavailable", "provider_limit", "ads_project_unapproved", "resource_denied", "wrong_domain", "unsafe_container", "live_version_conflict", "version_conflict", "operation_mismatch", "operation_busy", "incremental_authorization_required", "verification_pending", "unavailable", "commit_unknown"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class GoogleMarketingApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status = 0) { super(SAFE_CODES.has(code) ? code : "unavailable"); this.name = "GoogleMarketingApiError"; this.code = this.message; this.status = status; }
}
function invalid(): never { throw new GoogleMarketingApiError("unavailable"); }
function object(value: unknown, keys: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const v = value as Record<string, unknown>;
  if (keys.some(key => !Object.hasOwn(v, key)) || Object.keys(v).some(key => !keys.includes(key) && !optional.includes(key))) return invalid();
  return v;
}
function text(value: unknown, max: number): string {
  if (typeof value !== "string" || !value || value.length > max || /[\x00-\x1f\x7f<>]/u.test(value)) return invalid();
  return value;
}
function option(value: unknown): GoogleMarketingResourceOption {
  const v = object(value, ["id", "name"], ["parentId", "tagId", "conversionLabel"]);
  const tagId = v.tagId === undefined ? undefined : text(v.tagId, 40);
  const conversionLabel = v.conversionLabel === undefined ? undefined : text(v.conversionLabel, 128);
  if ((tagId && !/^(GTM-[A-Z0-9]{4,24}|AW-[0-9]{4,20})$/.test(tagId)) || (conversionLabel && !/^[A-Za-z0-9_-]{1,128}$/.test(conversionLabel))) return invalid();
  return { id: text(v.id, 512), name: text(v.name, 160), ...(v.parentId === undefined ? {} : { parentId: text(v.parentId, 160) }), ...(tagId ? { tagId } : {}), ...(conversionLabel ? { conversionLabel } : {}) };
}
function array(value: unknown): unknown[] { if (!Array.isArray(value) || value.length > 1000) return invalid(); return value; }
async function readJson(response: Response): Promise<unknown> {
  if (!response.body) return invalid();
  const reader = response.body.getReader();
  let result = "", bytes = 0;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 262144) { await reader.cancel(); return invalid(); }
      result += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(result + decoder.decode());
  } catch { return invalid(); } finally { reader.releaseLock(); }
}

export function createGoogleMarketingClient(fetcher: typeof fetch = fetch) {
  async function request(path: string, init: RequestInit = {}): Promise<unknown> {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), 30000);
    try {
      const response = await fetcher(`/api/marketing/google${path}`, { ...init, credentials: "same-origin", cache: "no-store", signal: timeout.signal });
      const payload = await readJson(response);
      if (!response.ok) {
        const v = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
        throw new GoogleMarketingApiError(typeof v.code === "string" ? v.code : "unavailable", response.status);
      }
      return payload;
    } catch (error) { if (error instanceof GoogleMarketingApiError) throw error; throw new GoogleMarketingApiError("unavailable"); }
    finally { clearTimeout(timer); }
  }
  function write(path: string, body: unknown, operationId: string): Promise<unknown> {
    if (!UUID.test(operationId)) return Promise.reject(new GoogleMarketingApiError("invalid_input"));
    return request(path, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": operationId }, body: JSON.stringify(body) });
  }
  return Object.freeze({
    async overview(): Promise<GoogleMarketingOverview> {
      try {
        const v = object(await request("", { method: "GET" }), ["storeDomain", "oauthConfigured", "connections"]);
        if (typeof v.storeDomain !== "string" || v.storeDomain.length > 253 || (v.storeDomain && !/^[a-z0-9.-]+$/i.test(v.storeDomain)) || typeof v.oauthConfigured !== "boolean") return invalid();
        const connections = array(v.connections).map(parseGoogleMarketingConnection);
        if (connections.length > 3 || new Set(connections.map(item => item.service)).size !== connections.length) return invalid();
        return { storeDomain: v.storeDomain, oauthConfigured: v.oauthConfigured, connections };
      } catch (error) { if (error instanceof GoogleMarketingApiError) throw error; return invalid(); }
    },
    async connect(service: GoogleMarketingService, operationId: string): Promise<{ authorizationUrl: string }> {
      const v = object(await write("/connect", { service: parseGoogleMarketingService(service) }, operationId), ["authorizationUrl"]);
      const raw = text(v.authorizationUrl, 16000);
      let url: URL;
      try { url = new URL(raw); } catch { return invalid(); }
      if (url.origin !== "https://accounts.google.com" || url.pathname !== "/o/oauth2/v2/auth" || url.username || url.password || url.hash) return invalid();
      return { authorizationUrl: url.href };
    },
    async resources(service: GoogleMarketingService, accountId?: string): Promise<GoogleMarketingResources> {
      const query = new URLSearchParams({ service: parseGoogleMarketingService(service) });
      if (accountId) query.set("accountId", accountId);
      const v = object(await request(`/resources?${query}`, { method: "GET" }), ["accounts", "resources"], ["nextPageToken"]);
      return { accounts: array(v.accounts).map(option), resources: array(v.resources).map(option), ...(v.nextPageToken === undefined ? {} : { nextPageToken: text(v.nextPageToken, 2000) }) };
    },
    async apply(input: ApplyInput, operationId: string): Promise<GoogleMarketingConnection> {
      try { return parseGoogleMarketingConnection(await write("/apply", input, operationId)); } catch (error) { if (error instanceof GoogleMarketingApiError) throw error; return invalid(); }
    },
    async disconnect(input: DisconnectInput, operationId: string): Promise<GoogleMarketingConnection> {
      try { return parseGoogleMarketingConnection(await write("/disconnect", input, operationId)); } catch (error) { if (error instanceof GoogleMarketingApiError) throw error; return invalid(); }
    },
  });
}
export type GoogleMarketingClient = ReturnType<typeof createGoogleMarketingClient>;
export const googleMarketingClient = createGoogleMarketingClient();
