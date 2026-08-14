import { createHash } from "node:crypto";

const CALLBACK_PATH = "/api/payments/paytr/callback";
const MAX_CALLBACK_BYTES = 2_048;
const MERCHANT_OID = /^(?:[a-f0-9]{32}|[a-f0-9]{64})$/;
const SUCCESS_FIELDS = Object.freeze(["merchant_oid", "status", "total_amount", "hash", "payment_type", "test_mode"]);
const SUCCESS_CONTEXT_FIELDS = Object.freeze([...SUCCESS_FIELDS, "payment_amount", "currency"]);
const INSTALLMENT_COUNT = /^(?:[0-9]|1[0-2])$/;
const FAILED_FIELDS = Object.freeze([...SUCCESS_FIELDS, "failed_reason_code", "failed_reason_msg"]);
export type PaytrCallbackRequestRejectionStage =
  | "method" | "content_type" | "headers" | "authority"
  | "target" | "length" | "body" | "form_encoding" | "form_status"
  | "form_context" | "form_fields_duplicate" | "form_fields_failure_on_success"
  | "form_fields_installment" | "form_fields_merchant" | "form_fields_test_mode"
  | "form_fields_payment_type" | "form_fields_unknown_extra"
  | "form_fields_unknown_missing" | "form_fields_unknown_replace" | "form_oid";

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

function exactForm(
  body: string,
  reject: (stage: PaytrCallbackRequestRejectionStage) => null,
): string | null {
  const params = new URLSearchParams(body);
  const entries = [...params.entries()];
  if (new URLSearchParams(entries).toString() !== body) return reject("form_encoding");
  const names = new Set(entries.map(([name]) => name));
  if (names.size !== entries.length) return reject("form_fields_duplicate");
  const status = params.get("status");
  if (status !== "success" && status !== "failed") return reject("form_status");
  const hasPaymentAmount = params.has("payment_amount");
  const hasCurrency = params.has("currency");
  if (hasPaymentAmount !== hasCurrency) return reject("form_context");
  const installmentCount = params.get("installment_count");
  if (installmentCount !== null && (status !== "success" || !INSTALLMENT_COUNT.test(installmentCount))) {
    return reject("form_fields_installment");
  }
  const baseExpected = status === "success"
    ? hasPaymentAmount ? SUCCESS_CONTEXT_FIELDS : SUCCESS_FIELDS
    : status === "failed" ? FAILED_FIELDS : [];
  const expected = installmentCount === null ? baseExpected : [...baseExpected, "installment_count"];
  if (entries.length !== expected.length || entries.some(([name]) => !expected.includes(name)) ||
      expected.some((name) => !params.has(name))) {
    if (status === "success" && (names.has("failed_reason_code") || names.has("failed_reason_msg"))) {
      return reject("form_fields_failure_on_success");
    }
    if (names.has("installment_count")) return reject("form_fields_installment");
    if (names.has("merchant_id")) return reject("form_fields_merchant");
    if (!names.has("test_mode")) return reject("form_fields_test_mode");
    if (!names.has("payment_type")) return reject("form_fields_payment_type");
    if (entries.length > expected.length) return reject("form_fields_unknown_extra");
    if (entries.length < expected.length) return reject("form_fields_unknown_missing");
    return reject("form_fields_unknown_replace");
  }
  const oid = params.get("merchant_oid");
  return oid !== null && MERCHANT_OID.test(oid) ? oid : reject("form_oid");
}

export async function readExactPaytrCallbackRequest(input: Readonly<{
  request: Request;
  trustedHostname: string;
  configuredCallbackUrl: string;
  audit?: (stage: PaytrCallbackRequestRejectionStage) => void;
}>): Promise<Readonly<{ merchantOid: string; form: string; callbackDigest: string }> | null> {
  const reject = (stage: PaytrCallbackRequestRejectionStage): null => {
    try { input.audit?.(stage); } catch { /* diagnostics cannot affect rejection */ }
    return null;
  };
  try {
    const { request, trustedHostname, configuredCallbackUrl } = input;
    if (request.method !== "POST") return reject("method");
    if (request.headers.get("content-type") !== "application/x-www-form-urlencoded") return reject("content_type");
    if (request.headers.has("authorization") || request.headers.has("transfer-encoding") ||
        request.headers.has("origin") || request.headers.has("cookie")) return reject("headers");
    if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(trustedHostname) ||
        !canonicalCallbackUrl(configuredCallbackUrl, trustedHostname)) return reject("authority");
    const url = new URL(request.url);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password ||
        url.pathname !== CALLBACK_PATH || url.search || url.hash) return reject("target");
    const contentLength = request.headers.get("content-length");
    if (contentLength !== null && (!/^[1-9][0-9]{0,3}$/.test(contentLength) || Number(contentLength) > MAX_CALLBACK_BYTES)) return reject("length");
    let bytes: Uint8Array;
    try { bytes = await boundedBody(request.body); }
    catch { return reject("body"); }
    try {
      const form = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (!Buffer.from(form, "utf8").equals(bytes)) return reject("body");
      const merchantOid = exactForm(form, reject);
      if (merchantOid === null) return null;
      const adapterForm = new URLSearchParams(form);
      adapterForm.delete("installment_count");
      return Object.freeze({ merchantOid, form: adapterForm.toString(),
        callbackDigest: createHash("sha256").update(bytes).digest("hex") });
    } finally { bytes.fill(0); }
  } catch { return reject("body"); }
}
