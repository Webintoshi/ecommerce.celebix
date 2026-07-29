import "server-only";

import {
  parseCheckoutDeliveryInput,
  parseCheckoutSubmitInput,
  type CheckoutDeliveryInput,
  type CheckoutHttpError,
  type CheckoutSubmitInput,
} from "@celebix/saas-contracts";

import {
  digestCartCredential,
  readCartCredential,
} from "../cart-capture/credential.ts";

const HOSTNAME =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const DELIVERY_BYTES = 32_768;
const SUBMIT_BYTES = 4_096;

type ErrorResult = Readonly<{ kind: "error"; code: CheckoutHttpError }>;
export type CheckoutCredentialRequest = Readonly<{
  kind: "valid";
  hostname: string;
  credentialDigest: string;
}>;
export type CheckoutDeliveryRequest = CheckoutCredentialRequest & Readonly<{
  delivery: CheckoutDeliveryInput;
}>;
export type CheckoutSubmitRequest = CheckoutCredentialRequest & Readonly<{
  submission: CheckoutSubmitInput;
}>;

const INVALID: ErrorResult = Object.freeze({ kind: "error", code: "invalid_input" });
const ORIGIN_DENIED: ErrorResult = Object.freeze({
  kind: "error",
  code: "origin_denied",
});
const CART_NOT_FOUND: ErrorResult = Object.freeze({
  kind: "error",
  code: "cart_not_found",
});

function validHostname(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 3
    && value.length <= 253
    && value === value.trim()
    && value === value.toLowerCase()
    && HOSTNAME.test(value);
}

function hasPrivateAuthority(headers: Headers): boolean {
  try {
    for (const [name] of headers) {
      if (
        name === "authorization"
        || name === "proxy-authorization"
        || name.startsWith("x-store-")
        || name.startsWith("x-tenant-")
        || name.startsWith("x-payment-")
        || name.startsWith("x-provider-")
        || (name.startsWith("x-celebix-") && name !== "x-celebix-storefront-proxy")
      ) return true;
    }
  } catch {
    return true;
  }
  return false;
}

function exactTarget(
  request: Request,
  hostname: string,
  pathname: string,
  method: "GET" | "POST",
  sameOrigin: boolean,
): ErrorResult | null {
  if (!validHostname(hostname) || request.method !== method) return INVALID;
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return INVALID;
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:")
    || url.username
    || url.password
    || url.pathname !== pathname
    || url.search
    || url.hash
    || request.headers.has("transfer-encoding")
    || hasPrivateAuthority(request.headers)
  ) return INVALID;
  if (sameOrigin && request.headers.get("origin") !== `https://${hostname}`) {
    return ORIGIN_DENIED;
  }
  return null;
}

function exactCookieNames(value: string | null): boolean {
  if (value === null || value.length < 1 || value.length > 4_096 || CONTROL.test(value)) {
    return value === null || value === "";
  }
  if (value.includes(",")) return false;
  const seen = new Set<string>();
  for (const segment of value.split(";")) {
    const selected = segment.trim();
    const separator = selected.indexOf("=");
    if (separator < 1) continue;
    const name = selected.slice(0, separator);
    if (seen.has(name)) return false;
    seen.add(name);
  }
  return true;
}

function credential(
  request: Request,
  hostname: string,
  pathname: string,
  method: "GET" | "POST",
  sameOrigin: boolean,
): ErrorResult | CheckoutCredentialRequest {
  const target = exactTarget(request, hostname, pathname, method, sameOrigin);
  if (target !== null) return target;
  const cookieHeader = request.headers.get("cookie");
  if (!exactCookieNames(cookieHeader)) return INVALID;
  const selected = readCartCredential(cookieHeader);
  if (selected.kind === "missing") return CART_NOT_FOUND;
  if (selected.kind !== "present") return INVALID;
  try {
    return Object.freeze({
      kind: "valid",
      hostname,
      credentialDigest: digestCartCredential(selected.credential),
    });
  } catch {
    return INVALID;
  }
}

async function boundedBody(
  request: Request,
  maximumBytes: number,
): Promise<Uint8Array | null> {
  if (request.body === null) return null;
  const declared = request.headers.get("content-length");
  if (
    declared !== null
    && (!/^[1-9][0-9]{0,5}$/.test(declared) || Number(declared) > maximumBytes)
  ) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      if (!(next.value instanceof Uint8Array)) return null;
      total += next.value.byteLength;
      if (total > maximumBytes) {
        try {
          await reader.cancel();
        } catch {
          // The request remains invalid even if stream cancellation fails.
        }
        return null;
      }
      chunks.push(new Uint8Array(next.value));
    }
  } catch {
    return null;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Cleanup is best effort.
    }
  }
  if (total < 1) return null;
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function exactUtf8(bytes: Uint8Array): string | null {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return Buffer.from(text, "utf8").equals(bytes) ? text : null;
  } catch {
    return null;
  }
}

function duplicateJsonKeys(text: string): boolean {
  let cursor = 0;
  let depth = 0;
  const whitespace = () => {
    while (/\s/.test(text[cursor] ?? "")) cursor += 1;
  };
  const string = (): string => {
    const start = cursor;
    cursor += 1;
    while (cursor < text.length) {
      if (text[cursor] === "\\") {
        cursor += 2;
        continue;
      }
      if (text[cursor] === "\"") {
        cursor += 1;
        return JSON.parse(text.slice(start, cursor)) as string;
      }
      cursor += 1;
    }
    throw new TypeError("checkout_json_invalid");
  };
  const value = (): boolean => {
    whitespace();
    if (text[cursor] === "{") return object();
    if (text[cursor] === "[") {
      depth += 1;
      if (depth > 64) return true;
      cursor += 1;
      whitespace();
      if (text[cursor] === "]") {
        cursor += 1;
        depth -= 1;
        return false;
      }
      while (cursor < text.length) {
        if (value()) return true;
        whitespace();
        if (text[cursor] === "]") {
          cursor += 1;
          depth -= 1;
          return false;
        }
        if (text[cursor] !== ",") return true;
        cursor += 1;
      }
      return true;
    }
    if (text[cursor] === "\"") {
      string();
      return false;
    }
    while (cursor < text.length && !/[\s,}\]]/.test(text[cursor]!)) cursor += 1;
    return false;
  };
  const object = (): boolean => {
    depth += 1;
    if (depth > 64) return true;
    cursor += 1;
    whitespace();
    if (text[cursor] === "}") {
      cursor += 1;
      depth -= 1;
      return false;
    }
    const keys = new Set<string>();
    while (cursor < text.length) {
      whitespace();
      if (text[cursor] !== "\"") return true;
      const key = string();
      if (keys.has(key)) return true;
      keys.add(key);
      whitespace();
      if (text[cursor] !== ":") return true;
      cursor += 1;
      if (value()) return true;
      whitespace();
      if (text[cursor] === "}") {
        cursor += 1;
        depth -= 1;
        return false;
      }
      if (text[cursor] !== ",") return true;
      cursor += 1;
    }
    return true;
  };
  try {
    const duplicate = value();
    whitespace();
    return duplicate || cursor !== text.length;
  } catch {
    return true;
  }
}

export function readCheckoutCredentialRequest(input: Readonly<{
  request: Request;
  hostname: string;
  pathname: string;
  method: "GET" | "POST";
  sameOrigin: boolean;
}>): ErrorResult | CheckoutCredentialRequest {
  return credential(
    input.request,
    input.hostname,
    input.pathname,
    input.method,
    input.sameOrigin,
  );
}

export async function readCheckoutDeliveryRequest(
  request: Request,
  hostname: string,
): Promise<ErrorResult | CheckoutDeliveryRequest> {
  const selected = credential(
    request,
    hostname,
    "/api/checkout/delivery",
    "POST",
    true,
  );
  if (selected.kind !== "valid") return selected;
  if (request.headers.get("content-type") !== "application/json") return INVALID;
  const bytes = await boundedBody(request, DELIVERY_BYTES);
  if (bytes === null) return INVALID;
  const text = exactUtf8(bytes);
  if (text === null || duplicateJsonKeys(text)) return INVALID;
  try {
    const delivery = parseCheckoutDeliveryInput(JSON.parse(text) as unknown);
    return Object.freeze({ ...selected, delivery });
  } catch {
    return INVALID;
  }
}

export async function readCheckoutSubmitRequest(
  request: Request,
  hostname: string,
): Promise<ErrorResult | CheckoutSubmitRequest> {
  const selected = credential(
    request,
    hostname,
    "/api/checkout/submit",
    "POST",
    true,
  );
  if (selected.kind !== "valid") return selected;
  if (request.headers.get("content-type") !== "application/x-www-form-urlencoded") {
    return INVALID;
  }
  const bytes = await boundedBody(request, SUBMIT_BYTES);
  if (bytes === null) return INVALID;
  const text = exactUtf8(bytes);
  if (text === null) return INVALID;
  try {
    const entries = [...new URLSearchParams(text).entries()];
    if (
      entries.length !== 7
      || new Set(entries.map(([name]) => name)).size !== entries.length
      || new URLSearchParams(entries).toString() !== text
    ) return INVALID;
    const form = Object.fromEntries(entries) as Record<string, string>;
    if (
      !/^[1-9][0-9]{0,15}$/.test(form.cartVersion ?? "")
      || form.distanceSales !== "true"
      || form.preInformation !== "true"
      || Object.keys(form).some((key) => ![
        "cartVersion",
        "checkoutNonce",
        "operationId",
        "paymentMethodId",
        "identityNumber",
        "distanceSales",
        "preInformation",
      ].includes(key))
    ) return INVALID;
    const submission = parseCheckoutSubmitInput(Object.freeze({
      cartVersion: Number(form.cartVersion),
      checkoutNonce: form.checkoutNonce,
      operationId: form.operationId,
      paymentMethodId: form.paymentMethodId,
      identityNumber: form.identityNumber === "" ? null : form.identityNumber,
      consents: Object.freeze({
        distanceSales: true,
        preInformation: true,
      }),
    }));
    return Object.freeze({ ...selected, submission });
  } catch {
    return INVALID;
  }
}
