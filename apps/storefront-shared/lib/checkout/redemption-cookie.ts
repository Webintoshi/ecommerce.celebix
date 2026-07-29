import { createHash, randomBytes as secureRandomBytes } from "node:crypto";

export const REDEMPTION_COOKIE_NAME = "__Host-celebix_quick";
const PREFIX = "q1.";
const TOKEN_BYTES = 32;
const MAX_AGE_SECONDS = 30 * 60;
const COOKIE_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const COOKIE_VALUE = /^[!#$%&'*+.^_`|~0-9A-Za-z:=_-]+$/;

function invalid(): never {
  throw new Error("redemption_cookie_invalid");
}

function canonicalBytes(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const bytes = Buffer.from(value, "base64url");
  return bytes.byteLength === TOKEN_BYTES && bytes.toString("base64url") === value ? bytes : null;
}

export function isCanonicalRedemptionCredential(value: unknown): value is string {
  return typeof value === "string" && value === value.trim() && value.startsWith(PREFIX) &&
    canonicalBytes(value.slice(PREFIX.length)) !== null;
}

export function generateRedemptionCredential(
  random: (size: number) => Uint8Array = secureRandomBytes,
): string {
  const bytes = Buffer.from(random(TOKEN_BYTES));
  if (bytes.byteLength !== TOKEN_BYTES) invalid();
  return `${PREFIX}${bytes.toString("base64url")}`;
}

export function digestRedemptionCredential(value: unknown): string {
  if (!isCanonicalRedemptionCredential(value)) invalid();
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export type ParsedRedemptionCookie =
  | Readonly<{ kind: "missing" }>
  | Readonly<{ kind: "invalid" }>
  | Readonly<{ kind: "valid"; credential: string }>;

export function parseRedemptionCookie(header: string | null): ParsedRedemptionCookie {
  if (header === null || header === "") return Object.freeze({ kind: "missing" });
  if (header !== header.trim() || /[\u0000-\u001f\u007f]/.test(header)) return Object.freeze({ kind: "invalid" });
  let selected: string | undefined;
  for (const part of header.split(";")) {
    const candidate = part.startsWith(" ") ? part.slice(1) : part;
    if (!candidate || candidate !== candidate.trim() || candidate.includes(";")) return Object.freeze({ kind: "invalid" });
    const separator = candidate.indexOf("=");
    if (separator <= 0) return Object.freeze({ kind: "invalid" });
    const name = candidate.slice(0, separator);
    const value = candidate.slice(separator + 1);
    if (!COOKIE_NAME.test(name) || !value || !COOKIE_VALUE.test(value)) return Object.freeze({ kind: "invalid" });
    if (name === REDEMPTION_COOKIE_NAME) {
      if (selected !== undefined || !isCanonicalRedemptionCredential(value)) return Object.freeze({ kind: "invalid" });
      selected = value;
    }
  }
  return selected === undefined
    ? Object.freeze({ kind: "missing" })
    : Object.freeze({ kind: "valid", credential: selected });
}

export function serializeRedemptionCookie(credential: unknown, maxAgeSeconds: unknown): string {
  if (!isCanonicalRedemptionCredential(credential) || !Number.isSafeInteger(maxAgeSeconds) ||
      (maxAgeSeconds as number) < 1 || (maxAgeSeconds as number) > MAX_AGE_SECONDS) invalid();
  return `${REDEMPTION_COOKIE_NAME}=${credential}; Path=/; Max-Age=${String(maxAgeSeconds)}; HttpOnly; Secure; SameSite=Lax`;
}
