import { createHash } from "node:crypto";

const CALLBACK_PATH = "/api/payments/paytr/callback";
const MAX_CALLBACK_BYTES = 2_048;
const MERCHANT_OID = /^(?:[a-f0-9]{32}|[a-f0-9]{64})$/;
const SUCCESS_FIELDS = Object.freeze(["merchant_oid", "status", "total_amount", "hash", "payment_type", "test_mode"]);
const FAILED_FIELDS = Object.freeze([...SUCCESS_FIELDS, "failed_reason_code", "failed_reason_msg"]);

async function boundedBody(stream: ReadableStream<Uint8Array> | null): Promise<Uint8Array> {
  if (stream === null) throw new TypeError("callback_invalid");
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const selected = await reader.read();
      if (selected.done) break;
      if (!(selected.value instanceof Uint8Array)) throw new TypeError("callback_invalid");
      total += selected.value.byteLength;
      if (total > MAX_CALLBACK_BYTES) {
        try { await reader.cancel(); } catch { /* denial remains opaque */ }
        throw new TypeError("callback_invalid");
      }
      chunks.push(selected.value);
    }
    if (total < 1) throw new TypeError("callback_invalid");
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } finally { reader.releaseLock(); }
}

function canonicalCallbackUrl(value: string, hostname: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.port &&
      parsed.hostname === hostname && parsed.hostname === parsed.hostname.toLowerCase() &&
      parsed.pathname === CALLBACK_PATH && !parsed.search && !parsed.hash &&
      parsed.toString() === `https://${hostname}${CALLBACK_PATH}`;
  } catch { return false; }
}

function exactForm(body: string): string | null {
  const params = new URLSearchParams(body);
  const entries = [...params.entries()];
  if (entries.length < SUCCESS_FIELDS.length || new URLSearchParams(entries).toString() !== body) return null;
  const status = params.get("status");
  const expected = status === "success" ? SUCCESS_FIELDS : status === "failed" ? FAILED_FIELDS : [];
  if (entries.length !== expected.length || new Set(entries.map(([name]) => name)).size !== entries.length ||
      entries.some(([name]) => !expected.includes(name)) || expected.some((name) => !params.has(name))) return null;
  const oid = params.get("merchant_oid");
  return oid !== null && MERCHANT_OID.test(oid) ? oid : null;
}

export async function readExactPaytrCallbackRequest(input: Readonly<{
  request: Request;
  trustedHostname: string;
  configuredCallbackUrl: string;
}>): Promise<Readonly<{ merchantOid: string; form: string; callbackDigest: string }> | null> {
  try {
    const { request, trustedHostname, configuredCallbackUrl } = input;
    if (request.method !== "POST" || request.headers.get("content-type") !== "application/x-www-form-urlencoded" ||
        request.headers.has("authorization") || request.headers.has("transfer-encoding") ||
        request.headers.has("origin") || request.headers.has("cookie") ||
        !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(trustedHostname) ||
        !canonicalCallbackUrl(configuredCallbackUrl, trustedHostname)) return null;
    const url = new URL(request.url);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password ||
        url.pathname !== CALLBACK_PATH || url.search || url.hash) return null;
    const contentLength = request.headers.get("content-length");
    if (contentLength !== null && (!/^[1-9][0-9]{0,3}$/.test(contentLength) || Number(contentLength) > MAX_CALLBACK_BYTES)) return null;
    const bytes = await boundedBody(request.body);
    try {
      const form = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (!Buffer.from(form, "utf8").equals(bytes)) return null;
      const merchantOid = exactForm(form);
      if (merchantOid === null) return null;
      return Object.freeze({ merchantOid, form,
        callbackDigest: createHash("sha256").update(bytes).digest("hex") });
    } finally { bytes.fill(0); }
  } catch { return null; }
}
