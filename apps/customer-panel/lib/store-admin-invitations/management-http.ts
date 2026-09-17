import { normalizeAdminRequestHostname } from "@celebix/saas-data";
import { parseStoreAdminInvitationActionIntent, parseStoreAdminInvitationSendIntent } from "@celebix/saas-contracts";
import { invitationManagementResponseStatus, parseInvitationManagementResponse, type InvitationManagementRequest, type InvitationManagementResponse } from "../../../../packages/saas-contracts/src/store-admin-invitation-internal-protocol.ts";
import { readOrderPanelSessionCookie } from "../order-http/request-input.ts";
import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";
export interface InvitationManagementRuntime { access: ServerPanelAccessRuntime; manage(input: InvitationManagementRequest): Promise<InvitationManagementResponse> }
type Action = InvitationManagementRequest["action"];
function json(body: unknown, status: number) { return Response.json(body, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" } }); }
function error(code: string, status: number) { return json({ code }, status); }
async function readBody(request: Request) {
  if (request.headers.get("content-type") !== "application/json" || request.headers.has("transfer-encoding") || !request.body) throw Error("body");
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^(0|[1-9]\d*)$/.test(declared) || Number(declared) > 16384)) throw Error("body");
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let total = 0;
  try { for (;;) { const next = await reader.read(); if (next.done) break; total += next.value.byteLength; if (total > 16384) throw Error("body"); chunks.push(next.value); } }
  catch { void reader.cancel().catch(() => undefined); throw Error("body"); }
  const bytes = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
export function createInvitationManagementHttp(d: { resolveRuntime(): Promise<InvitationManagementRuntime | null>; now(): Date; requestId(): string }) {
  return async (request: Request, action: Action): Promise<Response> => {
    const method = action === "list" ? "GET" : "POST", path = `/api/store-admin-invitations${action === "list" ? "" : `/${action}`}`;
    if (request.method !== method) return error("method_not_allowed", 405);
    const url = new URL(request.url);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== path || url.search || url.hash) return error("invalid_input", 400);
    for (const [name] of request.headers) if (name === "authorization" || name.startsWith("x-celebix") || ["x-store-id", "x-tenant-id", "x-principal-id", "x-membership-id", "x-plan-id", "x-database-url"].includes(name)) return error("invalid_input", 400);
    const cookie = readOrderPanelSessionCookie(request); if (cookie.kind !== "present") return error("unauthenticated", 401);
    let hostname: string;
    try { hostname = normalizeAdminRequestHostname(request.headers.get("host")); } catch { return error("invalid_input", 400); }
    try {
      const runtime = await d.resolveRuntime(); if (!runtime || !runtime.access.panelOrigin) return error("unavailable", 503);
      if (hostname === new URL(runtime.access.panelOrigin).hostname) return error("membership_denied", 403);
      // Exact Origin plus a non-simple custom header requires a same-origin browser
      // request. No CORS allowance exists; forwarded authority headers are ignored.
      if (action !== "list" && (request.headers.get("origin") !== `https://${hostname}` || request.headers.get("x-invitation-csrf") !== "1")) return error("origin_denied", 403);
      const now = d.now(), requestId = d.requestId();
      if (!(now instanceof Date) || !Number.isFinite(+now)) return error("unavailable", 503);
      const access = await runtime.access.resolveCredential({ hostname, credential: cookie.credential, requestId, now });
      if (access.kind !== "authenticated") return error(access.kind === "unavailable" ? "unavailable" : "membership_denied", access.kind === "unavailable" ? 503 : 403);
      if (access.tenantContext.membership.role !== "store_owner") return error("membership_denied", 403);
      const base = { schemaVersion: 7 as const, operation: "invitation_management" as const, sessionCredential: cookie.credential, requestHostname: hostname };
      let input: InvitationManagementRequest;
      try {
        if (action === "list") input = { ...base, action };
        else {
          const raw = await readBody(request);
          input = action === "send" ? { ...base, action, intent: parseStoreAdminInvitationSendIntent(raw) } : { ...base, action, intent: parseStoreAdminInvitationActionIntent(raw) };
          const operation = request.headers.get("idempotency-key"); if (operation !== null && operation !== input.intent.operationId) return error("invalid_input", 400);
        }
      } catch { return error("invalid_input", 400); }
      const raw = await runtime.manage(input), status = invitationManagementResponseStatus(raw);
      const response = parseInvitationManagementResponse(JSON.stringify(raw), status, action);
      return json(response, response.kind === "invitation_management_rejected" && response.code === "membership_denied" ? 403 : status);
    } catch { return error("unavailable", 503); }
  };
}
