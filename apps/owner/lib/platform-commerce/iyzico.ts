import "server-only";

import { randomBytes } from "node:crypto";
import { isIP } from "node:net";
import {
  createIyzicoAuthorization,
  parseIyzicoCredential,
  verifyIyzicoInitializeResponseSignature,
  verifyIyzicoRetrieveResponseSignature,
} from "@celebix/payment-adapters";

const INITIALIZE_PATH = "/payment/iyzipos/checkoutform/initialize/auth/ecom";
const RETRIEVE_PATH = "/payment/iyzipos/checkoutform/auth/ecom/detail";
const IDENTIFIER = /^[A-Za-z0-9_-]{1,128}$/;
const TOKEN = /^[A-Za-z0-9_-]{36,256}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const UNKNOWN = Object.freeze({ status: "unknown", code: "provider_unavailable" } as const);
const INVALID = Object.freeze({ status: "failed", code: "invalid_request" } as const);
const REJECTED = Object.freeze({ status: "failed", code: "provider_rejected" } as const);

export type PlatformIyzicoConfig = Readonly<{
  mode: "test" | "live";
  apiKey: string;
  secretKey: string;
  callbackOrigin: string;
  allowLocalhostForTests?: boolean;
  timeoutMs?: number;
  maxResponseBytes?: number;
}>;

export type PlatformIyzicoBuyer = Readonly<{
  id: string;
  name: string;
  surname: string;
  identityNumber: string;
  email: string;
  gsmNumber: string;
  registrationAddress: string;
  city: string;
  country: string;
  zipCode?: string;
}>;

export type PlatformIyzicoInitializeInput = Readonly<{
  attemptId: string;
  orderId: string;
  description: string;
  totalCents: number;
  buyer: PlatformIyzicoBuyer;
  ip: string;
  callbackUrl: string;
}>;

export type PlatformIyzicoRetrieveInput = Readonly<{
  attemptId: string;
  orderId: string;
  totalCents: number;
  token: string;
}>;

export type PlatformIyzicoFailure = typeof UNKNOWN | typeof INVALID | typeof REJECTED;
export type PlatformIyzicoInitialization = PlatformIyzicoFailure | Readonly<{
  status: "ready";
  token: string;
  paymentPageUrl: string;
  expiresAt: string;
}>;
export type PlatformIyzicoItemTransaction = Readonly<{
  itemId: string;
  paymentTransactionId: string;
  priceCents: number;
  paidPriceCents: number;
}>;
export type PlatformIyzicoPayment = PlatformIyzicoFailure | Readonly<{
  status: "payment";
  paymentStatus: "approved" | "pending";
  paymentId: string;
  token: string;
  itemTransactions: readonly PlatformIyzicoItemTransaction[];
}>;
export type PlatformIyzicoGateway = Readonly<{
  initialize(input: PlatformIyzicoInitializeInput): Promise<PlatformIyzicoInitialization>;
  retrieve(input: PlatformIyzicoRetrieveInput): Promise<PlatformIyzicoPayment>;
}>;

function invalid(): never { throw new TypeError("platform_iyzico_invalid"); }

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}

function text(value: unknown, maximum: number): string {
  if (typeof value !== "string" || !value.length || value.length > maximum || value.trim() !== value || CONTROL.test(value)) invalid();
  return value;
}

function identifier(value: unknown): string {
  const result = text(value, 128);
  if (!IDENTIFIER.test(result)) invalid();
  return result;
}

function token(value: unknown): string {
  const result = text(value, 256);
  if (!TOKEN.test(result)) invalid();
  return result;
}

function positiveCents(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) invalid();
  return value;
}

function amount(value: number): string {
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
}

function cents(value: unknown): number {
  if (typeof value !== "number" && typeof value !== "string") invalid();
  const match = /^(0|[1-9][0-9]{0,13})(?:\.([0-9]{1,8}))?$/.exec(String(value));
  if (!match || (match[2]?.slice(2) ?? "").replaceAll("0", "") !== "") invalid();
  const result = BigInt(match[1]) * 100n + BigInt((match[2] ?? "").slice(0, 2).padEnd(2, "0"));
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) invalid();
  return Number(result);
}

function buyer(value: PlatformIyzicoBuyer, ip: string): PlatformIyzicoBuyer & { ip: string } {
  const raw = object(value);
  const identityNumber = text(raw.identityNumber, 50);
  if (!/^[\x21-\x7e]{5,50}$/.test(identityNumber) || /^([0-9])\1+$/.test(identityNumber) || identityNumber === "12345678901") invalid();
  const email = text(raw.email, 254);
  const gsmNumber = text(raw.gsmNumber, 16);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\+[1-9][0-9]{7,14}$/.test(gsmNumber) || isIP(ip) === 0) invalid();
  return {
    id: identifier(raw.id), name: text(raw.name, 64), surname: text(raw.surname, 64),
    identityNumber, email, gsmNumber, registrationAddress: text(raw.registrationAddress, 512),
    city: text(raw.city, 128), country: text(raw.country, 128), ip,
    ...(raw.zipCode === undefined ? {} : { zipCode: text(raw.zipCode, 32) }),
  };
}

function duplicateJsonKeys(raw: string): boolean {
  const stack: Array<{ keys: Set<string>; expectingKey: boolean } | null> = [];
  for (const match of raw.matchAll(/"(?:[^"\\]|\\.)*"|[{}\[\]:,]/g)) {
    const value = match[0];
    const current = stack.at(-1);
    if (value === "{") stack.push({ keys: new Set(), expectingKey: true });
    else if (value === "[") stack.push(null);
    else if (value === "}" || value === "]") stack.pop();
    else if (value === "," && current) current.expectingKey = true;
    else if (value.startsWith('"') && current?.expectingKey) {
      const key = JSON.parse(value) as string;
      if (current.keys.has(key)) return true;
      current.keys.add(key);
      current.expectingKey = false;
    }
  }
  return false;
}

function checkoutUrl(raw: unknown, expectedToken: string, mode: "test" | "live"): string {
  const value = text(raw, 2048);
  const url = new URL(value);
  const origin = mode === "test" ? "https://sandbox-cpp.iyzipay.com" : "https://cpp.iyzipay.com";
  if (url.origin !== origin || url.pathname !== "/" || url.username || url.password || url.hash || url.port
    || url.searchParams.getAll("token").length !== 1 || url.searchParams.get("token") !== expectedToken
    || url.searchParams.getAll("lang").length > 1
    || (url.searchParams.has("lang") && url.searchParams.get("lang") !== "tr")
    || [...url.searchParams.keys()].some((key) => key !== "token" && key !== "lang")) invalid();
  return value;
}

export function createPlatformIyzicoGateway(config: PlatformIyzicoConfig, fetcher: typeof fetch = fetch): PlatformIyzicoGateway {
  let credential: ReturnType<typeof parseIyzicoCredential>;
  let callbackOrigin: string;
  let mode: "test" | "live";
  let timeoutMs: number;
  let maxResponseBytes: number;
  try {
    const raw = object(config);
    const allowed = new Set(["mode", "apiKey", "secretKey", "callbackOrigin", "allowLocalhostForTests", "timeoutMs", "maxResponseBytes"]);
    if (Object.keys(raw).some((key) => !allowed.has(key)) || typeof fetcher !== "function") invalid();
    if (config.mode !== "test" && config.mode !== "live") invalid();
    mode = config.mode;
    credential = parseIyzicoCredential({ apiKey: config.apiKey, secretKey: config.secretKey });
    const origin = new URL(config.callbackOrigin);
    const local = mode === "test" && config.allowLocalhostForTests === true
      && origin.protocol === "http:" && origin.hostname === "localhost";
    if (config.callbackOrigin !== origin.origin || origin.username || origin.password
      || (!local && config.callbackOrigin !== "https://celebix.net")
      || (config.allowLocalhostForTests !== undefined && typeof config.allowLocalhostForTests !== "boolean")) invalid();
    callbackOrigin = origin.origin;
    timeoutMs = config.timeoutMs ?? 10_000;
    maxResponseBytes = config.maxResponseBytes ?? 262_144;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 5 || timeoutMs > 30_000
      || !Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 64 || maxResponseBytes > 1_048_576) invalid();
  } catch {
    throw new TypeError("platform_iyzico_config_invalid");
  }
  const apiOrigin = mode === "test" ? "https://sandbox-api.iyzipay.com" : "https://api.iyzipay.com";

  async function request(path: typeof INITIALIZE_PATH | typeof RETRIEVE_PATH, payload: Record<string, unknown>): Promise<{ httpStatus: number; body: Record<string, unknown> } | null> {
    const abort = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const operation = async () => {
      try {
        const body = JSON.stringify(payload);
        const auth = createIyzicoAuthorization({ credential, randomKey: randomBytes(24).toString("base64url"), uriPath: path, body: new TextEncoder().encode(body) });
        const response = await fetcher(`${apiOrigin}${path}`, {
          method: "POST", body, redirect: "error", credentials: "omit", cache: "no-store", signal: abort.signal,
          headers: { "content-type": "application/json", authorization: auth.authorization, "x-iyzi-rnd": auth.randomKey },
        });
        if (abort.signal.aborted || response.redirected || ![200, 400, 401, 403].includes(response.status)
          || response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
          void response.body?.cancel().catch(() => {});
          return null;
        }
        const length = response.headers.get("content-length");
        if (length !== null && (!/^[0-9]+$/.test(length) || Number(length) > maxResponseBytes)) {
          void response.body?.cancel().catch(() => {});
          return null;
        }
        if (!response.body) return null;
        reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (!abort.signal.aborted) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > maxResponseBytes) {
            void reader.cancel().catch(() => {});
            return null;
          }
          chunks.push(chunk.value);
        }
        if (abort.signal.aborted) return null;
        const raw = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, size));
        const parsed = object(JSON.parse(raw));
        if (duplicateJsonKeys(raw)) return null;
        return { httpStatus: response.status, body: parsed };
      } catch { return null; }
    };
    try {
      return await Promise.race([
        operation(),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => {
            abort.abort();
            void reader?.cancel().catch(() => {});
            resolve(null);
          }, timeoutMs);
        }),
      ]);
    } finally { if (timer) clearTimeout(timer); }
  }

  return Object.freeze({
    async initialize(input: PlatformIyzicoInitializeInput): Promise<PlatformIyzicoInitialization> {
      let payload: Record<string, unknown>;
      try {
        const totalCents = positiveCents(input.totalCents);
        const selectedBuyer = buyer(input.buyer, input.ip);
        const callback = new URL(input.callbackUrl);
        if (callback.origin !== callbackOrigin || callback.username || callback.password || callback.hash) invalid();
        const address = { address: selectedBuyer.registrationAddress, contactName: `${selectedBuyer.name} ${selectedBuyer.surname}`, city: selectedBuyer.city, country: selectedBuyer.country,
          ...(selectedBuyer.zipCode === undefined ? {} : { zipCode: selectedBuyer.zipCode }) };
        payload = {
          locale: "tr", conversationId: identifier(input.attemptId), basketId: identifier(input.orderId),
          price: amount(totalCents), paidPrice: amount(totalCents), currency: "TRY", paymentGroup: "PRODUCT",
          callbackUrl: callback.toString(), buyer: selectedBuyer, billingAddress: address,
          basketItems: [{ id: input.orderId, name: text(input.description, 200), price: amount(totalCents), category1: "Software", itemType: "VIRTUAL" }],
          enabledInstallments: [1],
        };
      } catch { return INVALID; }
      const startedAt = Date.now();
      const response = await request(INITIALIZE_PATH, payload);
      if (!response) return UNKNOWN;
      if (response.body.status === "failure") return REJECTED;
      try {
        const raw = response.body;
        const selectedToken = token(raw.token);
        if (response.httpStatus !== 200 || raw.status !== "success" || raw.conversationId !== input.attemptId
          || !verifyIyzicoInitializeResponseSignature({ credential, conversationId: input.attemptId, token: selectedToken, providedSignature: raw.signature as string })
          || typeof raw.tokenExpireTime !== "number" || !Number.isSafeInteger(raw.tokenExpireTime)
          || raw.tokenExpireTime < 1 || raw.tokenExpireTime > 86_400) return UNKNOWN;
        return Object.freeze({ status: "ready", token: selectedToken,
          paymentPageUrl: checkoutUrl(raw.paymentPageUrl, selectedToken, mode),
          expiresAt: new Date(startedAt + raw.tokenExpireTime * 1000).toISOString() });
      } catch { return UNKNOWN; }
    },
    async retrieve(input: PlatformIyzicoRetrieveInput): Promise<PlatformIyzicoPayment> {
      try {
        identifier(input.attemptId); identifier(input.orderId); positiveCents(input.totalCents); token(input.token);
      } catch { return INVALID; }
      const response = await request(RETRIEVE_PATH, { locale: "tr", conversationId: input.attemptId, token: input.token });
      if (!response || response.httpStatus !== 200) return UNKNOWN;
      try {
        const raw = response.body;
        if (raw.status !== "success" || raw.conversationId !== input.attemptId || raw.basketId !== input.orderId
          || raw.currency !== "TRY" || raw.token !== input.token
          || cents(raw.price) !== input.totalCents || cents(raw.paidPrice) !== input.totalCents) return UNKNOWN;
        const paymentId = identifier(raw.paymentId);
        if (!verifyIyzicoRetrieveResponseSignature({ credential, conversationId: input.attemptId,
          basketId: input.orderId, token: input.token, currency: "TRY", paymentId,
          price: raw.price as string | number, paidPrice: raw.paidPrice as string | number,
          paymentStatus: raw.paymentStatus as string, providedSignature: raw.signature as string })) return UNKNOWN;
        if ((raw.paymentStatus !== "SUCCESS" && raw.paymentStatus !== "FAILURE")
          || (raw.fraudStatus !== 1 && raw.fraudStatus !== 0 && raw.fraudStatus !== -1)
          || (raw.fraudStatus !== -1 && raw.paymentStatus !== "SUCCESS")) return UNKNOWN;
        if (!Array.isArray(raw.itemTransactions) || raw.itemTransactions.length !== 1) return UNKNOWN;
        const item = object(raw.itemTransactions[0]);
        if (item.itemId !== input.orderId || cents(item.price) !== input.totalCents || cents(item.paidPrice) !== input.totalCents
          || (raw.fraudStatus === 1 && item.transactionStatus !== 1 && item.transactionStatus !== 2)
          || (raw.fraudStatus === 0 && item.transactionStatus !== 0)
          || (raw.fraudStatus === -1 && item.transactionStatus !== -1)) return UNKNOWN;
        const paymentTransactionId = identifier(item.paymentTransactionId);
        if (raw.fraudStatus === -1) return REJECTED;
        return Object.freeze({ status: "payment", paymentStatus: raw.fraudStatus === 1 ? "approved" : "pending",
          paymentId, token: input.token,
          itemTransactions: Object.freeze([Object.freeze({ itemId: input.orderId, paymentTransactionId, priceCents: input.totalCents, paidPriceCents: input.totalCents })]),
        });
      } catch { return UNKNOWN; }
    },
  });
}
