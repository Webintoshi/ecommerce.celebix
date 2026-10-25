import { randomBytes as cryptoRandomBytes } from "node:crypto";
import { isIP } from "node:net";
import { types as nodeTypes } from "node:util";
import { parseProviderPaymentMethodConfig } from "@celebix/saas-contracts";
import type { HostedPaymentAdapter, HostedPaymentCallbackInput, HostedPaymentInitialization, HostedPaymentInitializeInput, HostedPaymentQueryInput, HostedPaymentStatus, VerifiedProviderCallback } from "../../contracts.ts";
import type { ProviderTransport, ProviderTransportResult } from "../../transport.ts";
import { createAkbankHmac, parseAkbankCredential, verifyAkbankHmac, wipeAkbankCredential, type AkbankCredential } from "./config.ts";
import { AKBANK_HOSTED_FIELD_NAMES, AKBANK_JSON_PACKET } from "./packet.ts";

export { AKBANK_JSON_PACKET } from "./packet.ts";
export type { AkbankCredential } from "./config.ts";
export type AkbankAdapterOptions = Readonly<{ now(): Date; randomBytes(size: number): Uint8Array }>;
export type AkbankCredentialValidationResult =
  | Readonly<{ kind: "validated"; maskedAccountReference: string; outcomeCode: "provider_validated" }>
  | Readonly<{ kind: "rejected"; outcomeCode: "provider_rejected" | "validation_unavailable" | "invalid_validation_request" }>;

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ORDER = /^[A-Za-z0-9_-]{1,36}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const NOT_FOUND = new Set(["VPS-1007", "VPS-2160"]);
const DEFAULT_OPTIONS = Object.freeze({ now: () => new Date(), randomBytes: (size: number) => new Uint8Array(cryptoRandomBytes(size)) });
const INITIALIZE_KEYS = ["environment","preferences","credential","attemptId","orderReference","amountMinor","currency","callbackUrl","successUrl","failureUrl","customer","basket","signal"];
const QUERY_KEYS = ["environment","credential","attemptId","orderReference","providerReference","amountMinor","currency","signal"];
const CALLBACK_KEYS = ["environment","credential","method","headers","body","expected"];
const CALLBACK_CRITICAL = ["merchantSafeId","terminalSafeId","orderId","amount"];
const CALLBACK_IF_PRESENT = ["txnCode","responseCode","hostResponseCode","currencyCode","installCount","txnStatus","ccbRewardAmount","pcbRewardAmount","xcbRewardAmount"];

type Inquiry = { kind: "verified"; value: Record<string, unknown> } | { kind: "unavailable" } | { kind: "denied" };

function invalid(code = "akbank_adapter_invalid"): never { throw new TypeError(code); }
function wipe(value: Uint8Array | undefined): void { try { value?.fill(0); } catch { /* Cleanup preserves the outcome. */ } }
function record(value: unknown, required: readonly string[] = [], allowed?: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || nodeTypes.isProxy(value) || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length > 128 || keys.some(key => typeof key !== "string" || (allowed && !allowed.includes(key))) || required.some(key => !Object.hasOwn(descriptors, key))) invalid();
  const selected: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys as string[]) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    selected[key] = descriptor.value;
  }
  return selected;
}
function bytes(value: unknown, maximum = 1_048_576): Uint8Array {
  if (nodeTypes.isProxy(value) || !nodeTypes.isUint8Array(value) || Object.getPrototypeOf(value) !== Uint8Array.prototype || !(value.buffer instanceof ArrayBuffer) || value.byteLength < 1 || value.byteLength > maximum) invalid();
  return value;
}
function text(value: unknown, maximum = 128): string {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || value.trim() !== value || CONTROL.test(value) || /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/.test(value)) invalid();
  return value;
}
function amount(value: unknown): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) invalid(); return value; }
function environment(value: unknown): "test" | "live" { if (value !== "test" && value !== "live") invalid(); return value; }
function abortSignal(value: unknown): AbortSignal { if (!(value instanceof AbortSignal)) invalid(); return value; }
function attempt(value: unknown): string { if (typeof value !== "string" || !UUID.test(value)) invalid(); return value; }
function order(value: unknown): string { if (typeof value !== "string" || !ORDER.test(value)) invalid(); return value; }
function major(value: number): string { return `${Math.floor(value / 100)}.${String(value % 100).padStart(2,"0")}`; }
function matchesAmount(value: unknown, expected: number): boolean {
  const selected = typeof value === "number" && Number.isFinite(value) && !Object.is(value,-0) ? String(value) : value;
  if (typeof selected !== "string" || !/^(?:0|[1-9][0-9]{0,13})(?:\.[0-9]{1,8})?$/.test(selected)) return false;
  const [whole, fraction = ""] = selected.split(".");
  if (!/^0*$/.test(fraction.slice(2))) return false;
  return BigInt(whole!) * 100n + BigInt(`${fraction}00`.slice(0,2)) === BigInt(expected);
}
function zero(value: unknown): boolean { return matchesAmount(value, 0); }
function dependencies(value: unknown): AkbankAdapterOptions {
  const selected = record(value,["now","randomBytes"],["now","randomBytes"]);
  if (typeof selected.now !== "function" || typeof selected.randomBytes !== "function" || nodeTypes.isProxy(selected.now) || nodeTypes.isProxy(selected.randomBytes)) invalid();
  return Object.freeze({now:selected.now as () => Date,randomBytes:selected.randomBytes as (size:number) => Uint8Array});
}
function clock(options: AkbankAdapterOptions): string {
  const date = options.now();
  if (!(date instanceof Date) || nodeTypes.isProxy(date) || !Number.isFinite(date.getTime())) invalid();
  // Bank examples omit offsets. Turkish civil time is an isolated, documented implementation choice.
  return new Date(date.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0,-1);
}
function nonce(options: AkbankAdapterOptions): string {
  let random: Uint8Array | undefined;
  try { random = bytes(options.randomBytes(64),64); if (random.byteLength !== 64) invalid(); return Buffer.from(random).toString("hex").toUpperCase(); } finally { wipe(random); }
}
function requestFunction(transport: ProviderTransport): ProviderTransport["request"] {
  const selected = record(transport,["request"],["request"]);
  if (typeof selected.request !== "function" || nodeTypes.isProxy(selected.request)) invalid();
  return selected.request as ProviderTransport["request"];
}
function callbackAuthority(value: unknown): { url: string; origin: string } {
  const selected = text(value,2048);
  const url = new URL(selected);
  const segments = url.pathname.split("/");
  const binding = segments[5];
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash || url.toString() !== selected || !url.hostname.includes(".") || isIP(url.hostname) !== 0 || url.hostname.endsWith(".invalid") || segments.length !== 6 || segments[1] !== "api" || segments[2] !== "payments" || segments[3] !== "akbank_json" || segments[4] !== "callback" || !binding || !/^[A-Za-z0-9_-]{43}$/.test(binding)) invalid();
  const decoded = Buffer.from(binding,"base64url");
  try { if (decoded.byteLength !== 32 || decoded.toString("base64url") !== binding) invalid(); } finally { decoded.fill(0); }
  return {url:selected,origin:url.origin};
}
function returnAuthority(value: unknown, origin: string, status: "basarili" | "basarisiz"): void {
  const selected = text(value,2048);
  const url = new URL(selected);
  if (url.origin !== origin || url.protocol !== "https:" || url.username || url.password || url.hash || url.toString() !== selected || `${url.pathname}${url.search}` !== `/odeme/hizli/sonuc?durum=${status}`) invalid();
}
function basketShape(value: unknown): void {
  if (!Array.isArray(value) || nodeTypes.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < 1 || value.length > 1000) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) invalid();
  for (let index=0;index<value.length;index+=1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) invalid();
    const item = record(descriptor.value,["reference","name","quantity","unitAmountMinor"],["reference","name","quantity","unitAmountMinor","itemType"]);
    text(item.reference); text(item.name,256);
    amount(item.quantity);
    if (typeof item.unitAmountMinor !== "number" || !Number.isSafeInteger(item.unitAmountMinor) || item.unitAmountMinor < 0) invalid();
    if (item.itemType !== undefined && item.itemType !== "PHYSICAL" && item.itemType !== "VIRTUAL") invalid();
  }
}
function duplicateJsonKeys(source: string): boolean {
  let cursor = 0;
  let depth = 0;
  const whitespace = () => { while (/\s/.test(source[cursor] ?? "")) cursor += 1; };
  const string = (): string => {
    const start = cursor++;
    while (cursor < source.length) {
      if (source[cursor] === "\\") { cursor += 2; continue; }
      if (source[cursor++] === '"') return JSON.parse(source.slice(start,cursor)) as string;
    }
    return invalid();
  };
  const value = (): boolean => {
    whitespace();
    if (++depth > 64) return true;
    const token = source[cursor];
    if (token === "{") {
      cursor += 1; whitespace();
      const keys = new Set<string>();
      if (source[cursor] !== "}") while (cursor < source.length) {
        whitespace(); const key = string(); if (keys.has(key)) return true; keys.add(key);
        whitespace(); cursor += 1; if (value()) return true; whitespace();
        if (source[cursor] !== ",") break; cursor += 1;
      }
      cursor += 1;
    } else if (token === "[") {
      cursor += 1; whitespace();
      if (source[cursor] !== "]") while (cursor < source.length) { if (value()) return true; whitespace(); if (source[cursor] !== ",") break; cursor += 1; }
      cursor += 1;
    } else if (token === '"') string();
    else { while (cursor < source.length && !/[\s,}\]]/.test(source[cursor]!)) cursor += 1; }
    depth -= 1;
    return false;
  };
  return value();
}
function authenticatedJson(source: string): unknown {
  // Validate the authenticated original syntax, then retain every numeric token
  // as decimal text. No security decision uses JSON's rounded binary numbers.
  JSON.parse(source);
  const number = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
  const parts: string[] = [];
  let cursor = 0;
  let copied = 0;
  while (cursor < source.length) {
    const character = source[cursor]!;
    if (character === '"') {
      cursor += 1;
      while (cursor < source.length) {
        if (source[cursor] === "\\") { cursor += 2; continue; }
        if (source[cursor++] === '"') break;
      }
      continue;
    }
    if (character === "-" || /[0-9]/.test(character)) {
      number.lastIndex = cursor;
      const token = number.exec(source);
      if (token === null) invalid();
      parts.push(source.slice(copied, cursor), JSON.stringify(token[0]));
      cursor = number.lastIndex;
      copied = cursor;
      continue;
    }
    cursor += 1;
  }
  parts.push(source.slice(copied));
  return JSON.parse(parts.join("")) as unknown;
}
function signatureHeader(value: unknown): string {
  const headers = record(value);
  const matches = Object.keys(headers).filter(key => key.toLowerCase() === "auth-hash");
  if (matches.length !== 1) invalid();
  return text(headers[matches[0]!],88);
}
function terminalBound(raw: Record<string, unknown>, credential: AkbankCredential): boolean {
  const terminal = record(raw.terminal,["merchantSafeId","terminalSafeId"]);
  return terminal.merchantSafeId === credential.merchantSafeId && terminal.terminalSafeId === credential.terminalSafeId;
}
async function inquire(transport: ProviderTransport, options: AkbankAdapterOptions, selectedEnvironment: "test" | "live", credential: AkbankCredential, orderId: string, signal: AbortSignal): Promise<Inquiry> {
  let body: Uint8Array | undefined;
  let responseBody: Uint8Array | undefined;
  try {
    if (signal.aborted) return {kind:"unavailable"};
    body = ENCODER.encode(JSON.stringify({version:"1.00",txnCode:"1010",requestDateTime:clock(options),randomNumber:nonce(options),terminal:{merchantSafeId:credential.merchantSafeId,terminalSafeId:credential.terminalSafeId},order:{orderId}}));
    const result = await requestFunction(transport)({packet:AKBANK_JSON_PACKET,environment:selectedEnvironment,url:AKBANK_JSON_PACKET.endpoints[selectedEnvironment][0]!,method:"POST",headers:{"content-type":"application/json","auth-hash":createAkbankHmac({credential,body})},body,signal});
    if (result.kind !== "response") return {kind:"unavailable"};
    responseBody = result.body;
    if (result.status === 401 && responseBody.byteLength === 0) return {kind:"denied"};
    if (result.status !== 200 || !/^application\/json(?:;\s*charset=utf-8)?$/i.test(result.contentType)) return {kind:"unavailable"};
    const rawBytes = bytes(responseBody);
    if (!verifyAkbankHmac({credential,body:rawBytes,providedSignature:signatureHeader(result.headers)})) return {kind:"unavailable"};
    const source = DECODER.decode(rawBytes);
    const raw = authenticatedJson(source);
    if (duplicateJsonKeys(source)) return {kind:"unavailable"};
    const selected = record(raw,["txnCode","responseCode","terminal"]);
    if (selected.txnCode !== "1010" || !terminalBound(selected,credential)) return {kind:"unavailable"};
    return {kind:"verified",value:selected};
  } catch { return {kind:"unavailable"}; } finally { wipe(body); wipe(responseBody); }
}
function statusFromInquiry(raw: Record<string, unknown>, orderId: string, amountMinor: number): HostedPaymentStatus {
  if (NOT_FOUND.has(String(raw.responseCode))) return {kind:"pending",providerReference:orderId};
  if (raw.responseCode !== "VPS-0000" || !Array.isArray(raw.txnDetailList) || raw.txnDetailList.length > 100) return {kind:"unknown",providerReference:orderId};
  const details = raw.txnDetailList.map(value => record(value));
  const related = details.filter(item => item.orderId === orderId || item.orgOrderId === orderId);
  // Follow-on refunds, cancellations and reversals cannot authorize the original full capture.
  if (related.some(item => (item.txnCode === "1002" || item.txnCode === "1003") && item.responseCode === "VPS-0000" && item.txnStatus === "N")) return {kind:"failed",providerReference:orderId,code:"provider_transaction_reversed"};
  const sales = related.filter(item => item.txnCode === "1000" && item.orderId === orderId);
  if (sales.length !== 1) return {kind:"pending",providerReference:orderId};
  const sale = sales[0]!;
  if (sale.orgOrderId !== orderId || !matchesAmount(sale.amount,amountMinor) || (sale.currencyCode !== 949 && sale.currencyCode !== "949") || (sale.installCount !== 1 && sale.installCount !== "1")) return {kind:"unknown",providerReference:orderId};
  if (sale.txnStatus === "R" || sale.txnStatus === "V") return {kind:"failed",providerReference:orderId,code:"provider_transaction_reversed"};
  if (sale.txnStatus !== "N") return {kind:"pending",providerReference:orderId};
  if (sale.responseCode !== "VPS-0000" || sale.hostResponseCode !== "00") return {kind:"failed",providerReference:orderId,code:"provider_payment_failed"};
  if ((sale.totalRefundAmount !== undefined && !zero(sale.totalRefundAmount)) || (sale.refundCounter !== undefined && sale.refundCounter !== 0 && sale.refundCounter !== "0") || ["ccbRewardAmount","pcbRewardAmount","xcbRewardAmount"].some(key => sale[key] !== undefined && !zero(sale[key]))) return {kind:"unknown",providerReference:orderId};
  return {kind:"succeeded",providerReference:orderId,paidAmountMinor:amountMinor,currency:"TRY"};
}
function expectedScope(selected: Record<string, unknown>): {orderId:string;amountMinor:number} {
  const orderId = attempt(selected.attemptId); text(selected.orderReference);
  if (selected.currency !== "TRY" || (selected.providerReference !== null && selected.providerReference !== undefined && selected.providerReference !== orderId)) invalid();
  return {orderId,amountMinor:amount(selected.amountMinor)};
}
function callbackFields(value: unknown): Record<string,string> {
  const raw = bytes(value,65_536);
  const source = DECODER.decode(raw);
  if (/%(?![0-9a-f]{2})/i.test(source)) invalid();
  const params = new URLSearchParams(source);
  const fields: Record<string,string> = Object.create(null) as Record<string,string>;
  for (const [key,value] of params) {
    if (!/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(key) || Object.hasOwn(fields,key) || value.length > 4096 || CONTROL.test(value) || Object.keys(fields).length >= 100) invalid();
    fields[key] = value;
  }
  return fields;
}
function authenticateCallback(fields: Record<string,string>, credential: AkbankCredential, orderId: string, amountMinor: number): void {
  const hashParams = text(fields.hashParams,4096);
  const names = hashParams.split("+");
  if (names.length < 4 || names.length > 64 || new Set(names).size !== names.length || names.some(name => !/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(name) || name === "hash" || name === "hashParams" || !Object.hasOwn(fields,name)) || CALLBACK_CRITICAL.some(name => !names.includes(name)) || CALLBACK_IF_PRESENT.some(name => Object.hasOwn(fields,name) && !names.includes(name))) invalid();
  let signed: Uint8Array | undefined;
  try { signed = ENCODER.encode(names.map(name => fields[name]).join("")); if (!verifyAkbankHmac({credential,body:signed,providedSignature:fields.hash!})) invalid(); } finally { wipe(signed); }
  if (fields.merchantSafeId !== credential.merchantSafeId || fields.terminalSafeId !== credential.terminalSafeId || fields.orderId !== orderId || !matchesAmount(fields.amount,amountMinor) || (fields.currencyCode !== undefined && fields.currencyCode !== "949") || (fields.installCount !== undefined && fields.installCount !== "1") || ["ccbRewardAmount","pcbRewardAmount","xcbRewardAmount"].some(key => fields[key] !== undefined && !zero(fields[key]))) invalid();
}
function maskAccount(value: AkbankCredential): string { return `Akbank…${value.merchantSafeId.slice(-4)}/${value.terminalSafeId.slice(-4)}`; }

export async function validateAkbankCredentialWithTransport(transport: ProviderTransport, input: Readonly<{environment:"test"|"live";credential:AkbankCredential;validationReference:string;signal:AbortSignal}>, optionInput: AkbankAdapterOptions = DEFAULT_OPTIONS): Promise<AkbankCredentialValidationResult> {
  let credential: AkbankCredential | undefined;
  try {
    let selected: Record<string,unknown>;
    let options: AkbankAdapterOptions;
    let selectedEnvironment: "test"|"live";
    let signal: AbortSignal;
    let validationReference: string;
    try {
      selected = record(input,["environment","credential","validationReference","signal"],["environment","credential","validationReference","signal"]);
      selectedEnvironment = environment(selected.environment); credential = parseAkbankCredential(selected.credential); signal = abortSignal(selected.signal); validationReference = order(selected.validationReference); options = dependencies(optionInput); requestFunction(transport);
    } catch { return {kind:"rejected",outcomeCode:"invalid_validation_request"}; }
    const result = await inquire(transport,options,selectedEnvironment,credential,validationReference,signal);
    if (result.kind === "denied") return {kind:"rejected",outcomeCode:"provider_rejected"};
    if (result.kind === "verified" && NOT_FOUND.has(String(result.value.responseCode)) && (result.value.txnDetailList === undefined || (Array.isArray(result.value.txnDetailList) && result.value.txnDetailList.length === 0))) return {kind:"validated",maskedAccountReference:maskAccount(credential),outcomeCode:"provider_validated"};
    return {kind:"rejected",outcomeCode:"validation_unavailable"};
  } finally { if (credential) wipeAkbankCredential(credential); }
}

export function createAkbankHostedAdapter(transport: ProviderTransport, optionInput: AkbankAdapterOptions = DEFAULT_OPTIONS): HostedPaymentAdapter<AkbankCredential> {
  requestFunction(transport);
  const options = dependencies(optionInput);
  const adapter: HostedPaymentAdapter<AkbankCredential> = {
    packet: AKBANK_JSON_PACKET,
    parseCredential: parseAkbankCredential,
    maskAccount(value: AkbankCredential): string { const selected = parseAkbankCredential(value); try { return maskAccount(selected); } finally { wipeAkbankCredential(selected); } },
    async initialize(input: HostedPaymentInitializeInput<AkbankCredential>): Promise<HostedPaymentInitialization> {
      let credential: AkbankCredential | undefined;
      try {
        const selected = record(input,INITIALIZE_KEYS,INITIALIZE_KEYS);
        const selectedEnvironment = environment(selected.environment);
        const preferences = parseProviderPaymentMethodConfig("akbank_json",selected.preferences);
        if (preferences.environment !== selectedEnvironment || preferences.threeDSecure !== "provider_managed" || preferences.installmentMode !== "single_payment" || preferences.maxInstallment !== 0) invalid();
        credential = parseAkbankCredential(selected.credential);
        const orderId = attempt(selected.attemptId); text(selected.orderReference);
        const amountMinor = amount(selected.amountMinor);
        if (selected.currency !== "TRY" || abortSignal(selected.signal).aborted) invalid();
        const callback = callbackAuthority(selected.callbackUrl); returnAuthority(selected.successUrl,callback.origin,"basarili"); returnAuthority(selected.failureUrl,callback.origin,"basarisiz");
        basketShape(selected.basket);
        const fields: Record<string,string> = Object.fromEntries(AKBANK_HOSTED_FIELD_NAMES.filter(name => name !== "hash").map(name => [name,""]));
        Object.assign(fields,{paymentModel:"3D_PAY_HOSTING",txnCode:"3000",merchantSafeId:credential.merchantSafeId,terminalSafeId:credential.terminalSafeId,orderId,lang:preferences.locale.toUpperCase(),amount:major(amountMinor),ccbRewardAmount:"0.00",pcbRewardAmount:"0.00",xcbRewardAmount:"0.00",currencyCode:"949",installCount:"1",okUrl:callback.url,failUrl:callback.url,randomNumber:nonce(options),requestDateTime:clock(options)});
        let signed: Uint8Array | undefined;
        try { signed = ENCODER.encode(AKBANK_HOSTED_FIELD_NAMES.filter(name => name !== "hash").map(name => fields[name]).join("")); fields.hash = createAkbankHmac({credential,body:signed}); } finally { wipe(signed); }
        const presentation = AKBANK_JSON_PACKET.presentation[selectedEnvironment];
        if (presentation.kind !== "provider_form_post") invalid();
        return Object.freeze({kind:"form_post",url:presentation.url,fields:Object.freeze(fields),providerReference:orderId});
      } catch { return Object.freeze({kind:"rejected",code:"invalid_request"}); } finally { if (credential) wipeAkbankCredential(credential); }
    },
    async query(input: HostedPaymentQueryInput<AkbankCredential>): Promise<HostedPaymentStatus> {
      let credential: AkbankCredential | undefined;
      let orderId: string | null = null;
      try {
        const selected = record(input,QUERY_KEYS,QUERY_KEYS);
        const scope = expectedScope(selected); orderId = scope.orderId;
        credential = parseAkbankCredential(selected.credential);
        const result = await inquire(transport,options,environment(selected.environment),credential,orderId,abortSignal(selected.signal));
        return Object.freeze(result.kind === "verified" ? statusFromInquiry(result.value,orderId,scope.amountMinor) : {kind:"unknown",providerReference:orderId});
      } catch { return Object.freeze({kind:"unknown",providerReference:orderId}); } finally { if (credential) wipeAkbankCredential(credential); }
    },
    async verifyCallback(input: HostedPaymentCallbackInput<AkbankCredential>): Promise<VerifiedProviderCallback> {
      let credential: AkbankCredential | undefined;
      try {
        const selected = record(input,CALLBACK_KEYS,[...CALLBACK_KEYS,"signal"]);
        if (selected.method !== "POST") invalid();
        const selectedEnvironment = environment(selected.environment);
        const headers = record(selected.headers,["content-type"],["content-type","content-length"]);
        if (!/^application\/x-www-form-urlencoded(?:;\s*charset=utf-8)?$/i.test(String(headers["content-type"]))) invalid();
        const expected = record(selected.expected,["attemptId","orderReference","amountMinor","currency"],["attemptId","orderReference","amountMinor","currency","providerReference"]);
        const scope = expectedScope(expected);
        const rawBody = bytes(selected.body,65_536);
        if (headers["content-length"] !== undefined && headers["content-length"] !== String(rawBody.byteLength)) invalid();
        credential = parseAkbankCredential(selected.credential);
        authenticateCallback(callbackFields(rawBody),credential,scope.orderId,scope.amountMinor);
        const signal = selected.signal === undefined ? new AbortController().signal : abortSignal(selected.signal);
        const inquiry = await inquire(transport,options,selectedEnvironment,credential,scope.orderId,signal);
        const status = inquiry.kind === "verified" ? statusFromInquiry(inquiry.value,scope.orderId,scope.amountMinor) : {kind:"unknown" as const,providerReference:scope.orderId};
        const callbackStatus = status.kind === "succeeded" ? "succeeded" : status.kind === "failed" ? "failed" : status.kind === "pending" ? "pending" : "retry";
        return Object.freeze({eventKey:`akbank:${scope.orderId}:${callbackStatus}`,status:callbackStatus,providerReference:scope.orderId,paidAmountMinor:callbackStatus === "retry" ? 0 : scope.amountMinor,currency:"TRY",safeCode:callbackStatus === "succeeded" ? "provider_payment_succeeded" : callbackStatus === "failed" ? "provider_payment_failed" : callbackStatus === "pending" ? "provider_payment_pending" : "provider_temporarily_unavailable"});
      } catch { return invalid("akbank_callback_invalid"); } finally { if (credential) wipeAkbankCredential(credential); }
    },
  };
  for (const method of [adapter.parseCredential,adapter.maskAccount,adapter.initialize,adapter.query,adapter.verifyCallback]) Object.freeze(method);
  return Object.freeze(adapter);
}
