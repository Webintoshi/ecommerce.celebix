import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import type { QueryResult } from "pg";

import type { PostgresPoolLike } from "../postgres/pool.ts";
import {
  PostgresStorefrontHostedCheckoutRepository,
  StorefrontHostedCheckoutRepositoryError,
} from "./repository.ts";
import { hostedPromotionCodes, parseHostedAuthorityV2 } from "./validation.ts";
import type { HostedCheckoutBeginResult } from "./types.ts";

const HOST = "guzide.saas-staging.celebix.site";
const NOW = new Date("2026-08-06T12:00:00.000Z");
const STORE = "10000000-0000-4000-8000-000000000191";
const SOURCE = "20000000-0000-4000-8000-000000000191";
const PRODUCT = "30000000-0000-4000-8000-000000000191";
const VARIANT = "40000000-0000-4000-8000-000000000191";
const METHOD = "50000000-0000-4000-8000-000000000191";
const PROFILE = "60000000-0000-4000-8000-000000000191";
const OPERATION = "70000000-0000-4000-8000-000000000191";
const SESSION = "80000000-0000-4000-8000-000000000191";
const ORDER = "81000000-0000-4000-8000-000000000191";
const CUSTOMER = "82000000-0000-4000-8000-000000000191";
const PROSPECTIVE_CUSTOMER = "82000000-0000-4000-8000-000000000192";
const RESERVATION_GROUP = "88000000-0000-4000-8000-000000000191";
const SECOND_PRODUCT = "30000000-0000-4000-8000-000000000192";
const SECOND_VARIANT = "40000000-0000-4000-8000-000000000192";
const FULL_DISCOUNT_PRODUCT = "30000000-0000-4000-8000-000000000193";
const FULL_DISCOUNT_VARIANT = "40000000-0000-4000-8000-000000000193";
const GIFT_PRODUCT = "30000000-0000-4000-8000-000000000194";
const GIFT_VARIANT = "40000000-0000-4000-8000-000000000194";
const DIGEST = "a".repeat(64);
const EVALUATOR_AUTHORITY_DIGEST = "2".repeat(64);
const EVALUATOR_FINGERPRINT = "3".repeat(64);
const EVIDENCE = `sha256:${"b".repeat(64)}`;
const CANDIDATES = Object.freeze([Object.freeze({ keyId: "cart-key", digest: DIGEST })]);
const NORMALIZED_CODES = Object.freeze(["KARGO", "YUZDE10"]);
const DELIVERY = Object.freeze({
  contact: Object.freeze({ firstName: "Ada", lastName: "Lovelace", email: "ada@example.test", phone: "+905551112233" }),
  shippingAddress: Object.freeze({ line1: "Cadde 1", city: "İstanbul", country: "TR" as const }),
});

const authority = () => ({
  authorityDigest: DIGEST, storeId: STORE, sourceKind: "cart", sourceId: SOURCE,
  sourceVersion: 1, paymentMethodId: METHOD, methodVersion: 2, profileId: PROFILE,
  profileVersion: 3, providerCode: "paytr_iframe", environment: "test",
  credentialVersion: 4, executionAdapterVersion: 1, executionEvidenceDigest: EVIDENCE,
  orderReference: `sf:${SOURCE}:1`, currency: "TRY", subtotalMinor: 10_000,
  shippingMinor: 0, discountMinor: 0, totalMinor: 10_000, delivery: DELIVERY,
  items: [{ productId: PRODUCT, variantId: VARIANT, slug: "urun", title: "Ürün", variantTitle: "Standart", quantity: 1, unitPriceCents: 10_000, lineTotalCents: 10_000, available: true }],
  presentation: "iframe", requiredCustomerFields: [], customerName: "Ada Lovelace",
  customerEmail: "ada@example.test", customerPhone: "+905551112233", customerAddress: "Cadde 1",
  city: "İstanbul", country: "TR", postalCode: null,
  basket: [{ reference: VARIANT, name: "Ürün", quantity: 1, unitAmountMinor: 10_000, itemType: "PHYSICAL" }],
});
const authorityV2 = () => ({
  ...authority(),
  orderId: ORDER,
  customerId: CUSTOMER,
  evaluatorAuthorityDigest: EVALUATOR_AUTHORITY_DIGEST,
  subtotalMinor: 17_000,
  shippingMinor: 1_000,
  lineDiscountMinor: 3_900,
  shippingDiscountMinor: 400,
  discountMinor: 4_300,
  totalMinor: 13_700,
  promotionStatus: { kind: "evaluated" },
  appliedPromotions: [{
    name: "Sepette indirim", benefitKind: "fixed_amount", normalizedCode: "YUZDE10",
    lineDiscountCents: 3_900, shippingDiscountCents: 400, discountCents: 4_300,
  }],
  gifts: [],
  items: [
    {
      productId: PRODUCT, variantId: VARIANT, slug: "urun", title: "Ürün", variantTitle: "Standart",
      quantity: 1, unitPriceCents: 10_000, lineTotalCents: 10_000, discountCents: 1_500,
      payableCents: 8_500, available: true,
    },
    {
      productId: SECOND_PRODUCT, variantId: SECOND_VARIANT, slug: "ikinci-urun", title: "İkinci ürün",
      variantTitle: "Standart", quantity: 1, unitPriceCents: 5_000, lineTotalCents: 5_000,
      discountCents: 400, payableCents: 4_600, available: true,
    },
    {
      productId: FULL_DISCOUNT_PRODUCT, variantId: FULL_DISCOUNT_VARIANT, slug: "tam-indirim", title: "Tam indirim",
      variantTitle: "Standart", quantity: 1, unitPriceCents: 2_000, lineTotalCents: 2_000,
      discountCents: 2_000, payableCents: 0, available: true,
    },
    {
      productId: GIFT_PRODUCT, variantId: GIFT_VARIANT, slug: "hediye", title: "Hediye",
      variantTitle: "Standart", quantity: 1, unitPriceCents: 0, lineTotalCents: 0,
      discountCents: 0, payableCents: 0, available: true,
    },
  ],
  basket: [
    { reference: VARIANT, name: "Ürün", quantity: 1, unitAmountMinor: 8_500, itemType: "PHYSICAL" },
    { reference: SECOND_VARIANT, name: "İkinci ürün", quantity: 1, unitAmountMinor: 4_600, itemType: "PHYSICAL" },
    { reference: "shipping:standard", name: "Kargo", quantity: 1, unitAmountMinor: 600, itemType: "VIRTUAL" },
  ],
});
const envelope = () => ({ algorithm: "A256GCM" as const, ciphertext: "AQ", iv: "AAAAAAAAAAAAAAAA", keyId: "provider-key", tag: "AAAAAAAAAAAAAAAAAAAAAA", version: 1 as const });
const beginPayload = () => ({
  attemptId: OPERATION, storeId: STORE, paymentMethodId: METHOD, profileId: PROFILE,
  providerCode: "paytr_iframe", environment: "test", executionAdapterVersion: 1,
  executionEvidenceDigest: EVIDENCE, credentialVersion: 4, amountMinor: 10_000, currency: "TRY",
  methodConfig: { environment: "test", locale: "tr", threeDSecure: "provider_managed", installmentMode: "all", maxInstallment: 0 },
  publicConfig: { environment: "test" }, sealedCredentials: envelope(), sessionId: SESSION,
  sessionStatus: "active", sessionVersion: 1,
  paymentSessionKeyId: "current_01", receiptKeyId: "current_01", customerKeyId: "current_01",
  paymentSessionExpiresAt: "2026-08-06T12:15:00.000Z",
  receiptExpiresAt: "2026-08-07T12:00:00.000Z", customerExpiresAt: "2026-09-05T12:00:00.000Z",
});

type Row = Record<string, unknown>;
type Responder = (text: string, values: unknown[]) => Row[] | Promise<Row[]>;
class Client {
  readonly calls: Array<{ text: string; values: unknown[] }> = [];
  readonly releases: unknown[] = [];
  private readonly responder: Responder;
  private readonly realPgResult: boolean;
  constructor(responder: Responder, realPgResult = false) { this.responder = responder; this.realPgResult = realPgResult; }
  async query(text: string, values: unknown[] = []): Promise<QueryResult<Row>> {
    this.calls.push({ text, values });
    const rows = await this.responder(text, values);
    const result: QueryResult<Row> = { rows, rowCount: rows.length, command: "", oid: 0, fields: [] };
    if (this.realPgResult) Object.assign(result, {
      RowCtor: null, _parsers: [], _prebuiltEmptyResultObject: null,
      _types: {}, rowAsArray: false,
    });
    return result;
  }
  release(value?: unknown) { this.releases.push(value); }
}
class Pool implements PostgresPoolLike {
  private cursor = 0;
  private readonly clients: readonly Client[];
  constructor(clients: readonly Client[]) { this.clients = clients; }
  async connect() { const client = this.clients[this.cursor++]; if (!client) throw new Error("pool"); return client; }
}
const options = (pool: Pool, audits: string[] = []) => ({
  pool, role: "celebix_saas_host_resolver" as const,
  timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
  audit: (event: Readonly<{ type: string }>) => { audits.push(event.type); },
});
const repository = (pool: Pool, audits: string[] = []) => new PostgresStorefrontHostedCheckoutRepository(options(pool, audits));
const row = (outcome: string, result: unknown): Row[] => [{ outcome, result_payload: result }];

const authorityInput = () => ({ hostname: HOST, now: NOW, intentKind: "cart" as const, candidates: CANDIDATES, cartVersion: 1, delivery: DELIVERY, paymentMethodId: METHOD });
const authorityV2Input = () => ({
  ...authorityInput(),
  operationId: OPERATION,
  customerCandidates: CANDIDATES,
  normalizedCodes: NORMALIZED_CODES,
  orderId: ORDER,
  prospectiveCustomerId: PROSPECTIVE_CUSTOMER,
});
const beginInput = () => ({
  ...authorityInput(), expectedAuthorityDigest: DIGEST, operationId: OPERATION,
  fingerprint: "c".repeat(64), sessionId: SESSION, callbackBindingDigest: "d".repeat(64),
  orderId: ORDER, customerId: CUSTOMER,
  addressId: "83000000-0000-4000-8000-000000000191", eventId: "84000000-0000-4000-8000-000000000191",
  receiptId: "85000000-0000-4000-8000-000000000191", customerCredentialId: "86000000-0000-4000-8000-000000000191",
  paymentSession: { keyId: "payment-key", digest: "e".repeat(64) },
  receipt: { keyId: "receipt-key", digest: "f".repeat(64) },
  customer: { keyId: "customer-key", digest: "1".repeat(64) },
});
const beginV2Input = () => ({
  ...beginInput(),
  customerCandidates: CANDIDATES,
  normalizedCodes: NORMALIZED_CODES,
  expectedEvaluatorAuthorityDigest: EVALUATOR_AUTHORITY_DIGEST,
});

const promotionReservation = () => ({
  reservationGroupId: RESERVATION_GROUP,
  status: "reserved" as const,
  expiresAt: "2026-08-07T12:00:00.000Z",
  evaluatorFingerprint: EVALUATOR_FINGERPRINT,
});
const grossAuthorityV2 = () => {
  const prepared = authorityV2();
  return {
    ...prepared,
    evaluatorAuthorityDigest: "4".repeat(64),
    lineDiscountMinor: 0,
    shippingDiscountMinor: 0,
    discountMinor: 0,
    totalMinor: 18_000,
    promotionStatus: { kind: "evaluated" },
    appliedPromotions: [],
    gifts: [],
    items: prepared.items.map((item) => ({ ...item, discountCents: 0, payableCents: item.lineTotalCents })),
    basket: [
      { reference: VARIANT, name: "Ürün", quantity: 1, unitAmountMinor: 10_000, itemType: "PHYSICAL" },
      { reference: SECOND_VARIANT, name: "İkinci ürün", quantity: 1, unitAmountMinor: 5_000, itemType: "PHYSICAL" },
      { reference: FULL_DISCOUNT_VARIANT, name: "Tam indirim", quantity: 1, unitAmountMinor: 2_000, itemType: "PHYSICAL" },
      { reference: "shipping:standard", name: "Kargo", quantity: 1, unitAmountMinor: 1_000, itemType: "VIRTUAL" },
    ],
  };
};
type ProvisionalHostedCheckoutBeginV2Result = HostedCheckoutBeginResult & Readonly<{
  authority: ReturnType<typeof authorityV2>;
  promotionReservation: ReturnType<typeof promotionReservation> | null;
}>;

type ProvisionalHostedCheckoutRepositoryV2 = PostgresStorefrontHostedCheckoutRepository & Readonly<{
  authorityV2(input: ReturnType<typeof authorityV2Input>): Promise<ReturnType<typeof authorityV2>>;
  beginV2(input: ReturnType<typeof beginV2Input>): Promise<ProvisionalHostedCheckoutBeginV2Result>;
}>;

function repositoryV2(pool: Pool, audits: string[] = []): ProvisionalHostedCheckoutRepositoryV2 {
  return repository(pool, audits) as ProvisionalHostedCheckoutRepositoryV2;
}

test("authority sends the exact public start signature and returns a deeply frozen provider-neutral projection", async () => {
  const client = new Client((text) => text.includes("public_storefront_hosted_checkout_authority") ? row("found", authority()) : []);
  const result = await repository(new Pool([client])).authority(authorityInput());
  const call = client.calls.find(({ text }) => text.includes("public_storefront_hosted_checkout_authority"));
  assert.match(call?.text ?? "", /\$7::uuid/u);
  assert.deepEqual(call?.values, [HOST, NOW, "cart", JSON.stringify(CANDIDATES), 1, JSON.stringify(DELIVERY), METHOD]);
  assert.equal(result.providerCode, "paytr_iframe");
  assert.equal(Object.isFrozen(result), true); assert.equal(Object.isFrozen(result.items), true); assert.equal(Object.isFrozen(result.items[0]), true);
  assert.equal(client.calls[0]?.text, "BEGIN READ ONLY"); assert.equal(client.calls.at(-1)?.text, "COMMIT");
});

test("authority accepts the real pg Result envelope while keeping the row contract exact", async () => {
  const client = new Client(
    (text) => text.includes("public_storefront_hosted_checkout_authority") ? row("found", authority()) : [],
    true,
  );
  const result = await repository(new Pool([client])).authority(authorityInput());
  assert.equal(result.providerCode, "paytr_iframe");
  assert.equal(client.calls.at(-1)?.text, "COMMIT");
});

test("authorityV2 prepares or replays the canonical customer authority bound to the operation, codes and future order id", async () => {
  const client = new Client((text) => text.includes("public_storefront_hosted_checkout_authority_v2")
    ? row("found", authorityV2())
    : []);
  const selected = repositoryV2(new Pool([client]));
  assert.equal(typeof selected.authorityV2, "function", "authorityV2 must be additive to the V1 repository");

  const result = await selected.authorityV2(authorityV2Input());
  const call = client.calls.find(({ text }) => text.includes("public_storefront_hosted_checkout_authority_v2"));
  assert.match(call?.text ?? "", /\$8::jsonb,\$9::jsonb,\$10::uuid,\$11::uuid,\$12::uuid/u);
  assert.deepEqual(call?.values, [
    HOST,
    NOW,
    "cart",
    JSON.stringify(CANDIDATES),
    1,
    JSON.stringify(DELIVERY),
    METHOD,
    JSON.stringify(CANDIDATES),
    JSON.stringify(NORMALIZED_CODES),
    ORDER,
    PROSPECTIVE_CUSTOMER,
    OPERATION,
  ]);
  assert.equal(result.orderId, ORDER);
  assert.equal(result.customerId, CUSTOMER);
  assert.equal(result.evaluatorAuthorityDigest, EVALUATOR_AUTHORITY_DIGEST);
  assert.equal(result.totalMinor, 13_700);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.items), true);
  assert.equal(Object.isFrozen(result.basket), true);
  assert.equal(Object.isFrozen(result.basket[0]), true);
  assert.equal(client.calls[0]?.text, "BEGIN ISOLATION LEVEL READ COMMITTED");
  assert.equal(client.calls.at(-1)?.text, "COMMIT");
});

test("authorityV2 accepts only canonical unique promotion codes with an upper bound of five", async () => {
  assert.deepEqual(hostedPromotionCodes(["YUZDE10", "KARGO"]), NORMALIZED_CODES);
  assert.deepEqual(hostedPromotionCodes(["KARGO", "YUZDE10"]), NORMALIZED_CODES);
  for (const normalizedCodes of [
    ["YUZDE10", "KARGO", "HEDIYE", "VIP", "SEPET100", "FAZLA"],
    ["yüzde10"],
    ["VIP", "VIP"],
  ]) {
    const client = new Client(() => []);
    const selected = repositoryV2(new Pool([client]));
    assert.equal(typeof selected.authorityV2, "function", "authorityV2 must validate before acquiring a client");
    await assert.rejects(
      selected.authorityV2({ ...authorityV2Input(), normalizedCodes }),
      (error: unknown) => error instanceof StorefrontHostedCheckoutRepositoryError && error.code === "invalid_input",
    );
    assert.equal(client.calls.length, 0);
  }
});

test("authorityV2 rejects a malformed replay operation id before pool checkout", async () => {
  const client = new Client(() => []);
  await assert.rejects(
    repositoryV2(new Pool([client])).authorityV2({ ...authorityV2Input(), operationId: "not-an-operation" }),
    (error: unknown) => error instanceof StorefrontHostedCheckoutRepositoryError && error.code === "invalid_input",
  );
  assert.equal(client.calls.length, 0);
});

test("authorityV2 omits zero-payable and gift lines, allocates one unit per row, and puts net shipping last", async () => {
  const client = new Client((text) => text.includes("public_storefront_hosted_checkout_authority_v2")
    ? row("found", authorityV2())
    : []);
  const selected = repositoryV2(new Pool([client]));
  assert.equal(typeof selected.authorityV2, "function", "authorityV2 must be additive to the V1 repository");

  const result = await selected.authorityV2(authorityV2Input());
  assert.deepEqual(result.basket, [
    { reference: VARIANT, name: "Ürün", quantity: 1, unitAmountMinor: 8_500, itemType: "PHYSICAL" },
    { reference: SECOND_VARIANT, name: "İkinci ürün", quantity: 1, unitAmountMinor: 4_600, itemType: "PHYSICAL" },
    { reference: "shipping:standard", name: "Kargo", quantity: 1, unitAmountMinor: 600, itemType: "VIRTUAL" },
  ]);
  assert.equal(result.items.length, 4);
});

test("hosted V2 parser counts only the twenty evaluator input lines when authority also freezes an auto-added gift", () => {
  const merchandise = Array.from({ length: 20 }, (_, index) => {
    const suffix = String(index + 1).padStart(12, "0");
    return {
      productId: `30000000-0000-4000-8000-${suffix}`,
      variantId: `40000000-0000-4000-8000-${suffix}`,
      slug: `evaluated-line-${index + 1}`,
      title: `Evaluated line ${index + 1}`,
      variantTitle: "Default",
      quantity: 1,
      unitPriceCents: 100,
      lineTotalCents: 100,
      discountCents: 5,
      payableCents: 95,
      available: true,
    };
  });
  const gift = {
    productId: GIFT_PRODUCT,
    variantId: GIFT_VARIANT,
    slug: "frozen-auto-added-gift",
    title: "Frozen auto-added gift",
    variantTitle: "Default",
    quantity: 1,
    unitPriceCents: 0,
    lineTotalCents: 0,
    discountCents: 0,
    payableCents: 0,
    available: true,
  };
  const value = {
    ...authorityV2(),
    subtotalMinor: 2_000,
    shippingMinor: 0,
    lineDiscountMinor: 100,
    shippingDiscountMinor: 0,
    discountMinor: 100,
    totalMinor: 1_900,
    appliedPromotions: [{
      name: "Twenty-line promotion",
      benefitKind: "percentage",
      lineDiscountCents: 100,
      shippingDiscountCents: 0,
      discountCents: 100,
    }],
    gifts: [{ variantId: GIFT_VARIANT, quantity: 1, autoAdd: true }],
    items: [...merchandise, gift],
    basket: merchandise.map((item) => ({
      reference: item.variantId,
      name: item.title,
      quantity: 1,
      unitAmountMinor: item.payableCents,
      itemType: "PHYSICAL",
    })),
  };
  assert.deepEqual(parseHostedAuthorityV2(value).items, value.items);
});

test("hosted V2 parser accepts a trailing auto-added gift row for the same variant as paid merchandise", () => {
  const paid = {
    productId: PRODUCT,
    variantId: VARIANT,
    slug: "same-variant-paid",
    title: "Same variant paid",
    variantTitle: "Default",
    quantity: 3,
    unitPriceCents: 100,
    lineTotalCents: 300,
    discountCents: 0,
    payableCents: 300,
    available: true,
  };
  const gift = {
    ...paid,
    slug: "same-variant-gift",
    title: "Same variant gift",
    quantity: 1,
    unitPriceCents: 0,
    lineTotalCents: 0,
    payableCents: 0,
  };
  const value = {
    ...authorityV2(),
    subtotalMinor: 300,
    shippingMinor: 0,
    lineDiscountMinor: 0,
    shippingDiscountMinor: 0,
    discountMinor: 0,
    totalMinor: 300,
    appliedPromotions: [{
      name: "Same variant gift",
      benefitKind: "gift",
      lineDiscountCents: 0,
      shippingDiscountCents: 0,
      discountCents: 0,
    }],
    gifts: [{ variantId: VARIANT, quantity: 1, autoAdd: true }],
    items: [paid, gift],
    basket: [{
      reference: VARIANT,
      name: paid.title,
      quantity: 1,
      unitAmountMinor: 300,
      itemType: "PHYSICAL",
    }],
  };
  assert.deepEqual(parseHostedAuthorityV2(value).items, value.items);
});

test("hosted V2 parser rejects a maximum-safe-integer gift quantity before expanding chunks", () => {
  const value = {
    ...authorityV2(),
    gifts: [{ variantId: GIFT_VARIANT, quantity: Number.MAX_SAFE_INTEGER, autoAdd: true }],
  };
  const validationUrl = new URL("./validation.ts", import.meta.url).href;
  const source = [
    `import { parseHostedAuthorityV2 } from ${JSON.stringify(validationUrl)};`,
    `const value = ${JSON.stringify(value)};`,
    "try { parseHostedAuthorityV2(value); process.exitCode = 1; }",
    "catch (error) { if (!(error instanceof TypeError) || error.message !== 'invalid_input') throw error; }",
  ].join("\n");
  const probe = spawnSync(process.execPath, [
    "--experimental-strip-types",
    "--input-type=module",
    "--eval",
    source,
  ], { encoding: "utf8", timeout: 1_000 });
  assert.equal(probe.error, undefined, `oversized gift parser did not fail promptly: ${probe.error?.message ?? ""}`);
  assert.equal(probe.status, 0, `${probe.stderr}\n${probe.stdout}`);
});

test("authorityV2 rejects allocated basket drift before prepared authority can leave the repository", async () => {
  const malformed = authorityV2();
  for (const basket of [
    malformed.basket.map((entry, index) => index === 2 ? { ...entry, unitAmountMinor: 599 } : entry),
    malformed.basket.map((entry, index) => index === 0 ? { ...entry, quantity: 2 } : entry),
    malformed.basket.map((entry, index) => index === 0 ? { ...entry, unitAmountMinor: 0 } : entry),
    [malformed.basket[2]!, malformed.basket[0]!, malformed.basket[1]!],
  ]) {
    const client = new Client((text) => text.includes("public_storefront_hosted_checkout_authority_v2")
      ? row("found", { ...malformed, basket })
      : []);
    const selected = repositoryV2(new Pool([client]));
    assert.equal(typeof selected.authorityV2, "function", "authorityV2 must be additive to the V1 repository");
    await assert.rejects(
      selected.authorityV2(authorityV2Input()),
      (error: unknown) => error instanceof StorefrontHostedCheckoutRepositoryError && error.code === "unavailable",
    );
    assert.equal(client.calls.at(-1)?.text, "ROLLBACK");
  }
});

test("authority rejects private or secret DB fields instead of forwarding them", async () => {
  const client = new Client((text) => text.includes("public_storefront_hosted_checkout_authority") ? row("found", { ...authority(), sealedCredentials: envelope() }) : []);
  await assert.rejects(repository(new Pool([client])).authority(authorityInput()), (error: unknown) => error instanceof StorefrontHostedCheckoutRepositoryError && error.code === "unavailable");
  assert.equal(client.calls.at(-1)?.text, "ROLLBACK");
});

test("begin validates every generated identifier and parses the scoped payment-attempt result", async () => {
  const client = new Client((text) => text.includes("public_storefront_hosted_checkout_begin") ? row("created", beginPayload()) : []);
  const result = await repository(new Pool([client])).begin(beginInput());
  const call = client.calls.find(({ text }) => text.includes("public_storefront_hosted_checkout_begin"));
  assert.match(call?.text ?? "", /\$24::text/u); assert.equal(call?.values.length, 24);
  assert.equal(result.attemptId, OPERATION); assert.equal(result.outcome, "created"); assert.equal(Object.isFrozen(result.sealedCredentials), true);
});

test("beginV2 binds normalized codes and the evaluator authority digest to the named V2 write", async () => {
  const payload = {
    ...beginPayload(),
    amountMinor: 13_700,
    authority: authorityV2(),
    promotionReservation: promotionReservation(),
  };
  const client = new Client((text) => text.includes("public_storefront_hosted_checkout_begin_v2")
    ? row("created", payload)
    : []);
  const selected = repositoryV2(new Pool([client]));
  assert.equal(typeof selected.beginV2, "function", "beginV2 must be additive to the V1 repository");

  const result = await selected.beginV2(beginV2Input());
  const call = client.calls.find(({ text }) => text.includes("public_storefront_hosted_checkout_begin_v2"));
  assert.match(call?.text ?? "", /\$25::jsonb,\$26::jsonb,\$27::text/u);
  assert.equal(call?.values.length, 27);
  assert.deepEqual(call?.values.slice(24), [
    JSON.stringify(CANDIDATES),
    JSON.stringify(NORMALIZED_CODES),
    EVALUATOR_AUTHORITY_DIGEST,
  ]);
  assert.equal(result.amountMinor, 13_700);
  assert.equal(result.authority.customerId, CUSTOMER);
  assert.equal(result.authority.evaluatorAuthorityDigest, EVALUATOR_AUTHORITY_DIGEST);
  assert.deepEqual(result.promotionReservation, promotionReservation());
  assert.equal(result.promotionReservation?.expiresAt, payload.receiptExpiresAt);
  assert.equal(Object.isFrozen(result.authority.basket), true);
  assert.equal(Object.isFrozen(result.promotionReservation), true);
  assert.equal(result.outcome, "created");
  assert.equal(client.calls[0]?.text, "BEGIN ISOLATION LEVEL READ COMMITTED");
  assert.equal(client.calls.at(-1)?.text, "COMMIT");
});

test("beginV2 admits an exact null reservation for a gross no-campaign authority", async () => {
  const gross = grossAuthorityV2();
  const payload = {
    ...beginPayload(),
    amountMinor: gross.totalMinor,
    authority: gross,
    promotionReservation: null,
  };
  const client = new Client((text) => text.includes("public_storefront_hosted_checkout_begin_v2")
    ? row("created", payload)
    : []);
  const selected = repositoryV2(new Pool([client]));
  assert.equal(typeof selected.beginV2, "function", "beginV2 must be additive to the V1 repository");
  const result = await selected.beginV2({
    ...beginV2Input(),
    expectedEvaluatorAuthorityDigest: gross.evaluatorAuthorityDigest,
  });
  assert.equal(result.amountMinor, 18_000);
  assert.equal(result.promotionReservation, null);
  assert.equal(result.authority.appliedPromotions.length, 0);
  assert.equal(result.authority.gifts.length, 0);
});

test("beginV2 rejects final authority drift and invalid null or shortened promotion reservations", async () => {
  const giftAuthority = {
    ...grossAuthorityV2(),
    appliedPromotions: [{
      name: "Hediye", benefitKind: "gift", normalizedCode: "KARGO",
      lineDiscountCents: 0, shippingDiscountCents: 0, discountCents: 0,
    }],
    gifts: [{ variantId: GIFT_VARIANT, quantity: 1, autoAdd: true }],
  };
  for (const resultPayload of [
    {
      ...beginPayload(),
      amountMinor: 13_701,
      authority: authorityV2(),
      promotionReservation: promotionReservation(),
    },
    {
      ...beginPayload(),
      amountMinor: 13_700,
      authority: authorityV2(),
      promotionReservation: {
        ...promotionReservation(),
        expiresAt: "2026-08-06T12:15:00.000Z",
      },
    },
    {
      ...beginPayload(),
      amountMinor: 13_700,
      authority: authorityV2(),
      promotionReservation: null,
    },
    {
      ...beginPayload(),
      amountMinor: giftAuthority.totalMinor,
      authority: giftAuthority,
      promotionReservation: null,
    },
    {
      ...beginPayload(),
      amountMinor: 13_700,
      authority: {
        ...authorityV2(),
        evaluatorAuthorityDigest: "9".repeat(64),
      },
      promotionReservation: promotionReservation(),
    },
    {
      ...beginPayload(),
      amountMinor: 13_700,
      authority: {
        ...authorityV2(),
        basket: authorityV2().basket.map((item, index) => index === 2
          ? { ...item, reference: "shipping:forged" }
          : item),
      },
      promotionReservation: promotionReservation(),
    },
    {
      ...beginPayload(),
      amountMinor: 13_700,
      authority: {
        ...authorityV2(),
        basket: authorityV2().basket.map((item, index) => index === 2
          ? { ...item, name: "Private shipping" }
          : item),
      },
      promotionReservation: promotionReservation(),
    },
  ]) {
    const client = new Client((text) => text.includes("public_storefront_hosted_checkout_begin_v2")
      ? row("created", resultPayload)
      : []);
    const selected = repositoryV2(new Pool([client]));
    assert.equal(typeof selected.beginV2, "function", "beginV2 must validate final settlement authority");
    await assert.rejects(
      selected.beginV2(beginV2Input()),
      (error: unknown) => error instanceof StorefrontHostedCheckoutRepositoryError && error.code === "unavailable",
    );
    assert.equal(client.calls.at(-1)?.text, "ROLLBACK");
  }
});

test("begin commit ambiguity destroys the socket and performs exactly one credential-bound status recovery", async () => {
  const audits: string[] = [];
  const first = new Client(async (text) => {
    if (text.includes("public_storefront_hosted_checkout_begin")) return row("created", beginPayload());
    if (text === "COMMIT") throw new Error("socket lost");
    return [];
  });
  const second = new Client((text) => text.includes("public_storefront_hosted_checkout_status")
    ? row("found", { sessionId: SESSION, status: "active", safeCode: "payment_started", version: 1, paymentSessionExpiresAt: "2026-08-06T12:15:00.000Z" }) : []);
  const result = await repository(new Pool([first, second]), audits).begin(beginInput());
  assert.equal(result.attemptId, OPERATION); assert.deepEqual(first.releases, [true]);
  assert.equal(second.calls.filter(({ text }) => text.includes("public_storefront_hosted_checkout_status")).length, 1);
  assert.deepEqual(audits, ["storefront_hosted_checkout_commit_unknown"]);
});

test("presentation save/read preserves only the digest-bound sealed presentation", async () => {
  const sealed = { ...envelope(), keyId: "presentation-key" };
  const saveClient = new Client((text) => text.includes("presentation_save") ? row("updated", { sessionId: SESSION, status: "provider_ready", version: 2, providerCode: "paytr_iframe", presentationExpiresAt: "2026-08-06T12:05:00.000Z" }) : []);
  await repository(new Pool([saveClient])).savePresentation({ hostname: HOST, now: NOW, candidates: [{ keyId: "payment-key", digest: "e".repeat(64) }], operationId: "87000000-0000-4000-8000-000000000191", fingerprint: "2".repeat(64), expectedVersion: 1, presentationKeyId: "presentation-key", presentationDigest: "3".repeat(64), sealedPresentation: sealed, presentationExpiresAt: new Date("2026-08-06T12:05:00.000Z") });
  const readClient = new Client((text) => text.includes("checkout_presentation(") ? row("found", { sessionId: SESSION, status: "provider_ready", version: 2, providerCode: "paytr_iframe", presentationKeyId: "presentation-key", presentationDigest: "3".repeat(64), sealedPresentation: sealed, presentationExpiresAt: "2026-08-06T12:05:00.000Z" }) : []);
  const state = await repository(new Pool([readClient])).presentation({ hostname: HOST, now: NOW, candidates: [{ keyId: "payment-key", digest: "e".repeat(64) }] });
  assert.equal(state.presentationDigest, "3".repeat(64)); assert.equal(Object.isFrozen(state.sealedPresentation), true);
});

test("presentation save accepts the shared sealed-envelope key id contract", async () => {
  const presentationKey = "Quick.Order-Key_V1";
  const sealed = { ...envelope(), keyId: presentationKey };
  const client = new Client((text) => text.includes("presentation_save")
    ? row("updated", { sessionId: SESSION, status: "provider_ready", version: 2, providerCode: "paytr_iframe", presentationExpiresAt: "2026-08-06T12:05:00.000Z" })
    : []);

  await repository(new Pool([client])).savePresentation({
    hostname: HOST, now: NOW, candidates: [{ keyId: "payment-key", digest: "e".repeat(64) }],
    operationId: "87000000-0000-4000-8000-000000000192", fingerprint: "2".repeat(64), expectedVersion: 1,
    presentationKeyId: presentationKey, presentationDigest: "3".repeat(64), sealedPresentation: sealed,
    presentationExpiresAt: new Date("2026-08-06T12:05:00.000Z"),
  });

  const call = client.calls.find(({ text }) => text.includes("presentation_save"));
  assert.equal(call?.values[6], presentationKey);
});

test("begin keeps issued commerce credential key ids on the narrow contract", async () => {
  const client = new Client(() => []);
  await assert.rejects(repository(new Pool([client])).begin({
    ...beginInput(),
    paymentSession: { keyId: "Quick.Order-Key_V1", digest: "e".repeat(64) },
  }), (error: unknown) => error instanceof StorefrontHostedCheckoutRepositoryError && error.code === "invalid_input");
  assert.equal(client.calls.length, 0);
});

test("status returns only the finite public lifecycle", async () => {
  const client = new Client((text) => text.includes("checkout_status") ? row("found", { sessionId: SESSION, status: "processing", safeCode: "provider_processing", version: 3, paymentSessionExpiresAt: "2026-08-06T12:15:00.000Z" }) : []);
  const status = await repository(new Pool([client])).status({ hostname: HOST, now: NOW, candidates: [{ keyId: "payment-key", digest: "e".repeat(64) }] });
  assert.deepEqual(status, { sessionId: SESSION, status: "processing", safeCode: "provider_processing", version: 3, paymentSessionExpiresAt: "2026-08-06T12:15:00.000Z" });
});

test("unknown outcomes map to unavailable and accessors are rejected before acquiring a client", async () => {
  const client = new Client((text) => text.includes("authority") ? row("future_outcome", null) : []);
  await assert.rejects(repository(new Pool([client])).authority(authorityInput()), /unavailable/u);
  const malicious = Object.create(null) as Record<string, unknown>;
  for (const [key, value] of Object.entries(authorityInput())) {
    if (key !== "hostname") Object.defineProperty(malicious, key, { enumerable: true, value });
  }
  Object.defineProperty(malicious, "hostname", { enumerable: true, get: () => HOST });
  await assert.rejects(repository(new Pool([])).authority(malicious as ReturnType<typeof authorityInput>), /invalid_input/u);
});
