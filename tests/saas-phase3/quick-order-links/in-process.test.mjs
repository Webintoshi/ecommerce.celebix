import assert from "node:assert/strict";
import test from "node:test";

import {
  parseQuickOrderLinkDetail,
  parseQuickOrderLinkListItem,
  parseQuickOrderLinkMutationResult,
} from "../../../packages/saas-contracts/src/index.ts";
import {
  PostgresQuickOrderLinkRepository,
  QuickOrderLinkRepositoryError,
} from "../../../packages/saas-data/src/index.ts";

const STORE_ID = "33333333-3333-4333-8333-333333333333";
const PRINCIPAL_ID = "44444444-4444-4444-8444-444444444444";
const MEMBERSHIP_ID = "55555555-5555-4555-8555-555555555555";
const PLAN_ID = "66666666-6666-4666-8666-666666666666";
const LINK_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NEW_LINK_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ITEM_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const NEW_ITEM_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const VARIANT_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const PROVIDER_CONFIG_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const OPERATION_ID = "77777777-7777-4777-8777-777777777777";
const NOW = new Date("2026-07-21T08:00:00.000Z");
const TOKEN_DIGEST = "1".repeat(64);
const PRIVATE_DRIVER = "postgres://private@database/celebix";
const PRIVATE_REQUEST = "private-quick-link-request";
const PRIVATE_SUBJECT = "private-identity-subject";

function tenantContext(overrides = {}) {
  return {
    schemaVersion: 1,
    requestId: PRIVATE_REQUEST,
    principal: { id: PRINCIPAL_ID, issuer: "https://identity.example/oidc", subject: PRIVATE_SUBJECT },
    store: { id: STORE_ID, slug: "atlas-store", status: "active" },
    membership: { id: MEMBERSHIP_ID, role: "store_owner", status: "active" },
    entitlements: {
      schemaVersion: 1,
      planId: PLAN_ID,
      planCode: "merchant_growth",
      version: 3,
      status: "active",
      features: ["catalog", "orders", "checkout"],
      limits: { products: 100, staff: 5, storageBytes: 1_024 },
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: "2027-01-01T00:00:00.000Z",
    },
    locale: "tr-TR",
    ...overrides,
  };
}

function address() {
  return {
    recipientName: "Ada Lovelace",
    phone: "+905551112233",
    line1: "1 Logic Street",
    district: "Kadikoy",
    city: "Istanbul",
    postalCode: "34710",
    country: "TR",
  };
}

function sealedToken() {
  return {
    algorithm: "A256GCM",
    ciphertext: "AQ",
    iv: "AAAAAAAAAAAAAAAA",
    keyId: "quick-link-key-2026",
    tag: "AAAAAAAAAAAAAAAAAAAAAA",
    version: 1,
  };
}

function listItem(overrides = {}) {
  return {
    id: LINK_ID,
    customerName: "Ada Lovelace",
    customerEmail: "ada@example.com",
    firstProductName: "Atlas Mug",
    itemCount: 1,
    status: "active",
    currency: "TRY",
    totalCents: 13_000,
    expiresAt: "2026-07-22T08:00:00.000000Z",
    createdAt: "2026-07-21T08:00:00.000000Z",
    version: 1,
    ...overrides,
  };
}

function detail(overrides = {}) {
  return {
    ...listItem(),
    customerPhone: "+905551112233",
    shippingAddress: address(),
    billingAddress: address(),
    customerNote: "Leave at reception",
    internalLabel: "VIP",
    providerKey: "paytr",
    subtotalCents: 12_500,
    shippingCents: 1_000,
    discountCents: 500,
    items: [{
      id: ITEM_ID,
      position: 0,
      productName: "Atlas Mug",
      variantName: "Black",
      sku: "ATLAS-BLACK",
      unitPriceCents: 12_500,
      quantity: 1,
      lineTotalCents: 12_500,
    }],
    updatedAt: "2026-07-21T08:00:00.000000Z",
    ...overrides,
  };
}

function mutation(overrides = {}) {
  return {
    id: LINK_ID,
    status: "active",
    version: 1,
    expiresAt: "2026-07-22T08:00:00.000000Z",
    updatedAt: "2026-07-21T08:00:00.000000Z",
    ...overrides,
  };
}

function createInput(overrides = {}) {
  return {
    tenantContext: tenantContext(),
    now: NOW,
    operationId: OPERATION_ID,
    linkId: LINK_ID,
    items: [{ itemId: ITEM_ID, variantId: VARIANT_ID, quantity: 1 }],
    providerConfigId: PROVIDER_CONFIG_ID,
    customerName: "Ada Lovelace",
    customerEmail: "ada@example.com",
    customerPhone: "+905551112233",
    shippingAddress: address(),
    billingAddress: address(),
    customerNote: "Leave at reception",
    internalLabel: "VIP",
    shippingCents: 1_000,
    discountCents: 500,
    expiryHours: 24,
    tokenDigest: TOKEN_DIGEST,
    sealedToken: sealedToken(),
    ...overrides,
  };
}

function duplicateInput(overrides = {}) {
  return {
    tenantContext: tenantContext(),
    now: NOW,
    linkId: LINK_ID,
    operationId: OPERATION_ID,
    newLinkId: NEW_LINK_ID,
    newItemIds: [NEW_ITEM_ID],
    tokenDigest: TOKEN_DIGEST,
    sealedToken: sealedToken(),
    ...overrides,
  };
}

class FakeClient {
  calls = [];
  releases = [];

  constructor(responder = () => []) {
    this.responder = responder;
  }

  async query(text, values = []) {
    this.calls.push({ text, values });
    const response = await this.responder(text, values);
    const rows = Array.isArray(response) ? response : response.rows;
    const rowCount = Array.isArray(response) ? rows.length : (response.rowCount ?? rows.length);
    return { rows, rowCount, command: "", oid: 0, fields: [] };
  }

  release(destroy) {
    this.releases.push(destroy);
  }
}

class FakePool {
  connects = 0;

  constructor(...clients) {
    this.clients = clients;
  }

  async connect() {
    const selected = this.clients[this.connects];
    this.connects += 1;
    if (selected instanceof Error) throw selected;
    if (!selected) throw new Error(`${PRIVATE_DRIVER} unexpected checkout`);
    return selected;
  }
}

function fakeResult(functionName, outcome, resultPayload, options = {}) {
  return new FakeClient((text) => {
    if (text === "COMMIT" && options.commitFailure) throw new Error(`${PRIVATE_DRIVER} commit failed`);
    return text.includes(`saas.${functionName}`)
      ? [{ outcome, result_payload: resultPayload }]
      : [];
  });
}

function repository(...clients) {
  return new PostgresQuickOrderLinkRepository({
    pool: new FakePool(...clients),
    role: "celebix_saas_app",
    timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
    audit: () => undefined,
  });
}

function functionCall(client, name) {
  const call = client.calls.find(({ text }) => text.includes(`saas.${name}`));
  assert.ok(call, `missing ${name} call`);
  return call;
}

function assertSafeResult(value) {
  const serialized = JSON.stringify(value);
  for (const privateValue of [TOKEN_DIGEST, sealedToken().ciphertext, PRIVATE_REQUEST, PRIVATE_SUBJECT]) {
    assert.equal(serialized.includes(privateValue), false);
  }
  assert.doesNotMatch(serialized, /tokenDigest|sealedToken|tokenKeyId|providerConfigId|storeId|principalId|membershipId|planId|requestId/);
}

function quickLinkError(code) {
  return (error) => {
    assert.equal(error instanceof QuickOrderLinkRepositoryError, true);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    assert.deepEqual(Object.keys(error), ["code"]);
    assert.equal(Object.isFrozen(error), true);
    assert.doesNotMatch(String(error), /postgres|database|private|digest/i);
    return true;
  };
}

test("list and get traverse the public contract parsers through real repository reads", async () => {
  const listClient = fakeResult("quick_links_list", "listed", { items: [listItem()] });
  const getClient = fakeResult("quick_links_get", "found", detail());
  const quickLinks = repository(listClient, getClient);

  const listed = await quickLinks.list({ tenantContext: tenantContext(), now: NOW, pageSize: 25, status: "active" });
  assert.deepEqual(listed, { items: [parseQuickOrderLinkListItem(listItem())] });
  assert.equal(Object.isFrozen(listed), true);
  assert.equal(Object.isFrozen(listed.items), true);
  assertSafeResult(listed);

  const found = await quickLinks.get({ tenantContext: tenantContext(), now: NOW, linkId: LINK_ID });
  assert.deepEqual(found, parseQuickOrderLinkDetail(detail()));
  assert.equal(Object.isFrozen(found), true);
  assert.equal(Object.isFrozen(found.items), true);
  assertSafeResult(found);

  assert.match(functionCall(listClient, "quick_links_list").text, /\$11::uuid/);
  assert.match(functionCall(getClient, "quick_links_get").text, /\$8::uuid/);
  for (const client of [listClient, getClient]) {
    const bound = JSON.stringify(client.calls.flatMap(({ values }) => values));
    assert.equal(bound.includes(PRIVATE_REQUEST), false);
    assert.equal(bound.includes(PRIVATE_SUBJECT), false);
  }
});

test("create cancel and duplicate traverse exact repository mutations into public contract results", async () => {
  const createClient = fakeResult("quick_links_create", "committed", mutation());
  const cancelClient = fakeResult("quick_links_cancel", "committed", mutation({ status: "cancelled", version: 2 }));
  const duplicateClient = fakeResult("quick_links_duplicate", "committed", mutation({ id: NEW_LINK_ID }));
  const quickLinks = repository(createClient, cancelClient, duplicateClient);

  const created = await quickLinks.create(createInput());
  const cancelled = await quickLinks.cancel({
    tenantContext: tenantContext(), now: NOW, linkId: LINK_ID, operationId: OPERATION_ID, expectedVersion: 1,
  });
  const duplicated = await quickLinks.duplicate(duplicateInput());

  assert.deepEqual(created, parseQuickOrderLinkMutationResult({ ...mutation(), replayed: false }));
  assert.deepEqual(cancelled, parseQuickOrderLinkMutationResult({
    ...mutation({ status: "cancelled", version: 2 }), replayed: false,
  }));
  assert.deepEqual(duplicated, parseQuickOrderLinkMutationResult({
    ...mutation({ id: NEW_LINK_ID }), replayed: false,
  }));
  for (const result of [created, cancelled, duplicated]) {
    assert.equal(Object.isFrozen(result), true);
    assert.deepEqual(Object.keys(result).sort(), ["expiresAt", "id", "replayed", "status", "updatedAt", "version"]);
    assertSafeResult(result);
  }

  assert.match(functionCall(createClient, "quick_links_create").text, /\$27::text/);
  assert.match(functionCall(cancelClient, "quick_links_cancel").text, /\$11::text/);
  assert.match(functionCall(duplicateClient, "quick_links_duplicate").text, /\$15::text/);
});

test("operation replay and one-shot read-only recovery preserve the same safe public mutation", async () => {
  const replayClient = fakeResult("quick_links_create", "operation_replayed", mutation());
  const replayed = await repository(replayClient).create(createInput());
  assert.deepEqual(replayed, parseQuickOrderLinkMutationResult({ ...mutation(), replayed: true }));
  assertSafeResult(replayed);

  const writer = fakeResult("quick_links_create", "committed", mutation(), { commitFailure: true });
  const recovery = fakeResult("quick_links_recover_operation", "operation_replayed", mutation());
  const recovered = await repository(writer, recovery).create(createInput());
  assert.deepEqual(recovered, replayed);
  assert.equal(writer.releases.includes(true), true);
  assert.equal(writer.calls.some(({ text }) => text === "ROLLBACK"), false);
  assert.equal(recovery.calls[0].text, "BEGIN READ ONLY");
  assert.equal(recovery.calls.filter(({ text }) => text.includes("quick_links_recover_operation")).length, 1);
  assert.equal(writer.calls.filter(({ text }) => text.includes("quick_links_create")).length, 1);
  assert.equal(functionCall(recovery, "quick_links_recover_operation").values[8], "create");
  assertSafeResult(recovered);
});

test("controlled and hostile failures expose only stable finite repository outcomes", async () => {
  const cases = [
    ["get", "quick_links_get", "quick_link_not_found", () => ({ tenantContext: tenantContext(), now: NOW, linkId: LINK_ID })],
    ["create", "quick_links_create", "provider_not_ready", () => createInput()],
    ["cancel", "quick_links_cancel", "version_conflict", () => ({
      tenantContext: tenantContext(), now: NOW, linkId: LINK_ID, operationId: OPERATION_ID, expectedVersion: 1,
    })],
    ["duplicate", "quick_links_duplicate", "operation_mismatch", () => duplicateInput()],
  ];
  for (const [method, functionName, code, input] of cases) {
    const client = fakeResult(functionName, code, null);
    await assert.rejects(repository(client)[method](input()), quickLinkError(code));
    assert.equal(client.calls.some(({ text }) => text === "ROLLBACK"), true);
  }

  const malformed = fakeResult("quick_links_list", "listed", {
    items: [{ ...listItem(), tokenDigest: TOKEN_DIGEST }],
  });
  await assert.rejects(repository(malformed).list({
    tenantContext: tenantContext(), now: NOW, pageSize: 25,
  }), quickLinkError("unavailable"));

  const driver = new FakeClient((text) => {
    if (text.includes("quick_links_get")) throw new Error(`${PRIVATE_DRIVER} ${TOKEN_DIGEST}`);
    return [];
  });
  await assert.rejects(repository(driver).get({
    tenantContext: tenantContext(), now: NOW, linkId: LINK_ID,
  }), quickLinkError("unavailable"));

  const noCheckout = new FakePool();
  const invalidAuthority = new PostgresQuickOrderLinkRepository({
    pool: noCheckout,
    role: "celebix_saas_app",
    timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
    audit: () => undefined,
  });
  await assert.rejects(invalidAuthority.list({
    tenantContext: tenantContext({ membership: { id: MEMBERSHIP_ID, role: "store_owner", status: "disabled" } }),
    now: NOW,
    pageSize: 25,
  }), quickLinkError("membership_denied"));
  assert.equal(noCheckout.connects, 0);
});

test("failed recovery remains commit_unknown without a rollback or second write", async () => {
  const writer = fakeResult("quick_links_duplicate", "committed", mutation({ id: NEW_LINK_ID }), { commitFailure: true });
  const recovery = fakeResult("quick_links_recover_operation", "operation_replayed", mutation({ id: LINK_ID }));
  await assert.rejects(repository(writer, recovery).duplicate(duplicateInput()), quickLinkError("commit_unknown"));
  assert.equal(writer.calls.filter(({ text }) => text.includes("quick_links_duplicate")).length, 1);
  assert.equal(writer.calls.some(({ text }) => text === "ROLLBACK"), false);
  assert.equal(recovery.calls.filter(({ text }) => text.includes("quick_links_recover_operation")).length, 1);
  assert.equal(recovery.calls.some(({ text }) => text === "ROLLBACK"), false);
  assert.equal(writer.releases.includes(true), true);
  assert.equal(recovery.releases.includes(true), true);
});
