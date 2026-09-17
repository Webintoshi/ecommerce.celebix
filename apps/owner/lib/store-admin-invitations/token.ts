import { createHash, randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;
const TOKEN_LENGTH = 43;
const TOKEN = /^[A-Za-z0-9_-]{43}$/u;
const DIGEST_DOMAIN = "celebix-store-admin-invitation-token:v1\n";

function invalid(): never {
  throw new Error("store_admin_invitation_token_invalid");
}

function canonicalToken(value: unknown): string {
  if (typeof value !== "string" || value.length !== TOKEN_LENGTH || !TOKEN.test(value)) invalid();
  const decoded = Buffer.from(value, "base64url");
  try {
    if (decoded.length !== TOKEN_BYTES || decoded.toString("base64url") !== value) invalid();
    return value;
  } finally {
    decoded.fill(0);
  }
}

export function digestStoreAdminInvitationToken(token: unknown): string {
  try {
    const canonical = canonicalToken(token);
    return createHash("sha256").update(DIGEST_DOMAIN, "utf8").update(canonical, "utf8").digest("hex");
  } catch {
    return invalid();
  }
}

export function createStoreAdminInvitationToken(): { token: string; digest: string } {
  const bytes = randomBytes(TOKEN_BYTES);
  try {
    const token = bytes.toString("base64url");
    return Object.freeze({ token, digest: digestStoreAdminInvitationToken(token) });
  } finally {
    bytes.fill(0);
  }
}

function canonicalHttpsOrigin(value: unknown): string {
  if (typeof value !== "string") invalid();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return invalid();
  }
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== "" ||
    url.origin !== value
  ) invalid();
  return value;
}

export function buildStoreAdminInvitationUrl(acceptanceOrigin: string, token: string): string {
  try {
    const origin = canonicalHttpsOrigin(acceptanceOrigin);
    const canonical = canonicalToken(token);
    return `${origin}/invitations/accept#token=${canonical}`;
  } catch {
    return invalid();
  }
}
