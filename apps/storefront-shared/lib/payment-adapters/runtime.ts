import "server-only";
import { createHash } from "node:crypto";
import { types as nodeTypes } from "node:util";

import type {
  HostedPaymentAdapter,
  HostedPaymentInitialization,
  HostedPaymentStatus,
  PaymentAdapterRegistry,
  VerifiedProviderCallback,
} from "@celebix/payment-adapters";
import {
  openMerchantProviderCredential,
  PaymentAttemptRepositoryError,
  type BeginPaymentAttemptResult,
  type MerchantProviderCredentialKeyring,
  type PaymentAttemptAuthority,
  type PaymentAttemptReconciliationClaim,
  type PaymentAttemptRepository,
  type SealedMerchantProviderCredential,
} from "@celebix/saas-data";

import {
  readExactHostedPaymentCallback,
  readExactHostedPaymentCallbackByDigest,
  type ExactHostedPaymentCallback,
} from "./callback-authority.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PROVIDER_CODE = /^[a-z][a-z0-9_]{0,63}$/;
const CODE = /^[a-z][a-z0-9_]{0,63}$/;
const CURRENCY = /^[A-Z]{3}$/;
const ORDER_REFERENCE = /^[A-Za-z0-9._:-]{1,128}$/;
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const PROVIDER_REFERENCE_CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const CALLBACK_BINDING_BYTES = 32;
const MAXIMUM_EVENT_KEY_LENGTH = 512;
const MAXIMUM_TOKEN_LENGTH = 4_096;
const SUCCESS_PATH = "/odeme/hizli/sonuc?durum=basarili";
const FAILURE_PATH = "/odeme/hizli/sonuc?durum=basarisiz";
const PROCESSING_PATH = "/odeme/hizli/sonuc?durum=isleniyor";
const RECONCILIATION_LEASE_MS = 60_000;
const PROVIDER_DEADLINE_MS = 5_000;
const AUTHORITY_CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const PROVIDER_DEADLINE_EXCEEDED = Symbol("provider_deadline_exceeded");

type TrustedHostAuthority =
  | Readonly<{ kind: "trusted"; hostname: string }>
  | Readonly<{ kind: string; hostname?: never }>;

type CredentialOpenInput = Readonly<{
  envelope: SealedMerchantProviderCredential;
  profileId: string;
  storeId: string;
  providerCode: string;
  capability: "payment_processing";
  credentialVersion: number;
  keyring: MerchantProviderCredentialKeyring;
}>;
type OpenedCredential = Readonly<{
  bytes: Uint8Array;
  credential: object;
  credentialDigest: string;
}>;

export type HostedPaymentPresentation =
  | Readonly<{ kind: "redirect"; url: string }>
  | Readonly<{ kind: "iframe"; url: string; token: string }>
  | Readonly<{ kind: "processing" }>
  | Readonly<{ kind: "rejected" }>;

type HostedPaymentProviderAckResult =
  | Readonly<{ kind: "accepted" }>
  | Readonly<{ kind: "retry" }>
  | Readonly<{ kind: "rejected" }>;

export type HostedPaymentCallbackResult =
  | HostedPaymentProviderAckResult
  | Readonly<{
      kind: "customer_return";
      outcome: "success" | "failure" | "processing";
    }>;

export type HostedPaymentDigestCallbackResult =
  | HostedPaymentProviderAckResult
  | Readonly<{ kind: "not_found" }>;

type ExactCallbackResult =
  | HostedPaymentCallbackResult
  | Readonly<{ kind: "not_found" }>;

export type HostedPaymentReconciliationResult =
  | Readonly<{ kind: "captured" }>
  | Readonly<{ kind: "failed" }>
  | Readonly<{ kind: "processing" }>
  | Readonly<{ kind: "rejected" }>;

export type InitializeHostedPaymentInput = Readonly<{
  headers: Headers;
  storeId: string;
  operationId: string;
  paymentMethodId: string;
  orderReference: string;
  amountMinor: number;
  currency: string;
  customer: Readonly<{
    name: string;
    email: string;
    phone: string;
    ipAddress: string;
    address: string;
    identityNumber?: string;
    city?: string;
    country?: string;
    postalCode?: string;
  }>;
  basket: readonly Readonly<{
    reference: string;
    name: string;
    quantity: number;
    unitAmountMinor: number;
    itemType?: "PHYSICAL" | "VIRTUAL";
  }>[];
}>;

export type HostedPaymentRuntime = Readonly<{
  initialize(input: InitializeHostedPaymentInput): Promise<HostedPaymentPresentation>;
  callback(input: Readonly<{
    request: Request;
    providerCode: string;
    binding: string;
  }>): Promise<HostedPaymentCallbackResult>;
  callbackByDigest(input: Readonly<{
    request: Request;
    providerCode: string;
    callbackBindingDigest: string;
  }>): Promise<HostedPaymentDigestCallbackResult>;
  reconcile(input: Readonly<{
    attemptId: string;
    operationId: string;
    expectedVersion: number;
    workerId: string;
    leaseId: string;
  }>): Promise<HostedPaymentReconciliationResult>;
}>;

export type HostedPaymentRuntimeDependencies = Readonly<{
  attempts: PaymentAttemptRepository;
  adapters: PaymentAdapterRegistry;
  keyring: MerchantProviderCredentialKeyring;
  openCredential?: (input: CredentialOpenInput) => Uint8Array;
  selectAuthority: (headers: Headers) => TrustedHostAuthority;
  selectCompiledAuthority: (
    providerCode: string,
  ) => Readonly<{
    providerCode: string;
    environment: "test" | "live";
    adapterVersion: number;
    evidenceDigest: string;
  }> | null;
  matchesCompiledAuthority: (authority: Readonly<{
    providerCode: string;
    capability: "payment_processing";
    environment: "test" | "live";
    adapterVersion: number;
    evidenceDigest: string;
  }>) => Promise<boolean>;
  now: () => Date;
  randomBytes: (size: number) => Uint8Array;
  providerTimeoutMs?: number;
}>;

const PRESENTATION_PROCESSING = Object.freeze({ kind: "processing" as const });
const PRESENTATION_REJECTED = Object.freeze({ kind: "rejected" as const });
const CALLBACK_ACCEPTED = Object.freeze({ kind: "accepted" as const });
const CALLBACK_RETRY = Object.freeze({ kind: "retry" as const });
const CALLBACK_REJECTED = Object.freeze({ kind: "rejected" as const });
const CALLBACK_RETURN_SUCCESS = Object.freeze({
  kind: "customer_return" as const,
  outcome: "success" as const,
});
const CALLBACK_RETURN_FAILURE = Object.freeze({
  kind: "customer_return" as const,
  outcome: "failure" as const,
});
const CALLBACK_RETURN_PROCESSING = Object.freeze({
  kind: "customer_return" as const,
  outcome: "processing" as const,
});
const CALLBACK_NOT_FOUND = Object.freeze({ kind: "not_found" as const });
const RECONCILIATION_CAPTURED = Object.freeze({ kind: "captured" as const });
const RECONCILIATION_FAILED = Object.freeze({ kind: "failed" as const });
const RECONCILIATION_PROCESSING = Object.freeze({ kind: "processing" as const });
const RECONCILIATION_REJECTED = Object.freeze({ kind: "rejected" as const });

function digest(kind: string, ...facts: readonly unknown[]): string {
  return createHash("sha256")
    .update(JSON.stringify(["celebix-hosted-payment", 1, kind, ...facts]), "utf8")
    .digest("hex");
}

function uuidFromDigest(value: string): string {
  const bytes = Buffer.from(value.slice(0, 32), "hex");
  try {
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = bytes.toString("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } finally {
    bytes.fill(0);
  }
}

function phase(kind: string, ...facts: readonly unknown[]): Readonly<{
  operationId: string;
  fingerprint: string;
}> {
  const fingerprint = digest(kind, ...facts);
  return Object.freeze({
    operationId: uuidFromDigest(digest("operation", kind, ...facts)),
    fingerprint,
  });
}

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function selectedNow(dependencies: HostedPaymentRuntimeDependencies): Date | null {
  try {
    const value = dependencies.now();
    return validDate(value) ? new Date(value.getTime()) : null;
  } catch {
    return null;
  }
}

function trustedHostname(
  dependencies: HostedPaymentRuntimeDependencies,
  headers: Headers,
): string | null {
  try {
    for (const [name, value] of headers) {
      const authorityBearing = name === "host"
        || name === "forwarded"
        || name === "x-celebix-storefront-proxy"
        || name.startsWith("x-forwarded-");
      if (
        authorityBearing
        && (value !== value.trim() || value.includes(",") || AUTHORITY_CONTROL.test(value))
      ) return null;
    }
    const authority = dependencies.selectAuthority(headers);
    const hostname = authority.hostname;
    return authority.kind === "trusted"
      && typeof hostname === "string"
      && hostname.length <= 253
      && hostname === hostname.toLowerCase()
      && HOSTNAME.test(hostname)
      ? hostname
      : null;
  } catch {
    return null;
  }
}

function providerDeadlineMilliseconds(dependencies: HostedPaymentRuntimeDependencies): number | null {
  try {
    const configured: unknown = dependencies.providerTimeoutMs;
    const selected = configured === undefined ? PROVIDER_DEADLINE_MS : configured;
    return typeof selected === "number"
      && Number.isSafeInteger(selected)
      && selected >= 1
      && selected <= PROVIDER_DEADLINE_MS
      ? selected
      : null;
  } catch {
    return null;
  }
}

async function withinProviderDeadline<T>(
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const provider = Promise.resolve().then(() => operation(controller.signal));
  void provider.catch(() => undefined);
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(PROVIDER_DEADLINE_EXCEEDED);
    }, timeoutMs);
  });
  try {
    return await Promise.race([provider, deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function validProviderReference(value: unknown): value is string | null {
  return value === null || (
    typeof value === "string"
    && value.length >= 1
    && value.length <= 256
    && value === value.trim()
    && !PROVIDER_REFERENCE_CONTROL.test(value)
  );
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  return keys.length === expected.length
    && keys.every((key) => typeof key === "string" && expected.includes(key))
    && expected.every((key) => {
      const descriptor = descriptors[key];
      return Boolean(descriptor && descriptor.enumerable && "value" in descriptor);
    });
}

function exactRequiredOptionalKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
): boolean {
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  const allowed = [...required, ...optional];
  return required.every((key) => descriptors[key] !== undefined)
    && keys.every((key) => typeof key === "string" && allowed.includes(key))
    && keys.every((key) => {
      if (typeof key !== "string") return false;
      const descriptor = descriptors[key];
      return Boolean(descriptor && descriptor.enumerable && "value" in descriptor);
    });
}

function denseArray(value: unknown[], minimum: number, maximum: number): boolean {
  if (
    nodeTypes.isProxy(value)
    || Object.getPrototypeOf(value) !== Array.prototype
    || value.length < minimum
    || value.length > maximum
  ) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) return false;
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return false;
  }
  return true;
}

function credentialObject(
  bytes: Uint8Array,
  authority: BeginPaymentAttemptResult | PaymentAttemptAuthority | PaymentAttemptReconciliationClaim,
  adapter: HostedPaymentAdapter<object>,
): Record<string, unknown> {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > 16_384) {
    throw new TypeError("hosted_payment_runtime_invalid");
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const encoded = Buffer.from(text, "utf8");
  try {
    if (!encoded.equals(bytes)) throw new TypeError("hosted_payment_runtime_invalid");
  } finally {
    encoded.fill(0);
  }
  const privateConfig = JSON.parse(text) as unknown;
  if (!plainRecord(privateConfig)) throw new TypeError("hosted_payment_runtime_invalid");
  const privateKeys = adapter.packet.credentialFields.map(({ key }) => key);
  const publicKeys = adapter.packet.publicFields.map(({ key }) => key);
  if (
    !exactKeys(privateConfig, privateKeys)
    || !plainRecord(authority.publicConfig)
    || !exactKeys(authority.publicConfig as Record<string, unknown>, ["environment", ...publicKeys])
    || authority.publicConfig.environment !== authority.environment
    || privateKeys.some((key) => publicKeys.includes(key))
  ) throw new TypeError("hosted_payment_runtime_invalid");
  const merged: Record<string, unknown> = {};
  for (const key of publicKeys) merged[key] = authority.publicConfig[key];
  for (const key of privateKeys) merged[key] = privateConfig[key];
  wipeObject(privateConfig);
  return merged;
}

function wipeObject(value: unknown, seen: WeakSet<object> = new WeakSet<object>()): void {
  if (typeof value !== "object" || value === null || seen.has(value)) return;
  seen.add(value);
  if (value instanceof Uint8Array) {
    try { value.fill(0); } catch { /* cleanup cannot replace an outcome */ }
    return;
  }
  try {
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) continue;
      wipeObject(descriptor.value, seen);
      try {
        if (typeof descriptor.value === "string") {
          Reflect.set(value, key, "");
        } else if (typeof descriptor.value === "number") {
          Reflect.set(value, key, 0);
        } else if (typeof descriptor.value === "boolean") {
          Reflect.set(value, key, false);
        }
      } catch {
        // Frozen adapter-owned data is still contained and loses its only runtime reference.
      }
    }
  } catch {
    // Cleanup is best effort and never changes the stable result.
  }
}

function wipeOpenedCredential(opened: OpenedCredential): void {
  wipeObject(opened.credential);
  opened.bytes.fill(0);
}

function wipeableCredential(value: unknown, seen: WeakSet<object> = new WeakSet<object>()): boolean {
  if (value === null) return true;
  if (typeof value !== "object") return false;
  if (nodeTypes.isProxy(value) || seen.has(value)) return false;
  seen.add(value);
  if (value instanceof Uint8Array) return Object.getPrototypeOf(value) === Uint8Array.prototype;
  if (Array.isArray(value)) {
    if (!denseArray(value, 0, 64)) return false;
  } else if (Object.getPrototypeOf(value) !== Object.prototype) {
    return false;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string" || (Array.isArray(value) && key === "length")) continue;
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return false;
    const selected = descriptor.value;
    if (
      typeof selected === "string"
      || typeof selected === "number"
      || typeof selected === "boolean"
    ) {
      if (!descriptor.writable) return false;
    } else if (!wipeableCredential(selected, seen)) {
      return false;
    }
  }
  return true;
}

function openCredential(
  dependencies: HostedPaymentRuntimeDependencies,
  authority: BeginPaymentAttemptResult | PaymentAttemptAuthority | PaymentAttemptReconciliationClaim,
  adapter: HostedPaymentAdapter<object>,
): OpenedCredential {
  const bytes = (dependencies.openCredential ?? openMerchantProviderCredential)({
    envelope: authority.sealedCredentials,
    profileId: authority.profileId,
    storeId: authority.storeId,
    providerCode: authority.providerCode,
    capability: "payment_processing",
    credentialVersion: authority.credentialVersion,
    keyring: dependencies.keyring,
  });
  try {
    const credentialDigest = createHash("sha256").update(bytes).digest("hex");
    const config = credentialObject(bytes, authority, adapter);
    const credential = adapter.parseCredential(config);
    if (
      typeof credential !== "object"
      || credential === null
      || Array.isArray(credential)
      || !wipeableCredential(credential)
    ) {
      wipeObject(config);
      throw new TypeError("hosted_payment_runtime_invalid");
    }
    return Object.freeze({ bytes, credential, credentialDigest });
  } catch (error) {
    bytes.fill(0);
    throw error;
  }
}

type SelectedHostedPaymentAdapter = Readonly<{
  adapter: HostedPaymentAdapter<object>;
  compiledAuthority: Readonly<{
    providerCode: string;
    environment: "test" | "live";
    adapterVersion: number;
    evidenceDigest: string;
  }>;
}>;

function adapterFor(
  dependencies: HostedPaymentRuntimeDependencies,
  authority: BeginPaymentAttemptResult | PaymentAttemptAuthority | PaymentAttemptReconciliationClaim,
  operation: "initialize" | "callback" | "query",
): SelectedHostedPaymentAdapter | null {
  try {
    const providerCode = authority.providerCode;
    const adapter = dependencies.adapters.adapter(providerCode);
    const compiled = dependencies.selectCompiledAuthority(providerCode);
    const descriptors = compiled !== null
      && typeof compiled === "object"
      && !Array.isArray(compiled)
      && !nodeTypes.isProxy(compiled)
      && Object.getPrototypeOf(compiled) === Object.prototype
      ? Object.getOwnPropertyDescriptors(compiled)
      : null;
    const keys = ["providerCode", "environment", "adapterVersion", "evidenceDigest"];
    if (!(adapter !== null
      && adapter.packet.providerCode === providerCode
      && adapter.packet.capabilities[operation]
      && descriptors !== null
      && Reflect.ownKeys(descriptors).length === keys.length
      && keys.every((key) => {
        const descriptor = descriptors[key];
        return descriptor?.enumerable === true && "value" in descriptor;
      })
      && descriptors.providerCode?.value === providerCode
      && descriptors.environment?.value === authority.environment
      && descriptors.adapterVersion?.value === adapter.packet.adapterVersion
      && typeof descriptors.evidenceDigest?.value === "string"
      && /^sha256:[a-f0-9]{64}$/.test(descriptors.evidenceDigest.value))) return null;
    return Object.freeze({
      adapter,
      compiledAuthority: Object.freeze({
        providerCode,
        environment: descriptors.environment.value as "test" | "live",
        adapterVersion: descriptors.adapterVersion.value as number,
        evidenceDigest: descriptors.evidenceDigest.value as string,
      }),
    });
  } catch {
    return null;
  }
}

async function currentCompiledAuthorityMatches(
  dependencies: HostedPaymentRuntimeDependencies,
  selected: SelectedHostedPaymentAdapter,
): Promise<boolean> {
  try {
    return await dependencies.matchesCompiledAuthority(Object.freeze({
      providerCode: selected.compiledAuthority.providerCode,
      capability: "payment_processing" as const,
      environment: selected.compiledAuthority.environment,
      adapterVersion: selected.compiledAuthority.adapterVersion,
      evidenceDigest: selected.compiledAuthority.evidenceDigest,
    })) === true;
  } catch {
    return false;
  }
}

function registeredAdapterPresent(
  dependencies: HostedPaymentRuntimeDependencies,
  providerCode: string,
): boolean {
  try {
    return dependencies.adapters.adapter(providerCode) !== null;
  } catch {
    return false;
  }
}

function environmentMatches(
  authority: BeginPaymentAttemptResult | PaymentAttemptAuthority | PaymentAttemptReconciliationClaim,
): boolean {
  return (authority.environment === "test" || authority.environment === "live")
    && authority.publicConfig.environment === authority.environment;
}

function exactBrowserUrl(
  adapter: HostedPaymentAdapter<object>,
  environment: "test" | "live",
  value: unknown,
  token?: unknown,
): string | null {
  if (typeof value !== "string" || value.length < 1 || value.length > 2_048) return null;
  try {
    const parsed = new URL(value);
    const structurallyValid = parsed.protocol === "https:"
      && !parsed.username
      && !parsed.password
      && !parsed.port
      && !parsed.hash;
    if (!structurallyValid) return null;
    const rule = adapter.packet.presentation[environment];
    if (rule.kind === "exact_url") {
      return !parsed.search && parsed.toString() === value && value === rule.url ? value : null;
    }
    if (
      typeof token !== "string"
      || token.length < rule.token.minimum
      || token.length > rule.token.maximum
      || token.length > MAXIMUM_TOKEN_LENGTH
      || !/^[A-Za-z0-9_-]+$/.test(token)
    ) return null;
    if (rule.kind === "provider_token_url") {
      return !parsed.search
        && parsed.toString() === value
        && value === `${rule.urlPrefix}${token}`
        ? value
        : null;
    }
    const exactQuery = `?${rule.tokenParameter}=${token}&${rule.languageParameter}=${rule.language}`;
    if (value !== `${rule.origin}${exactQuery}` && value !== `${rule.origin}/${exactQuery}`) {
      return null;
    }
    return parsed.origin === rule.origin
      && parsed.pathname === rule.pathname
      && parsed.search === exactQuery
      && parsed.searchParams.size === 2
      && parsed.searchParams.get(rule.tokenParameter) === token
      && parsed.searchParams.get(rule.languageParameter) === rule.language
      ? value
      : null;
  } catch {
    return null;
  }
}

function parseInitialization(
  adapter: HostedPaymentAdapter<object>,
  environment: "test" | "live",
  value: HostedPaymentInitialization,
): Readonly<{
  status: "awaiting_customer" | "submitted" | "failed";
  providerReference: string | null;
  safeCode: string;
  presentation: HostedPaymentPresentation;
}> | null {
  if (!plainRecord(value)) return null;
  if (
    value.kind === "redirect"
    && exactKeys(value, ["kind", "url", "providerReference"])
    && validProviderReference(value.providerReference)
  ) {
    const url = exactBrowserUrl(adapter, environment, value.url);
    return url === null ? null : Object.freeze({
      status: "awaiting_customer",
      providerReference: value.providerReference,
      safeCode: "redirect_ready",
      presentation: Object.freeze({ kind: "redirect", url }),
    });
  }
  if (
    value.kind === "iframe"
    && exactKeys(value, ["kind", "url", "token", "providerReference"])
    && validProviderReference(value.providerReference)
  ) {
    const url = exactBrowserUrl(adapter, environment, value.url, value.token);
    if (
      url === null
      || typeof value.token !== "string"
      || value.token.length < 1
      || value.token.length > MAXIMUM_TOKEN_LENGTH
      || value.token !== value.token.trim()
      || PROVIDER_REFERENCE_CONTROL.test(value.token)
    ) return null;
    return Object.freeze({
      status: "awaiting_customer",
      providerReference: value.providerReference,
      safeCode: "iframe_ready",
      presentation: Object.freeze({ kind: "iframe", url, token: value.token }),
    });
  }
  if (
    value.kind === "pending"
    && exactKeys(value, ["kind", "providerReference"])
    && validProviderReference(value.providerReference)
  ) {
    return Object.freeze({
      status: "submitted",
      providerReference: value.providerReference,
      safeCode: "provider_pending",
      presentation: PRESENTATION_PROCESSING,
    });
  }
  if (
    value.kind === "rejected"
    && exactKeys(value, ["kind", "code"])
    && typeof value.code === "string"
    && CODE.test(value.code)
  ) {
    return Object.freeze({
      status: "failed",
      providerReference: null,
      safeCode: value.code,
      presentation: PRESENTATION_REJECTED,
    });
  }
  return null;
}

function validInitializeInput(value: InitializeHostedPaymentInput): boolean {
  if (
    !(value.headers instanceof Headers)
    || !UUID.test(value.storeId)
    || !UUID.test(value.operationId)
    || !UUID.test(value.paymentMethodId)
    || !ORDER_REFERENCE.test(value.orderReference)
    || !Number.isSafeInteger(value.amountMinor)
    || value.amountMinor < 1
    || !CURRENCY.test(value.currency)
    || !plainRecord(value.customer)
    || !Array.isArray(value.basket)
    || !denseArray(value.basket as unknown[], 1, 100)
  ) return false;
  const customerFields = ["name", "email", "phone", "ipAddress", "address"];
  const optionalCustomerFields = ["identityNumber", "city", "country", "postalCode"];
  if (
    !exactRequiredOptionalKeys(
      value.customer as Record<string, unknown>,
      customerFields,
      optionalCustomerFields,
    )
    || [...customerFields, ...optionalCustomerFields].some((key) => {
      const selected = value.customer[key as keyof typeof value.customer];
      return selected !== undefined && (typeof selected !== "string"
        || selected.length < 1 || selected.length > 1_024
        || selected !== selected.trim() || PROVIDER_REFERENCE_CONTROL.test(selected));
    })
  ) return false;
  return value.basket.every((item) => {
    if (
      !plainRecord(item)
      || !exactRequiredOptionalKeys(
        item,
        ["reference", "name", "quantity", "unitAmountMinor"],
        ["itemType"],
      )
    ) return false;
    const { reference, name, quantity, unitAmountMinor, itemType } = item;
    return typeof reference === "string"
      && reference.length >= 1
      && reference.length <= 128
      && typeof name === "string"
      && name.length >= 1
      && name.length <= 512
      && typeof quantity === "number"
      && Number.isSafeInteger(quantity)
      && quantity >= 1
      && typeof unitAmountMinor === "number"
      && Number.isSafeInteger(unitAmountMinor)
      && unitAmountMinor >= 1
      && (itemType === undefined || itemType === "PHYSICAL" || itemType === "VIRTUAL");
  });
}

function providerInitializeProjection(
  providerCode: string,
  input: InitializeHostedPaymentInput,
): Readonly<Pick<InitializeHostedPaymentInput, "customer" | "basket">> | null {
  const customer = Object.freeze({
    name: input.customer.name,
    email: input.customer.email,
    phone: input.customer.phone,
    ipAddress: input.customer.ipAddress,
    address: input.customer.address,
  });
  const basket = Object.freeze(input.basket.map((item) => Object.freeze({
    reference: item.reference,
    name: item.name,
    quantity: item.quantity,
    unitAmountMinor: item.unitAmountMinor,
  })));
  if (providerCode !== "iyzico_iframe") {
    return Object.freeze({ customer, basket });
  }
  const { identityNumber, city, country, postalCode } = input.customer;
  if (
    typeof identityNumber !== "string"
    || typeof city !== "string"
    || typeof country !== "string"
    || input.basket.some((item) => item.itemType !== "PHYSICAL" && item.itemType !== "VIRTUAL")
  ) return null;
  const iyzicoCustomer = Object.freeze({
    ...customer,
    identityNumber,
    city,
    country,
    ...(postalCode === undefined ? {} : { postalCode }),
  });
  const iyzicoBasket = Object.freeze(input.basket.map((item) => Object.freeze({
    reference: item.reference,
    name: item.name,
    quantity: item.quantity,
    unitAmountMinor: item.unitAmountMinor,
    itemType: item.itemType!,
  })));
  return Object.freeze({ customer: iyzicoCustomer, basket: iyzicoBasket });
}

function exactBeginAuthority(
  result: BeginPaymentAttemptResult,
  input: InitializeHostedPaymentInput,
): boolean {
  return result.attemptId === input.operationId
    && result.storeId === input.storeId
    && result.paymentMethodId === input.paymentMethodId
    && result.amountMinor === input.amountMinor
    && result.currency === input.currency
    && UUID.test(result.profileId)
    && PROVIDER_CODE.test(result.providerCode)
    && Number.isSafeInteger(result.credentialVersion)
    && result.credentialVersion >= 1;
}

async function markFailed(
  dependencies: HostedPaymentRuntimeDependencies,
  begun: BeginPaymentAttemptResult,
  code: string,
  now: Date,
): Promise<void> {
  const selected = phase("initialize-failed", begun.attemptId, begun.credentialVersion, code);
  await dependencies.attempts.markInitialized({
    attemptId: begun.attemptId,
    ...selected,
    expectedVersion: 1,
    credentialVersion: begun.credentialVersion,
    status: "failed",
    providerReference: null,
    safeCode: code,
    now: new Date(now),
  });
}

async function initialize(
  dependencies: HostedPaymentRuntimeDependencies,
  input: InitializeHostedPaymentInput,
  providerTimeoutMs: number,
): Promise<HostedPaymentPresentation> {
  if (!validInitializeInput(input)) return PRESENTATION_REJECTED;
  const hostname = trustedHostname(dependencies, input.headers);
  const now = selectedNow(dependencies);
  if (hostname === null || now === null) return PRESENTATION_REJECTED;
  let random: Uint8Array | undefined;
  let bindingBytes: Buffer | undefined;
  try {
    random = dependencies.randomBytes(CALLBACK_BINDING_BYTES);
    if (!(random instanceof Uint8Array) || random.byteLength !== CALLBACK_BINDING_BYTES) {
      return PRESENTATION_REJECTED;
    }
    bindingBytes = Buffer.from(random);
    const binding = bindingBytes.toString("base64url");
    if (binding.length !== 43 || Buffer.from(binding, "base64url").toString("base64url") !== binding) {
      return PRESENTATION_REJECTED;
    }
    const callbackBindingDigest = createHash("sha256").update(bindingBytes).digest("hex");
    const beginFingerprint = digest(
      "begin",
      hostname,
      input.storeId,
      input.operationId,
      input.paymentMethodId,
      input.orderReference,
      input.amountMinor,
      input.currency,
      input.basket.map(({ reference, quantity, unitAmountMinor, itemType }) =>
        Object.freeze({ reference, quantity, unitAmountMinor, itemType: itemType ?? null })),
    );
    const begun = await dependencies.attempts.begin({
      authority: Object.freeze({ storeId: input.storeId, now: new Date(now) }),
      operationId: input.operationId,
      fingerprint: beginFingerprint,
      paymentMethodId: input.paymentMethodId,
      orderReference: input.orderReference,
      amountMinor: input.amountMinor,
      currency: input.currency,
      callbackBindingDigest,
    });
    if (!exactBeginAuthority(begun, input)) return PRESENTATION_REJECTED;
    if (begun.outcome === "replayed") return PRESENTATION_PROCESSING;
    const selectedAdapter = adapterFor(dependencies, begun, "initialize");
    if (selectedAdapter === null) {
      const safeCode = registeredAdapterPresent(dependencies, begun.providerCode)
        ? "execution_authority_mismatch"
        : "adapter_not_registered";
      try { await markFailed(dependencies, begun, safeCode, now); } catch { /* safe rejection */ }
      return PRESENTATION_REJECTED;
    }
    const adapter = selectedAdapter.adapter;
    if (!environmentMatches(begun)) {
      try { await markFailed(dependencies, begun, "environment_mismatch", now); } catch { /* safe rejection */ }
      return PRESENTATION_REJECTED;
    }
    const projection = providerInitializeProjection(begun.providerCode, input);
    if (projection === null) {
      try { await markFailed(dependencies, begun, "provider_input_invalid", now); } catch { /* safe rejection */ }
      return PRESENTATION_REJECTED;
    }
    if (!await currentCompiledAuthorityMatches(dependencies, selectedAdapter)) {
      try { await markFailed(dependencies, begun, "execution_authority_mismatch", now); } catch { /* safe rejection */ }
      return PRESENTATION_REJECTED;
    }
    let opened: OpenedCredential | undefined;
    try {
      opened = openCredential(dependencies, begun, adapter);
    } catch {
      try { await markFailed(dependencies, begun, "credential_invalid", now); } catch { /* safe rejection */ }
      return PRESENTATION_REJECTED;
    }
    try {
      let result: HostedPaymentInitialization;
      try {
        result = await withinProviderDeadline(providerTimeoutMs, (signal) => adapter.initialize(Object.freeze({
          environment: begun.environment,
          credential: opened.credential,
          attemptId: begun.attemptId,
          orderReference: input.orderReference,
          amountMinor: input.amountMinor,
          currency: input.currency,
          callbackUrl: `https://${hostname}/api/payments/${begun.providerCode}/callback/${binding}`,
          successUrl: `https://${hostname}${SUCCESS_PATH}`,
          failureUrl: `https://${hostname}${FAILURE_PATH}`,
          customer: projection.customer,
          basket: projection.basket,
          signal,
        })));
      } catch {
        wipeOpenedCredential(opened);
        const unknown = phase(
          "initialize-unknown",
          begun.attemptId,
          begun.credentialVersion,
          opened.credentialDigest,
        );
        try {
          await dependencies.attempts.markUnknown({
            attemptId: begun.attemptId,
            ...unknown,
            expectedVersion: 1,
            credentialVersion: begun.credentialVersion,
            providerReference: null,
            safeCode: "provider_outcome_unknown",
            now: new Date(now),
          });
        } catch { /* processing remains the only safe projection */ }
        return PRESENTATION_PROCESSING;
      }
      if (
        plainRecord(result)
        && result.kind === "unknown"
        && exactKeys(result, ["kind", "code", "providerReference"])
        && result.code === "provider_outcome_unknown"
        && validProviderReference(result.providerReference)
      ) {
        const unknown = phase(
          "initialize-unknown",
          begun.attemptId,
          begun.credentialVersion,
          opened.credentialDigest,
        );
        try {
          await dependencies.attempts.markUnknown({
            attemptId: begun.attemptId,
            ...unknown,
            expectedVersion: 1,
            credentialVersion: begun.credentialVersion,
            providerReference: result.providerReference,
            safeCode: "provider_outcome_unknown",
            now: new Date(now),
          });
        } catch { /* processing remains the only safe projection */ }
        return PRESENTATION_PROCESSING;
      }
      const parsed = parseInitialization(adapter, begun.environment, result);
      if (parsed === null) {
        const unknown = phase(
          "initialize-invalid-result",
          begun.attemptId,
          begun.credentialVersion,
          opened.credentialDigest,
        );
        try {
          await dependencies.attempts.markUnknown({
            attemptId: begun.attemptId,
            ...unknown,
            expectedVersion: 1,
            credentialVersion: begun.credentialVersion,
            providerReference: null,
            safeCode: "provider_outcome_unknown",
            now: new Date(now),
          });
        } catch { /* processing remains the only safe projection */ }
        return PRESENTATION_PROCESSING;
      }
      const initialized = phase(
        "initialize",
        begun.attemptId,
        begun.credentialVersion,
        opened.credentialDigest,
        parsed.status,
        parsed.providerReference,
        parsed.safeCode,
      );
      try {
        await dependencies.attempts.markInitialized({
          attemptId: begun.attemptId,
          ...initialized,
          expectedVersion: 1,
          credentialVersion: begun.credentialVersion,
          status: parsed.status,
          providerReference: parsed.providerReference,
          safeCode: parsed.safeCode,
          now: new Date(now),
        });
      } catch {
        return parsed.status === "failed" ? PRESENTATION_REJECTED : PRESENTATION_PROCESSING;
      }
      return parsed.presentation;
    } finally {
      wipeOpenedCredential(opened);
    }
  } catch {
    return PRESENTATION_REJECTED;
  } finally {
    try { random?.fill(0); } catch { /* cleanup remains opaque */ }
    bindingBytes?.fill(0);
  }
}

function parseVerifiedCallback(
  value: VerifiedProviderCallback,
  authority: PaymentAttemptAuthority,
): VerifiedProviderCallback | null {
  if (
    !plainRecord(value)
    || !exactKeys(value, [
      "eventKey", "status", "providerReference", "paidAmountMinor", "currency", "safeCode",
    ])
    || typeof value.eventKey !== "string"
    || value.eventKey.length < 1
    || value.eventKey.length > MAXIMUM_EVENT_KEY_LENGTH
    || value.eventKey !== value.eventKey.trim()
    || PROVIDER_REFERENCE_CONTROL.test(value.eventKey)
    || !["succeeded", "failed", "pending", "retry"].includes(value.status)
    || !validProviderReference(value.providerReference)
    || !Number.isSafeInteger(value.paidAmountMinor)
    || (
      value.status === "retry"
        ? value.paidAmountMinor !== 0
        : value.paidAmountMinor !== authority.amountMinor
    )
    || value.currency !== authority.currency
    || typeof value.safeCode !== "string"
    || !CODE.test(value.safeCode)
    || (authority.providerReference !== null && authority.providerReference !== value.providerReference)
  ) return null;
  return value;
}

function callbackProjection(
  adapter: HostedPaymentAdapter<object>,
  outcome: "success" | "failure" | "processing",
): HostedPaymentCallbackResult {
  if (adapter.packet.callbackResponse === "provider_ack") {
    return outcome === "processing" ? CALLBACK_RETRY : CALLBACK_ACCEPTED;
  }
  if (adapter.packet.callbackResponse !== "customer_return") return CALLBACK_REJECTED;
  return outcome === "success"
    ? CALLBACK_RETURN_SUCCESS
    : outcome === "failure"
      ? CALLBACK_RETURN_FAILURE
      : CALLBACK_RETURN_PROCESSING;
}

function retryableCallbackError(error: unknown): boolean {
  return error instanceof PaymentAttemptRepositoryError && error.code === "commit_unknown";
}

function exactHostedCallbackMutation(
  value: Awaited<ReturnType<PaymentAttemptRepository["applyHostedCallback"]>>,
  authority: PaymentAttemptAuthority,
  expected: Readonly<{
    status: "captured" | "failed" | "provider_outcome_unknown";
    providerReference: string | null;
    safeCode: string;
  }>,
): boolean {
  if (
    value.attemptId !== authority.attemptId
    || typeof value.replayed !== "boolean"
    || Number.isSafeInteger(value.version) === false
  ) return false;
  if (value.disposition === "processing") {
    return value.version >= 1
      && value.version <= authority.version
      && (value.status === "provider_outcome_unknown"
        || value.status === "reconciliation_required");
  }
  const increment = expected.status !== "provider_outcome_unknown"
    && authority.status === "awaiting_customer" ? 2 : 1;
  if (
    value.status !== expected.status
    || value.providerReference !== expected.providerReference
    || value.safeCode !== expected.safeCode
  ) return false;
  if (value.disposition === "applied") {
    return value.replayed === false
      && value.version === authority.version + increment;
  }
  return value.disposition === "replayed"
    && value.replayed
    && value.version >= 1
    && value.version <= authority.version + increment;
}

async function persistCallbackUnknown(
  dependencies: HostedPaymentRuntimeDependencies,
  authority: PaymentAttemptAuthority,
  opened: OpenedCredential,
  request: ExactHostedPaymentCallback,
  providerReference: string | null,
  safeCode: string,
  eventKey: string,
  now: Date,
): Promise<"persisted" | "retry" | "rejected"> {
  const selected = phase(
    "callback-unknown",
    authority.attemptId,
    opened.credentialDigest,
    request.callbackBindingDigest,
    createHash("sha256").update(eventKey, "utf8").digest("hex"),
    providerReference,
    safeCode,
  );
  try {
    const eventKeyDigest = createHash("sha256").update(eventKey, "utf8").digest("hex");
    const mutation = await dependencies.attempts.applyHostedCallback({
      providerCode: authority.providerCode,
      callbackBindingDigest: request.callbackBindingDigest,
      ...selected,
      eventKeyDigest,
      expectedVersion: authority.version,
      credentialVersion: authority.credentialVersion,
      status: "provider_outcome_unknown",
      providerReference,
      safeCode,
      amountMinor: authority.amountMinor,
      currency: authority.currency,
      now: new Date(now),
    });
    return exactHostedCallbackMutation(mutation, authority, {
      status: "provider_outcome_unknown",
      providerReference,
      safeCode,
    })
      ? "persisted"
      : "rejected";
  } catch (error) {
    return retryableCallbackError(error) ? "retry" : "rejected";
  }
}

async function settleExactCallback(
  dependencies: HostedPaymentRuntimeDependencies,
  request: ExactHostedPaymentCallback,
  now: Date,
  exposeAuthorityAbsence: boolean,
  providerTimeoutMs: number,
): Promise<ExactCallbackResult> {
  try {
    let authority: PaymentAttemptAuthority;
    try {
      authority = await dependencies.attempts.getCallbackAuthority({
        providerCode: request.providerCode,
        callbackBindingDigest: request.callbackBindingDigest,
        now: new Date(now),
      });
    } catch (error) {
      if (
        exposeAuthorityAbsence
        && error instanceof PaymentAttemptRepositoryError
        && error.code === "not_found"
      ) return CALLBACK_NOT_FOUND;
      return retryableCallbackError(error) ? CALLBACK_RETRY : CALLBACK_REJECTED;
    }
    if (
      authority.providerCode !== request.providerCode
      || !UUID.test(authority.attemptId)
      || !UUID.test(authority.storeId)
      || !UUID.test(authority.profileId)
      || !UUID.test(authority.paymentMethodId)
      || !environmentMatches(authority)
    ) return CALLBACK_REJECTED;
    const selectedAdapter = adapterFor(dependencies, authority, "callback");
    if (selectedAdapter === null) return CALLBACK_REJECTED;
    if (!await currentCompiledAuthorityMatches(dependencies, selectedAdapter)) return CALLBACK_REJECTED;
    const adapter = selectedAdapter.adapter;
    let opened: OpenedCredential | undefined;
    try {
      opened = openCredential(dependencies, authority, adapter);
      let providerResult: VerifiedProviderCallback;
      try {
        providerResult = await withinProviderDeadline(providerTimeoutMs, (signal) =>
          adapter.verifyCallback(Object.freeze({
            environment: authority.environment,
            credential: opened!.credential,
            method: request.method,
            headers: request.headers,
            body: request.body,
            signal,
            expected: Object.freeze({
              attemptId: authority.attemptId,
              orderReference: authority.orderReference,
              amountMinor: authority.amountMinor,
              currency: authority.currency,
              providerReference: authority.providerReference,
            }),
          })));
      } catch (error) {
        if (error !== PROVIDER_DEADLINE_EXCEEDED) return CALLBACK_REJECTED;
        const bodyDigest = createHash("sha256").update(request.body).digest("hex");
        const persisted = await persistCallbackUnknown(
          dependencies,
          authority,
          opened,
          request,
          authority.providerReference,
          "provider_verification_timeout",
          `timeout:${bodyDigest}`,
          now,
        );
        return persisted === "persisted"
          ? callbackProjection(adapter, "processing")
          : persisted === "retry"
            ? CALLBACK_RETRY
            : CALLBACK_REJECTED;
      }
      const verified = parseVerifiedCallback(providerResult, authority);
      if (verified === null) return CALLBACK_REJECTED;
      if (verified.status === "pending" || verified.status === "retry") {
        const persisted = await persistCallbackUnknown(
          dependencies,
          authority,
          opened,
          request,
          verified.providerReference,
          verified.safeCode,
          verified.eventKey,
          now,
        );
        return persisted === "persisted"
          ? callbackProjection(adapter, "processing")
          : persisted === "retry"
            ? CALLBACK_RETRY
            : CALLBACK_REJECTED;
      }
      const eventKeyDigest = createHash("sha256").update(verified.eventKey, "utf8").digest("hex");
      const selected = phase(
        "callback",
        authority.attemptId,
        opened.credentialDigest,
        request.callbackBindingDigest,
        eventKeyDigest,
        verified.status,
        verified.providerReference,
        verified.paidAmountMinor,
        verified.currency,
        verified.safeCode,
      );
      try {
        const status = verified.status === "succeeded" ? "captured" : "failed";
        const settled = await dependencies.attempts.applyHostedCallback({
          providerCode: authority.providerCode,
          callbackBindingDigest: request.callbackBindingDigest,
          ...selected,
          eventKeyDigest,
          expectedVersion: authority.version,
          credentialVersion: authority.credentialVersion,
          status,
          providerReference: verified.providerReference,
          safeCode: verified.safeCode,
          amountMinor: verified.paidAmountMinor,
          currency: verified.currency,
          now: new Date(now),
        });
        if (!exactHostedCallbackMutation(settled, authority, {
          status,
          providerReference: verified.providerReference,
          safeCode: verified.safeCode,
        })) return CALLBACK_REJECTED;
        if (settled.disposition === "processing") {
          return callbackProjection(adapter, "processing");
        }
      } catch (error) {
        return retryableCallbackError(error) ? CALLBACK_RETRY : CALLBACK_REJECTED;
      }
      return callbackProjection(
        adapter,
        verified.status === "succeeded" ? "success" : "failure",
      );
    } catch {
      return CALLBACK_REJECTED;
    } finally {
      if (opened !== undefined) {
        wipeObject(opened.credential);
        opened.bytes.fill(0);
      }
    }
  } finally {
    request.body.fill(0);
  }
}

async function callback(
  dependencies: HostedPaymentRuntimeDependencies,
  input: Readonly<{ request: Request; providerCode: string; binding: string }>,
  providerTimeoutMs: number,
): Promise<HostedPaymentCallbackResult> {
  const hostname = input.request instanceof Request
    ? trustedHostname(dependencies, input.request.headers)
    : null;
  const now = selectedNow(dependencies);
  if (hostname === null || now === null) return CALLBACK_REJECTED;
  const request = await readExactHostedPaymentCallback({
    request: input.request,
    providerCode: input.providerCode,
    binding: input.binding,
    trustedHostname: hostname,
  });
  if (request === null) return CALLBACK_REJECTED;
  const result = await settleExactCallback(dependencies, request, now, false, providerTimeoutMs);
  return result.kind === "not_found" ? CALLBACK_REJECTED : result;
}

async function callbackByDigest(
  dependencies: HostedPaymentRuntimeDependencies,
  input: Readonly<{
    request: Request;
    providerCode: string;
    callbackBindingDigest: string;
  }>,
  providerTimeoutMs: number,
): Promise<HostedPaymentDigestCallbackResult> {
  const hostname = input.request instanceof Request
    ? trustedHostname(dependencies, input.request.headers)
    : null;
  const now = selectedNow(dependencies);
  if (hostname === null || now === null) return CALLBACK_REJECTED;
  const request = await readExactHostedPaymentCallbackByDigest({
    request: input.request,
    providerCode: input.providerCode,
    callbackBindingDigest: input.callbackBindingDigest,
    trustedHostname: hostname,
  });
  if (request === null) return CALLBACK_REJECTED;
  const result = await settleExactCallback(dependencies, request, now, true, providerTimeoutMs);
  return result.kind === "customer_return" ? CALLBACK_REJECTED : result;
}

function exactClaim(
  claim: PaymentAttemptReconciliationClaim,
  input: Readonly<{
    attemptId: string;
    expectedVersion: number;
    workerId: string;
    leaseId: string;
    leaseExpiresAt: Date;
  }>,
): boolean {
  return claim.attemptId === input.attemptId
    && claim.status === "reconciliation_required"
    && claim.version === input.expectedVersion + 1
    && claim.leaseOwner === input.workerId
    && claim.leaseId === input.leaseId
    && claim.leaseExpiresAt === input.leaseExpiresAt.toISOString()
    && UUID.test(claim.storeId)
    && UUID.test(claim.profileId)
    && UUID.test(claim.paymentMethodId)
    && PROVIDER_CODE.test(claim.providerCode)
    && environmentMatches(claim);
}

function parseStatus(
  value: HostedPaymentStatus,
  claim: PaymentAttemptReconciliationClaim,
): Readonly<{
  status: "captured" | "failed" | "provider_outcome_unknown";
  providerReference: string | null;
  safeCode: string;
  result: HostedPaymentReconciliationResult;
}> | null {
  if (
    plainRecord(value)
    && value.kind === "rejected"
    && exactKeys(value, ["kind", "code"])
    && typeof value.code === "string"
    && CODE.test(value.code)
  ) return null;
  if (
    !plainRecord(value)
    || !("providerReference" in value)
    || !validProviderReference(value.providerReference)
  ) {
    return Object.freeze({
      status: "provider_outcome_unknown",
      providerReference: claim.providerReference,
      safeCode: "provider_outcome_unknown",
      result: RECONCILIATION_PROCESSING,
    });
  }
  if (
    value.kind === "succeeded"
    && exactKeys(value, [
      "kind", "providerReference", "paidAmountMinor", "currency",
    ])
    && typeof value.providerReference === "string"
    && value.paidAmountMinor === claim.amountMinor
    && value.currency === claim.currency
    && (claim.providerReference === null || claim.providerReference === value.providerReference)
  ) {
    return Object.freeze({
      status: "captured",
      providerReference: value.providerReference,
      safeCode: "payment_captured",
      result: RECONCILIATION_CAPTURED,
    });
  }
  if (
    value.kind === "failed"
    && exactKeys(value, ["kind", "providerReference", "code"])
    && typeof value.code === "string"
    && CODE.test(value.code)
    && (claim.providerReference === null || claim.providerReference === value.providerReference)
  ) {
    return Object.freeze({
      status: "failed",
      providerReference: claim.providerReference,
      safeCode: value.code,
      result: RECONCILIATION_FAILED,
    });
  }
  return Object.freeze({
    status: "provider_outcome_unknown",
    providerReference: claim.providerReference,
    safeCode: "provider_outcome_unknown",
    result: RECONCILIATION_PROCESSING,
  });
}

async function reconcile(
  dependencies: HostedPaymentRuntimeDependencies,
  input: Readonly<{
    attemptId: string;
    operationId: string;
    expectedVersion: number;
    workerId: string;
    leaseId: string;
  }>,
  providerTimeoutMs: number,
): Promise<HostedPaymentReconciliationResult> {
  if (
    !UUID.test(input.attemptId)
    || !UUID.test(input.operationId)
    || !UUID.test(input.leaseId)
    || !Number.isSafeInteger(input.expectedVersion)
    || input.expectedVersion < 1
    || typeof input.workerId !== "string"
    || !/^[A-Za-z0-9._-]{1,128}$/.test(input.workerId)
  ) return RECONCILIATION_REJECTED;
  const now = selectedNow(dependencies);
  if (now === null) return RECONCILIATION_REJECTED;
  const leaseExpiresAt = new Date(now.getTime() + RECONCILIATION_LEASE_MS);
  const claimFingerprint = digest(
    "reconciliation-claim",
    input.attemptId,
    input.expectedVersion,
    input.workerId,
    input.leaseId,
    now.toISOString(),
    leaseExpiresAt.toISOString(),
  );
  let claim: PaymentAttemptReconciliationClaim;
  try {
    claim = await dependencies.attempts.claimReconciliation({
      attemptId: input.attemptId,
      operationId: input.operationId,
      fingerprint: claimFingerprint,
      expectedVersion: input.expectedVersion,
      workerId: input.workerId,
      leaseId: input.leaseId,
      now: new Date(now),
      leaseExpiresAt,
    });
  } catch {
    return RECONCILIATION_REJECTED;
  }
  if (!exactClaim(claim, { ...input, leaseExpiresAt })) return RECONCILIATION_REJECTED;
  const selectedAdapter = adapterFor(dependencies, claim, "query");
  if (selectedAdapter === null) return RECONCILIATION_REJECTED;
  if (!await currentCompiledAuthorityMatches(dependencies, selectedAdapter)) {
    return RECONCILIATION_REJECTED;
  }
  const adapter = selectedAdapter.adapter;
  let selected: Readonly<{
    status: "captured" | "failed" | "provider_outcome_unknown";
    providerReference: string | null;
    safeCode: string;
    result: HostedPaymentReconciliationResult;
  }>;
  let opened: OpenedCredential | undefined;
  try {
    opened = openCredential(dependencies, claim, adapter);
  } catch {
    return RECONCILIATION_REJECTED;
  }
  try {
    const credential = opened.credential;
    try {
      const parsed = parseStatus(await withinProviderDeadline(providerTimeoutMs, (signal) => adapter.query(Object.freeze({
        environment: claim.environment,
        credential,
        attemptId: claim.attemptId,
        orderReference: claim.orderReference,
        providerReference: claim.providerReference,
        amountMinor: claim.amountMinor,
        currency: claim.currency,
        signal,
      }))), claim);
      if (parsed === null) return RECONCILIATION_REJECTED;
      selected = parsed;
    } catch {
      selected = Object.freeze({
        status: "provider_outcome_unknown",
        providerReference: claim.providerReference,
        safeCode: "provider_outcome_unknown",
        result: RECONCILIATION_PROCESSING,
      });
    }
  } finally {
    wipeOpenedCredential(opened);
  }
  const finalizeNow = selectedNow(dependencies);
  if (finalizeNow === null || finalizeNow.getTime() >= leaseExpiresAt.getTime()) {
    return RECONCILIATION_PROCESSING;
  }
  const finalized = phase(
    "reconciliation-finalize",
    claim.attemptId,
    claim.leaseId,
    claim.version,
    selected.status,
    opened?.credentialDigest ?? null,
    selected.providerReference,
    selected.safeCode,
    claim.amountMinor,
    claim.currency,
  );
  try {
    await dependencies.attempts.finalizeReconciliation({
      attemptId: claim.attemptId,
      ...finalized,
      expectedVersion: claim.version,
      workerId: claim.leaseOwner,
      leaseId: claim.leaseId,
      credentialVersion: claim.credentialVersion,
      status: selected.status,
      providerReference: selected.providerReference,
      safeCode: selected.safeCode,
      amountMinor: claim.amountMinor,
      currency: claim.currency,
      now: new Date(finalizeNow),
    });
  } catch {
    return RECONCILIATION_PROCESSING;
  }
  return selected.result;
}

export function createHostedPaymentRuntime(
  dependencies: HostedPaymentRuntimeDependencies,
): HostedPaymentRuntime {
  const providerTimeoutMs = providerDeadlineMilliseconds(dependencies);
  if (providerTimeoutMs === null) {
    return Object.freeze({
      initialize: async () => PRESENTATION_REJECTED,
      callback: async () => CALLBACK_REJECTED,
      callbackByDigest: async () => CALLBACK_REJECTED,
      reconcile: async () => RECONCILIATION_REJECTED,
    });
  }
  return Object.freeze({
    initialize: (input) => initialize(dependencies, input, providerTimeoutMs),
    callback: (input) => callback(dependencies, input, providerTimeoutMs),
    callbackByDigest: (input) => callbackByDigest(dependencies, input, providerTimeoutMs),
    reconcile: (input) => reconcile(dependencies, input, providerTimeoutMs),
  });
}

export function createHostedPaymentCallbackRoute(dependencies: Readonly<{
  resolveRuntime: () => Promise<HostedPaymentRuntime | null>;
}>) {
  const headers = Object.freeze({
    "cache-control": "no-store",
    "content-type": "text/plain; charset=utf-8",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex, nofollow",
  });
  return async function POST(
    request: Request,
    context: Readonly<{ params: Promise<Readonly<{ providerCode: string; binding: string }>> }>,
  ): Promise<Response> {
    try {
      const params = await context.params;
      const runtime = await dependencies.resolveRuntime();
      if (runtime === null) return new Response("INVALID", { status: 400, headers });
      const result = await runtime.callback({
        request,
        providerCode: params.providerCode,
        binding: params.binding,
      });
      if (result.kind === "customer_return") {
        const location = result.outcome === "success"
          ? SUCCESS_PATH
          : result.outcome === "failure"
            ? FAILURE_PATH
            : PROCESSING_PATH;
        return new Response(null, {
          status: 303,
          headers: Object.freeze({ ...headers, location }),
        });
      }
      return result.kind === "accepted"
        ? new Response("OK", { status: 200, headers })
        : result.kind === "retry"
          ? new Response("RETRY", { status: 503, headers })
          : new Response("INVALID", { status: 400, headers });
    } catch {
      return new Response("INVALID", { status: 400, headers });
    }
  };
}
