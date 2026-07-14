const KEY_ID = /^[A-Za-z0-9._-]{1,64}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const MAXIMUM_SESSION_MS = 8 * 60 * 60_000;
const MAXIMUM_MAX_AGE_SECONDS = 28_800;

function invalid(): never {
  throw new Error("persistent_panel_session_cookie_invalid");
}

function canonicalCredential(value: unknown): string {
  if (typeof value !== "string" || value.trim() !== value || !value.startsWith("v1.") || /[\u0000-\u0020\u007f]/.test(value)) invalid();
  const separator = value.length - 44;
  if (separator <= 3 || value[separator] !== ".") invalid();
  const keyId = value.slice(3, separator);
  const token = value.slice(separator + 1);
  if (!KEY_ID.test(keyId) || keyId.startsWith(".") || keyId.endsWith(".") || keyId.includes("..") || !TOKEN.test(token)) invalid();
  const bytes = Buffer.from(token, "base64url");
  if (bytes.byteLength !== 32 || bytes.toString("base64url") !== token) invalid();
  return value;
}

function timestamp(value: unknown): number {
  if (typeof value !== "string" || value.length > 32 || value.trim() !== value) invalid();
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) invalid();
  return milliseconds;
}

export function serializePersistentPanelSessionCookie(input: {
  credential: string;
  issuedAt: string;
  expiresAt: string;
  now: Date;
}): string {
  if (!input || typeof input !== "object") invalid();
  const keys = Object.keys(input).sort();
  if (keys.join("\n") !== ["credential", "expiresAt", "issuedAt", "now"].sort().join("\n")) invalid();
  const credential = canonicalCredential(input.credential);
  const issuedAt = timestamp(input.issuedAt);
  const expiresAt = timestamp(input.expiresAt);
  if (!(input.now instanceof Date) || !Number.isFinite(input.now.getTime())) invalid();
  const now = input.now.getTime();
  if (issuedAt > now || expiresAt <= now || expiresAt <= issuedAt || expiresAt > issuedAt + MAXIMUM_SESSION_MS) invalid();
  const maxAge = Math.floor((expiresAt - now) / 1_000);
  if (!Number.isSafeInteger(maxAge) || maxAge < 1 || maxAge > MAXIMUM_MAX_AGE_SECONDS) invalid();
  return `__Host-celebix_panel=${credential}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}
