import assert from "node:assert/strict";
import test from "node:test";

import type {
  HostedCheckoutBeginResult,
  HostedCheckoutAuthority,
  HostedCheckoutPresentationState,
  PaymentAttemptRepository,
  StorefrontHostedCheckoutRepository,
} from "@celebix/saas-data";
import { StorefrontHostedCheckoutRepositoryError } from "@celebix/saas-data";

import { createStorefrontCredential, parseStorefrontCommerceCredentialKeyring } from "../cart/credential.ts";
import type { HostedCheckoutStartRequest } from "../cart/types.ts";
import type { HostedPaymentPresentation, HostedPaymentRuntime } from "../payment-adapters/runtime.ts";
import { createStandardHostedCheckoutRuntime } from "./standard-hosted-payment.ts";

const HOST = "shop.example.test";
const STORE = "10000000-0000-4000-8000-000000000001";
const SOURCE = "11000000-0000-4000-8000-000000000001";
const METHOD = "20000000-0000-4000-8000-000000000001";
const PROFILE = "21000000-0000-4000-8000-000000000001";
const OPERATION = "30000000-0000-4000-8000-000000000001";
const ATTEMPT = "31000000-0000-4000-8000-000000000001";
const AUTHORITY_DIGEST = "a".repeat(64);
const EVALUATOR_AUTHORITY_DIGEST = "2".repeat(64);
const EVALUATOR_FINGERPRINT = "3".repeat(64);
const CANONICAL_CUSTOMER = "12000000-0000-4000-8000-000000000001";
const RESERVATION_GROUP = "32000000-0000-4000-8000-000000000001";
const PRODUCT_A = "40000000-0000-4000-8000-000000000001";
const VARIANT_A = "41000000-0000-4000-8000-000000000001";
const PRODUCT_B = "40000000-0000-4000-8000-000000000002";
const VARIANT_B = "41000000-0000-4000-8000-000000000002";
const EVIDENCE = `sha256:${"b".repeat(64)}`;
const NORMALIZED_CODES = Object.freeze(["KARGO", "YUZDE10"]);
const NOW = new Date("2026-08-06T12:00:00.000Z");
const KEY = Buffer.alloc(32, 17).toString("base64url");
const RETIRED_KEY = Buffer.alloc(32, 19).toString("base64url");
const commerceKeyring = parseStorefrontCommerceCredentialKeyring({
  CELEBIX_DEPLOYMENT_TIER: "staging",
  CELEBIX_STOREFRONT_COMMERCE_CREDENTIALS_MODE: "approved_staging",
  CELEBIX_STOREFRONT_COMMERCE_ACTIVE_KEY_ID: "current_01",
  CELEBIX_STOREFRONT_COMMERCE_KEYS: JSON.stringify([{ keyId: "current_01", key: KEY }, { keyId: "previous_01", key: RETIRED_KEY }]),
});
const presentationKeyring = Object.freeze({
  activeKeyId: "presentation_01",
  keys: Object.freeze([Object.freeze({ keyId: "presentation_01", key: new Uint8Array(Buffer.alloc(32, 29)) })]),
});
const cart = createStorefrontCredential("cart", commerceKeyring, (size) => new Uint8Array(size).fill(5));
const authenticatedCustomer = createStorefrontCredential("customer", commerceKeyring, (size) => new Uint8Array(size).fill(6));
const request: HostedCheckoutStartRequest = Object.freeze({
  kind: "hosted_start",
  operationId: OPERATION,
  cartVersion: 4,
  intentKind: "cart",
  contact: Object.freeze({ name: "Güzide Elif", email: "guzide@example.test", phone: "+905551112233" }),
  shippingAddress: Object.freeze({ addressLine1: "Bağdat Caddesi 1", city: "İstanbul", district: "Kadıköy", postalCode: "34710" }),
  shippingMethod: "standard",
  paymentMethodId: METHOD,
  identityNumber: "10000000146",
});
const requestV2 = Object.freeze({
  ...request,
  normalizedCodes: NORMALIZED_CODES,
});
const authority = Object.freeze({
  authorityDigest: AUTHORITY_DIGEST,
  storeId: STORE,
  sourceKind: "cart" as const,
  sourceId: SOURCE,
  sourceVersion: 4,
  paymentMethodId: METHOD,
  methodVersion: 1,
  profileId: PROFILE,
  profileVersion: 1,
  providerCode: "iyzico_iframe" as const,
  environment: "test" as const,
  credentialVersion: 1,
  executionAdapterVersion: 1,
  executionEvidenceDigest: EVIDENCE,
  orderReference: "SF-20260806-0001",
  currency: "TRY" as const,
  subtotalMinor: 10_000,
  shippingMinor: 0,
  discountMinor: 0,
  totalMinor: 10_000,
  delivery: Object.freeze({
    contact: Object.freeze({ firstName: "Güzide", lastName: "Elif", email: "guzide@example.test", phone: "+905551112233" }),
    shippingAddress: Object.freeze({ line1: "Bağdat Caddesi 1", city: "İstanbul", district: "Kadıköy", postalCode: "34710", country: "TR" as const }),
  }),
  items: Object.freeze([]),
  presentation: "iframe" as const,
  requiredCustomerFields: Object.freeze(["identity_number" as const]),
  customerName: "Güzide Elif",
  customerEmail: "guzide@example.test",
  customerPhone: "+905551112233",
  customerAddress: "Bağdat Caddesi 1",
  city: "İstanbul",
  country: "TR" as const,
  postalCode: "34710",
  basket: Object.freeze([Object.freeze({ reference: "sku-1", name: "Kolye", quantity: 1, unitAmountMinor: 10_000, itemType: "PHYSICAL" as const })]),
});

function baseAttempts(): PaymentAttemptRepository {
  const unused = async (): Promise<never> => { throw new Error("unused"); };
  return {
    begin: unused,
    markInitialized: unused,
    markUnknown: unused,
    getCallbackAuthority: unused,
    getReconciliationAuthority: unused,
    settleCallback: unused,
    applyHostedCallback: unused,
    claimReconciliation: unused,
    finalizeReconciliation: unused,
  };
}

function fixture(
  selectedPresentation: HostedPaymentPresentation,
  outcome: "created" | "replayed" = "created",
  options: Readonly<{
    authorityError?: StorefrontHostedCheckoutRepositoryError;
    beginError?: StorefrontHostedCheckoutRepositoryError;
    savePresentationError?: Error;
    audit?: (event: Readonly<{ stage: string; code?: string }>) => void;
    runtimeNow?: () => Date;
    attemptNow?: Date;
    providerCode?: "iyzico_iframe" | "paytr_iframe";
  }> = {},
) {
  const providerCode = options.providerCode ?? "iyzico_iframe";
  const selectedAuthority = Object.freeze({ ...authority, providerCode });
  let beginInput: Parameters<StorefrontHostedCheckoutRepository["begin"]>[0] | undefined;
  let savedInput: Parameters<StorefrontHostedCheckoutRepository["savePresentation"]>[0] | undefined;
  let stored: Parameters<StorefrontHostedCheckoutRepository["savePresentation"]>[0] | undefined;
  const begun: HostedCheckoutBeginResult = Object.freeze({
    outcome, attemptId: ATTEMPT, storeId: STORE, paymentMethodId: METHOD, profileId: PROFILE,
    providerCode, environment: "test", credentialVersion: 1,
    executionAdapterVersion: 1, executionEvidenceDigest: EVIDENCE, amountMinor: 10_000, currency: "TRY",
    methodConfig: Object.freeze({
      environment: "test" as const,
      locale: "tr" as const,
      threeDSecure: "provider_managed" as const,
      installmentMode: "all" as const,
      maxInstallment: 0 as const,
    }),
    publicConfig: Object.freeze({}),
    paymentSessionKeyId: outcome === "replayed" ? "previous_01" : "current_01",
    receiptKeyId: outcome === "replayed" ? "previous_01" : "current_01",
    customerKeyId: outcome === "replayed" ? "previous_01" : "current_01",
    sealedCredentials: Object.freeze({ algorithm: "A256GCM", ciphertext: "YQ", iv: Buffer.alloc(12).toString("base64url"), keyId: "provider_01", tag: Buffer.alloc(16).toString("base64url"), version: 1 }),
  });
  const repository: StorefrontHostedCheckoutRepository = {
    authority: async () => {
      if (options.authorityError) throw options.authorityError;
      return selectedAuthority;
    },
    authorityV2: async () => { throw new Error("unused"); },
    begin: async (input) => {
      if (options.beginError) throw options.beginError;
      beginInput = input;
      return begun;
    },
    beginV2: async () => { throw new Error("unused"); },
    savePresentation: async (input) => {
      if (options.savePresentationError) throw options.savePresentationError;
      savedInput = input; stored = input;
      return Object.freeze({ sessionId: input.candidates[0]?.digest.slice(0, 8).padEnd(8, "0") + "-0000-4000-8000-000000000001", status: "provider_ready", version: 2, providerCode, presentationExpiresAt: input.presentationExpiresAt.toISOString() });
    },
    presentation: async () => {
      if (!stored) throw new Error("not_ready");
      return Object.freeze({ sessionId: beginInput!.sessionId, status: "provider_ready", version: 2, providerCode: "iyzico_iframe", presentationExpiresAt: stored.presentationExpiresAt.toISOString(), presentationKeyId: stored.presentationKeyId, presentationDigest: stored.presentationDigest, sealedPresentation: stored.sealedPresentation });
    },
    status: async () => Object.freeze({ sessionId: beginInput?.sessionId ?? ATTEMPT, status: "processing", safeCode: "provider_pending", version: 2, paymentSessionExpiresAt: new Date(NOW.getTime() + 900_000).toISOString() }),
  };
  const dependencies: Parameters<typeof createStandardHostedCheckoutRuntime>[0] = {
    repository,
    commerceKeyring,
    presentationKeyring,
    now: options.runtimeNow ?? (() => new Date(NOW)),
    randomUuid: (() => { let index = 0; return () => `${String(++index).padStart(8, "0")}-0000-4000-8000-000000000001`; })(),
    resolveExecution: async () => Object.freeze({
      attempts: baseAttempts(),
      createRuntime: (attempts) => Object.freeze({
        initialize: async (input) => {
          try {
            const selected = await attempts.begin({
              authority: { storeId: input.storeId, now: new Date(options.attemptNow ?? NOW) }, operationId: input.operationId,
              fingerprint: "c".repeat(64), paymentMethodId: input.paymentMethodId,
              orderReference: input.orderReference, amountMinor: input.amountMinor, currency: input.currency,
              callbackBindingDigest: "d".repeat(64),
            });
            return selected.outcome === "replayed" ? Object.freeze({ kind: "processing" as const }) : selectedPresentation;
          } catch {
            return Object.freeze({ kind: "rejected" as const });
          }
        },
        callback: async () => ({ kind: "rejected" as const }),
        callbackByDigest: async () => ({ kind: "not_found" as const }),
        reconcile: async () => ({ kind: "rejected" as const }),
      }),
    }),
    ...(options.audit ? { audit: options.audit } : {}),
  };
  const runtime = createStandardHostedCheckoutRuntime(dependencies);
  return { runtime, getBegin: () => beginInput, getSaved: () => savedInput };
}

type PreparedAuthority = Omit<HostedCheckoutAuthority, "items" | "basket"> & Readonly<{
  orderId: string;
  customerId: string;
  evaluatorAuthorityDigest: string;
  lineDiscountMinor: number;
  shippingDiscountMinor: number;
  promotionStatus: Readonly<{ kind: "evaluated" }> | Readonly<{ kind: "not_evaluated"; reason: "cart_line_limit" }>;
  appliedPromotions: readonly Readonly<{
    name: string;
    benefitKind: "percentage" | "fixed_amount" | "free_shipping" | "buy_x_get_y" | "quantity_tiers" | "bundle_price" | "gift";
    normalizedCode?: string;
    lineDiscountCents: number;
    shippingDiscountCents: number;
    discountCents: number;
  }>[];
  gifts: readonly Readonly<{ variantId: string; quantity: number; autoAdd: boolean }>[];
  items: readonly Readonly<{
    productId: string;
    variantId: string;
    slug: string;
    title: string;
    variantTitle: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
    discountCents: number;
    payableCents: number;
    available: boolean;
  }>[];
  basket: readonly Readonly<{
    reference: string;
    name: string;
    quantity: number;
    unitAmountMinor: number;
    itemType: "PHYSICAL" | "VIRTUAL";
  }>[];
}>;

function preparedAuthority(orderId: string): PreparedAuthority {
  return Object.freeze({
    ...authority,
    orderId,
    customerId: CANONICAL_CUSTOMER,
    evaluatorAuthorityDigest: EVALUATOR_AUTHORITY_DIGEST,
    subtotalMinor: 15_000,
    shippingMinor: 1_000,
    lineDiscountMinor: 1_900,
    shippingDiscountMinor: 400,
    discountMinor: 2_300,
    totalMinor: 13_700,
    promotionStatus: Object.freeze({ kind: "evaluated" as const }),
    appliedPromotions: Object.freeze([Object.freeze({
      name: "Sepette indirim",
      benefitKind: "fixed_amount" as const,
      normalizedCode: "YUZDE10",
      lineDiscountCents: 1_900,
      shippingDiscountCents: 400,
      discountCents: 2_300,
    })]),
    gifts: Object.freeze([]),
    items: Object.freeze([
      Object.freeze({
        productId: PRODUCT_A, variantId: VARIANT_A, slug: "kolye", title: "Kolye", variantTitle: "Standart",
        quantity: 1, unitPriceCents: 10_000, lineTotalCents: 10_000, discountCents: 1_500,
        payableCents: 8_500, available: true,
      }),
      Object.freeze({
        productId: PRODUCT_B, variantId: VARIANT_B, slug: "bileklik", title: "Bileklik", variantTitle: "Standart",
        quantity: 1, unitPriceCents: 5_000, lineTotalCents: 5_000, discountCents: 400,
        payableCents: 4_600, available: true,
      }),
    ]),
    basket: Object.freeze([
      Object.freeze({ reference: VARIANT_A, name: "Kolye", quantity: 1, unitAmountMinor: 8_500, itemType: "PHYSICAL" as const }),
      Object.freeze({ reference: VARIANT_B, name: "Bileklik", quantity: 1, unitAmountMinor: 4_600, itemType: "PHYSICAL" as const }),
      Object.freeze({ reference: "shipping:standard", name: "Kargo", quantity: 1, unitAmountMinor: 600, itemType: "VIRTUAL" as const }),
    ]),
  });
}

function v2PromotionReservation() {
  return Object.freeze({
    reservationGroupId: RESERVATION_GROUP,
    status: "reserved" as const,
    expiresAt: "2026-08-07T12:00:00.000Z",
    evaluatorFingerprint: EVALUATOR_FINGERPRINT,
  });
}

type ProvisionalHostedCheckoutBeginV2Result = HostedCheckoutBeginResult & Readonly<{
  authority: PreparedAuthority;
  promotionReservation: ReturnType<typeof v2PromotionReservation> | null;
}>;
type ProvisionalHostedCheckoutRepositoryV2 = StorefrontHostedCheckoutRepository & Readonly<{
  authorityV2(input: unknown): Promise<PreparedAuthority>;
  beginV2(input: unknown): Promise<ProvisionalHostedCheckoutBeginV2Result>;
}>;

function v2BeginResult(
  selectedAuthority: PreparedAuthority,
  selectedReservation: ReturnType<typeof v2PromotionReservation> | null = v2PromotionReservation(),
  outcome: "created" | "replayed" = "created",
): ProvisionalHostedCheckoutBeginV2Result {
  return Object.freeze({
    outcome,
    attemptId: ATTEMPT,
    storeId: STORE,
    paymentMethodId: METHOD,
    profileId: PROFILE,
    providerCode: selectedAuthority.providerCode,
    environment: "test" as const,
    credentialVersion: 1,
    executionAdapterVersion: 1,
    executionEvidenceDigest: EVIDENCE,
    amountMinor: selectedAuthority.totalMinor,
    currency: "TRY" as const,
    methodConfig: Object.freeze({
      environment: "test" as const,
      locale: "tr" as const,
      threeDSecure: "provider_managed" as const,
      installmentMode: "all" as const,
      maxInstallment: 0 as const,
    }),
    publicConfig: Object.freeze({ environment: "test" as const }),
    paymentSessionKeyId: "current_01",
    receiptKeyId: "current_01",
    customerKeyId: "current_01",
    sealedCredentials: Object.freeze({
      algorithm: "A256GCM" as const,
      ciphertext: "YQ",
      iv: Buffer.alloc(12).toString("base64url"),
      keyId: "provider_01",
      tag: Buffer.alloc(16).toString("base64url"),
      version: 1 as const,
    }),
    authority: selectedAuthority,
    promotionReservation: selectedReservation,
  });
}

type V2PresentationStore = {
  state?: HostedCheckoutPresentationState;
};

function v2Fixture(options: Readonly<{
  prepareAuthority?: (value: PreparedAuthority) => PreparedAuthority;
  beginAuthority?: (value: PreparedAuthority) => PreparedAuthority;
  authorityError?: StorefrontHostedCheckoutRepositoryError;
  beginError?: StorefrontHostedCheckoutRepositoryError;
  beginOutcome?: "created" | "replayed";
  promotionReservation?: ReturnType<typeof v2PromotionReservation> | null;
  providerCode?: "iyzico_iframe" | "paytr_iframe";
  providerPresentation?: HostedPaymentPresentation;
  presentationStore?: V2PresentationStore;
  presentationError?: StorefrontHostedCheckoutRepositoryError;
  runtimeNow?: Date;
  uuidStart?: number;
}> = {}) {
  const authorityV2Inputs: unknown[] = [];
  const beginV2Inputs: unknown[] = [];
  const initializations: Array<Parameters<HostedPaymentRuntime["initialize"]>[0]> = [];
  let legacyAuthorityCalls = 0;
  let legacyBeginCalls = 0;
  let providerFetches = 0;
  let executionResolutions = 0;
  let randomUuidCalls = 0;
  let presentationReads = 0;
  let presentationWrites = 0;
  let selectedPrepared: PreparedAuthority | undefined;
  const legacyBegun = Object.freeze({
    ...v2BeginResult(preparedAuthority("00000001-0000-4000-8000-000000000001")),
    amountMinor: 10_000,
  });
  const repository = {
    authority: async () => {
      legacyAuthorityCalls += 1;
      return authority;
    },
    authorityV2: async (input: unknown) => {
      authorityV2Inputs.push(input);
      if (options.authorityError) throw options.authorityError;
      const orderId = (input as { orderId?: unknown }).orderId;
      if (typeof orderId !== "string") throw new StorefrontHostedCheckoutRepositoryError("invalid_input");
      const initial = preparedAuthority(orderId);
      const base = options.providerCode === undefined
        ? initial
        : Object.freeze({
          ...initial,
          providerCode: options.providerCode,
          presentation: options.providerCode === "paytr_iframe" ? "iframe" as const : initial.presentation,
        });
      selectedPrepared = options.prepareAuthority?.(base) ?? base;
      return selectedPrepared;
    },
    begin: async () => {
      legacyBeginCalls += 1;
      return legacyBegun;
    },
    beginV2: async (input: unknown) => {
      beginV2Inputs.push(input);
      if (options.beginError) throw options.beginError;
      if (!selectedPrepared) throw new Error("prepare_missing");
      return v2BeginResult(
        options.beginAuthority?.(selectedPrepared) ?? selectedPrepared,
        Object.hasOwn(options, "promotionReservation") ? options.promotionReservation! : v2PromotionReservation(),
        options.beginOutcome ?? "created",
      );
    },
    savePresentation: async (input: Parameters<StorefrontHostedCheckoutRepository["savePresentation"]>[0]) => {
      presentationWrites += 1;
      const sessionId = (beginV2Inputs.at(-1) as { sessionId?: unknown } | undefined)?.sessionId;
      if (typeof sessionId !== "string") throw new Error("begin_missing");
      const state = Object.freeze({
        sessionId,
        status: "provider_ready" as const,
        version: 2,
        providerCode: selectedPrepared!.providerCode,
        presentationExpiresAt: input.presentationExpiresAt.toISOString(),
        presentationKeyId: input.presentationKeyId,
        presentationDigest: input.presentationDigest,
        sealedPresentation: input.sealedPresentation,
      });
      if (options.presentationStore) options.presentationStore.state = state;
      return Object.freeze({
        sessionId: state.sessionId,
        status: state.status,
        version: state.version,
        providerCode: state.providerCode,
        presentationExpiresAt: state.presentationExpiresAt,
      });
    },
    presentation: async () => {
      presentationReads += 1;
      if (options.presentationError) throw options.presentationError;
      if (!options.presentationStore?.state) throw new StorefrontHostedCheckoutRepositoryError("not_found");
      return options.presentationStore.state;
    },
    status: async () => Object.freeze({
      sessionId: ATTEMPT,
      status: "processing" as const,
      safeCode: "provider_pending",
      version: 2,
      paymentSessionExpiresAt: "2026-08-06T12:15:00.000Z",
    }),
  } as unknown as ProvisionalHostedCheckoutRepositoryV2;
  const dependencies: Parameters<typeof createStandardHostedCheckoutRuntime>[0] = {
    repository,
    commerceKeyring,
    presentationKeyring,
    now: () => new Date(options.runtimeNow ?? NOW),
    randomUuid: (() => {
      let index = options.uuidStart ?? 0;
      return () => {
        randomUuidCalls += 1;
        return `${String(++index).padStart(8, "0")}-0000-4000-8000-000000000001`;
      };
    })(),
    resolveExecution: async () => {
      executionResolutions += 1;
      return Object.freeze({
        attempts: baseAttempts(),
        createRuntime: (attempts) => Object.freeze({
          initialize: async (input) => {
            initializations.push(input);
            const begun = await attempts.begin({
              authority: Object.freeze({ storeId: input.storeId, now: new Date(NOW) }),
              operationId: input.operationId,
              fingerprint: "c".repeat(64),
              paymentMethodId: input.paymentMethodId,
              orderReference: input.orderReference,
              amountMinor: input.amountMinor,
              currency: input.currency,
              callbackBindingDigest: "d".repeat(64),
            });
            if (begun.amountMinor !== input.amountMinor || begun.currency !== input.currency) {
              return Object.freeze({ kind: "rejected" as const });
            }
            if (begun.outcome === "replayed") return Object.freeze({ kind: "processing" as const });
            providerFetches += 1;
            return options.providerPresentation ?? Object.freeze({ kind: "processing" as const });
          },
          callback: async () => Object.freeze({ kind: "rejected" as const }),
          callbackByDigest: async () => Object.freeze({ kind: "not_found" as const }),
          reconcile: async () => Object.freeze({ kind: "rejected" as const }),
        }),
      });
    },
  };
  return Object.freeze({
    runtime: createStandardHostedCheckoutRuntime(dependencies),
    calls: Object.freeze({
      authorityV2Inputs,
      beginV2Inputs,
      initializations,
      legacyAuthority: () => legacyAuthorityCalls,
      legacyBegin: () => legacyBeginCalls,
      providerFetches: () => providerFetches,
      presentationReads: () => presentationReads,
      presentationWrites: () => presentationWrites,
      executionResolutions: () => executionResolutions,
      randomUuid: () => randomUuidCalls,
    }),
  });
}

function grossPreparedAuthority(value: PreparedAuthority): PreparedAuthority {
  return Object.freeze({
    ...value,
    evaluatorAuthorityDigest: "4".repeat(64),
    lineDiscountMinor: 0,
    shippingDiscountMinor: 0,
    discountMinor: 0,
    totalMinor: 16_000,
    promotionStatus: Object.freeze({ kind: "evaluated" as const }),
    appliedPromotions: Object.freeze([]),
    gifts: Object.freeze([]),
    items: Object.freeze(value.items.map((item) => Object.freeze({
      ...item,
      discountCents: 0,
      payableCents: item.lineTotalCents,
    }))),
    basket: Object.freeze([
      Object.freeze({ reference: VARIANT_A, name: "Kolye", quantity: 1, unitAmountMinor: 10_000, itemType: "PHYSICAL" as const }),
      Object.freeze({ reference: VARIANT_B, name: "Bileklik", quantity: 1, unitAmountMinor: 5_000, itemType: "PHYSICAL" as const }),
      Object.freeze({ reference: "shipping:standard", name: "Kargo", quantity: 1, unitAmountMinor: 1_000, itemType: "VIRTUAL" as const }),
    ]),
  });
}

function manyLinePreparedAuthority(
  value: PreparedAuthority,
  positiveLineCount: number,
  shippingMinor: number,
  includeZeroPayableLine = false,
): PreparedAuthority {
  const positiveItems = Array.from({ length: positiveLineCount }, (_, index) => Object.freeze({
    productId: `40000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    variantId: `41000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    slug: `urun-${String(index + 1)}`,
    title: `Ürün ${String(index + 1)}`,
    variantTitle: "Standart",
    quantity: 1,
    unitPriceCents: 100,
    lineTotalCents: 100,
    discountCents: 0,
    payableCents: 100,
    available: true,
  }));
  const items = Object.freeze([
    ...positiveItems,
    ...(includeZeroPayableLine ? [Object.freeze({
      productId: "40000000-0000-4000-8000-999999999999",
      variantId: "41000000-0000-4000-8000-999999999999",
      slug: "sifir-tutar",
      title: "Sıfır tutar",
      variantTitle: "Standart",
      quantity: 1,
      unitPriceCents: 0,
      lineTotalCents: 0,
      discountCents: 0,
      payableCents: 0,
      available: true,
    })] : []),
  ]);
  const basket = [
    ...positiveItems.map((item) => Object.freeze({
      reference: item.variantId,
      name: item.title,
      quantity: 1,
      unitAmountMinor: 100,
      itemType: "PHYSICAL" as const,
    })),
    ...(shippingMinor > 0 ? [Object.freeze({
      reference: "shipping:standard",
      name: "Kargo",
      quantity: 1,
      unitAmountMinor: shippingMinor,
      itemType: "VIRTUAL" as const,
    })] : []),
  ];
  return Object.freeze({
    ...value,
    evaluatorAuthorityDigest: "5".repeat(64),
    subtotalMinor: positiveLineCount * 100,
    shippingMinor,
    lineDiscountMinor: 0,
    shippingDiscountMinor: 0,
    discountMinor: 0,
    totalMinor: positiveLineCount * 100 + shippingMinor,
    promotionStatus: Object.freeze({ kind: "not_evaluated" as const, reason: "cart_line_limit" as const }),
    appliedPromotions: Object.freeze([]),
    gifts: Object.freeze([]),
    items,
    basket: Object.freeze(basket),
  });
}

function lineLimitPreparedAuthority(value: PreparedAuthority): PreparedAuthority {
  return manyLinePreparedAuthority(value, 21, 0);
}

const headers = new Headers({ host: HOST, "x-forwarded-for": "8.8.8.8" });
const cookie = `__Host-celebix_cart=${cart.value}`;
const v2Cookie = `${cookie}; __Host-celebix_customer=${authenticatedCustomer.value}`;

test("hosted start obtains durable authority, requires iyzico identity and scopes payment begin", async () => {
  const selected = fixture({ kind: "iframe", url: "https://sandbox-cpp.iyzipay.com/?token=abcdefghijklmnopqrstuvwxyzABCDEFGHIJ&lang=tr", token: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ" });
  await assert.rejects(selected.runtime.start({ hostname: HOST, cookieHeader: cookie, headers, request: { ...request, identityNumber: undefined } }), /invalid_input/u);
  const result = await selected.runtime.start({ hostname: HOST, cookieHeader: cookie, headers, request });
  assert.equal(result.destination, "/checkout/payment");
  assert.equal(result.setCookies.length, 3);
  assert.equal(selected.getBegin()?.expectedAuthorityDigest, AUTHORITY_DIGEST);
  assert.equal(selected.getBegin()?.fingerprint, "c".repeat(64));
  assert.equal(selected.getBegin()?.callbackBindingDigest, "d".repeat(64));
  assert.equal(selected.getBegin()?.delivery.contact.email, request.contact.email);
});

test("hosted start seals iframe or redirect presentation and never returns provider material", async () => {
  for (const presentation of [
    { kind: "iframe" as const, url: "https://sandbox-cpp.iyzipay.com/?token=abcdefghijklmnopqrstuvwxyzABCDEFGHIJ&lang=tr", token: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ" },
    { kind: "redirect" as const, url: "https://sandbox-cpp.iyzipay.com/?token=abcdefghijklmnopqrstuvwxyzABCDEFGHIJ&lang=tr" },
  ]) {
    const selected = fixture(presentation);
    const result = await selected.runtime.start({ hostname: HOST, cookieHeader: cookie, headers, request });
    assert.equal(JSON.stringify(result).includes("iyzipay"), false);
    assert.equal(JSON.stringify(result).includes("abcdefghijklmnopqrstuvwxyz"), false);
    assert.equal(selected.getSaved()?.sealedPresentation.ciphertext.length! > 10, true);
    const opened = await selected.runtime.presentation({ hostname: HOST, cookieHeader: result.setCookies[0]! });
    assert.deepEqual(opened, presentation);
  }
});

test("provider processing and replay return the fixed destination without persisting presentation", async () => {
  for (const outcome of ["created", "replayed"] as const) {
    const selected = fixture({ kind: "processing" }, outcome);
    const result = await selected.runtime.start({ hostname: HOST, cookieHeader: cookie, headers, request });
    assert.deepEqual({ destination: result.destination, state: result.state }, { destination: "/checkout/payment", state: "processing" });
    assert.equal(selected.getSaved(), undefined);
    if (outcome === "replayed") assert.match(result.setCookies.join(";"), /h1[.]previous_01/u);
  }
});

test("PayTR provider processing fails closed before issuing browser credentials", async () => {
  const events: Readonly<{ stage: string; code?: string }>[] = [];
  const selected = fixture({ kind: "processing" }, "created", {
    providerCode: "paytr_iframe",
    audit: (event) => events.push(event),
  });

  await assert.rejects(
    selected.runtime.start({ hostname: HOST, cookieHeader: cookie, headers, request }),
    /unavailable/u,
  );

  assert.equal(selected.getSaved(), undefined);
  assert.deepEqual(events, [{ stage: "provider_initialization_unknown" }]);
});

test("provider rejection fails closed and emits no browser credential", async () => {
  const selected = fixture({ kind: "rejected" });
  await assert.rejects(selected.runtime.start({ hostname: HOST, cookieHeader: cookie, headers, request }), /unavailable/u);
  assert.equal(selected.getSaved(), undefined);
});

test("hosted begin rejection emits its safe repository code", async () => {
  const events: Readonly<{ stage: string; code?: string }>[] = [];
  const selected = fixture(
    { kind: "iframe", url: "https://sandbox-cpp.iyzipay.com/?token=abcdefghijklmnopqrstuvwxyzABCDEFGHIJ&lang=tr", token: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ" },
    "created",
    {
      beginError: new StorefrontHostedCheckoutRepositoryError("durable_authority_invalid"),
      audit: (event) => events.push(event),
    },
  );
  await assert.rejects(selected.runtime.start({ hostname: HOST, cookieHeader: cookie, headers, request }), /unavailable/u);
  assert.deepEqual(events, [{ stage: "credential_persistence_missing", code: "durable_authority_invalid" }]);
});

test("hosted authority rejection emits its safe repository code", async () => {
  const events: Readonly<{ stage: string; code?: string }>[] = [];
  const selected = fixture(
    { kind: "iframe", url: "https://sandbox-cpp.iyzipay.com/?token=abcdefghijklmnopqrstuvwxyzABCDEFGHIJ&lang=tr", token: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ" },
    "created",
    {
      authorityError: new StorefrontHostedCheckoutRepositoryError("authority_unavailable"),
      audit: (event) => events.push(event),
    },
  );

  await assert.rejects(selected.runtime.start({ hostname: HOST, cookieHeader: cookie, headers, request }), /authority_unavailable/u);
  assert.deepEqual(events, [{ stage: "authority_failure", code: "authority_unavailable" }]);
});

test("hosted start emits a safe diagnostic when no trusted public client IP exists", async () => {
  const events: Readonly<{ stage: string; code?: string }>[] = [];
  const selected = fixture(
    { kind: "iframe", url: "https://sandbox-cpp.iyzipay.com/?token=abcdefghijklmnopqrstuvwxyzABCDEFGHIJ&lang=tr", token: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ" },
    "created",
    { audit: (event) => events.push(event) },
  );

  await assert.rejects(selected.runtime.start({
    hostname: HOST,
    cookieHeader: cookie,
    headers: new Headers({ host: HOST, "x-forwarded-for": "172.18.0.4" }),
    request,
  }), /invalid_input/u);
  assert.deepEqual(events, [{ stage: "client_ip_authority_invalid" }]);
});

test("presentation persistence failure emits only a safe diagnostic stage", async () => {
  const events: Readonly<{ stage: string; code?: string }>[] = [];
  const selected = fixture(
    { kind: "iframe", url: "https://sandbox-cpp.iyzipay.com/?token=abcdefghijklmnopqrstuvwxyzABCDEFGHIJ&lang=tr", token: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ" },
    "created",
    { savePresentationError: new StorefrontHostedCheckoutRepositoryError("invalid_input"), audit: (event) => events.push(event) },
  );
  await assert.rejects(selected.runtime.start({ hostname: HOST, cookieHeader: cookie, headers, request }));
  assert.deepEqual(events, [{ stage: "presentation_persistence_failed", code: "invalid_input" }]);
});

test("presentation persistence refreshes monotonic time without extending the original hold", async () => {
  const persistenceNow = new Date(NOW.getTime() + 2_000);
  const times = [new Date(NOW), persistenceNow];
  const selected = fixture(
    { kind: "iframe", url: "https://sandbox-cpp.iyzipay.com/?token=abcdefghijklmnopqrstuvwxyzABCDEFGHIJ&lang=tr", token: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ" },
    "created",
    {
      attemptNow: new Date(NOW.getTime() + 1_000),
      runtimeNow: () => new Date(times.shift() ?? persistenceNow),
    },
  );
  await selected.runtime.start({ hostname: HOST, cookieHeader: cookie, headers, request });
  assert.equal(selected.getSaved()?.now.toISOString(), persistenceNow.toISOString());
  assert.equal(selected.getSaved()?.presentationExpiresAt.toISOString(), new Date(NOW.getTime() + 15 * 60_000).toISOString());
});

test("V2 hosted start binds customer, order, codes and evaluator digest and sends only prepared database money to the provider", async () => {
  const selected = v2Fixture();
  const result = await selected.runtime.start({ hostname: HOST, cookieHeader: v2Cookie, headers, request: requestV2 });
  assert.equal(result.state, "processing");
  assert.equal(selected.calls.legacyAuthority(), 0);
  assert.equal(selected.calls.legacyBegin(), 0);
  assert.equal(selected.calls.authorityV2Inputs.length, 1);
  assert.equal(selected.calls.beginV2Inputs.length, 1);

  const prepared = selected.calls.authorityV2Inputs[0] as Readonly<Record<string, unknown>>;
  const begun = selected.calls.beginV2Inputs[0] as Readonly<Record<string, unknown>>;
  assert.equal(prepared.operationId, OPERATION);
  assert.deepEqual(prepared.customerCandidates, [Object.freeze({
    keyId: authenticatedCustomer.keyId,
    digest: authenticatedCustomer.digest,
  })]);
  assert.deepEqual(prepared.normalizedCodes, NORMALIZED_CODES);
  assert.match(String(prepared.orderId), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/u);
  assert.match(String(prepared.prospectiveCustomerId), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/u);
  assert.equal(begun.orderId, prepared.orderId);
  assert.equal(begun.customerId, CANONICAL_CUSTOMER);
  assert.deepEqual(begun.normalizedCodes, NORMALIZED_CODES);
  assert.equal(begun.expectedAuthorityDigest, AUTHORITY_DIGEST);
  assert.equal(begun.expectedEvaluatorAuthorityDigest, EVALUATOR_AUTHORITY_DIGEST);

  assert.equal(selected.calls.initializations.length, 1);
  assert.equal(selected.calls.initializations[0]?.amountMinor, 13_700);
  assert.deepEqual(selected.calls.initializations[0]?.basket, [
    { reference: VARIANT_A, name: "Kolye", quantity: 1, unitAmountMinor: 8_500, itemType: "PHYSICAL" },
    { reference: VARIANT_B, name: "Bileklik", quantity: 1, unitAmountMinor: 4_600, itemType: "PHYSICAL" },
    { reference: "shipping:standard", name: "Kargo", quantity: 1, unitAmountMinor: 600, itemType: "VIRTUAL" },
  ]);
  assert.equal(selected.calls.providerFetches(), 1);
});

test("V2 hosted begin fingerprint binds the provider request and exact promotion authority while exact retries remain stable", async () => {
  const first = v2Fixture();
  const replay = v2Fixture({ beginOutcome: "replayed" });
  const reordered = v2Fixture({ beginOutcome: "replayed" });
  const changedCodes = v2Fixture();
  const changedAuthority = v2Fixture({
    prepareAuthority: (value) => Object.freeze({
      ...value,
      authorityDigest: "6".repeat(64),
      evaluatorAuthorityDigest: "7".repeat(64),
    }),
  });

  await first.runtime.start({ hostname: HOST, cookieHeader: v2Cookie, headers, request: requestV2 });
  await replay.runtime.start({ hostname: HOST, cookieHeader: v2Cookie, headers, request: requestV2 });
  await reordered.runtime.start({
    hostname: HOST,
    cookieHeader: v2Cookie,
    headers,
    request: Object.freeze({ ...requestV2, normalizedCodes: Object.freeze([...NORMALIZED_CODES].reverse()) }),
  });
  await changedCodes.runtime.start({
    hostname: HOST,
    cookieHeader: v2Cookie,
    headers,
    request: Object.freeze({ ...requestV2, normalizedCodes: Object.freeze(["YUZDE20", "KARGO"]) }),
  });
  await changedAuthority.runtime.start({ hostname: HOST, cookieHeader: v2Cookie, headers, request: requestV2 });

  const fingerprint = String((first.calls.beginV2Inputs[0] as { fingerprint?: unknown }).fingerprint);
  const replayFingerprint = String((replay.calls.beginV2Inputs[0] as { fingerprint?: unknown }).fingerprint);
  const reorderedFingerprint = String((reordered.calls.beginV2Inputs[0] as { fingerprint?: unknown }).fingerprint);
  const changedCodesFingerprint = String((changedCodes.calls.beginV2Inputs[0] as { fingerprint?: unknown }).fingerprint);
  const changedAuthorityFingerprint = String((changedAuthority.calls.beginV2Inputs[0] as { fingerprint?: unknown }).fingerprint);
  assert.equal(fingerprint, "669ea36d25db1bf997d5564ec2131a2146975f8553d8ad1855d17f2595898f8f");
  assert.equal(replayFingerprint, fingerprint);
  assert.equal(reorderedFingerprint, fingerprint);
  assert.notEqual(changedCodesFingerprint, fingerprint);
  assert.notEqual(changedAuthorityFingerprint, fingerprint);
  assert.equal(replay.calls.providerFetches(), 0);
});

test("V2 PayTR lost-response retry recovers the exact durable provider-ready presentation without another provider call", async () => {
  const token = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN";
  const paytrPresentation = Object.freeze({
    kind: "iframe" as const,
    url: `https://www.paytr.com/odeme/guvenli/${token}`,
    token,
  });
  const presentationStore: V2PresentationStore = {};
  const first = v2Fixture({
    providerCode: "paytr_iframe",
    providerPresentation: paytrPresentation,
    presentationStore,
  });
  const created = await first.runtime.start({ hostname: HOST, cookieHeader: v2Cookie, headers, request: requestV2 });
  assert.equal(created.state, "ready");
  assert.equal(first.calls.providerFetches(), 1);
  assert.equal(first.calls.presentationWrites(), 1);

  const replay = v2Fixture({
    providerCode: "paytr_iframe",
    beginOutcome: "replayed",
    presentationStore,
  });
  const recovered = await replay.runtime.start({ hostname: HOST, cookieHeader: v2Cookie, headers, request: requestV2 });
  assert.deepEqual(recovered, created);
  assert.equal(replay.calls.providerFetches(), 0);
  assert.equal(replay.calls.presentationReads(), 1);
  assert.equal(replay.calls.presentationWrites(), 0);
  assert.deepEqual(
    await replay.runtime.presentation({ hostname: HOST, cookieHeader: recovered.setCookies[0]! }),
    paytrPresentation,
  );
});

test("V2 PayTR replay without one exact unexpired durable presentation fails safe without provider I/O", async () => {
  const token = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN";
  const paytrPresentation = Object.freeze({
    kind: "iframe" as const,
    url: `https://www.paytr.com/odeme/guvenli/${token}`,
    token,
  });
  const validStore: V2PresentationStore = {};
  const created = v2Fixture({
    providerCode: "paytr_iframe",
    providerPresentation: paytrPresentation,
    presentationStore: validStore,
  });
  await created.runtime.start({ hostname: HOST, cookieHeader: v2Cookie, headers, request: requestV2 });
  assert.ok(validStore.state);

  const tamperedStore: V2PresentationStore = {
    state: Object.freeze({ ...validStore.state!, presentationDigest: "f".repeat(64) }),
  };
  for (const selected of [
    v2Fixture({ providerCode: "paytr_iframe", beginOutcome: "replayed", presentationStore: {} }),
    v2Fixture({
      providerCode: "paytr_iframe",
      beginOutcome: "replayed",
      presentationError: new StorefrontHostedCheckoutRepositoryError("presentation_unavailable"),
    }),
    v2Fixture({ providerCode: "paytr_iframe", beginOutcome: "replayed", presentationStore: tamperedStore }),
  ]) {
    await assert.rejects(
      selected.runtime.start({ hostname: HOST, cookieHeader: v2Cookie, headers, request: requestV2 }),
      /unavailable/u,
    );
    assert.equal(selected.calls.providerFetches(), 0);
    assert.equal(selected.calls.presentationReads(), 1);
    assert.equal(selected.calls.presentationWrites(), 0);
  }
});

test("V2 hosted start never reaches the provider after begin recomputation drift or promotion reservation failure", async () => {
  for (const selected of [
    v2Fixture({ beginAuthority: (value) => Object.freeze({ ...value, evaluatorAuthorityDigest: "9".repeat(64) }) }),
    v2Fixture({ beginError: new StorefrontHostedCheckoutRepositoryError("durable_authority_invalid") }),
  ]) {
    await assert.rejects(
      selected.runtime.start({ hostname: HOST, cookieHeader: v2Cookie, headers, request: requestV2 }),
      /unavailable|durable_authority_invalid/u,
    );
    assert.equal(selected.calls.authorityV2Inputs.length, 1);
    assert.equal(selected.calls.beginV2Inputs.length, 1);
    assert.equal(selected.calls.legacyAuthority(), 0);
    assert.equal(selected.calls.legacyBegin(), 0);
    assert.equal(selected.calls.providerFetches(), 0);
  }
});

test("V2 exact-expiry authority replay fails before resolving payment execution or provider access", async () => {
  const exactExpiry = new Date("2026-08-06T12:15:00.000Z");
  const selected = v2Fixture({
    runtimeNow: exactExpiry,
    authorityError: new StorefrontHostedCheckoutRepositoryError("authority_unavailable"),
  });

  await assert.rejects(
    selected.runtime.start({ hostname: HOST, cookieHeader: v2Cookie, headers, request: requestV2 }),
    (error: unknown) => error instanceof StorefrontHostedCheckoutRepositoryError
      && error.code === "authority_unavailable",
  );

  assert.equal(selected.calls.authorityV2Inputs.length, 1);
  assert.equal(
    (selected.calls.authorityV2Inputs[0] as { now: Date }).now.toISOString(),
    exactExpiry.toISOString(),
  );
  assert.equal(selected.calls.executionResolutions(), 0);
  assert.equal(selected.calls.initializations.length, 0);
  assert.equal(selected.calls.providerFetches(), 0);
  assert.equal(selected.calls.beginV2Inputs.length, 0);
});

test("V2 hosted start rejects a zero total or an unreconciled prepared basket without provider access", async () => {
  const zeroTotal = v2Fixture({
    prepareAuthority: (value) => Object.freeze({
      ...value,
      shippingMinor: 0,
      lineDiscountMinor: 15_000,
      shippingDiscountMinor: 0,
      discountMinor: 15_000,
      totalMinor: 0,
      items: Object.freeze(value.items.map((item) => Object.freeze({
        ...item,
        discountCents: item.lineTotalCents,
        payableCents: 0,
      }))),
      appliedPromotions: Object.freeze([Object.freeze({
        name: "Tam indirim",
        benefitKind: "percentage" as const,
        normalizedCode: "YUZDE10",
        lineDiscountCents: 15_000,
        shippingDiscountCents: 0,
        discountCents: 15_000,
      })]),
      basket: Object.freeze([]),
    }),
  });
  const basketDrift = v2Fixture({
    prepareAuthority: (value) => Object.freeze({
      ...value,
      basket: Object.freeze(value.basket.map((entry, index) => index === 2
        ? Object.freeze({ ...entry, unitAmountMinor: 599 })
        : entry)),
    }),
  });

  for (const selected of [zeroTotal, basketDrift]) {
    await assert.rejects(
      selected.runtime.start({ hostname: HOST, cookieHeader: v2Cookie, headers, request: requestV2 }),
      /unavailable/u,
    );
    assert.equal(selected.calls.beginV2Inputs.length, 0);
    assert.equal(selected.calls.providerFetches(), 0);
  }
});

test("V2 gross and cart-line-limit authority proceeds without a promotion reservation", async () => {
  for (const prepareAuthority of [grossPreparedAuthority, lineLimitPreparedAuthority]) {
    const selected = v2Fixture({ prepareAuthority, promotionReservation: null });
    const result = await selected.runtime.start({ hostname: HOST, cookieHeader: v2Cookie, headers, request: requestV2 });
    assert.equal(result.state, "processing");
    assert.equal(selected.calls.beginV2Inputs.length, 1);
    assert.equal(selected.calls.providerFetches(), 1);
  }
});

test("V2 provider basket admits 99 positive merchandise rows plus net shipping and omits a zero-payable line", async () => {
  const maximum = v2Fixture({
    prepareAuthority: (value) => manyLinePreparedAuthority(value, 99, 100, true),
    promotionReservation: null,
  });

  const accepted = await maximum.runtime.start({ hostname: HOST, cookieHeader: v2Cookie, headers, request: requestV2 });
  assert.equal(accepted.state, "processing");
  assert.equal(maximum.calls.initializations[0]?.basket.length, 100);
  assert.equal(maximum.calls.initializations[0]?.basket.at(-1)?.itemType, "VIRTUAL");
  assert.equal(maximum.calls.providerFetches(), 1);
});

test("V2 provider basket rejects 100 positive merchandise rows plus positive shipping before begin or provider access", async () => {
  const overflow = v2Fixture({
    prepareAuthority: (value) => manyLinePreparedAuthority(value, 100, 100),
    promotionReservation: null,
  });

  await assert.rejects(
    overflow.runtime.start({ hostname: HOST, cookieHeader: v2Cookie, headers, request: requestV2 }),
    /unavailable/u,
  );
  assert.equal(overflow.calls.beginV2Inputs.length, 0);
  assert.equal(overflow.calls.providerFetches(), 0);
});

test("V2 refuses a null promotion reservation for discounted or zero-value gift authority", async () => {
  const giftWithoutReservation = v2Fixture({
    prepareAuthority: (value) => Object.freeze({
      ...grossPreparedAuthority(value),
      appliedPromotions: Object.freeze([Object.freeze({
        name: "Hediye",
        benefitKind: "gift" as const,
        normalizedCode: "KARGO",
        lineDiscountCents: 0,
        shippingDiscountCents: 0,
        discountCents: 0,
      })]),
      gifts: Object.freeze([Object.freeze({ variantId: VARIANT_B, quantity: 1, autoAdd: true })]),
    }),
    promotionReservation: null,
  });
  const discountWithoutReservation = v2Fixture({ promotionReservation: null });

  for (const selected of [giftWithoutReservation, discountWithoutReservation]) {
    await assert.rejects(
      selected.runtime.start({ hostname: HOST, cookieHeader: v2Cookie, headers, request: requestV2 }),
      /unavailable/u,
    );
    assert.equal(selected.calls.beginV2Inputs.length, 1);
    assert.equal(selected.calls.providerFetches(), 0);
  }
});

test("V2 derives every future settlement id from host and operation so a fresh replay cannot fork authority", async () => {
  const first = v2Fixture({ uuidStart: 0 });
  const replay = v2Fixture({ uuidStart: 900, beginOutcome: "replayed" });
  await first.runtime.start({ hostname: HOST, cookieHeader: v2Cookie, headers, request: requestV2 });
  await replay.runtime.start({ hostname: HOST, cookieHeader: v2Cookie, headers, request: requestV2 });

  assert.equal(first.calls.authorityV2Inputs.length, 1);
  assert.equal(replay.calls.authorityV2Inputs.length, 1);
  assert.equal(first.calls.beginV2Inputs.length, 1);
  assert.equal(replay.calls.beginV2Inputs.length, 1);
  const firstPrepare = first.calls.authorityV2Inputs[0] as Readonly<Record<string, unknown>>;
  const replayPrepare = replay.calls.authorityV2Inputs[0] as Readonly<Record<string, unknown>>;
  const firstBegin = first.calls.beginV2Inputs[0] as Readonly<Record<string, unknown>>;
  const replayBegin = replay.calls.beginV2Inputs[0] as Readonly<Record<string, unknown>>;
  assert.deepEqual(
    { operationId: replayPrepare.operationId, orderId: replayPrepare.orderId, prospectiveCustomerId: replayPrepare.prospectiveCustomerId },
    { operationId: firstPrepare.operationId, orderId: firstPrepare.orderId, prospectiveCustomerId: firstPrepare.prospectiveCustomerId },
  );
  assert.deepEqual(
    {
      sessionId: replayBegin.sessionId,
      orderId: replayBegin.orderId,
      customerId: replayBegin.customerId,
      addressId: replayBegin.addressId,
      eventId: replayBegin.eventId,
      receiptId: replayBegin.receiptId,
      customerCredentialId: replayBegin.customerCredentialId,
    },
    {
      sessionId: firstBegin.sessionId,
      orderId: firstBegin.orderId,
      customerId: firstBegin.customerId,
      addressId: firstBegin.addressId,
      eventId: firstBegin.eventId,
      receiptId: firstBegin.receiptId,
      customerCredentialId: firstBegin.customerCredentialId,
    },
  );
  assert.equal(first.calls.randomUuid(), 0);
  assert.equal(replay.calls.randomUuid(), 0);
  assert.equal(first.calls.providerFetches(), 1);
  assert.equal(replay.calls.providerFetches(), 0);
});
