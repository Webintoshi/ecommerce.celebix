import { canonicalInvitationOpaque } from "../../../../packages/saas-contracts/src/store-admin-invitation-internal-protocol.ts";
import { createHash, timingSafeEqual } from "node:crypto";
export const INVITATION_GRANT_COOKIE = "__Host-celebix_invitation_grant";
export const INVITATION_CSRF_COOKIE = "__Host-celebix_invitation_csrf";
export const INVITATION_OPERATION_COOKIE = "__Host-celebix_invitation_operation";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function invalid(): never { throw new Error("invitation_cookie_invalid"); }
export function readInvitationCookie(header: string | null, name: string): string | null {
  if (header === null) return null;
  if (header.length > 16384 || /[\u0000-\u001f\u007f]/.test(header)) invalid();
  const parts = header.split(";").map(s => s.trim());
  for (const part of parts) {
    const key = part.split("=")[0];
    try { if (decodeURIComponent(key) === name && key !== name) invalid(); } catch { invalid(); }
  }
  const matches = parts.filter(s => s.split("=")[0] === name);
  if (matches.length > 1) invalid();
  if (!matches.length) return null;
  const value = matches[0].slice(name.length + 1);
  if (!matches[0].startsWith(`${name}=`) || !value || /[\s"%,;=]/.test(value)) invalid();
  return value;
}
export function invitationCookie(name: string, value: string, age: number): string {
  if (![INVITATION_CSRF_COOKIE, INVITATION_OPERATION_COOKIE].includes(name) || !/^[A-Za-z0-9_.-]+$/.test(value) || !Number.isInteger(age) || age < 1 || age > 300) invalid();
  return `${name}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${age}`;
}
export function invitationOperationCookieValue(grant: string, operationId: string): string {
  canonicalInvitationOpaque(grant, "ig1."); if (!UUID.test(operationId)) invalid();
  return `${createHash("sha256").update("invitation-operation-cookie:v1\n").update(grant).digest("hex")}.${operationId}`;
}
export function invitationOperation(header: string | null, grant: string): string | null {
  const value = readInvitationCookie(header, INVITATION_OPERATION_COOKIE);
  if (!value) return null;
  if (!/^[a-f0-9]{64}\.[0-9a-f-]{36}$/.test(value)) invalid();
  const operationId = value.slice(65);
  return invitationOperationCookieValue(grant, operationId) === value ? operationId : null;
}
export function verifyInvitationCsrf(header: string | null, candidate: string): void {
  const saved = readInvitationCookie(header, INVITATION_CSRF_COOKIE);
  canonicalInvitationOpaque(saved); canonicalInvitationOpaque(candidate);
  if (!timingSafeEqual(Buffer.from(saved!), Buffer.from(candidate))) invalid();
}
export function clearInvitationCookies(response: Response): Response {
  for (const name of [INVITATION_GRANT_COOKIE, INVITATION_OPERATION_COOKIE, INVITATION_CSRF_COOKIE, "__Host-celebix_panel_pre_auth"]) {
    response.headers.append("set-cookie", `${name}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
  }
  return response;
}
/** Retain the existing callback's single-proof parser; admit only our exact continuation cookies. */
export function invitationCallbackRequest(request: Request): { request: Request; hasContinuation: boolean } {
  const header = request.headers.get("cookie");
  const grant = readInvitationCookie(header, INVITATION_GRANT_COOKIE);
  if (!grant) return { request, hasContinuation: false };
  canonicalInvitationOpaque(grant, "ig1.");
  const allowed = [INVITATION_GRANT_COOKIE, INVITATION_CSRF_COOKIE, INVITATION_OPERATION_COOKIE, "__Host-celebix_panel_pre_auth"];
  if (header!.split(";").some(p => !allowed.includes(p.trim().split("=")[0]))) invalid();
  const csrf = readInvitationCookie(header, INVITATION_CSRF_COOKIE);
  if (csrf) canonicalInvitationOpaque(csrf);
  const operation = readInvitationCookie(header, INVITATION_OPERATION_COOKIE);
  if (operation && !invitationOperation(header, grant)) invalid();
  const proof = canonicalInvitationOpaque(readInvitationCookie(header, "__Host-celebix_panel_pre_auth"), "pb1.");
  const headers = new Headers(request.headers); headers.set("cookie", `__Host-celebix_panel_pre_auth=${proof}`);
  return { request: new Request(request, { headers }), hasContinuation: true };
}
export function serializeInvitationGrantCookie(grant: string, expiresAt: string, now: Date): string {
  canonicalInvitationOpaque(grant, "ig1.");
  const age = Math.floor((Date.parse(expiresAt) - now.getTime()) / 1000);
  if (!Number.isInteger(age) || age < 1 || age > 300) throw new Error("invitation_cookie_invalid");
  return `${INVITATION_GRANT_COOKIE}=${grant}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${age}`;
}
