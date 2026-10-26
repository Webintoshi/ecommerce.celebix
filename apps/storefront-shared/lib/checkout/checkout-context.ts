import type { StorefrontCredentialRead } from "../cart/credential.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PAYMENT_PATH = /^\/checkout\/payment\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/;
const DESTINATION = /^\/checkout\/payment\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:\/result)?$/;
const COOKIE_NAME = "__Secure-celebix_hosted_checkout";
// A 32-byte base64url token has four significant bits in its last character.
const CREDENTIAL = /^h1\.[a-z][a-z0-9_-]{2,31}\.[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

export type CheckoutPaymentDestination = "/checkout/payment" | "/checkout/payment/result" | `/checkout/payment/${string}`;

export function parseCheckoutContextId(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

export function checkoutContextPaymentPath(contextId: string): `/checkout/payment/${string}` {
  if (parseCheckoutContextId(contextId) === null) throw new TypeError("checkout_context_invalid");
  return `/checkout/payment/${contextId}`;
}

export function checkoutContextResultPath(contextId: string): `/checkout/payment/${string}` {
  return `${checkoutContextPaymentPath(contextId)}/result`;
}

export function isCheckoutContextDestination(value: unknown): value is CheckoutPaymentDestination {
  return typeof value === "string" && (value === "/checkout/payment" || value === "/checkout/payment/result" || DESTINATION.test(value));
}

export function isCheckoutContextPaymentPath(pathname: string): boolean {
  return PAYMENT_PATH.test(pathname);
}

export function readCheckoutContextCookie(cookieHeader: string | null): StorefrontCredentialRead {
  if (cookieHeader === null || cookieHeader === "") return Object.freeze({ kind: "missing" });
  if (cookieHeader.length > 4_096 || CONTROL.test(cookieHeader)) return Object.freeze({ kind: "invalid" });
  const matches: string[] = [];
  for (const segment of cookieHeader.split(";")) {
    const trimmed = segment.trim();
    const separator = trimmed.indexOf("=");
    if (separator > 0 && trimmed.slice(0, separator) === COOKIE_NAME) matches.push(trimmed.slice(separator + 1));
  }
  if (matches.length === 0) return Object.freeze({ kind: "missing" });
  if (matches.length !== 1 || !CREDENTIAL.test(matches[0]!)) return Object.freeze({ kind: "invalid" });
  return Object.freeze({ kind: "present", value: matches[0]! });
}

export function serializeCheckoutContextCookie(contextId: string, value: string): string {
  const path = checkoutContextPaymentPath(contextId);
  if (!CREDENTIAL.test(value)) throw new TypeError("checkout_context_invalid");
  return `${COOKIE_NAME}=${value}; Path=${path}; Max-Age=86400; HttpOnly; Secure; SameSite=Lax`;
}
