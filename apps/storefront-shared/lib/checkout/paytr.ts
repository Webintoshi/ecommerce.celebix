import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { types as nodeTypes } from "node:util";

import {
  serializeCanonicalPaytrConfiguration,
  type CanonicalPaytrConfiguration,
} from "@celebix/saas-data";

export type PaytrConfiguration = CanonicalPaytrConfiguration;

export type PaytrCallback =
  | Readonly<{
      status: "success"; merchantOid: string;
      totalAmount: number; paymentAmount: number; paymentType: "card" | "eft";
      currency: "TRY"; testMode: 1;
    }>
  | Readonly<{
      status: "failed"; merchantOid: string; totalAmount: number;
      paymentType: "card" | "eft"; failedReasonCode: string;
      failedReasonMessageDigest: string; testMode: 1;
    }>;

const GET_TOKEN_URL = "https://www.paytr.com/odeme/api/get-token";
const STATUS_URL = "https://www.paytr.com/odeme/durum-sorgu";
const MAX_RESPONSE_BYTES = 4_096;
const CONTROL = /[\u0000-\u001f\u007f]/;
const MERCHANT_OID = /^[A-Za-z0-9]{1,64}$/;
const PROVIDER_TOKEN = /^[A-Za-z0-9_-]{32,256}$/;
const MAJOR_AMOUNT = /^(?:0|[1-9][0-9]{0,11})[.,][0-9]{1,2}$/;
const CALLBACK_AMOUNT = /^(?:0|[1-9][0-9]{0,14})$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const INSTALLMENTS = new Set([0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

function invalid(): never {
  throw new TypeError("paytr_invalid");
}

function configuration(value: PaytrConfiguration): PaytrConfiguration {
  serializeCanonicalPaytrConfiguration(value);
  return value;
}

function boundedString(value: unknown, minimum: number, maximum: number): string {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum ||
      value !== value.trim() || CONTROL.test(value)) invalid();
  return value;
}

function merchantOid(value: unknown): string {
  const selected = boundedString(value, 1, 64);
  if (!MERCHANT_OID.test(selected)) invalid();
  return selected;
}

function positiveInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) invalid();
  return value as number;
}

function canonicalBase64(value: unknown, maximumBytes = 16_384): string {
  if (typeof value !== "string" || value.length < 4 || !BASE64.test(value)) invalid();
  const bytes = Buffer.from(value, "base64");
  try {
    if (bytes.byteLength < 1 || bytes.byteLength > maximumBytes || bytes.toString("base64") !== value) invalid();
    return value;
  } finally {
    bytes.fill(0);
  }
}

function basket(value: unknown): string {
  const encoded = canonicalBase64(value, 8_192);
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")); } catch { return invalid(); }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 100) invalid();
  for (const item of parsed) {
    if (!Array.isArray(item) || item.length !== 3 || Object.getPrototypeOf(item) !== Array.prototype) invalid();
    boundedString(item[0], 1, 200);
    if (typeof item[1] !== "string" || !/^(?:0|[1-9][0-9]{0,9})[.][0-9]{2}$/.test(item[1])) invalid();
    positiveInteger(item[2]);
  }
  return encoded;
}

function email(value: unknown): string {
  const selected = boundedString(value, 3, 100);
  if (!/^[\x21-\x7e]+@[A-Za-z0-9.-]+$/.test(selected) || selected.includes("..")) invalid();
  return selected;
}

function userIp(value: unknown): string {
  const selected = boundedString(value, 2, 39);
  if (isIP(selected) === 0) invalid();
  return selected;
}

function installment(value: unknown): number {
  if (!Number.isSafeInteger(value) || !INSTALLMENTS.has(value as number)) invalid();
  return value as number;
}

function hmac(configurationValue: PaytrConfiguration, message: string): string {
  const selected = configuration(configurationValue);
  return createHmac("sha256", selected.merchantKey).update(message, "utf8").digest("base64");
}

export function createPaytrToken(input: Readonly<{
  configuration: PaytrConfiguration;
  userIp: string;
  merchantOid: string;
  email: string;
  paymentAmount: number;
  userBasket: string;
  noInstallment: 0 | 1;
  maxInstallment: number;
  currency: "TL";
}>): string {
  const selected = configuration(input.configuration);
  const ip = userIp(input.userIp);
  const oid = merchantOid(input.merchantOid);
  const customerEmail = email(input.email);
  const amount = positiveInteger(input.paymentAmount);
  const selectedBasket = basket(input.userBasket);
  if (input.noInstallment !== 0 && input.noInstallment !== 1) invalid();
  const maximum = installment(input.maxInstallment);
  if (input.currency !== "TL") invalid();
  return hmac(selected, `${selected.merchantId}${ip}${oid}${customerEmail}${String(amount)}${selectedBasket}${String(input.noInstallment)}${String(maximum)}TL${String(selected.testMode)}${selected.merchantSalt}`);
}

function canonicalCallbackHash(value: unknown): Buffer | null {
  if (typeof value !== "string" || value.length !== 44 || !BASE64.test(value)) return null;
  const bytes = Buffer.from(value, "base64");
  return bytes.byteLength === 32 && bytes.toString("base64") === value ? bytes : null;
}

export function verifyPaytrCallback(input: Readonly<{
  configuration: PaytrConfiguration;
  merchantOid: string;
  status: "success" | "failed";
  totalAmount: string;
  providedHash: string;
}>): boolean {
  try {
    const selected = configuration(input.configuration);
    const oid = merchantOid(input.merchantOid);
    if (input.status !== "success" && input.status !== "failed") return false;
    if (typeof input.totalAmount !== "string" || !CALLBACK_AMOUNT.test(input.totalAmount)) return false;
    const provided = canonicalCallbackHash(input.providedHash);
    if (provided === null) return false;
    const expected = Buffer.from(hmac(selected, `${oid}${selected.merchantSalt}${input.status}${input.totalAmount}`), "base64");
    try { return timingSafeEqual(provided, expected); } finally { provided.fill(0); expected.fill(0); }
  } catch {
    return false;
  }
}

export function authenticatePaytrCallback(input: Readonly<{
  configuration: PaytrConfiguration;
  form: string;
  expectedPaymentAmount: number;
}>): PaytrCallback | null {
  try {
    const expectedPaymentAmount = positiveInteger(input.expectedPaymentAmount);
    if (typeof input.form !== "string" || input.form.length < 1 || input.form.length > 2_048) return null;
    const params = new URLSearchParams(input.form);
    const entries = [...params.entries()];
    if (new URLSearchParams(entries).toString() !== input.form || new Set(entries.map(([key]) => key)).size !== entries.length) return null;
    const status = params.get("status");
    if (status !== "success" && status !== "failed") return null;
    const successFields = ["merchant_oid", "status", "total_amount", "hash", "payment_type", "test_mode"];
    const fields = status === "success" ? successFields : [...successFields, "failed_reason_code", "failed_reason_msg"];
    if (entries.length !== fields.length || fields.some((field) => !params.has(field)) ||
        entries.some(([field]) => !fields.includes(field))) return null;
    const oid = params.get("merchant_oid");
    const rawTotalAmount = params.get("total_amount");
    const providedHash = params.get("hash");
    const paymentType = params.get("payment_type");
    if (oid === null || rawTotalAmount === null || providedHash === null ||
        (paymentType !== "card" && paymentType !== "eft") || params.get("test_mode") !== "1" ||
        !/^[1-9][0-9]{0,15}$/.test(rawTotalAmount)) return null;
    const totalAmount = Number(rawTotalAmount);
    if (!Number.isSafeInteger(totalAmount) || !verifyPaytrCallback({ configuration: input.configuration,
      merchantOid: oid, status, totalAmount: rawTotalAmount, providedHash })) return null;
    if (status === "success") {
      if (totalAmount < expectedPaymentAmount) return null;
      return Object.freeze({ status, merchantOid: oid, totalAmount, paymentAmount: expectedPaymentAmount,
        paymentType, currency: "TRY", testMode: 1 });
    }
    const failedReasonCode = params.get("failed_reason_code");
    const failedReasonMessage = params.get("failed_reason_msg");
    if (failedReasonCode === null || failedReasonMessage === null) return null;
    boundedString(failedReasonCode, 1, 64);
    boundedString(failedReasonMessage, 1, 512);
    return Object.freeze({ status, merchantOid: oid, totalAmount, paymentType, testMode: 1,
      failedReasonCode, failedReasonMessageDigest: createHash("sha256").update(failedReasonMessage, "utf8").digest("hex") });
  } catch { return null; }
}

export function createPaytrStatusToken(configurationValue: PaytrConfiguration, merchantOidValue: string): string {
  const selected = configuration(configurationValue);
  const oid = merchantOid(merchantOidValue);
  return hmac(selected, `${selected.merchantId}${oid}${selected.merchantSalt}`);
}

function exactRecord(value: unknown, required: readonly string[], optional: readonly string[] = []): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || nodeTypes.isProxy(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const allowed = new Set([...required, ...optional]);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string" || !allowed.has(key)) ||
      required.some((key) => !Object.hasOwn(descriptors, key))) invalid();
  const copy: Record<string, unknown> = Object.create(null);
  for (const key of [...required, ...optional]) {
    const descriptor = descriptors[key];
    if (!descriptor) continue;
    if (!("value" in descriptor) || !descriptor.enumerable) invalid();
    copy[key] = descriptor.value;
  }
  return Object.freeze(copy);
}

function duplicateJsonKeys(text: string): boolean {
  let cursor = 0;
  const whitespace = () => { while (/\s/.test(text[cursor] ?? "")) cursor += 1; };
  const string = (): string => {
    const start = cursor;
    cursor += 1;
    while (cursor < text.length) {
      if (text[cursor] === "\\") { cursor += 2; continue; }
      if (text[cursor] === '"') { cursor += 1; return JSON.parse(text.slice(start, cursor)) as string; }
      cursor += 1;
    }
    return invalid();
  };
  const value = (): boolean => {
    whitespace();
    if (text[cursor] === "{") return object();
    if (text[cursor] === "[") {
      cursor += 1; whitespace();
      if (text[cursor] === "]") { cursor += 1; return false; }
      while (cursor < text.length) {
        if (value()) return true;
        whitespace();
        if (text[cursor] === "]") { cursor += 1; return false; }
        cursor += 1;
      }
      return false;
    }
    if (text[cursor] === '"') { string(); return false; }
    while (cursor < text.length && !/[\s,}\]]/.test(text[cursor]!)) cursor += 1;
    return false;
  };
  const object = (): boolean => {
    cursor += 1; whitespace();
    if (text[cursor] === "}") { cursor += 1; return false; }
    const keys = new Set<string>();
    while (cursor < text.length) {
      whitespace();
      const key = string();
      if (keys.has(key)) return true;
      keys.add(key); whitespace(); cursor += 1;
      if (value()) return true;
      whitespace();
      if (text[cursor] === "}") { cursor += 1; return false; }
      cursor += 1;
    }
    return false;
  };
  try { return value(); } catch { return true; }
}

async function responseJson(response: Response): Promise<unknown> {
  if (response.status !== 200) invalid();
  const contentType = response.headers.get("content-type");
  if (contentType === null || !/^application\/json(?:; charset=utf-8)?$/i.test(contentType)) invalid();
  const length = response.headers.get("content-length");
  if (length !== null && (!/^(?:0|[1-9][0-9]{0,4})$/.test(length) || Number(length) > MAX_RESPONSE_BYTES)) invalid();
  const bytes = Buffer.from(await boundedStream(response.body, MAX_RESPONSE_BYTES));
  try {
    if (bytes.byteLength < 2 || bytes.byteLength > MAX_RESPONSE_BYTES) invalid();
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!Buffer.from(text, "utf8").equals(bytes) || duplicateJsonKeys(text)) invalid();
    return JSON.parse(text) as unknown;
  } finally {
    bytes.fill(0);
  }
}

async function boundedStream(stream: ReadableStream<Uint8Array> | null, maximumBytes: number): Promise<Uint8Array> {
  if (stream === null) invalid();
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const selected = await reader.read();
      if (selected.done) break;
      if (!(selected.value instanceof Uint8Array)) invalid();
      total += selected.value.byteLength;
      if (total > maximumBytes) {
        try { await reader.cancel(); } catch { /* rejection remains opaque */ }
        invalid();
      }
      chunks.push(selected.value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } finally {
    reader.releaseLock();
  }
}

export type PaytrIframeTokenResult =
  | Readonly<{ status: "success"; token: string }>
  | Readonly<{ status: "rejected" }>
  | Readonly<{ status: "unknown" }>;

export async function requestPaytrIframeToken(input: Readonly<{
  configuration: PaytrConfiguration;
  userIp: string;
  merchantOid: string;
  email: string;
  paymentAmount: number;
  userBasket: string;
  userName: string;
  userAddress: string;
  userPhone: string;
  successUrl: string;
  failureUrl: string;
  noInstallment: 0 | 1;
  maxInstallment: number;
  signal: AbortSignal;
}>): Promise<PaytrIframeTokenResult> {
  try {
    const selected = configuration(input.configuration);
    const params = new URLSearchParams();
    params.append("merchant_id", selected.merchantId);
    params.append("user_ip", userIp(input.userIp));
    params.append("merchant_oid", merchantOid(input.merchantOid));
    params.append("email", email(input.email));
    params.append("payment_amount", String(positiveInteger(input.paymentAmount)));
    params.append("paytr_token", createPaytrToken({ configuration: selected, userIp: input.userIp, merchantOid: input.merchantOid, email: input.email, paymentAmount: input.paymentAmount, userBasket: input.userBasket, noInstallment: input.noInstallment, maxInstallment: input.maxInstallment, currency: "TL" }));
    params.append("user_basket", basket(input.userBasket));
    params.append("debug_on", "0");
    params.append("no_installment", String(input.noInstallment));
    params.append("max_installment", String(installment(input.maxInstallment)));
    params.append("user_name", boundedString(input.userName, 1, 60));
    params.append("user_address", boundedString(input.userAddress, 1, 400));
    params.append("user_phone", boundedString(input.userPhone, 1, 20));
    params.append("merchant_ok_url", exactReturnUrl(input.successUrl));
    params.append("merchant_fail_url", exactReturnUrl(input.failureUrl));
    params.append("timeout_limit", "30");
    params.append("currency", "TL");
    params.append("test_mode", "1");
    if (!(input.signal instanceof AbortSignal)) invalid();
    const response = await fetch(GET_TOKEN_URL, { method: "POST", redirect: "manual", signal: input.signal,
      headers: { "content-type": "application/x-www-form-urlencoded" }, body: params.toString() });
    const parsed = await responseJson(response);
    const status = exactRecord(parsed, ["status"], ["token", "reason"]);
    if (status.status === "success") {
      if (Object.keys(status).length !== 2 || typeof status.token !== "string" || !PROVIDER_TOKEN.test(status.token)) invalid();
      return Object.freeze({ status: "success", token: status.token });
    }
    if (status.status === "failed") {
      if (Object.keys(status).length !== 2) invalid();
      boundedString(status.reason, 1, 512);
      return Object.freeze({ status: "rejected" });
    }
    return Object.freeze({ status: "unknown" });
  } catch {
    return Object.freeze({ status: "unknown" });
  }
}

function exactReturnUrl(value: unknown): string {
  const raw = boundedString(value, 1, 400);
  const parsed = new URL(raw);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || parsed.hash ||
      parsed.pathname !== "/odeme/hizli/sonuc" ||
      (parsed.search !== "?durum=basarili" && parsed.search !== "?durum=basarisiz") ||
      parsed.hostname !== parsed.hostname.toLowerCase() || parsed.toString() !== raw) invalid();
  return raw;
}

function majorAmount(value: unknown): number {
  if (typeof value !== "string" || !MAJOR_AMOUNT.test(value)) invalid();
  const [whole, fraction] = value.replace(",", ".").split(".") as [string, string];
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) invalid();
  return Number(cents);
}

function dateTime(value: unknown): string {
  const selected = boundedString(value, 10, 19);
  if (!/^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}:\d{2})?$/.test(selected)) invalid();
  return selected;
}

function optionalMetadata(parsed: Readonly<Record<string, unknown>>): void {
  if (parsed.net_tutar !== undefined) majorAmount(parsed.net_tutar);
  if (parsed.kesinti_tutari !== undefined) majorAmount(parsed.kesinti_tutari);
  if (parsed.taksit !== undefined && (typeof parsed.taksit !== "string" || !/^(?:0|[2-9]|1[0-2])$/.test(parsed.taksit))) invalid();
  if (parsed.kart_marka !== undefined) boundedString(parsed.kart_marka, 1, 32);
  if (parsed.masked_pan !== undefined && (typeof parsed.masked_pan !== "string" || !/^[A-Za-z0-9*]{6,32}$/.test(parsed.masked_pan))) invalid();
  if (parsed.auth_code !== undefined && (typeof parsed.auth_code !== "string" || !/^[A-Za-z0-9]{1,32}$/.test(parsed.auth_code))) invalid();
  if (parsed.auth_date !== undefined && (typeof parsed.auth_date !== "string" || !/^\d{2}[.]\d{2}[.]\d{4} \d{2}:\d{2}:\d{2}$/.test(parsed.auth_date))) invalid();
  if (parsed.odeme_tipi !== undefined && parsed.odeme_tipi !== "KART" && parsed.odeme_tipi !== "EFT") invalid();
  if (parsed.returns === undefined) return;
  if (!Array.isArray(parsed.returns) || parsed.returns.length > 100 || Object.getPrototypeOf(parsed.returns) !== Array.prototype) invalid();
  const fields = ["return_amount", "return_date", "return_type", "date_completed", "return_auth_code", "return_ref_num", "reference_no", "return_source"];
  for (const entry of parsed.returns) {
    const selected = exactRecord(entry, [], fields);
    if (Object.keys(selected).length < 1) invalid();
    if (selected.return_amount !== undefined) majorAmount(selected.return_amount);
    for (const field of fields.slice(1)) {
      const value = selected[field];
      if (value !== undefined && (typeof value !== "string" || value.length > 128 || CONTROL.test(value))) invalid();
    }
  }
}

export async function queryPaytrStatus(input: Readonly<{
  configuration: PaytrConfiguration; merchantOid: string; signal: AbortSignal;
}>): Promise<Readonly<{
  status: "success"; paymentAmount: number; totalAmount: number;
  currency: "TRY"; testMode: 1;
}> | Readonly<{ status: "unknown" }>> {
  try {
    const selected = configuration(input.configuration);
    const oid = merchantOid(input.merchantOid);
    if (!(input.signal instanceof AbortSignal)) invalid();
    const params = new URLSearchParams();
    params.append("merchant_id", selected.merchantId);
    params.append("merchant_oid", oid);
    params.append("paytr_token", createPaytrStatusToken(selected, oid));
    const response = await fetch(STATUS_URL, { method: "POST", redirect: "manual", signal: input.signal,
      headers: { "content-type": "application/x-www-form-urlencoded" }, body: params.toString() });
    const raw = await responseJson(response);
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) invalid();
    const candidate = raw as Record<string, unknown>;
    if (candidate.status === "error") {
      const error = exactRecord(raw, ["status", "err_no", "err_msg"]);
      if (typeof error.err_no !== "string" || !/^[0-9]{1,16}$/.test(error.err_no)) invalid();
      boundedString(error.err_msg, 1, 512);
      return Object.freeze({ status: "unknown" });
    }
    const parsed = exactRecord(raw,
      ["status", "payment_amount", "payment_total", "payment_date", "currency", "test_mode"],
      ["net_tutar", "kesinti_tutari", "taksit", "kart_marka", "masked_pan", "auth_code", "auth_date", "odeme_tipi", "returns"]);
    if (parsed.status !== "success" || (parsed.currency !== "TL" && parsed.currency !== "TRY") || parsed.test_mode !== "1") invalid();
    dateTime(parsed.payment_date);
    optionalMetadata(parsed);
    const paymentAmount = majorAmount(parsed.payment_amount);
    const totalAmount = majorAmount(parsed.payment_total);
    if (paymentAmount < 1 || totalAmount < paymentAmount) invalid();
    return Object.freeze({ status: "success", paymentAmount, totalAmount, currency: "TRY", testMode: 1 });
  } catch {
    return Object.freeze({ status: "unknown" });
  }
}
