import { createHash } from "node:crypto";

export const CART_COOKIE_NAME = "__Host-celebix_cart";
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

function canonical(value: string): boolean {
  if (!TOKEN.test(value)) return false;
  const decoded = Buffer.from(value, "base64url");
  return decoded.byteLength === 32 && decoded.toString("base64url") === value;
}

export function createCartCredential(random: (size: number) => Uint8Array): Readonly<{ credential: string; digest: string }> {
  const bytes = random(32);
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== 32) throw new Error("cart_credential_unavailable");
  const copied = Buffer.from(bytes);
  const credential = copied.toString("base64url");
  if (!canonical(credential)) throw new Error("cart_credential_unavailable");
  return Object.freeze({ credential, digest: createHash("sha256").update(copied).digest("hex") });
}

export function digestCartCredential(value: string): string {
  if (!canonical(value)) throw new Error("cart_credential_invalid");
  return createHash("sha256").update(Buffer.from(value, "base64url")).digest("hex");
}

export function serializeCartCredential(value: string): string {
  if (!canonical(value)) throw new Error("cart_credential_invalid");
  return `${CART_COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

export type CartCredentialRead = Readonly<{ kind: "missing" }> | Readonly<{ kind: "invalid" }> | Readonly<{ kind: "present"; credential: string }>;

export function readCartCredential(cookie: string | null): CartCredentialRead {
  if (cookie === null || cookie === "") return Object.freeze({ kind: "missing" });
  if (cookie.length > 4_096 || /[\u0000-\u001f\u007f]/.test(cookie)) return Object.freeze({ kind: "invalid" });
  const matches: string[] = [];
  for (const segment of cookie.split(";")) {
    const trimmed = segment.trim();
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    if (trimmed.slice(0, separator) === CART_COOKIE_NAME) matches.push(trimmed.slice(separator + 1));
  }
  if (matches.length === 0) return Object.freeze({ kind: "missing" });
  if (matches.length !== 1 || !canonical(matches[0]!)) return Object.freeze({ kind: "invalid" });
  return Object.freeze({ kind: "present", credential: matches[0]! });
}
