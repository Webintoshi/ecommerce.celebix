import "server-only";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import { normalizePromotionCode } from "@celebix/saas-contracts";

import {
  openQuickLinkSecret,
  sealQuickLinkSecret,
  StorefrontHostedCheckoutRepositoryError,
  type HostedCheckoutAuthorityV2,
  type PaymentAttemptRepository,
  type QuickLinkKeyring,
  type StorefrontHostedCheckoutRepository,
} from "@celebix/saas-data";

import {
  createStorefrontOperationCredential,
  credentialDigestCandidates,
  readStorefrontCredentialCookie,
  serializeStorefrontCredentialCookie,
  type StorefrontCommerceCredentialKeyring,
} from "../cart/credential.ts";
import type { HostedCheckoutStartRequest } from "../cart/types.ts";
import type { HostedPaymentPresentation, HostedPaymentRuntime } from "../payment-adapters/runtime.ts";
import { selectTrustedClientIp } from "./trusted-client-ip.ts";
import {
  readStandardHostedCheckoutCookie,
  serializeStandardHostedCheckoutCookie,
  standardHostedCheckoutDigestCandidates,
} from "./standard-hosted-cookie.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const TOKEN = /^[A-Za-z0-9_-]+$/;
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const PRESENTATION_LIFETIME_MS = 15 * 60_000;
type StorefrontHostedCheckoutErrorCode = StorefrontHostedCheckoutRepositoryError["code"];

export class StandardHostedCheckoutRuntimeError extends Error {
  readonly code: "invalid_input" | "unavailable";
  constructor(code: "invalid_input" | "unavailable") {
    super(code);
    this.name = "StandardHostedCheckoutRuntimeError";
    this.code = code;
    Object.freeze(this);
  }
}

export type StandardHostedCheckoutExecution = Readonly<{
  attempts: PaymentAttemptRepository;
  createRuntime(attempts: PaymentAttemptRepository): HostedPaymentRuntime | null;
}>;

export type StandardHostedCheckoutStartResult = Readonly<{
  destination: "/checkout/payment";
  state: "ready" | "processing";
  setCookies: readonly string[];
}>;

export type StandardHostedCheckoutRuntime = Readonly<{
  start(input: Readonly<{
    hostname: string;
    cookieHeader: string | null;
    headers: Headers;
    request: HostedCheckoutStartRequest;
  }>): Promise<StandardHostedCheckoutStartResult>;
  presentation(input: Readonly<{ hostname: string; cookieHeader: string | null }>): Promise<HostedPaymentPresentation>;
  status(input: Readonly<{ hostname: string; cookieHeader: string | null }>): ReturnType<StorefrontHostedCheckoutRepository["status"]>;
}>;

type Dependencies = Readonly<{
  repository: StorefrontHostedCheckoutRepository;
  commerceKeyring: StorefrontCommerceCredentialKeyring;
  presentationKeyring: QuickLinkKeyring;
  resolveExecution(): Promise<StandardHostedCheckoutExecution | null>;
  now(): Date;
  randomUuid(): string;
  audit?(event: Readonly<{ stage: "authority_failure" | "identity_authority_mismatch" | "client_ip_authority_invalid" | "execution_unavailable" | "provider_runtime_unavailable" | "provider_initialization_failed" | "provider_rejected" | "provider_initialization_unknown" | "credential_persistence_missing" | "browser_credential_reconstruction_failed" | "presentation_invalid" | "presentation_seal_failed" | "presentation_persistence_failed"; code?: StorefrontHostedCheckoutErrorCode }>): void;
}>;

function unavailable(): never { throw new StandardHostedCheckoutRuntimeError("unavailable"); }
function invalid(): never { throw new StandardHostedCheckoutRuntimeError("invalid_input"); }

function audit(
  dependencies: Dependencies,
  stage: Parameters<NonNullable<Dependencies["audit"]>>[0]["stage"],
  code?: StorefrontHostedCheckoutErrorCode,
): void {
  try { dependencies.audit?.(Object.freeze({ stage, ...(code ? { code } : {}) })); } catch { /* diagnostics cannot affect checkout */ }
}

function now(dependencies: Dependencies): Date {
  const value = dependencies.now();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return unavailable();
  return new Date(value);
}

function digest(kind: string, ...facts: readonly unknown[]): string {
  return createHash("sha256")
    .update(JSON.stringify(["celebix-standard-hosted-checkout", 1, kind, ...facts]), "utf8")
    .digest("hex");
}

function uuidFromDigest(value: string): string {
  const bytes = Buffer.from(value.slice(0, 32), "hex");
  try {
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = bytes.toString("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } finally { bytes.fill(0); }
}

function derivedUuid(kind: string, hostname: string, operationId: string): string {
  return uuidFromDigest(digest(kind, hostname, operationId));
}

function derivedV2Uuid(kind: string, hostname: string, operationId: string): string {
  const bytes = Buffer.from(digest(`v2:${kind}`, hostname, operationId).slice(0, 32), "hex");
  try {
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x0f) | 0x80;
    const hex = bytes.toString("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } finally { bytes.fill(0); }
}

function generatedUuid(dependencies: Dependencies): string {
  const value = dependencies.randomUuid();
  return UUID.test(value) ? value : unavailable();
}

function promotionCodes(request: HostedCheckoutStartRequest): readonly string[] | null {
  if (!Object.hasOwn(request,"normalizedCodes")) return null;
  const value=request.normalizedCodes;
  if (!Array.isArray(value) || Object.getPrototypeOf(value)!==Array.prototype || value.length>5) return invalid();
  const descriptors=Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey,PropertyDescriptor>;
  if (Reflect.ownKeys(descriptors).length!==value.length+1) return invalid();
  const output:string[]=[]; const seen=new Set<string>();
  for (let index=0;index<value.length;index+=1) {
    const descriptor=descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return invalid();
    const normalized=normalizePromotionCode(descriptor.value);
    if (normalized!==descriptor.value || seen.has(normalized)) return invalid();
    seen.add(normalized); output.push(normalized);
  }
  output.sort();
  return Object.freeze(output);
}

function customerCandidates(
  cookieHeader:string|null,
  keyring:StorefrontCommerceCredentialKeyring,
): readonly Readonly<{keyId:string;digest:string}>[] {
  const selected=readStorefrontCredentialCookie("customer",cookieHeader);
  if (selected.kind==="missing") return Object.freeze([]);
  if (selected.kind!=="present") return invalid();
  const candidates=credentialDigestCandidates("customer",selected.value,keyring);
  return candidates.length>0 ? candidates : invalid();
}

function exactV2Basket(authority: Readonly<Record<string,unknown>>): boolean {
  const items=authority.items; const basket=authority.basket;
  if (!Array.isArray(items) || !Array.isArray(basket) || basket.length<1 || basket.length>100
    || !Number.isSafeInteger(authority.totalMinor) || (authority.totalMinor as number)<=0
    || !Number.isSafeInteger(authority.shippingMinor) || !Number.isSafeInteger(authority.shippingDiscountMinor)) return false;
  const merchandise=items.flatMap((item)=>{
    if (typeof item!=="object" || item===null || Array.isArray(item)) return [null];
    const row=item as Readonly<Record<string,unknown>>;
    if (!Number.isSafeInteger(row.payableCents) || (row.payableCents as number)<0 || typeof row.variantId!=="string" || typeof row.title!=="string") return [null];
    return (row.payableCents as number)>0 ? [Object.freeze({reference:row.variantId,name:row.title,quantity:1,unitAmountMinor:row.payableCents,itemType:"PHYSICAL"})] : [];
  });
  if (merchandise.some((entry)=>entry===null)) return false;
  const netShipping=(authority.shippingMinor as number)-(authority.shippingDiscountMinor as number);
  if (!Number.isSafeInteger(netShipping) || netShipping<0) return false;
  const expected=[...merchandise,...(netShipping>0?[Object.freeze({reference:"shipping:standard",name:"Kargo",quantity:1,unitAmountMinor:netShipping,itemType:"VIRTUAL"})]:[])];
  if (expected.length<1 || expected.length>100 || !isDeepStrictEqual(basket,expected)) return false;
  const total=expected.reduce((sum,entry)=>sum+(entry?.unitAmountMinor as number),0);
  return Number.isSafeInteger(total) && total===authority.totalMinor;
}

function sourceCandidates(
  request: HostedCheckoutStartRequest,
  cookieHeader: string | null,
  keyring: StorefrontCommerceCredentialKeyring,
) {
  const purpose = request.intentKind === "cart" ? "cart" : "intent";
  const selected = readStorefrontCredentialCookie(purpose, cookieHeader);
  if (selected.kind !== "present") return invalid();
  const candidates = credentialDigestCandidates(purpose, selected.value, keyring);
  return candidates.length > 0 ? candidates : invalid();
}

function delivery(request: HostedCheckoutStartRequest) {
  const normalized = request.contact.name.trim().replace(/ +/gu, " ");
  const split = normalized.lastIndexOf(" ");
  const digits = request.contact.phone.replace(/[^0-9+]/gu, "");
  return Object.freeze({
    contact: Object.freeze({
      firstName: split > 0 ? normalized.slice(0, split) : normalized,
      lastName: split > 0 ? normalized.slice(split + 1) : "-",
      email: request.contact.email,
      phone: digits.startsWith("+") ? digits : digits.startsWith("0") ? `+90${digits.slice(1)}` : `+${digits}`,
    }),
    shippingAddress: Object.freeze({
      line1: request.shippingAddress.addressLine1,
      ...(request.shippingAddress.addressLine2 ? { line2: request.shippingAddress.addressLine2 } : {}),
      city: request.shippingAddress.city,
      district: request.shippingAddress.district,
      ...(request.shippingAddress.postalCode ? { postalCode: request.shippingAddress.postalCode } : {}),
      country: "TR" as const,
    }),
    ...(request.note ? { note: request.note } : {}),
  });
}

function exactPresentation(
  providerCode: "paytr_iframe" | "iyzico_iframe",
  environment: "test" | "live",
  value: HostedPaymentPresentation,
): Extract<HostedPaymentPresentation, { kind: "iframe" | "redirect" }> | null {
  if (value.kind !== "iframe" && value.kind !== "redirect") return null;
  let parsed: URL;
  try { parsed = new URL(value.url); } catch { return null; }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || parsed.hash || parsed.toString() !== value.url) return null;
  if (providerCode === "paytr_iframe") {
    if (value.kind !== "iframe" || !TOKEN.test(value.token) || value.token.length < 32 || value.token.length > 256
      || value.url !== `https://www.paytr.com/odeme/guvenli/${value.token}`) return null;
    return Object.freeze({ kind: "iframe", url: value.url, token: value.token });
  }
  const expectedOrigin = environment === "test" ? "https://sandbox-cpp.iyzipay.com" : "https://cpp.iyzipay.com";
  const token = parsed.searchParams.get("token");
  const exactQuery = token === null ? "" : `?token=${token}&lang=tr`;
  if (parsed.origin !== expectedOrigin || parsed.pathname !== "/" || parsed.search !== exactQuery
    || parsed.searchParams.size !== 2 || token === null || !TOKEN.test(token) || token.length < 36 || token.length > 256
    || (value.kind === "iframe" && value.token !== token)) return null;
  return value.kind === "iframe"
    ? Object.freeze({ kind: "iframe", url: value.url, token: value.token })
    : Object.freeze({ kind: "redirect", url: value.url });
}

function openedPersistedPresentation(
  dependencies: Dependencies,
  state: Awaited<ReturnType<StorefrontHostedCheckoutRepository["presentation"]>>,
  selectedNow: Date,
  expected?: Readonly<{
    sessionId: string;
    providerCode: "paytr_iframe" | "iyzico_iframe";
    environment: "test" | "live";
  }>,
): Extract<HostedPaymentPresentation, { kind: "iframe" | "redirect" }> | null {
  if (!state.sealedPresentation || !state.presentationDigest || !state.presentationKeyId
    || state.sealedPresentation.keyId !== state.presentationKeyId
    || (expected !== undefined && (state.sessionId !== expected.sessionId || state.providerCode !== expected.providerCode))) return null;
  const expiresAt = new Date(state.presentationExpiresAt);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= selectedNow) return null;
  let plaintext: string;
  try {
    plaintext = openQuickLinkSecret({
      envelope: state.sealedPresentation, purpose: "hosted-presentation",
      storeId: state.sessionId, objectId: state.sessionId,
      digest: state.presentationDigest, keyring: dependencies.presentationKeyring,
    });
  } catch { return null; }
  if (createHash("sha256").update(plaintext, "utf8").digest("hex") !== state.presentationDigest) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(plaintext); } catch { return null; }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).length !== 5 || record.version !== 1 || record.sessionId !== state.sessionId
    || record.providerCode !== state.providerCode || (record.environment !== "test" && record.environment !== "live")
    || (expected !== undefined && record.environment !== expected.environment)) return null;
  return exactPresentation(state.providerCode, record.environment, record.presentation as HostedPaymentPresentation);
}

function scopedAttempts(input: Readonly<{
  base: PaymentAttemptRepository;
  repository: StorefrontHostedCheckoutRepository;
  hostname: string;
  sourceCandidates: ReturnType<typeof sourceCandidates>;
  request: HostedCheckoutStartRequest;
  authority: Awaited<ReturnType<StorefrontHostedCheckoutRepository["authority"]>>;
  paymentSession: ReturnType<typeof createStorefrontOperationCredential>;
  receipt: ReturnType<typeof createStorefrontOperationCredential>;
  customer: ReturnType<typeof createStorefrontOperationCredential>;
  sessionId: string;
  generated: Readonly<{ orderId: string; customerId: string; addressId: string; eventId: string; receiptId: string; customerCredentialId: string }>;
  delivery: ReturnType<typeof delivery>;
  recordPersistence(value: Readonly<{ paymentSessionKeyId: string; receiptKeyId: string; customerKeyId: string }>): void;
  recordPersistenceFailure(code: StorefrontHostedCheckoutErrorCode): void;
  recordBeginOutcome(value: "created" | "replayed"): void;
}>): PaymentAttemptRepository {
  const scoped: PaymentAttemptRepository = {
    begin: async (payment) => {
      if (payment.authority.storeId !== input.authority.storeId
        || payment.operationId !== input.request.operationId
        || payment.paymentMethodId !== input.authority.paymentMethodId
        || payment.orderReference !== input.authority.orderReference
        || payment.amountMinor !== input.authority.totalMinor
        || payment.currency !== input.authority.currency
        || !DIGEST.test(payment.fingerprint)
        || !DIGEST.test(payment.callbackBindingDigest)) return unavailable();
      let begun;
      try {
        begun = await input.repository.begin({
          hostname: input.hostname,
          now: new Date(payment.authority.now),
          intentKind: input.request.intentKind,
          candidates: input.sourceCandidates,
          cartVersion: input.request.cartVersion,
          delivery: input.delivery,
          paymentMethodId: input.request.paymentMethodId,
          expectedAuthorityDigest: input.authority.authorityDigest,
          operationId: input.request.operationId,
          fingerprint: payment.fingerprint,
          sessionId: input.sessionId,
          callbackBindingDigest: payment.callbackBindingDigest,
          ...input.generated,
          paymentSession: Object.freeze({ keyId: input.paymentSession.keyId, digest: input.paymentSession.digest }),
          receipt: Object.freeze({ keyId: input.receipt.keyId, digest: input.receipt.digest }),
          customer: Object.freeze({ keyId: input.customer.keyId, digest: input.customer.digest }),
        });
      } catch (error) {
        if (error instanceof StorefrontHostedCheckoutRepositoryError) input.recordPersistenceFailure(error.code);
        throw error;
      }
      input.recordPersistence(Object.freeze({
        paymentSessionKeyId: begun.paymentSessionKeyId,
        receiptKeyId: begun.receiptKeyId,
        customerKeyId: begun.customerKeyId,
      }));
      input.recordBeginOutcome(begun.outcome);
      return begun;
    },
    markInitialized: (value) => input.base.markInitialized(value),
    markUnknown: (value) => input.base.markUnknown(value),
    getCallbackAuthority: (value) => input.base.getCallbackAuthority(value),
    getReconciliationAuthority: (value) => input.base.getReconciliationAuthority(value),
    settleCallback: (value) => input.base.settleCallback(value),
    applyHostedCallback: (value) => input.base.applyHostedCallback(value),
    claimReconciliation: (value) => input.base.claimReconciliation(value),
    finalizeReconciliation: (value) => input.base.finalizeReconciliation(value),
  };
  return Object.freeze(scoped);
}

function scopedAttemptsV2(input: Readonly<{
  base: PaymentAttemptRepository;
  repository: StorefrontHostedCheckoutRepository;
  hostname: string;
  sourceCandidates: ReturnType<typeof sourceCandidates>;
  customerCandidates: readonly Readonly<{ keyId: string; digest: string }>[];
  normalizedCodes: readonly string[];
  request: HostedCheckoutStartRequest;
  authority: HostedCheckoutAuthorityV2;
  paymentSession: ReturnType<typeof createStorefrontOperationCredential>;
  receipt: ReturnType<typeof createStorefrontOperationCredential>;
  customer: ReturnType<typeof createStorefrontOperationCredential>;
  sessionId: string;
  generated: Readonly<{ orderId: string; customerId: string; addressId: string; eventId: string; receiptId: string; customerCredentialId: string }>;
  delivery: ReturnType<typeof delivery>;
  recordPersistence(value: Readonly<{ paymentSessionKeyId: string; receiptKeyId: string; customerKeyId: string }>): void;
  recordPersistenceFailure(code: StorefrontHostedCheckoutErrorCode): void;
  recordBeginOutcome(value: "created" | "replayed"): void;
}>): PaymentAttemptRepository {
  const scoped: PaymentAttemptRepository = {
    begin: async (payment) => {
      if (payment.authority.storeId !== input.authority.storeId
        || payment.operationId !== input.request.operationId
        || payment.paymentMethodId !== input.authority.paymentMethodId
        || payment.orderReference !== input.authority.orderReference
        || payment.amountMinor !== input.authority.totalMinor
        || payment.currency !== input.authority.currency
        || !DIGEST.test(payment.fingerprint)
        || !DIGEST.test(payment.callbackBindingDigest)) return unavailable();
      let begun;
      try {
        const promotionBoundFingerprint = digest(
          "begin:v2",
          2,
          payment.fingerprint,
          input.normalizedCodes,
          input.authority.authorityDigest,
          input.authority.evaluatorAuthorityDigest,
        );
        begun = await input.repository.beginV2({
          hostname: input.hostname,
          now: new Date(payment.authority.now),
          intentKind: input.request.intentKind,
          candidates: input.sourceCandidates,
          cartVersion: input.request.cartVersion,
          delivery: input.delivery,
          paymentMethodId: input.request.paymentMethodId,
          expectedAuthorityDigest: input.authority.authorityDigest,
          operationId: input.request.operationId,
          fingerprint: promotionBoundFingerprint,
          sessionId: input.sessionId,
          callbackBindingDigest: payment.callbackBindingDigest,
          ...input.generated,
          paymentSession: Object.freeze({ keyId: input.paymentSession.keyId, digest: input.paymentSession.digest }),
          receipt: Object.freeze({ keyId: input.receipt.keyId, digest: input.receipt.digest }),
          customer: Object.freeze({ keyId: input.customer.keyId, digest: input.customer.digest }),
          customerCandidates: input.customerCandidates,
          normalizedCodes: input.normalizedCodes,
          expectedEvaluatorAuthorityDigest: input.authority.evaluatorAuthorityDigest,
        });
      } catch (error) {
        if (error instanceof StorefrontHostedCheckoutRepositoryError) input.recordPersistenceFailure(error.code);
        throw error;
      }
      if (!isDeepStrictEqual(begun.authority, input.authority)
        || begun.amountMinor !== input.authority.totalMinor
        || begun.currency !== input.authority.currency) return unavailable();
      const promotionFactsPresent = input.authority.appliedPromotions.length > 0
        || input.authority.gifts.length > 0
        || input.authority.discountMinor > 0;
      if ((begun.promotionReservation === null) === promotionFactsPresent) return unavailable();
      input.recordPersistence(Object.freeze({
        paymentSessionKeyId: begun.paymentSessionKeyId,
        receiptKeyId: begun.receiptKeyId,
        customerKeyId: begun.customerKeyId,
      }));
      input.recordBeginOutcome(begun.outcome);
      return begun;
    },
    markInitialized: (value) => input.base.markInitialized(value),
    markUnknown: (value) => input.base.markUnknown(value),
    getCallbackAuthority: (value) => input.base.getCallbackAuthority(value),
    getReconciliationAuthority: (value) => input.base.getReconciliationAuthority(value),
    settleCallback: (value) => input.base.settleCallback(value),
    applyHostedCallback: (value) => input.base.applyHostedCallback(value),
    claimReconciliation: (value) => input.base.claimReconciliation(value),
    finalizeReconciliation: (value) => input.base.finalizeReconciliation(value),
  };
  return Object.freeze(scoped);
}

function hostedCandidates(cookieHeader: string | null, keyring: StorefrontCommerceCredentialKeyring) {
  const selected = readStandardHostedCheckoutCookie(cookieHeader);
  if (selected.kind !== "present") return invalid();
  const candidates = standardHostedCheckoutDigestCandidates(selected.value, keyring);
  return candidates.length > 0 ? candidates : invalid();
}

export function createStandardHostedCheckoutRuntime(dependencies: Dependencies): StandardHostedCheckoutRuntime {
  return Object.freeze({
    async start(input) {
      if (!HOSTNAME.test(input.hostname) || input.hostname !== input.hostname.toLowerCase() || !(input.headers instanceof Headers)) return invalid();
      const selectedNow = now(dependencies);
      const candidates = sourceCandidates(input.request, input.cookieHeader, dependencies.commerceKeyring);
      const selectedDelivery = delivery(input.request);
      const normalizedCodes = promotionCodes(input.request);
      let selectedAuthority:
        | Readonly<{ version: 1; authority: Awaited<ReturnType<StorefrontHostedCheckoutRepository["authority"]>> }>
        | Readonly<{
          version: 2;
          authority: HostedCheckoutAuthorityV2;
          customerCandidates: readonly Readonly<{ keyId: string; digest: string }>[];
          normalizedCodes: readonly string[];
        }>;
      try {
        if (normalizedCodes === null) {
          selectedAuthority = Object.freeze({
            version: 1 as const,
            authority: await dependencies.repository.authority({
              hostname: input.hostname, now: selectedNow, intentKind: input.request.intentKind,
              candidates, cartVersion: input.request.cartVersion, delivery: selectedDelivery,
              paymentMethodId: input.request.paymentMethodId,
            }),
          });
        } else {
          const selectedCustomerCandidates = customerCandidates(input.cookieHeader, dependencies.commerceKeyring);
          const preparedOrderId = derivedV2Uuid("order", input.hostname, input.request.operationId);
          const authority = await dependencies.repository.authorityV2({
            hostname: input.hostname, now: selectedNow, intentKind: input.request.intentKind,
            candidates, cartVersion: input.request.cartVersion, delivery: selectedDelivery,
            paymentMethodId: input.request.paymentMethodId,
            operationId: input.request.operationId,
            customerCandidates: selectedCustomerCandidates,
            normalizedCodes,
            orderId: preparedOrderId,
            prospectiveCustomerId: derivedV2Uuid("prospective-customer", input.hostname, input.request.operationId),
          });
          if (authority.orderId !== preparedOrderId || !UUID.test(authority.customerId)
            || !DIGEST.test(authority.authorityDigest) || !DIGEST.test(authority.evaluatorAuthorityDigest)
            || !exactV2Basket(authority as unknown as Readonly<Record<string, unknown>>)) return unavailable();
          selectedAuthority = Object.freeze({
            version: 2 as const,
            authority,
            customerCandidates: selectedCustomerCandidates,
            normalizedCodes,
          });
        }
      } catch (error) {
        audit(dependencies, "authority_failure", error instanceof StorefrontHostedCheckoutRepositoryError ? error.code : undefined);
        throw error;
      }
      const authority = selectedAuthority.authority;
      const identityRequired = authority.requiredCustomerFields.length === 1
        && authority.requiredCustomerFields[0] === "identity_number";
      if (identityRequired !== (input.request.identityNumber !== undefined)) { audit(dependencies, "identity_authority_mismatch"); return invalid(); }
      const clientIp = selectTrustedClientIp(input.headers);
      if (clientIp === null) { audit(dependencies, "client_ip_authority_invalid"); return invalid(); }
      let execution;
      try { execution = await dependencies.resolveExecution(); }
      catch { audit(dependencies, "execution_unavailable"); return unavailable(); }
      if (execution === null) { audit(dependencies, "execution_unavailable"); return unavailable(); }
      const sessionId = derivedUuid("session", input.hostname, input.request.operationId);
      const paymentSession = createStorefrontOperationCredential("hosted_checkout", input.request.operationId, dependencies.commerceKeyring);
      const receipt = createStorefrontOperationCredential("receipt", input.request.operationId, dependencies.commerceKeyring);
      const customer = createStorefrontOperationCredential("customer", input.request.operationId, dependencies.commerceKeyring);
      let persistedKeys: Readonly<{ paymentSessionKeyId: string; receiptKeyId: string; customerKeyId: string }> | undefined;
      let beginOutcome: "created" | "replayed" | undefined;
      let persistenceFailureCode: StorefrontHostedCheckoutErrorCode | undefined;
      const recordPersistence = (value: Readonly<{ paymentSessionKeyId: string; receiptKeyId: string; customerKeyId: string }>) => { persistedKeys = value; };
      const recordPersistenceFailure = (code: StorefrontHostedCheckoutErrorCode) => { persistenceFailureCode = code; };
      const recordBeginOutcome = (value: "created" | "replayed") => { beginOutcome = value; };
      const scoped = selectedAuthority.version === 1
        ? scopedAttempts({
          base: execution.attempts, repository: dependencies.repository, hostname: input.hostname,
          sourceCandidates: candidates, request: input.request, authority: selectedAuthority.authority,
          paymentSession, receipt, customer, sessionId, delivery: selectedDelivery,
          generated: Object.freeze({
            orderId: generatedUuid(dependencies), customerId: generatedUuid(dependencies),
            addressId: generatedUuid(dependencies), eventId: generatedUuid(dependencies),
            receiptId: generatedUuid(dependencies), customerCredentialId: generatedUuid(dependencies),
          }),
          recordPersistence,
          recordPersistenceFailure,
          recordBeginOutcome,
        })
        : scopedAttemptsV2({
          base: execution.attempts, repository: dependencies.repository, hostname: input.hostname,
          sourceCandidates: candidates, customerCandidates: selectedAuthority.customerCandidates,
          normalizedCodes: selectedAuthority.normalizedCodes, request: input.request,
          authority: selectedAuthority.authority, paymentSession, receipt, customer, sessionId,
          delivery: selectedDelivery,
          generated: Object.freeze({
            orderId: selectedAuthority.authority.orderId,
            customerId: selectedAuthority.authority.customerId,
            addressId: derivedV2Uuid("address", input.hostname, input.request.operationId),
            eventId: derivedV2Uuid("event", input.hostname, input.request.operationId),
            receiptId: derivedV2Uuid("receipt", input.hostname, input.request.operationId),
            customerCredentialId: derivedV2Uuid("customer-credential", input.hostname, input.request.operationId),
          }),
          recordPersistence,
          recordPersistenceFailure,
          recordBeginOutcome,
        });
      const hosted = execution.createRuntime(scoped);
      if (hosted === null) { audit(dependencies, "provider_runtime_unavailable"); return unavailable(); }
      let providerPresentation;
      try {
        providerPresentation = await hosted.initialize({
          headers: new Headers(input.headers), storeId: authority.storeId,
          operationId: input.request.operationId, paymentMethodId: authority.paymentMethodId,
          orderReference: authority.orderReference, amountMinor: authority.totalMinor,
          currency: authority.currency,
          customer: Object.freeze({
            name: authority.customerName, email: authority.customerEmail, phone: authority.customerPhone,
            ipAddress: clientIp, address: authority.customerAddress,
            ...(input.request.identityNumber ? { identityNumber: input.request.identityNumber } : {}),
            city: authority.city, country: authority.country,
            ...(authority.postalCode ? { postalCode: authority.postalCode } : {}),
          }),
          basket: authority.basket,
        });
      } catch (error) {
        audit(dependencies, "provider_initialization_failed", error instanceof StorefrontHostedCheckoutRepositoryError ? error.code : undefined);
        throw error;
      }
      if (persistedKeys === undefined) { audit(dependencies, "credential_persistence_missing", persistenceFailureCode); return unavailable(); }
      if (providerPresentation.kind === "rejected") { audit(dependencies, "provider_rejected"); return unavailable(); }
      let persistedPaymentSession: ReturnType<typeof createStorefrontOperationCredential>;
      let browserCookies: readonly string[];
      try {
        persistedPaymentSession = createStorefrontOperationCredential("hosted_checkout", input.request.operationId, dependencies.commerceKeyring, persistedKeys.paymentSessionKeyId);
        const persistedReceipt = createStorefrontOperationCredential("receipt", input.request.operationId, dependencies.commerceKeyring, persistedKeys.receiptKeyId);
        const persistedCustomer = createStorefrontOperationCredential("customer", input.request.operationId, dependencies.commerceKeyring, persistedKeys.customerKeyId);
        browserCookies = Object.freeze([
          serializeStandardHostedCheckoutCookie(persistedPaymentSession.value),
          serializeStorefrontCredentialCookie("receipt", persistedReceipt.value),
          serializeStorefrontCredentialCookie("customer", persistedCustomer.value),
        ]);
      } catch { audit(dependencies, "browser_credential_reconstruction_failed"); return unavailable(); }
      if (providerPresentation.kind === "processing") {
        if (authority.providerCode === "paytr_iframe") {
          if (beginOutcome !== "replayed") {
            audit(dependencies, "provider_initialization_unknown");
            return unavailable();
          }
          let recovered: Extract<HostedPaymentPresentation, { kind: "iframe" | "redirect" }> | null = null;
          try {
            const recoveryNow = now(dependencies);
            const state = await dependencies.repository.presentation({
              hostname: input.hostname,
              now: recoveryNow,
              candidates: Object.freeze([{ keyId: persistedPaymentSession.keyId, digest: persistedPaymentSession.digest }]),
            });
            recovered = openedPersistedPresentation(dependencies, state, recoveryNow, Object.freeze({
              sessionId,
              providerCode: authority.providerCode,
              environment: authority.environment,
            }));
          } catch { /* missing or non-ready durable presentation is not recoverable */ }
          if (recovered === null) {
            audit(dependencies, "provider_initialization_unknown");
            return unavailable();
          }
          return Object.freeze({ destination: "/checkout/payment" as const, state: "ready" as const, setCookies: browserCookies });
        }
        return Object.freeze({ destination: "/checkout/payment" as const, state: "processing" as const, setCookies: browserCookies });
      }
      const presentation = exactPresentation(authority.providerCode, authority.environment, providerPresentation);
      if (presentation === null) { audit(dependencies, "presentation_invalid"); return unavailable(); }
      const serialized = JSON.stringify(Object.freeze({
        version: 1, sessionId, providerCode: authority.providerCode,
        environment: authority.environment, presentation,
      }));
      const presentationDigest = createHash("sha256").update(serialized, "utf8").digest("hex");
      let sealedPresentation: ReturnType<typeof sealQuickLinkSecret>;
      try {
        sealedPresentation = sealQuickLinkSecret({
          plaintext: serialized, purpose: "hosted-presentation",
          storeId: sessionId, objectId: sessionId, digest: presentationDigest,
          keyring: dependencies.presentationKeyring,
        });
      } catch { audit(dependencies, "presentation_seal_failed"); return unavailable(); }
      const persistenceNow = now(dependencies);
      try {
        await dependencies.repository.savePresentation({
          hostname: input.hostname, now: persistenceNow,
          candidates: Object.freeze([{ keyId: persistedPaymentSession.keyId, digest: persistedPaymentSession.digest }]),
          operationId: derivedUuid("presentation-operation", input.hostname, input.request.operationId),
          fingerprint: digest("presentation", sessionId, presentationDigest), expectedVersion: 1,
          presentationKeyId: sealedPresentation.keyId, presentationDigest,
          sealedPresentation, presentationExpiresAt: new Date(selectedNow.getTime() + PRESENTATION_LIFETIME_MS),
        });
      } catch (error) {
        audit(dependencies, "presentation_persistence_failed", error instanceof StorefrontHostedCheckoutRepositoryError ? error.code : "unavailable");
        return unavailable();
      }
      return Object.freeze({ destination: "/checkout/payment" as const, state: "ready" as const, setCookies: browserCookies });
    },
    async presentation(input) {
      const selectedNow = now(dependencies);
      const state = await dependencies.repository.presentation({
        hostname: input.hostname, now: selectedNow,
        candidates: hostedCandidates(input.cookieHeader, dependencies.commerceKeyring),
      });
      return openedPersistedPresentation(dependencies, state, selectedNow) ?? unavailable();
    },
    async status(input) {
      return dependencies.repository.status({
        hostname: input.hostname, now: now(dependencies),
        candidates: hostedCandidates(input.cookieHeader, dependencies.commerceKeyring),
      });
    },
  });
}
