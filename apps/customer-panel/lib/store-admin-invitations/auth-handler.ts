import { randomBytes as secureBytes, randomUUID } from "node:crypto";
import { canonicalInvitationOpaque, parseInvitationResponse, invitationResponseStatus, type InvitationResponse } from "../../../../packages/saas-contracts/src/store-admin-invitation-internal-protocol.ts";
import { parsePanelBrowserBindingCookie, serializePanelBrowserBindingCookie } from "../panel-browser-binding/cookie.ts";
import type { TrustedPanelSessionReady } from "../panel-session-completion/completion.ts";
import { INVITATION_CSRF_COOKIE, INVITATION_GRANT_COOKIE, INVITATION_OPERATION_COOKIE, clearInvitationCookies, invitationCookie, invitationOperation, invitationOperationCookieValue, readInvitationCookie, verifyInvitationCsrf } from "./cookie.ts";
import { invitationFragmentClient } from "./client.ts";

type GrantInput = { grantCredential: string; browserBindingCredential: string };
export interface InvitationBrowserTransport {
  startInvitation(input: { token: string; browserBindingCredential: string }): Promise<InvitationResponse>;
  previewInvitation(input: GrantInput): Promise<InvitationResponse>;
  acceptInvitation(input: GrantInput & { operationId: string }): Promise<InvitationResponse>;
}
function invalid(): never { throw new Error("invitation_request_invalid"); }
function escape(value: string) { return value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!); }
const style = `*{box-sizing:border-box}body{margin:0;background:#f1f1ed;color:#202124;font:16px system-ui,sans-serif;line-height:1.6}main{max-width:480px;margin:8vh auto;padding:32px;background:white;border:1px solid #e3e7ef;border-radius:20px}h1{font-size:26px;line-height:1.25}p,dd{overflow-wrap:anywhere}dt{font-weight:600}dd{margin:0 0 16px}button,a{font:inherit}button{width:100%;min-height:48px;border:0;border-radius:10px;background:#202124;color:white;cursor:pointer}button:disabled{background:#64748b;cursor:default}:focus-visible{outline:3px solid #f59e0b;outline-offset:4px}a{color:#202124}@media(max-width:520px){main{margin:24px 16px;padding:24px}}`;
export function createStoreAdminInvitationHandlers(options: {
  panelOrigin: string; acceptanceOrigin: string; environment: "disposable_test" | "approved_staging";
  transport: InvitationBrowserTransport; presentSession(session: TrustedPanelSessionReady): Promise<Response>;
  clock(): Date; randomBytes?(size: number): Uint8Array; randomUuid?(): string;
}) {
  const origin = new URL(options.panelOrigin);
  if (origin.protocol !== "https:" || origin.origin !== options.panelOrigin || origin.port || options.acceptanceOrigin !== options.panelOrigin || !["disposable_test", "approved_staging"].includes(options.environment)) invalid();
  const bytes = options.randomBytes ?? secureBytes, uuid = options.randomUuid ?? randomUUID;
  const random = () => canonicalInvitationOpaque(Buffer.from(bytes(32)).toString("base64url"));
  function now() { const n = options.clock(); if (!(n instanceof Date) || !Number.isFinite(n.getTime())) invalid(); return n; }
  function html(content: string, status = 200, script?: string): Response {
    const nonce = random();
    return new Response(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Mağaza daveti · Celebix</title><style nonce="${nonce}">${style}</style></head><body><main><p>Celebix Panel</p>${content}</main>${script ? `<script nonce="${nonce}">${script}</script>` : ""}</body></html>`, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", "content-security-policy": `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'` } });
  }
  const retry = () => html('<h1>İşlem sonucu henüz doğrulanamadı</h1><p>Aynı daveti tekrar kontrol edin. Yeni bir kabul işlemi başlatılmayacak.</p><a href="/invitations/confirm">Tekrar kontrol et</a>', 503);
  const terminal = () => clearInvitationCookies(html('<h1>Davet kullanılamıyor</h1><p>Davetin süresi dolmuş veya erişiminiz değişmiş olabilir. Daha önce kabul ettiyseniz normal mağaza girişini kullanın.</p>', 409));
  function gate(request: Request, path: string, method: string) {
    const u = new URL(request.url);
    // Follow existing proxy-safe auth reconstruction: configured public origin, exact path,
    // no forwarded-header authority. Mutations additionally prove the exact external Origin.
    if (request.method !== method || !["https:", "http:"].includes(u.protocol) || u.username || u.password || u.pathname !== path || u.search || u.hash) invalid();
    if (method === "POST" && request.headers.get("origin") !== origin.origin) invalid();
    for (const name of request.headers.keys()) if (name.startsWith("x-celebix-") || name === "authorization") invalid();
  }
  function credentials(request: Request): GrantInput {
    const header = request.headers.get("cookie");
    const g = canonicalInvitationOpaque(readInvitationCookie(header, INVITATION_GRANT_COOKIE), "ig1.");
    const p = readInvitationCookie(header, "__Host-celebix_panel_pre_auth");
    return { grantCredential: g, browserBindingCredential: parsePanelBrowserBindingCookie(`__Host-celebix_panel_pre_auth=${p}`) };
  }
  async function body(request: Request, fields: string[], json: boolean) {
    if (request.headers.get("content-type") !== (json ? "application/json" : "application/x-www-form-urlencoded") || !request.body) invalid();
    const length = request.headers.get("content-length");
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > 4096)) invalid();
    const reader = request.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 4096) invalid(); chunks.push(value); } }
    catch (e) { void reader.cancel().catch(() => {}); throw e; }
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
    let row: Record<string, unknown>;
    if (json) { row = JSON.parse(raw); if (!row || typeof row !== "object" || Array.isArray(row) || JSON.stringify(row) !== raw) invalid(); }
    else { const params = new URLSearchParams(raw); if ([...params.keys()].length !== fields.length || fields.some(k => params.getAll(k).length !== 1)) invalid(); row = Object.fromEntries(params); }
    if (Object.keys(row).length !== fields.length || Object.keys(row).some(k => !fields.includes(k)) || fields.some(k => typeof row[k] !== "string")) invalid();
    verifyInvitationCsrf(request.headers.get("cookie"), String(row.csrfToken)); return row as Record<string, string>;
  }
  function verified(result: InvitationResponse, operation: "invitation_start" | "invitation_preview" | "invitation_accept") {
    return parseInvitationResponse(JSON.stringify(result), invitationResponseStatus(result), `${origin.origin}/auth/callback`, now(), operation);
  }
  return Object.freeze({
    async start(request: Request): Promise<Response> {
      let input: Record<string, string>;
      try { gate(request, "/invitations/start", "POST"); input = await body(request, ["token", "csrfToken"], true); canonicalInvitationOpaque(input.token); }
      catch { return html("<h1>İstek doğrulanamadı</h1>", 400); }
      try {
        const proof = `pb1.${random()}`;
        const result = verified(await options.transport.startInvitation({ token: input.token, browserBindingCredential: proof }), "invitation_start");
        if (result.kind !== "invitation_login_ready") return result.kind === "invitation_rejected" && !result.retryable ? terminal() : retry();
        const response = Response.json({ redirectTo: result.providerAuthorizationUrl }, { headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
        clearInvitationCookies(response);
        response.headers.append("set-cookie", serializePanelBrowserBindingCookie({ credential: proof, expiresAt: result.browserBindingExpiresAt, now: now() }));
        return response;
      } catch { return retry(); }
    },
    async confirm(request: Request): Promise<Response> {
      let input: GrantInput;
      try { gate(request, "/invitations/confirm", "GET"); input = credentials(request); }
      catch { return html("<h1>İstek doğrulanamadı</h1>", 400); }
      try {
        const result = verified(await options.transport.previewInvitation(input), "invitation_preview");
        if (result.kind !== "invitation_confirmation") return result.kind === "invitation_rejected" && !result.retryable ? terminal() : retry();
        const operationId = invitationOperation(request.headers.get("cookie"), input.grantCredential) ?? uuid();
        const operation = invitationOperationCookieValue(input.grantCredential, operationId), csrf = random();
        const age = Math.floor((Date.parse(result.expiresAt) - now().getTime()) / 1000);
        const response = html(`<h1>Mağaza davetini kabul edin</h1><dl><dt>Mağaza</dt><dd>${escape(result.storeName)}</dd><dt>Rol</dt><dd>${escape(result.role)}</dd><dt>Doğrulanan e-posta</dt><dd>${escape(result.email)}</dd></dl><p>Devam etmek için bu mağazaya katılmayı onaylayın.</p><form method="post" action="/invitations/accept"><input type="hidden" name="csrfToken" value="${csrf}"><input type="hidden" name="operationId" value="${operationId}"><button type="submit">Kabul et</button></form>`);
        response.headers.append("set-cookie", invitationCookie(INVITATION_CSRF_COOKIE, csrf, age));
        response.headers.append("set-cookie", invitationCookie(INVITATION_OPERATION_COOKIE, operation, age));
        // Native POSTs under no-referrer carry Origin:null. This token-free page keeps
        // same-origin Origin proof while still suppressing every cross-origin referrer.
        response.headers.set("referrer-policy", "same-origin");
        return response;
      } catch { return retry(); }
    },
    async accept(request: Request): Promise<Response> {
      if (request.method === "GET") {
        try {
          gate(request, "/invitations/accept", "GET"); const csrf = random();
          const response = html(`<h1>Mağazanıza katılın</h1><p>Davetinizi görüntülemek için önce güvenli giriş yapın. Henüz mağazaya katılmayacaksınız.</p><form id="invitation-start"><input type="hidden" name="csrfToken" value="${csrf}"><button id="continue" type="submit" disabled>Devam et</button></form><p id="status" role="status" tabindex="-1"></p><noscript>Devam etmek için JavaScript etkin olmalıdır.</noscript>`, 200, invitationFragmentClient);
          response.headers.append("set-cookie", invitationCookie(INVITATION_CSRF_COOKIE, csrf, 300)); return response;
        } catch { return html("<h1>İstek doğrulanamadı</h1>", 400); }
      }
      let input: GrantInput, operationId: string;
      try { gate(request, "/invitations/accept", "POST"); input = credentials(request); const submitted = await body(request, ["csrfToken", "operationId"], false); operationId = invitationOperation(request.headers.get("cookie"), input.grantCredential) ?? invalid(); if (submitted.operationId !== operationId) invalid(); }
      catch { return html("<h1>İstek doğrulanamadı</h1>", 400); }
      try {
        const result = verified(await options.transport.acceptInvitation({ ...input, operationId }), "invitation_accept");
        if (result.kind === "invitation_accepted_access_retry") return html('<h1>Davet kabul edildi</h1><p>Mağaza erişimi henüz açılamadı. Üyeliğiniz yeniden oluşturulmayacak.</p><a href="/invitations/confirm">Erişimi tekrar dene</a><p>Süre dolduysa mağazanızın normal girişini kullanın.</p>', 503);
        if (result.kind === "invitation_rejected") return result.retryable ? retry() : terminal();
        if (result.kind !== "invitation_session_ready") return retry();
        const response = await options.presentSession(Object.freeze({ schemaVersion: 1, kind: "session_ready", sessionCredential: result.sessionCredential, sessionIssuedAt: result.sessionIssuedAt, sessionExpiresAt: result.sessionExpiresAt, destinationStoreId: result.destinationStoreId, destinationOrigin: result.destinationOrigin, redirectPath: "/" }));
        return clearInvitationCookies(response);
      } catch { return retry(); }
    },
  });
}
