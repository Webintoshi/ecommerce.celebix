import { normalizeStoreAdminInvitationEmail } from "@celebix/saas-contracts";

import type { InvitationDeliveryPayload } from "./seal.ts";
import { buildStoreAdminInvitationUrl, digestStoreAdminInvitationToken } from "./token.ts";

export type InvitationEmailRequest = Readonly<{
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}>;

const SUBJECT = "Mağaza yönetim daveti";
const FIELDS = Object.freeze([
  "token",
  "recipient",
  "sender",
  "displayName",
  "storeName",
  "role",
  "expiresAt",
  "acceptanceOrigin",
] as const);
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const ANGLE_BRACKET = /[<>]/u;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function invalid(): never {
  throw new Error("store_admin_invitation_email_invalid");
}
function exactPayload(value: unknown): Record<(typeof FIELDS)[number], unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const keys = Reflect.ownKeys(value);
  if (keys.length !== FIELDS.length || keys.some((key) => typeof key !== "string" || !FIELDS.includes(key as (typeof FIELDS)[number]))) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (FIELDS.some((field) => !descriptors[field]?.enumerable || !("value" in descriptors[field]!))) invalid();
  return Object.fromEntries(FIELDS.map((field) => [field, descriptors[field]!.value])) as Record<(typeof FIELDS)[number], unknown>;
}

function canonicalEmail(value: unknown): string {
  const normalized = normalizeStoreAdminInvitationEmail(value);
  if (normalized !== value) invalid();
  return normalized;
}

function boundedName(value: unknown): string {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > 160
    || value !== value.trim()
    || CONTROL.test(value)
    || ANGLE_BRACKET.test(value)
  ) invalid();
  return value;
}

function expiry(value: unknown): string {
  if (typeof value !== "string" || !ISO_UTC.test(value)) invalid();
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) invalid();
  return value;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderInvitationEmail(payload: InvitationDeliveryPayload): InvitationEmailRequest {
  try {
    const parsed = exactPayload(payload);
    if (typeof parsed.token !== "string") invalid();
    digestStoreAdminInvitationToken(parsed.token);
    const recipient = canonicalEmail(parsed.recipient);
    const sender = canonicalEmail(parsed.sender);
    const displayName = boundedName(parsed.displayName);
    const storeName = boundedName(parsed.storeName);
    const expiresAt = expiry(parsed.expiresAt);
    if (parsed.role !== "admin" && parsed.role !== "editor" && parsed.role !== "analyst") invalid();
    if (typeof parsed.acceptanceOrigin !== "string") invalid();
    const acceptanceUrl = buildStoreAdminInvitationUrl(parsed.acceptanceOrigin, parsed.token);
    const roleLabel = { admin: "Yönetici", editor: "Editör", analyst: "Analist" }[parsed.role];

    return Object.freeze({
      from: sender,
      to: recipient,
      subject: SUBJECT,
      html: `<p>Merhaba ${escapeHtml(displayName)},</p><p>${escapeHtml(storeName)} mağazasını <strong>${roleLabel}</strong> rolüyle yönetmeniz için davet edildiniz.</p><p><a href="${escapeHtml(acceptanceUrl)}">Daveti kabul et</a></p><p>Giriş yaparken davet edilen e-posta adresini (${escapeHtml(recipient)}) kullanın. Yetkiniz yalnızca daveti açıkça kabul ettikten sonra başlar.</p><p>Davetin son kullanma zamanı: ${escapeHtml(expiresAt)}</p>`,
      text: `Merhaba ${displayName},\n\n${storeName} mağazasını ${roleLabel} rolüyle yönetmeniz için davet edildiniz.\n\nDaveti kabul etmek için:\n${acceptanceUrl}\n\nGiriş yaparken davet edilen e-posta adresini (${recipient}) kullanın. Yetkiniz yalnızca daveti açıkça kabul ettikten sonra başlar.\n\nDavetin son kullanma zamanı: ${expiresAt}`,
    });
  } catch {
    return invalid();
  }
}
