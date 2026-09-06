import assert from "node:assert/strict";
import test from "node:test";

import type { PostgresPoolLike } from "../postgres/pool.ts";
import {
  PostgresStorefrontCommerceRepository,
  StorefrontCommerceRepositoryError,
} from "./index.ts";

const HOST = "guzide-cart.saas-staging.celebix.site";
const NOW = new Date("2026-07-31T12:00:00.000Z");
const PRODUCT = "40000000-0000-4000-8000-000000000081";
const VARIANT = "50000000-0000-4000-8000-000000000081";
const OPERATION = "70000000-0000-4000-8000-000000000081";
const DIGEST = "a".repeat(64);
const AUTHORITY_DIGEST = "d".repeat(64);
const CANDIDATES = Object.freeze([
  Object.freeze({ keyId: "current_01", digest: DIGEST }),
]);
const NORMALIZED_CODES = Object.freeze([
  "YUZDE10",
  "HEDIYE",
  "KARGO",
  "SEPET100",
  "VIP",
]);
const CART = Object.freeze({
  version: 1,
  currency: "TRY",
  itemCount: 1,
  subtotalCents: 1127100,
  shippingCents: 9900,
  totalCents: 1137000,
  checkoutReady: true,
  checkoutBlocker: null,
  items: Object.freeze([
    Object.freeze({
      productId: PRODUCT,
      variantId: VARIANT,
      slug: "altin-yuzuk",
      title: "Altın Yüzük",
      variantTitle: "14 Ayar",
      quantity: 1,
      unitPriceCents: 1127100,
      lineTotalCents: 1127100,
      available: true,
    }),
  ]),
});
const BANK_TRANSFER = Object.freeze({
  kind: "bank_transfer",
  label: "Banka havalesi",
  instructions: "Açıklama",
  bankName: "Celebix Bank",
  accountHolder: "Güzide",
  iban: "TR330006100519786457841326",
});
const RECEIPT = Object.freeze({
  orderReference: "SF-72000000000040008000000000000081",
  currency: "TRY",
  subtotalCents: 1127100,
  shippingCents: 9900,
  totalCents: 1137000,
  paymentStatus: "pending",
  paymentMethod: Object.freeze({
    kind: "bank_transfer",
    label: "Banka havalesi",
    instructions: "Açıklama",
    bankName: "Celebix Bank",
    accountHolder: "Güzide",
    iban: "TR330006100519786457841326",
  }),
  delivery: Object.freeze({
    recipientName: "Güzide Elif",
    addressLine1: "Cadde 1",
    city: "İstanbul",
    country: "TR",
  }),
  items: CART.items,
  createdAt: NOW.toISOString(),
});
const PERSISTED_CREATED = Object.freeze({
  receipt: true as const,
  customer: true,
  receiptKeyId: "current_01",
  customerKeyId: "current_01",
});
const PERSISTED_REUSED = Object.freeze({
  receipt: true as const,
  customer: false,
  receiptKeyId: "current_01",
  customerKeyId: "current_01",
});
const DELIVERY = Object.freeze({
  contact: Object.freeze({
    firstName: "Güzide",
    lastName: "Elif",
    email: "guzide@example.test",
    phone: "+905551112233",
  }),
  shippingAddress: Object.freeze({
    line1: "Cadde 1",
    city: "İstanbul",
    country: "TR" as const,
  }),
});
const DISCOUNTED_ITEM = Object.freeze({
  ...CART.items[0],
  discountCents: 112710,
  payableCents: 1014390,
});
const DISCOUNTED_CART = Object.freeze({
  ...CART,
  lineDiscountCents: 112710,
  shippingDiscountCents: 0,
  discountCents: 112710,
  totalCents: 1024290,
  items: Object.freeze([DISCOUNTED_ITEM]),
});
const APPLIED_PROMOTION = Object.freeze({
  name: "Sepette %10",
  benefitKind: "percentage" as const,
  normalizedCode: "YUZDE10",
  lineDiscountCents: 112710,
  shippingDiscountCents: 0,
  discountCents: 112710,
});
const QUOTE_V2 = Object.freeze({
  cart: DISCOUNTED_CART,
  paymentMethods: Object.freeze([BANK_TRANSFER]),
  promotionStatus: Object.freeze({ kind: "evaluated" as const }),
  appliedPromotions: Object.freeze([APPLIED_PROMOTION]),
  rejectedPromotions: Object.freeze([
    Object.freeze({
      normalizedCode: "HEDIYE",
      reason: "not_eligible" as const,
    }),
  ]),
  gifts: Object.freeze([]),
  progressMessages: Object.freeze(["Ücretsiz kargo için 500 TL daha ekleyin."]),
});
const RECEIPT_V2 = Object.freeze({
  ...RECEIPT,
  lineDiscountCents: DISCOUNTED_CART.lineDiscountCents,
  shippingDiscountCents: DISCOUNTED_CART.shippingDiscountCents,
  discountCents: DISCOUNTED_CART.discountCents,
  totalCents: DISCOUNTED_CART.totalCents,
  items: DISCOUNTED_CART.items,
  promotionStatus: QUOTE_V2.promotionStatus,
  appliedPromotions: QUOTE_V2.appliedPromotions,
  gifts: QUOTE_V2.gifts,
});

function completeV2Input() {
  return {
    hostname: HOST,
    now: NOW,
    intentKind: "cart" as const,
    candidates: CANDIDATES,
    customerCandidates: CANDIDATES,
    operationId: OPERATION,
    cartVersion: 1,
    delivery: DELIVERY,
    paymentKind: "bank_transfer" as const,
    generated: {
      orderId: "72000000-0000-4000-8000-000000000081",
      customerId: "73000000-0000-4000-8000-000000000081",
      addressId: "74000000-0000-4000-8000-000000000081",
      eventId: "75000000-0000-4000-8000-000000000081",
      receipt: {
        id: "76000000-0000-4000-8000-000000000081",
        keyId: "current_01",
        digest: "b".repeat(64),
        expiresAt: new Date("2026-08-01T12:00:00.000Z"),
      },
      customer: {
        id: "77000000-0000-4000-8000-000000000081",
        keyId: "current_01",
        digest: "c".repeat(64),
        expiresAt: new Date("2026-08-30T12:00:00.000Z"),
      },
    },
    normalizedCodes: NORMALIZED_CODES,
  };
}

type Row = Record<string, unknown>;
type Responder = (text: string, values: unknown[]) => Row[] | Promise<Row[]>;
class Client {
  readonly calls: Array<{ text: string; values: unknown[] }> = [];
  readonly releases: unknown[] = [];
  private readonly responder: Responder;
  constructor(responder: Responder) {
    this.responder = responder;
  }
  async query(text: string, values: unknown[] = []) {
    this.calls.push({ text, values });
    const rows = await this.responder(text, values);
    return { rows, rowCount: rows.length, command: "", oid: 0, fields: [] };
  }
  release(value?: unknown) {
    this.releases.push(value);
  }
}
class Pool implements PostgresPoolLike {
  private index = 0;
  private readonly clients: readonly Client[];
  constructor(clients: readonly Client[]) {
    this.clients = clients;
  }
  async connect() {
    const client = this.clients[this.index++];
    if (!client) throw new Error("pool");
    return client;
  }
}
const TIMEOUTS = Object.freeze({
  poolCheckoutMs: 100,
  statementMs: 500,
  lockMs: 300,
  idleTransactionMs: 700,
});
function repository(pool: Pool) {
  return new PostgresStorefrontCommerceRepository({
    pool,
    role: "celebix_saas_host_resolver",
    timeouts: TIMEOUTS,
    audit: () => undefined,
  });
}
function responder(outcome: string, result: unknown): Responder {
  return (text) =>
    text.includes("saas.") ? [{ outcome, result_payload: result }] : [];
}

test("cart resolve uses one read-only hostname/digest workflow and releases after commit", async () => {
  const client = new Client(responder("found", CART));
  assert.deepEqual(
    await repository(new Pool([client])).resolveCart({
      hostname: HOST,
      now: NOW,
      candidates: CANDIDATES,
    }),
    CART,
  );
  assert.equal(client.calls[0]?.text, "BEGIN READ ONLY");
  const selected = client.calls.find(({ text }) =>
    text.includes("saas.public_cart_resolve"),
  );
  assert.deepEqual(selected?.values, [HOST, NOW, JSON.stringify(CANDIDATES)]);
  assert.equal(client.calls.at(-1)?.text, "COMMIT");
  assert.deepEqual(client.releases, [undefined]);
});

test("recovery restore passes only digest and fresh cart credential metadata", async () => {
  const client = new Client(
    responder("restored", {
      cart: CART,
      restoredItems: 1,
      omittedItems: 2,
      adjustedItems: 1,
    }),
  );
  const generated = {
    id: "60000000-0000-4000-8000-000000000081",
    keyId: "current_01",
    digest: "b".repeat(64),
    expiresAt: new Date("2026-08-30T12:00:00.000Z"),
  };
  const result = await repository(new Pool([client])).restoreCart({
    hostname: HOST,
    now: NOW,
    tokenDigest: DIGEST,
    cart: generated,
  });
  assert.deepEqual(result, {
    cart: CART,
    restoredItems: 1,
    omittedItems: 2,
    adjustedItems: 1,
  });
  const selected = client.calls.find(({ text }) =>
    text.includes("public_cart_recovery_restore"),
  );
  assert.deepEqual(selected?.values, [
    HOST,
    NOW,
    DIGEST,
    generated.id,
    generated.keyId,
    generated.digest,
    generated.expiresAt,
  ]);
});

test("cart attribution persistence is strict, store-resolved, and PII-free", async () => {
  const client = new Client(responder("recorded", {}));
  const attribution = {
    firstTouch: {
      source: "atlas-qa",
      medium: "test",
      campaign: "cart-recovery",
    },
    lastTouch: {
      source: "atlas-qa",
      medium: "test",
      campaign: "cart-recovery",
    },
    referrerHost: "search.example",
    landingPathGroup: "/products/ring",
    deviceGroup: "mobile" as const,
  };
  await repository(new Pool([client])).recordCartAttribution({
    hostname: HOST,
    now: NOW,
    candidates: CANDIDATES,
    attribution,
  });
  const selected = client.calls.find(({ text }) =>
    text.includes("public_cart_attribution_record"),
  );
  assert.deepEqual(selected?.values, [
    HOST,
    NOW,
    JSON.stringify(CANDIDATES),
    JSON.stringify(attribution),
  ]);
  assert.doesNotMatch(
    JSON.stringify(selected?.values),
    /storeId|email|phone|https:/u,
  );
});

test("new cart mutation sends only generated digest metadata and canonical product authority", async () => {
  const client = new Client(
    responder("committed", { credentialCreated: true, cart: CART }),
  );
  const result = await repository(new Pool([client])).mutateCart({
    hostname: HOST,
    now: NOW,
    candidates: [],
    customerCandidates: CANDIDATES,
    cart: {
      id: "60000000-0000-4000-8000-000000000081",
      keyId: "current_01",
      digest: DIGEST,
      expiresAt: new Date("2026-08-30T12:00:00.000Z"),
    },
    operationId: OPERATION,
    action: "add",
    expectedVersion: 0,
    productId: PRODUCT,
    variantId: VARIANT,
    quantity: 1,
  });
  assert.deepEqual(result, { credentialCreated: true, cart: CART });
  const selected = client.calls.find(({ text }) =>
    text.includes("saas.public_cart_mutate"),
  );
  assert.equal(selected?.values.includes(PRODUCT), true);
  assert.equal(selected?.values.includes(VARIANT), true);
  assert.equal(selected?.values.at(-1), JSON.stringify(CANDIDATES));
  assert.equal(JSON.stringify(selected?.values).includes("credential"), false);
});

test("checkout quote restores the canonical null blocker removed by jsonb_strip_nulls", async () => {
  const { checkoutBlocker: _removed, ...databaseCart } = CART;
  const client = new Client(
    responder("quoted", {
      cart: databaseCart,
      paymentMethods: [BANK_TRANSFER],
    }),
  );
  const result = await repository(new Pool([client])).quote({
    hostname: HOST,
    now: NOW,
    intentKind: "cart",
    candidates: CANDIDATES,
  });
  assert.deepEqual(result, { cart: CART, paymentMethods: [BANK_TRANSFER] });
  const selected = client.calls.find(({ text }) =>
    text.includes("saas.public_checkout_quote"),
  );
  assert.deepEqual(
    selected?.text,
    "SELECT outcome,result_payload FROM saas.public_checkout_quote($1::text,$2::timestamptz,$3::text,$4::jsonb)",
  );
  assert.deepEqual(selected?.values, [
    HOST,
    NOW,
    "cart",
    JSON.stringify(CANDIDATES),
  ]);
  assert.equal(client.calls.at(-1)?.text, "COMMIT");
});

test("checkout quote persists the current privacy-safe session attribution", async () => {
  const client = new Client(
    responder("quoted", { cart: CART, paymentMethods: [BANK_TRANSFER] }),
  );
  const attribution = {
    firstTouch: { source: "atlas-qa", medium: "test" },
    lastTouch: { source: "atlas-qa", medium: "test" },
    landingPathGroup: "/products/ring",
    deviceGroup: "mobile" as const,
    anonymousSessionRef: `h1_${"a".repeat(64)}`,
  };
  await repository(new Pool([client])).quote({
    hostname: HOST,
    now: NOW,
    intentKind: "cart",
    candidates: CANDIDATES,
    attribution,
  });
  const selected = client.calls.find(({ text }) =>
    text.includes("saas.public_checkout_quote"),
  );
  assert.match(selected?.text ?? "", /\$5::jsonb/u);
  assert.deepEqual(selected?.values, [
    HOST,
    NOW,
    "cart",
    JSON.stringify(CANDIDATES),
    JSON.stringify(attribution),
  ]);
});

test("checkout quote compatibility never admits extra cart authority", async () => {
  const { checkoutBlocker: _removed, ...databaseCart } = CART;
  const client = new Client(
    responder("quoted", {
      cart: { ...databaseCart, storeId: PRODUCT },
      paymentMethods: [BANK_TRANSFER],
    }),
  );
  await assert.rejects(
    repository(new Pool([client])).quote({
      hostname: HOST,
      now: NOW,
      intentKind: "cart",
      candidates: CANDIDATES,
    }),
    (error: unknown) =>
      error instanceof StorefrontCommerceRepositoryError &&
      error.code === "unavailable",
  );
  assert.equal(client.calls.at(-1)?.text, "ROLLBACK");
});

test("checkout unknown commit destroys the client and performs exactly one read-only recovery", async () => {
  const first = new Client(async (text) => {
    if (text.includes("saas.public_checkout_complete"))
      return [
        {
          outcome: "committed",
          result_payload: {
            receipt: RECEIPT,
            credentialPersistence: PERSISTED_CREATED,
          },
        },
      ];
    if (text === "COMMIT") throw new Error("socket lost");
    return [];
  });
  const second = new Client(
    responder("operation_replayed", {
      receipt: RECEIPT,
      credentialPersistence: PERSISTED_CREATED,
    }),
  );
  const result = await repository(new Pool([first, second])).complete({
    hostname: HOST,
    now: NOW,
    intentKind: "cart",
    candidates: CANDIDATES,
    customerCandidates: [],
    operationId: OPERATION,
    cartVersion: 1,
    delivery: {
      contact: {
        firstName: "Güzide",
        lastName: "Elif",
        email: "guzide@example.test",
        phone: "+905551112233",
      },
      shippingAddress: { line1: "Cadde 1", city: "İstanbul", country: "TR" },
    },
    paymentKind: "bank_transfer",
    generated: {
      orderId: "72000000-0000-4000-8000-000000000081",
      customerId: "73000000-0000-4000-8000-000000000081",
      addressId: "74000000-0000-4000-8000-000000000081",
      eventId: "75000000-0000-4000-8000-000000000081",
      receipt: {
        id: "76000000-0000-4000-8000-000000000081",
        keyId: "current_01",
        digest: "b".repeat(64),
        expiresAt: new Date("2026-08-01T12:00:00.000Z"),
      },
      customer: {
        id: "77000000-0000-4000-8000-000000000081",
        keyId: "current_01",
        digest: "c".repeat(64),
        expiresAt: new Date("2026-08-30T12:00:00.000Z"),
      },
    },
  });
  assert.deepEqual(result, {
    receipt: RECEIPT,
    credentialPersistence: PERSISTED_CREATED,
  });
  assert.deepEqual(first.releases, [true]);
  assert.equal(
    second.calls.filter(({ text }) =>
      text.includes("saas.public_checkout_recover"),
    ).length,
    1,
  );
  assert.equal(second.calls[0]?.text, "BEGIN READ ONLY");
});

test("ordinary checkout replay never claims newly generated credentials were persisted", async () => {
  const client = new Client(
    responder("operation_replayed", {
      receipt: RECEIPT,
      credentialPersistence: PERSISTED_REUSED,
    }),
  );
  const result = await repository(new Pool([client])).complete({
    hostname: HOST,
    now: NOW,
    intentKind: "cart",
    candidates: CANDIDATES,
    customerCandidates: CANDIDATES,
    operationId: OPERATION,
    cartVersion: 1,
    delivery: {
      contact: {
        firstName: "Güzide",
        lastName: "Elif",
        email: "guzide@example.test",
        phone: "+905551112233",
      },
      shippingAddress: { line1: "Cadde 1", city: "İstanbul", country: "TR" },
    },
    paymentKind: "bank_transfer",
    generated: {
      orderId: "72000000-0000-4000-8000-000000000081",
      customerId: "73000000-0000-4000-8000-000000000081",
      addressId: "74000000-0000-4000-8000-000000000081",
      eventId: "75000000-0000-4000-8000-000000000081",
      receipt: {
        id: "76000000-0000-4000-8000-000000000081",
        keyId: "current_01",
        digest: "b".repeat(64),
        expiresAt: new Date("2026-08-01T12:00:00.000Z"),
      },
      customer: {
        id: "77000000-0000-4000-8000-000000000081",
        keyId: "current_01",
        digest: "c".repeat(64),
        expiresAt: new Date("2026-08-30T12:00:00.000Z"),
      },
    },
  });
  assert.deepEqual(result, {
    receipt: RECEIPT,
    credentialPersistence: PERSISTED_REUSED,
  });
  const selected = client.calls.find(({ text }) =>
    text.includes("saas.public_checkout_complete"),
  );
  assert.equal(
    selected?.text,
    "SELECT outcome,result_payload FROM saas.public_checkout_complete($1::text,$2::timestamptz,$3::text,$4::jsonb,$5::jsonb,$6::uuid,$7::text,$8::bigint,$9::jsonb,$10::text,$11::uuid,$12::uuid,$13::uuid,$14::uuid,$15::uuid,$16::text,$17::text,$18::timestamptz,$19::uuid,$20::text,$21::text,$22::timestamptz)",
  );
  assert.equal(selected?.values.length, 22);
});

test("V2 quote sends sorted normalized codes and customer authority through the additive seven-argument call", async () => {
  const attribution = {
    firstTouch: { source: "atlas-qa", medium: "test" },
    lastTouch: { source: "atlas-qa", medium: "test" },
    landingPathGroup: "/products/ring",
    deviceGroup: "mobile" as const,
  };
  const client = new Client(
    responder("quoted", {
      quote: QUOTE_V2,
      authorityDigest: AUTHORITY_DIGEST,
    }),
  );
  const result = await repository(new Pool([client])).quoteV2({
    hostname: HOST,
    now: NOW,
    intentKind: "cart",
    candidates: CANDIDATES,
    customerCandidates: CANDIDATES,
    normalizedCodes: NORMALIZED_CODES,
    attribution,
  });

  assert.deepEqual(result, {
    quote: QUOTE_V2,
    authorityDigest: AUTHORITY_DIGEST,
  });
  assert.equal(Object.hasOwn(result.quote, "authorityDigest"), false);
  const selected = client.calls.find(({ text }) =>
    text.includes("saas.public_checkout_quote_v2"),
  );
  assert.equal(
    selected?.text,
    "SELECT outcome,result_payload FROM saas.public_checkout_quote_v2($1::text,$2::timestamptz,$3::text,$4::jsonb,$5::jsonb,$6::text[],$7::jsonb)",
  );
  assert.deepEqual(selected?.values, [
    HOST,
    NOW,
    "cart",
    JSON.stringify(CANDIDATES),
    JSON.stringify(CANDIDATES),
    ["HEDIYE", "KARGO", "SEPET100", "VIP", "YUZDE10"],
    JSON.stringify(attribution),
  ]);
  assert.equal(client.calls[0]?.text, "BEGIN READ ONLY");
});

test("V2 quote rejects private authority embedded in the public projection", async () => {
  const client = new Client(
    responder("quoted", {
      quote: { ...QUOTE_V2, authorityDigest: AUTHORITY_DIGEST },
      authorityDigest: AUTHORITY_DIGEST,
    }),
  );
  await assert.rejects(
    repository(new Pool([client])).quoteV2({
      hostname: HOST,
      now: NOW,
      intentKind: "cart",
      candidates: CANDIDATES,
      customerCandidates: [],
      normalizedCodes: ["YUZDE10"],
    }),
    (error: unknown) =>
      error instanceof StorefrontCommerceRepositoryError &&
      error.code === "unavailable",
  );
  assert.equal(client.calls.at(-1)?.text, "ROLLBACK");
});

test("V2 complete binds the semantic code set and server-generated identities in its additive fingerprint", async () => {
  const first = new Client(
    responder("committed", {
      receipt: RECEIPT_V2,
      credentialPersistence: PERSISTED_REUSED,
    }),
  );
  const second = new Client(
    responder("operation_replayed", {
      receipt: RECEIPT_V2,
      credentialPersistence: PERSISTED_REUSED,
    }),
  );
  const selected = repository(new Pool([first, second]));
  const baseline = await selected.completeV2(completeV2Input());
  const reordered = await selected.completeV2({
    ...completeV2Input(),
    normalizedCodes: [...NORMALIZED_CODES].reverse(),
  });

  assert.deepEqual(baseline, {
    receipt: RECEIPT_V2,
    credentialPersistence: PERSISTED_REUSED,
  });
  assert.deepEqual(reordered, baseline);
  const calls = [first, second].map((client) =>
    client.calls.find(({ text }) =>
      text.includes("saas.public_checkout_complete_v2"),
    ),
  );
  const expectedText =
    "SELECT outcome,result_payload FROM saas.public_checkout_complete_v2($1::text,$2::timestamptz,$3::text,$4::jsonb,$5::jsonb,$6::uuid,$7::text,$8::bigint,$9::jsonb,$10::text,$11::uuid,$12::uuid,$13::uuid,$14::uuid,$15::uuid,$16::text,$17::text,$18::timestamptz,$19::uuid,$20::text,$21::text,$22::timestamptz,$23::text[])";
  assert.equal(calls[0]?.text, expectedText);
  assert.equal(calls[1]?.text, expectedText);
  assert.equal(calls[0]?.values.length, 23);
  assert.equal(
    calls[0]?.values[6],
    "5824c8a6e694d78c701f95bbb16d3f6eb3b269d3885491745072eeeddc77aa10",
  );
  assert.equal(calls[1]?.values[6], calls[0]?.values[6]);
  assert.deepEqual(calls[0]?.values[22], [
    "HEDIYE",
    "KARGO",
    "SEPET100",
    "VIP",
    "YUZDE10",
  ]);
  assert.deepEqual(calls[1]?.values[22], calls[0]?.values[22]);
});

test("V2 unknown commit recovers once through the version-aware checkout ledger without retrying the mutation", async () => {
  const first = new Client(async (text) => {
    if (text.includes("saas.public_checkout_complete_v2"))
      return [
        {
          outcome: "committed",
          result_payload: {
            receipt: RECEIPT_V2,
            credentialPersistence: PERSISTED_REUSED,
          },
        },
      ];
    if (text === "COMMIT") throw new Error("socket lost");
    return [];
  });
  const second = new Client(
    responder("operation_replayed", {
      receipt: RECEIPT_V2,
      credentialPersistence: PERSISTED_REUSED,
    }),
  );

  const result = await repository(new Pool([first, second])).completeV2(
    completeV2Input(),
  );

  assert.deepEqual(result, {
    receipt: RECEIPT_V2,
    credentialPersistence: PERSISTED_REUSED,
  });
  assert.deepEqual(first.releases, [true]);
  assert.equal(
    [first, second].flatMap(({ calls }) => calls).filter(({ text }) =>
      text.includes("saas.public_checkout_complete_v2"),
    ).length,
    1,
  );
  const recovery = second.calls.find(({ text }) =>
    text.includes("saas.public_checkout_recover_v2"),
  );
  assert.equal(
    recovery?.text,
    "SELECT outcome,result_payload FROM saas.public_checkout_recover_v2($1::text,$2::timestamptz,$3::uuid,$4::text)",
  );
  assert.deepEqual(recovery?.values, [
    HOST,
    NOW,
    OPERATION,
    "5824c8a6e694d78c701f95bbb16d3f6eb3b269d3885491745072eeeddc77aa10",
  ]);
  assert.equal(second.calls[0]?.text, "BEGIN READ ONLY");
});

test("V2 complete strictly requires the frozen discounted receipt projection", async () => {
  const client = new Client(
    responder("committed", {
      receipt: RECEIPT,
      credentialPersistence: PERSISTED_REUSED,
    }),
  );
  await assert.rejects(
    repository(new Pool([client])).completeV2(completeV2Input()),
    (error: unknown) =>
      error instanceof StorefrontCommerceRepositoryError &&
      error.code === "unavailable",
  );
  assert.equal(client.calls.at(-1)?.text, "ROLLBACK");
});

test("V2 quote and complete reject client financial, tenant, evaluator context, and code overflow authority before pool checkout", async (t) => {
  const quoteBase = {
    hostname: HOST,
    now: NOW,
    intentKind: "cart" as const,
    candidates: CANDIDATES,
    customerCandidates: CANDIDATES,
    normalizedCodes: ["YUZDE10"],
  };
  const quoteInputs = [
    ["quote client total", { ...quoteBase, totalCents: 1 }],
    ["quote client store", { ...quoteBase, storeId: PRODUCT }],
    ["quote client evaluator context", { ...quoteBase, evaluatorContext: {} }],
    [
      "quote six coupon codes",
      {
        ...quoteBase,
        normalizedCodes: ["BIR", "IKI", "UC", "DORT", "BES", "ALTI"],
      },
    ],
  ] as const;
  for (const [name, input] of quoteInputs) {
    await t.test(name, async () => {
      await assert.rejects(
        repository(new Pool([])).quoteV2(input),
        (error: unknown) =>
          error instanceof StorefrontCommerceRepositoryError &&
          error.code === "invalid_input",
      );
    });
  }

  const completeBase = completeV2Input();
  const completeInputs = [
    ["complete client total", { ...completeBase, totalCents: 1 }],
    ["complete client store", { ...completeBase, storeId: PRODUCT }],
    [
      "complete client evaluator context",
      { ...completeBase, evaluatorContext: {} },
    ],
    [
      "complete six coupon codes",
      {
        ...completeBase,
        normalizedCodes: ["BIR", "IKI", "UC", "DORT", "BES", "ALTI"],
      },
    ],
  ] as const;
  for (const [name, input] of completeInputs) {
    await t.test(name, async () => {
      await assert.rejects(
        repository(new Pool([])).completeV2(input),
        (error: unknown) =>
          error instanceof StorefrontCommerceRepositoryError &&
          error.code === "invalid_input",
      );
    });
  }
});

test("receipt read binds credentials through the mixed-version read-only call", async () => {
  const receiptCandidates = Object.freeze([
    Object.freeze({ keyId: "receipt_01", digest: "b".repeat(64) }),
  ]);
  const customerCandidates = Object.freeze([
    Object.freeze({ keyId: "customer_01", digest: "c".repeat(64) }),
  ]);
  const client = new Client(responder("found", RECEIPT));
  const result = await repository(new Pool([client])).getReceipt({
    hostname: HOST,
    now: NOW,
    receiptCandidates,
    customerCandidates,
  });
  assert.deepEqual(result, RECEIPT);
  const selected = client.calls.find(({ text }) =>
    text.includes("saas.public_receipt_get_v2"),
  );
  assert.match(
    selected?.text ?? "",
    /public_receipt_get_v2\(\$1::text,\$2::timestamptz,\$3::jsonb,\$4::jsonb\)/u,
  );
  assert.deepEqual(selected?.values, [
    HOST,
    NOW,
    JSON.stringify(receiptCandidates),
    JSON.stringify(customerCandidates),
  ]);
  assert.equal(client.calls[0]?.text, "BEGIN READ ONLY");
  assert.equal(client.calls.at(-1)?.text, "COMMIT");
});

test("a completed V2 checkout remains exactly readable through its persisted receipt", async () => {
  const completion = new Client(
    responder("committed", {
      receipt: RECEIPT_V2,
      credentialPersistence: PERSISTED_CREATED,
    }),
  );
  const receipt = new Client(responder("found", RECEIPT_V2));
  const selected = repository(new Pool([completion, receipt]));

  const committed = await selected.completeV2(completeV2Input());
  assert.deepEqual(committed.receipt, RECEIPT_V2);
  assert.deepEqual(
    await selected.getReceipt({
      hostname: HOST,
      now: NOW,
      receiptCandidates: CANDIDATES,
      customerCandidates: CANDIDATES,
    }),
    RECEIPT_V2,
  );
});

test("account order history strictly admits a mixed sequence of V1 and V2 receipts", async () => {
  const client = new Client(
    responder("found", { items: [RECEIPT, RECEIPT_V2] }),
  );
  const result = await repository(new Pool([client])).listAccountOrders({
    hostname: HOST,
    now: NOW,
    candidates: CANDIDATES,
    limit: 20,
  });
  assert.deepEqual(result, [RECEIPT, RECEIPT_V2]);
  assert.equal(
    client.calls.find(({ text }) => text.includes("public_account_orders_v2"))?.text,
    "SELECT outcome,result_payload FROM saas.public_account_orders_v2($1::text,$2::timestamptz,$3::jsonb,$4::integer)",
  );
});

test("receipt version dispatch never falls back when a V2 discriminant has an incomplete shape", async () => {
  const client = new Client(
    responder("found", {
      ...RECEIPT,
      promotionStatus: { kind: "evaluated" },
    }),
  );
  await assert.rejects(
    repository(new Pool([client])).getReceipt({
      hostname: HOST,
      now: NOW,
      receiptCandidates: CANDIDATES,
      customerCandidates: CANDIDATES,
    }),
    (error: unknown) =>
      error instanceof StorefrontCommerceRepositoryError &&
      error.code === "unavailable",
  );
});

test("malformed database projection rolls back and never returns a partial cart", async () => {
  const client = new Client(
    responder("found", { ...CART, storeId: "private" }),
  );
  await assert.rejects(
    repository(new Pool([client])).resolveCart({
      hostname: HOST,
      now: NOW,
      candidates: CANDIDATES,
    }),
    (error: unknown) =>
      error instanceof StorefrontCommerceRepositoryError &&
      error.code === "unavailable",
  );
  assert.equal(client.calls.at(-1)?.text, "ROLLBACK");
  assert.deepEqual(client.releases, [undefined]);
});

test("repository rejects more than sixteen candidates before pool acquisition", async () => {
  const selected = repository(new Pool([]));
  await assert.rejects(
    selected.resolveCart({
      hostname: HOST,
      now: NOW,
      candidates: Array.from({ length: 17 }, (_, index) => ({
        keyId: `key_${index}`,
        digest: DIGEST,
      })),
    }),
    /invalid_input/u,
  );
});
