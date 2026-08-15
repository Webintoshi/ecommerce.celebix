import "server-only";
import { createHash } from "node:crypto";
import {
  IYZICO_IFRAME_PACKET,
  type PaymentAdapterPresentationRule,
} from "@celebix/payment-adapters";

const PROVIDER_CODE = /^[a-z][a-z0-9_]{0,63}$/;
const BASE64URL = /^[A-Za-z0-9_-]{43}$/;
const CALLBACK_BINDING_DIGEST = /^[a-f0-9]{64}$/;
const MAXIMUM_CALLBACK_BYTES = 65_536;
const MAXIMUM_HEADERS = 32;
const MAXIMUM_HEADER_VALUE = 4_096;
const CONTROL = /[\u0000-\u0008\u000a-\u001f\u007f-\u009f]/;
const CONTENT_TYPES = Object.freeze([
  "application/x-www-form-urlencoded",
  "application/json",
  "application/json; charset=utf-8",
]);
const FORM_CONTENT_TYPES = Object.freeze([
  "application/x-www-form-urlencoded",
  "application/x-www-form-urlencoded; charset=utf-8",
  "application/x-www-form-urlencoded; charset=UTF-8",
]);
const FORBIDDEN_HEADERS = Object.freeze([
  "authorization",
  "cookie",
  "transfer-encoding",
  "content-encoding",
  "proxy-authorization",
]);
function customerReturnOrigin(rule: PaymentAdapterPresentationRule): string {
  if (rule.kind !== "provider_query_token_url") {
    throw new TypeError("iyzico_customer_return_origin_invalid");
  }
  return rule.origin;
}
const IYZICO_CUSTOMER_RETURN_ORIGINS: readonly string[] = Object.freeze([
  customerReturnOrigin(IYZICO_IFRAME_PACKET.presentation.test),
  customerReturnOrigin(IYZICO_IFRAME_PACKET.presentation.live),
]);
const PROVIDER_CALLBACK_HEADERS = Object.freeze([
  "content-length",
  "content-type",
  "x-provider-signature",
]);

export type ExactHostedPaymentCallback = Readonly<{
  providerCode: string;
  callbackBindingDigest: string;
  method: "POST";
  headers: Readonly<Record<string, string>>;
  body: Uint8Array;
}>;

function canonicalBinding(value: unknown): Buffer | null {
  if (typeof value !== "string" || !BASE64URL.test(value)) return null;
  const bytes = Buffer.from(value, "base64url");
  return bytes.byteLength === 32 && bytes.toString("base64url") === value ? bytes : null;
}

function exactTarget(request: Request, providerCode: string, binding: string, hostname: string): boolean {
  try {
    const target = new URL(request.url);
    return target.protocol === "https:"
      && !target.username
      && !target.password
      && !target.port
      && target.hostname === hostname
      && target.pathname === `/api/payments/${providerCode}/callback/${binding}`
      && !target.search
      && !target.hash
      && target.toString() === `https://${hostname}/api/payments/${providerCode}/callback/${binding}`;
  } catch {
    return false;
  }
}

function exactDigestTarget(request: Request, hostname: string): boolean {
  try {
    const target = new URL(request.url);
    return target.protocol === "https:"
      && !target.username
      && !target.password
      && !target.port
      && target.hostname === hostname
      && target.pathname === "/api/payments/paytr/callback"
      && !target.search
      && !target.hash
      && target.toString() === `https://${hostname}/api/payments/paytr/callback`;
  } catch {
    return false;
  }
}

async function boundedBody(stream: ReadableStream<Uint8Array> | null): Promise<Uint8Array> {
  if (stream === null) throw new TypeError("hosted_payment_callback_invalid");
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const selected = await reader.read();
      if (selected.done) break;
      if (!(selected.value instanceof Uint8Array)) throw new TypeError("hosted_payment_callback_invalid");
      chunks.push(selected.value);
      total += selected.value.byteLength;
      if (total > MAXIMUM_CALLBACK_BYTES) {
        try { await reader.cancel(); } catch { /* rejection remains opaque */ }
        throw new TypeError("hosted_payment_callback_invalid");
      }
    }
    if (total < 1) throw new TypeError("hosted_payment_callback_invalid");
    const output = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return output;
  } finally {
    for (const chunk of chunks) {
      try { chunk.fill(0); } catch { /* cleanup is best effort */ }
    }
    try { reader.releaseLock(); } catch { /* cleanup is best effort */ }
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
    throw new TypeError("hosted_payment_callback_invalid");
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

function validateBody(bytes: Uint8Array, contentType: string): void {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (!Buffer.from(text, "utf8").equals(bytes)) throw new TypeError("hosted_payment_callback_invalid");
  if (contentType === "application/x-www-form-urlencoded") {
    const entries = [...new URLSearchParams(text).entries()];
    if (
      entries.length < 1
      || new Set(entries.map(([name]) => name)).size !== entries.length
      || new URLSearchParams(entries).toString() !== text
    ) throw new TypeError("hosted_payment_callback_invalid");
    return;
  }
  const value = JSON.parse(text) as unknown;
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
    || duplicateJsonKeys(text)
    || JSON.stringify(value) !== text
  ) throw new TypeError("hosted_payment_callback_invalid");
}

function exactHeaders(
  headers: Headers,
  providerCode: string,
): Readonly<Record<string, string>> | null {
  const entries = [...headers.entries()];
  if (entries.length < 1 || entries.length > MAXIMUM_HEADERS) return null;
  const output: Record<string, string> = {};
  for (const [name, value] of entries) {
    if (name === "origin") {
      if (
        providerCode !== IYZICO_IFRAME_PACKET.providerCode
        || !IYZICO_CUSTOMER_RETURN_ORIGINS.includes(value)
      ) return null;
      continue;
    }
    if (
      FORBIDDEN_HEADERS.includes(name)
      || value.length < 1
      || value.length > MAXIMUM_HEADER_VALUE
      || value !== value.trim()
      || CONTROL.test(value)
    ) return null;
    if (PROVIDER_CALLBACK_HEADERS.includes(name)) output[name] = value;
  }
  const contentType = output["content-type"];
  if (contentType === undefined) return null;
  if (FORM_CONTENT_TYPES.includes(contentType)) {
    output["content-type"] = "application/x-www-form-urlencoded";
  } else if (!CONTENT_TYPES.includes(contentType)) {
    return null;
  }
  const declared = output["content-length"];
  if (
    declared !== undefined
    && (
      !/^[1-9][0-9]{0,4}$/.test(declared)
      || Number(declared) > MAXIMUM_CALLBACK_BYTES
    )
  ) return null;
  return Object.freeze(output);
}

export async function readExactHostedPaymentCallback(input: Readonly<{
  request: Request;
  providerCode: string;
  binding: string;
  trustedHostname: string;
}>): Promise<ExactHostedPaymentCallback | null> {
  let bindingBytes: Buffer | null = null;
  try {
    if (
      !(input.request instanceof Request)
      || input.request.method !== "POST"
      || !PROVIDER_CODE.test(input.providerCode)
      || typeof input.trustedHostname !== "string"
      || input.trustedHostname !== input.trustedHostname.toLowerCase()
    ) return null;
    bindingBytes = canonicalBinding(input.binding);
    if (
      bindingBytes === null
      || !exactTarget(input.request, input.providerCode, input.binding, input.trustedHostname)
    ) return null;
    return await readValidatedCallback(
      input.request,
      input.providerCode,
      createHash("sha256").update(bindingBytes).digest("hex"),
    );
  } catch {
    return null;
  } finally {
    bindingBytes?.fill(0);
  }
}

async function readValidatedCallback(
  request: Request,
  providerCode: string,
  callbackBindingDigest: string,
): Promise<ExactHostedPaymentCallback | null> {
  let body: Uint8Array | undefined;
  try {
    const headers = exactHeaders(request.headers, providerCode);
    if (headers === null) return null;
    body = await boundedBody(request.body);
    const declared = headers["content-length"];
    if (declared !== undefined && Number(declared) !== body.byteLength) return null;
    validateBody(body, headers["content-type"]!);
    const selected = Object.freeze({
      providerCode,
      callbackBindingDigest,
      method: "POST" as const,
      headers,
      body,
    });
    body = undefined;
    return selected;
  } catch {
    return null;
  } finally {
    body?.fill(0);
  }
}

export async function readExactHostedPaymentCallbackByDigest(input: Readonly<{
  request: Request;
  providerCode: string;
  callbackBindingDigest: string;
  trustedHostname: string;
}>): Promise<ExactHostedPaymentCallback | null> {
  try {
    if (
      !(input.request instanceof Request)
      || input.request.method !== "POST"
      || !PROVIDER_CODE.test(input.providerCode)
      || !CALLBACK_BINDING_DIGEST.test(input.callbackBindingDigest)
      || typeof input.trustedHostname !== "string"
      || input.trustedHostname !== input.trustedHostname.toLowerCase()
      || !exactDigestTarget(input.request, input.trustedHostname)
    ) return null;
    return await readValidatedCallback(
      input.request,
      input.providerCode,
      input.callbackBindingDigest,
    );
  } catch {
    return null;
  }
}
