import { normalizeStoreAdminInvitationEmail } from "@celebix/saas-contracts";

import { buildStoreAdminInvitationUrl } from "./token.ts";

type Environment = Readonly<Record<string, string | undefined>>;

export type InvitationDeliveryConfig = Readonly<{
  apiKey: string;
  sender: string;
  acceptanceOrigin: string;
  allowedStoreId: string;
  allowedRecipient: string;
}>;

const API_KEY = /^re_[A-Za-z0-9_-]{6,500}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const PRINTABLE_ASCII = /^[\x20-\x7e]+$/u;
const PROBE_TOKEN = Buffer.alloc(32).toString("base64url");

function invalid(): never {
  throw new Error("store_admin_invitation_config_invalid");
}
function required(source: Environment, name: string): string {
  const value = source[name];
  if (typeof value !== "string" || value.length === 0 || value !== value.trim() || !PRINTABLE_ASCII.test(value)) invalid();
  return value;
}

function canonicalEmail(value: string): string {
  const normalized = normalizeStoreAdminInvitationEmail(value);
  if (normalized !== value) invalid();
  return normalized;
}

export function parseInvitationDeliveryConfig(env: Environment): InvitationDeliveryConfig | null {
  try {
    const mode = env.CELEBIX_ADMIN_INVITATIONS_ENABLED;
    if (mode === undefined || mode === "false") return null;
    if (mode !== "true") invalid();

    const apiKey = required(env, "CELEBIX_ADMIN_INVITATIONS_RESEND_API_KEY");
    if (!API_KEY.test(apiKey)) invalid();
    const sender = canonicalEmail(required(env, "CELEBIX_ADMIN_INVITATIONS_FROM"));
    const acceptanceOrigin = required(env, "CELEBIX_ADMIN_INVITATIONS_ACCEPTANCE_ORIGIN");
    buildStoreAdminInvitationUrl(acceptanceOrigin, PROBE_TOKEN);
    const allowedStoreId = required(env, "CELEBIX_ADMIN_INVITATIONS_ALLOWED_STORE_ID");
    if (!UUID.test(allowedStoreId)) invalid();
    const allowedRecipient = canonicalEmail(required(env, "CELEBIX_ADMIN_INVITATIONS_ALLOWED_RECIPIENT"));

    return Object.freeze({ apiKey, sender, acceptanceOrigin, allowedStoreId, allowedRecipient });
  } catch {
    return invalid();
  }
}
