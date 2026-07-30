import { parseCanonicalAdminHostname } from "@celebix/saas-data";

import { serializePersistentPanelSessionCookie } from "./panel-session-completion/cookie.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const KEY_ID = /^[A-Za-z0-9._-]{1,64}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const MAXIMUM_SESSION_MS = 8 * 60 * 60_000;

function json(code: string, status: 400 | 409 | 503): Response {
  return Response.json({ code }, { status, headers: {
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  } });
}

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== keys.length || keys.some((key) => !(key in row))) throw new Error("invalid");
  return row;
}

function credential(value: unknown): string {
  if (typeof value !== "string" || value !== value.trim() || !value.startsWith("v1.")) throw new Error("invalid");
  const separator = value.length - 44;
  if (separator <= 3 || value[separator] !== ".") throw new Error("invalid");
  const keyId = value.slice(3, separator);
  const token = value.slice(separator + 1);
  if (!KEY_ID.test(keyId) || keyId.startsWith(".") || keyId.endsWith(".") || keyId.includes("..") || !TOKEN.test(token)) throw new Error("invalid");
  const bytes = Buffer.from(token, "base64url");
  if (bytes.byteLength !== 32 || bytes.toString("base64url") !== token) throw new Error("invalid");
  return value;
}

function timestamp(value: unknown): string {
  const normalized = value instanceof Date ? value.toISOString() : value;
  if (typeof normalized !== "string" || normalized.length > 32 || normalized !== normalized.trim()) throw new Error("invalid");
  const milliseconds = Date.parse(normalized);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== normalized) throw new Error("invalid");
  return normalized;
}

function canonicalRequest(request: Request): { hostname: string; origin: string } {
  if (request.method !== "POST") throw new Error("invalid");
  const url = new URL(request.url);
  if (
    !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/auth/handoff" ||
    url.search || url.hash
  ) throw new Error("invalid");
  const hostname = request.headers.get("host");
  if (
    !hostname || hostname !== hostname.trim() || hostname !== hostname.toLowerCase() || hostname.includes(":") ||
    !/^[a-z0-9.-]{3,253}$/.test(hostname)
  ) throw new Error("invalid");
  try { parseCanonicalAdminHostname(hostname, "production"); }
  catch {
    try { parseCanonicalAdminHostname(hostname, "staging"); }
    catch { throw new Error("invalid"); }
  }
  return { hostname, origin: `https://${hostname}` };
}

async function boundedBody(request: Request, maximumBytes: number): Promise<string> {
  const contentType = request.headers.get("content-type");
  if (contentType !== "application/x-www-form-urlencoded") throw new Error("invalid");
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximumBytes)) throw new Error("invalid");
  if (!request.body) throw new Error("invalid");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximumBytes) throw new Error("invalid");
      chunks.push(value);
    }
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error;
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (!decoded || /[\u0000-\u001f\u007f]/.test(decoded)) throw new Error("invalid");
  return decoded;
}

function sessionResult(value: unknown, trustedNow: Date) {
  if (!value || typeof value !== "object" || !Object.isFrozen(value)) throw new Error("invalid");
  const result = exact(value, ["kind", "sessionCredential", "session"]);
  if (result.kind !== "redeemed" || !result.session || typeof result.session !== "object" || !Object.isFrozen(result.session)) throw new Error("invalid");
  const session = exact(result.session, ["sessionId", "familyId", "principalId", "activeStoreId", "version", "issuedAt", "rotatedAt", "expiresAt"]);
  for (const key of ["sessionId", "familyId", "principalId", "activeStoreId"] as const) {
    if (typeof session[key] !== "string" || !UUID.test(session[key] as string)) throw new Error("invalid");
  }
  if (!Number.isSafeInteger(session.version) || Number(session.version) < 1) throw new Error("invalid");
  const issuedAt = timestamp(session.issuedAt);
  const rotatedAt = timestamp(session.rotatedAt);
  const expiresAt = timestamp(session.expiresAt);
  if (
    Date.parse(issuedAt) > trustedNow.getTime() || Date.parse(issuedAt) > Date.parse(rotatedAt) ||
    Date.parse(rotatedAt) >= Date.parse(expiresAt) || Date.parse(expiresAt) <= trustedNow.getTime() ||
    Date.parse(expiresAt) > Date.parse(issuedAt) + MAXIMUM_SESSION_MS
  ) throw new Error("invalid");
  return { sessionCredential: credential(result.sessionCredential), issuedAt, expiresAt };
}

export function createCrossHostHandoffHttpHandler(options: Readonly<{
  resolveRuntime(): Promise<unknown>;
  clock(): Date;
  maximumBodyBytes: number;
}>) {
  if (
    !options || typeof options.resolveRuntime !== "function" || typeof options.clock !== "function" ||
    !Number.isSafeInteger(options.maximumBodyBytes) || options.maximumBodyBytes < 128 || options.maximumBodyBytes > 4_096
  ) throw new Error("cross_host_handoff_http_invalid");

  return async function handle(request: Request): Promise<Response> {
    let authority: { hostname: string; origin: string };
    try { authority = canonicalRequest(request); }
    catch { return json("admin_handoff_request_invalid", 400); }

    let runtime: Record<string, any>;
    let trustedNow: Date;
    try {
      const resolved = await options.resolveRuntime();
      if (!resolved || typeof resolved !== "object") throw new Error("unavailable");
      runtime = resolved as Record<string, any>;
      trustedNow = options.clock();
      if (!(trustedNow instanceof Date) || !Number.isFinite(trustedNow.getTime())) throw new Error("unavailable");
      if (request.headers.get("origin") !== runtime.access?.panelOrigin) throw new Error("invalid");
      const brand = await runtime.adminDomains?.resolvePublicBrand({ hostname: authority.hostname, now: trustedNow });
      if (!brand || brand.kind !== "resolved" || brand.brand?.canonicalAdminOrigin !== authority.origin) throw new Error("invalid");
    } catch { return json("admin_handoff_unavailable", 503); }

    let handoffCredential: string;
    try {
      const body = await boundedBody(request, options.maximumBodyBytes);
      const fields = new URLSearchParams(body);
      if (fields.size !== 1 || fields.getAll("handoff").length !== 1) throw new Error("invalid");
      handoffCredential = credential(fields.get("handoff"));
    } catch { return json("admin_handoff_request_invalid", 400); }

    try {
      let redeemed = await runtime.handoffs.redeemHandoff({
        credential: handoffCredential,
        destinationHostname: authority.hostname,
        now: trustedNow,
      });
      if (redeemed && typeof redeemed === "object" && redeemed.kind === "commit_unknown") {
        const unknown = exact(redeemed, ["kind", "sessionCredential", "recovery"]);
        redeemed = await runtime.handoffs.recoverRedemption({
          credential: handoffCredential,
          destinationHostname: authority.hostname,
          sessionCredential: credential(unknown.sessionCredential),
          recovery: unknown.recovery,
        });
      }
      const session = sessionResult(redeemed, trustedNow);
      const cookie = serializePersistentPanelSessionCookie({
        credential: session.sessionCredential,
        issuedAt: session.issuedAt,
        expiresAt: session.expiresAt,
        now: trustedNow,
      });
      return new Response(null, { status: 303, headers: {
        location: `${authority.origin}/`,
        "set-cookie": cookie,
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
      } });
    } catch { return json("admin_handoff_rejected", 409); }
  };
}
