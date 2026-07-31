import "server-only";

import { parseCanonicalAdminHostname } from "@celebix/saas-data";

import { createPanelLogoutStateCodec } from "./panel-logout-state.ts";
import { serializePersistentPanelSessionDeletionCookie } from "./panel-session-completion/cookie.ts";
import { readPersistentPanelSessionCookie } from "./server-panel-session-controls/request-input.ts";

const HOSTNAME = /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

type LogoutRuntime = Readonly<{
  access: Readonly<{
    panelOrigin: string;
    revokeCredential(input: Readonly<{ credential: string; reason: "logout"; now: Date }>): Promise<Readonly<{ kind: string }>>;
  }>;
  adminDomains: Readonly<{
    resolvePublicBrand(input: Readonly<{ hostname: string; now: Date }>): Promise<Readonly<{ kind: string; brand?: Readonly<{ canonicalAdminOrigin: string }> }>>;
  }>;
  logout: Readonly<{ endSessionEndpoint: string; clientId: string; stateKey: Uint8Array }>;
}>;

type Dependencies = Readonly<{
  resolveRuntime(): Promise<LogoutRuntime | unknown>;
  now(): Date;
  randomBytes(size: number): Uint8Array;
  maximumBodyBytes: number;
}>;

function json(code: string, status: number, headers?: HeadersInit): Response {
  return Response.json({ code }, { status, headers: {
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    ...(headers ?? {}),
  } });
}

function deletionHeader(): HeadersInit {
  return { "set-cookie": serializePersistentPanelSessionDeletionCookie() };
}

function validHostname(value: unknown): string | null {
  return typeof value === "string" && value.length >= 3 && value.length <= 253 && value === value.trim() &&
    value === value.toLowerCase() && HOSTNAME.test(value) ? value : null;
}

function publicRequestAuthority(request: Request): Readonly<{ url: URL; hostname: string; origin: string }> | null {
  let url: URL;
  try { url = new URL(request.url); } catch { return null; }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
  const hostname = validHostname(request.headers.get("host"));
  return hostname ? Object.freeze({ url, hostname, origin: `https://${hostname}` }) : null;
}

function canonicalAdminOrigin(value: unknown): Readonly<{ origin: string; hostname: string }> | null {
  if (typeof value !== "string") return null;
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash || url.origin !== value) return null;
  try { parseCanonicalAdminHostname(url.hostname, "production"); }
  catch {
    try { parseCanonicalAdminHostname(url.hostname, "staging"); }
    catch { return null; }
  }
  return Object.freeze({ origin: value, hostname: url.hostname });
}

function validNow(value: unknown): Date | null {
  return value instanceof Date && Number.isFinite(value.getTime()) ? new Date(value) : null;
}

function exactEndSession(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2_048 || value !== value.trim()) return null;
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  return url.protocol === "https:" && !url.username && !url.password && !url.port &&
    url.pathname.endsWith("/oidc/session/end") && !url.search && !url.hash && url.toString() === value
    ? value
    : null;
}

async function emptyForm(request: Request, maximumBytes: number): Promise<boolean> {
  if (request.headers.get("content-type") !== "application/x-www-form-urlencoded" || request.headers.has("transfer-encoding")) return false;
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximumBytes)) return false;
  if (request.body === null) return true;
  const reader = request.body.getReader();
  let total = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) return total === 0;
      total += next.value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        return false;
      }
    }
  } catch { return false; }
}

function providerLogoutUrl(runtime: LogoutRuntime, state: string): string | null {
  const endpoint = exactEndSession(runtime.logout.endSessionEndpoint);
  const clientId = runtime.logout.clientId;
  if (!endpoint || typeof clientId !== "string" || clientId.length < 1 || clientId.length > 256 || clientId !== clientId.trim() || /[\u0000-\u001f\u007f]/.test(clientId)) return null;
  const callback = `${runtime.access.panelOrigin}/auth/logout/callback`;
  let callbackUrl: URL;
  try { callbackUrl = new URL(callback); } catch { return null; }
  if (callbackUrl.protocol !== "https:" || callbackUrl.origin !== runtime.access.panelOrigin || callbackUrl.pathname !== "/auth/logout/callback" || callbackUrl.search || callbackUrl.hash) return null;
  const url = new URL(endpoint);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("post_logout_redirect_uri", callback);
  url.searchParams.set("state", state);
  return url.toString();
}

export function createTenantPanelLogoutHandler(dependencies: Dependencies) {
  if (!dependencies || typeof dependencies.resolveRuntime !== "function" || typeof dependencies.now !== "function" || typeof dependencies.randomBytes !== "function" || !Number.isSafeInteger(dependencies.maximumBodyBytes) || dependencies.maximumBodyBytes < 1 || dependencies.maximumBodyBytes > 256) {
    throw new Error("tenant_panel_logout_handler_invalid");
  }
  return async function handle(request: Request): Promise<Response> {
    const authority = publicRequestAuthority(request);
    if (request.method !== "POST") return json("method_not_allowed", 405, { allow: "POST" });
    if (!authority || authority.url.pathname !== "/api/session/logout" || authority.url.search || authority.url.hash) return json("panel_logout_request_invalid", 400);
    if (request.headers.get("origin") !== authority.origin) return json("panel_origin_required", 403);
    if (!(await emptyForm(request, dependencies.maximumBodyBytes))) return json("panel_logout_request_invalid", 400);

    let runtime: LogoutRuntime;
    let now: Date;
    let destinationOrigin: string;
    try {
      const resolved = await dependencies.resolveRuntime();
      if (!resolved || typeof resolved !== "object") throw new Error("unavailable");
      runtime = resolved as LogoutRuntime;
      now = dependencies.now();
      if (!validNow(now)) throw new Error("unavailable");
      const brand = await runtime.adminDomains.resolvePublicBrand({ hostname: authority.hostname, now });
      const canonical = brand.kind === "resolved" ? canonicalAdminOrigin(brand.brand?.canonicalAdminOrigin) : null;
      if (!canonical) throw new Error("unavailable");
      destinationOrigin = canonical.origin;
    } catch { return json("panel_session_retry_required", 503); }

    const cookie = readPersistentPanelSessionCookie(request);
    if (cookie.kind === "present") {
      let revoked: Readonly<{ kind: string }>;
      try { revoked = await runtime.access.revokeCredential({ credential: cookie.credential, reason: "logout", now }); }
      catch { return json("panel_session_retry_required", 503); }
      if (revoked.kind !== "revoked" && revoked.kind !== "unauthenticated") {
        if (revoked.kind === "durable_authority_invalid") return json("durable_authority_invalid", 409);
        return json("panel_session_retry_required", 503);
      }
    }

    try {
      const state = createPanelLogoutStateCodec(runtime.logout.stateKey).issue({ destinationOrigin, now, randomBytes: dependencies.randomBytes });
      const location = providerLogoutUrl(runtime, state);
      if (!location) throw new Error("unavailable");
      return new Response(null, { status: 303, headers: {
        location,
        ...deletionHeader(),
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
      } });
    } catch { return json("panel_logout_provider_unavailable", 503, cookie.kind === "invalid" ? deletionHeader() : undefined); }
  };
}

export function createTenantPanelLogoutCallbackHandler(dependencies: Readonly<{
  resolveRuntime(): Promise<LogoutRuntime | unknown>;
  now(): Date;
}>) {
  if (!dependencies || typeof dependencies.resolveRuntime !== "function" || typeof dependencies.now !== "function") throw new Error("tenant_panel_logout_callback_handler_invalid");
  return async function handle(request: Request): Promise<Response> {
    if (request.method !== "GET") return json("method_not_allowed", 405, { allow: "GET" });
    let runtime: LogoutRuntime;
    let now: Date;
    try {
      runtime = await dependencies.resolveRuntime() as LogoutRuntime;
      const authority = publicRequestAuthority(request);
      now = dependencies.now();
      if (!runtime || !authority || !validNow(now) || authority.origin !== runtime.access.panelOrigin || authority.url.pathname !== "/auth/logout/callback" || authority.url.hash || authority.url.searchParams.size !== 1 || authority.url.searchParams.getAll("state").length !== 1) throw new Error("invalid");
      const verified = createPanelLogoutStateCodec(runtime.logout.stateKey).verify({ state: authority.url.searchParams.get("state") ?? "", now });
      const destination = canonicalAdminOrigin(verified.destinationOrigin);
      if (!destination) throw new Error("invalid");
      const brand = await runtime.adminDomains.resolvePublicBrand({ hostname: destination.hostname, now });
      if (brand.kind !== "resolved" || brand.brand?.canonicalAdminOrigin !== destination.origin) throw new Error("invalid");
      return new Response(null, { status: 303, headers: {
        location: `${destination.origin}/login`,
        ...deletionHeader(),
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
      } });
    } catch { return json("panel_logout_callback_invalid", 400, deletionHeader()); }
  };
}
