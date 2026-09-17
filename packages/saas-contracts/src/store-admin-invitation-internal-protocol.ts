/** Credential-bearing INTERNAL wire shapes. Never return these from a public browser endpoint. */
export type InvitationRequest =
  | { schemaVersion: 4; operation: "invitation_start"; browserBindingCredential: string; token: string }
  | { schemaVersion: 5; operation: "invitation_preview"; browserBindingCredential: string; grantCredential: string }
  | { schemaVersion: 6; operation: "invitation_accept"; browserBindingCredential: string; grantCredential: string; operationId: string };
export type InvitationResponse = Readonly<
  | { schemaVersion: 3; kind: "invitation_login_ready"; providerAuthorizationUrl: string; browserBindingExpiresAt: string }
  | { schemaVersion: 3; kind: "invitation_confirmation"; storeName: string; email: string; role: "admin" | "editor" | "analyst"; expiresAt: string }
  | { schemaVersion: 3; kind: "invitation_session_ready"; sessionCredential: string; sessionIssuedAt: string; sessionExpiresAt: string; destinationStoreId: string; destinationOrigin: string; redirectPath: "/" }
  | { schemaVersion: 3; kind: "invitation_rejected"; code: "invitation_unavailable" | "callback_unavailable" | "acceptance_unknown"; retryable: boolean }
  | { schemaVersion: 3; kind: "invitation_accepted_access_retry"; accepted: true; retryable: true }
>;
export type InvitationConfirmationReady = Readonly<{ schemaVersion: 2; kind: "invitation_confirmation_ready"; grantCredential: string; grantExpiresAt: string; continuationPath: "/invitations/confirm" }>;
const TOKEN = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function invalid(): never { throw new Error("invitation_internal_protocol_invalid"); }
function text(value: unknown, maximum: number): string {
  if (typeof value !== "string" || !value || value.length > maximum || value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value)) invalid();
  return value;
}
export function canonicalInvitationOpaque(value: unknown, prefix = ""): string {
  const s = text(value, 128);
  if (!s.startsWith(prefix) || !TOKEN.test(s.slice(prefix.length))) invalid();
  return s;
}
function uuid(value: unknown): string { const s = text(value, 36); if (!UUID.test(s)) invalid(); return s; }
function timestamp(value: unknown): string { const s = text(value, 32); if (!Number.isFinite(Date.parse(s)) || new Date(s).toISOString() !== s) invalid(); return s; }
function expiry(value: unknown, now: Date, maximum: number): string {
  const s = timestamp(value), remaining = Date.parse(s) - now.getTime();
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > maximum) invalid(); return s;
}
function exact(raw: string, keys: string[]): Record<string, unknown> {
  const row = JSON.parse(raw);
  if (!row || typeof row !== "object" || Array.isArray(row) || Object.keys(row).join(",") !== keys.join(",") || JSON.stringify(row) !== raw) invalid();
  return row;
}
export function parseInvitationRequest(raw: string): Readonly<InvitationRequest> {
  const p = JSON.parse(raw);
  const keys = ["schemaVersion", "operation", "browserBindingCredential", p?.schemaVersion === 4 ? "token" : "grantCredential", ...(p?.schemaVersion === 6 ? ["operationId"] : [])];
  const b = exact(raw, keys);
  canonicalInvitationOpaque(b.browserBindingCredential, "pb1.");
  if (b.schemaVersion === 4 && b.operation === "invitation_start") canonicalInvitationOpaque(b.token);
  else if ((b.schemaVersion === 5 && b.operation === "invitation_preview") || (b.schemaVersion === 6 && b.operation === "invitation_accept")) {
    canonicalInvitationOpaque(b.grantCredential, "ig1."); if (b.schemaVersion === 6) uuid(b.operationId);
  } else invalid();
  return Object.freeze(b) as Readonly<InvitationRequest>;
}
export function parseInvitationConfirmationReady(raw: string, now: Date): InvitationConfirmationReady {
  const b = exact(raw, ["schemaVersion", "kind", "grantCredential", "grantExpiresAt", "continuationPath"]);
  if (b.schemaVersion !== 2 || b.kind !== "invitation_confirmation_ready" || b.continuationPath !== "/invitations/confirm") invalid();
  canonicalInvitationOpaque(b.grantCredential, "ig1."); expiry(b.grantExpiresAt, now, 300_000);
  return Object.freeze(b) as InvitationConfirmationReady;
}
export function invitationResponseStatus(body: InvitationResponse): 200 | 409 | 503 {
  return body.kind === "invitation_accepted_access_retry" ? 503 : body.kind === "invitation_rejected" ? body.retryable ? 503 : 409 : 200;
}
export function parseInvitationResponse(raw: string, status: number, callbackAuthority: string, now: Date, operation: InvitationRequest["operation"]): InvitationResponse {
  const p = JSON.parse(raw);
  const common = ["schemaVersion", "kind"];
  let b: Record<string, unknown>;
  switch (p?.kind) {
    case "invitation_login_ready": {
      b = exact(raw, [...common, "providerAuthorizationUrl", "browserBindingExpiresAt"]);
      if (operation !== "invitation_start") invalid();
      const u = new URL(text(b.providerAuthorizationUrl, 16_384));
      if (u.protocol !== "https:" || u.username || u.password || u.port || u.hash || u.toString() !== b.providerAuthorizationUrl) invalid();
      for (const [key, value] of [["redirect_uri", callbackAuthority], ["response_type", "code"], ["response_mode", "query"]]) {
        if (u.searchParams.getAll(key).length !== 1 || u.searchParams.get(key) !== value) invalid();
      }
      if (u.searchParams.getAll("state").length !== 1 || text(u.searchParams.get("state"), 1024).length < 16) invalid();
      expiry(b.browserBindingExpiresAt, now, 900_000); break;
    }
    case "invitation_confirmation":
      b = exact(raw, [...common, "storeName", "email", "role", "expiresAt"]);
      if (operation !== "invitation_preview" || !["admin", "editor", "analyst"].includes(String(b.role))) invalid();
      text(b.storeName, 512); text(b.email, 320); expiry(b.expiresAt, now, 300_000); break;
    case "invitation_session_ready": {
      b = exact(raw, [...common, "sessionCredential", "sessionIssuedAt", "sessionExpiresAt", "destinationStoreId", "destinationOrigin", "redirectPath"]);
      if (operation !== "invitation_accept" || b.redirectPath !== "/") invalid();
      const c = text(b.sessionCredential, 128), split = c.length - 44, key = c.slice(3, split);
      if (!c.startsWith("v1.") || c[split] !== "." || !/^[A-Za-z0-9._-]{1,64}$/.test(key) || key.startsWith(".") || key.endsWith(".") || key.includes("..")) invalid();
      canonicalInvitationOpaque(c.slice(split + 1)); uuid(b.destinationStoreId);
      const u = new URL(text(b.destinationOrigin, 2048));
      if (u.protocol !== "https:" || u.username || u.password || u.port || u.origin !== b.destinationOrigin || u.hostname.includes("*")) invalid();
      const issued = timestamp(b.sessionIssuedAt); expiry(b.sessionExpiresAt, now, 28_800_000);
      if (Date.parse(issued) > now.getTime() || Date.parse(String(b.sessionExpiresAt)) > Date.parse(issued) + 28_800_000) invalid();
      break;
    }
    case "invitation_accepted_access_retry":
      b = exact(raw, [...common, "accepted", "retryable"]);
      if (operation !== "invitation_accept" || b.accepted !== true || b.retryable !== true) invalid(); break;
    case "invitation_rejected":
      b = exact(raw, [...common, "code", "retryable"]);
      if (!["invitation_unavailable", "callback_unavailable", "acceptance_unknown"].includes(String(b.code)) || typeof b.retryable !== "boolean") invalid();
      if (b.code === "invitation_unavailable" ? b.retryable : !b.retryable) invalid();
      if (b.code === "acceptance_unknown" && operation !== "invitation_accept") invalid(); break;
    default: return invalid();
  }
  if (b.schemaVersion !== 3 || invitationResponseStatus(b as InvitationResponse) !== status) invalid();
  return Object.freeze(b) as InvitationResponse;
}
