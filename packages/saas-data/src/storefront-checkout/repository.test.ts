import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  isTrustedPublicCheckoutError,
  PUBLIC_CHECKOUT_ERROR_CODES,
  PublicCheckoutRepositoryError,
  trustedPublicCheckoutError,
} from "./errors.ts";
import { PostgresPublicCheckoutRepository } from "./repository.ts";
import type {
  BeginHostedCheckoutInput,
  PostgresPublicCheckoutRepositoryOptions,
  SubmitBuiltInCheckoutInput,
  UpdateCheckoutDeliveryInput,
} from "./types.ts";

const NOW = new Date("2026-07-28T15:00:00.000Z");
const DIGEST = "a".repeat(64);
const CART_ID = "11111111-1111-4111-8111-111111111111";
const ITEM_ID = "22222222-2222-4222-8222-222222222222";
const PAYMENT_ID = "44444444-4444-4444-8444-444444444444";
const OPERATION_ID = "55555555-5555-4555-8555-555555555555";
const ATTEMPT_ID = "66666666-6666-4666-8666-666666666666";
const ORDER_ID = "77777777-7777-4777-8777-777777777777";
const ORDER_ITEM_ID = "88888888-8888-4888-8888-888888888888";
const ORDER_EVENT_ID = "99999999-9999-4999-8999-999999999999";
const NONCE = "A".repeat(43);
const PRIVATE_DRIVER = "postgres://admin:secret@private.invalid/customer@example.com";

type Call = Readonly<{ text: string; values: unknown[] }>;

class FakeClient {
  readonly calls: Call[] = [];
  readonly releases: unknown[] = [];
  private readonly handler: (text: string, values: unknown[]) => unknown[];

  constructor(handler: (text: string, values: unknown[]) => unknown[] = () => []) {
    this.handler = handler;
  }

  async query(text: string, values: unknown[] = []) {
    this.calls.push({ text, values });
    const rows = this.handler(text, values);
    return { command: "", fields: [], oid: 0, rowCount: rows.length, rows };
  }

  release(destroy?: boolean | Error) {
    this.releases.push(destroy);
  }
}

class FakePool {
  connects = 0;
  private readonly clients: readonly (FakeClient | Error)[];

  constructor(clients: readonly (FakeClient | Error)[] = []) {
    this.clients = clients;
  }

  async connect() {
    const selected = this.clients[this.connects++];
    if (selected instanceof Error) throw selected;
    if (selected === undefined) throw new Error(PRIVATE_DRIVER);
    return selected;
  }
}

function selected(outcome: string, resultPayload: unknown) {
  return { outcome, result_payload: resultPayload };
}

function quotePayload() {
  return {
    schemaVersion: 1,
    cartId: CART_ID,
    cartVersion: 2,
    storeName: "Celebix",
    currency: "TRY",
    locale: "tr",
    items: [{
      id: ITEM_ID,
      title: "Ürün",
      variantLabel: null,
      quantity: 1,
      unitPriceCents: 10_000,
      lineTotalCents: 10_000,
      imagePath: null,
    }],
    shippingOptions: [{
      id: "standard",
      label: "Standart teslimat",
      description: null,
      priceCents: 2_900,
    }],
    selectedShippingId: "standard",
    paymentMethods: [{
      id: PAYMENT_ID,
      kind: "cash_on_delivery",
      label: "Kapıda ödeme",
      instructions: "Teslimatta ödeyin",
    }],
    policyLinks: [{
      policyType: "distance_sales",
      label: "Mesafeli satış",
      href: "/politikalar/distance_sales",
    }],
    subtotalCents: 10_000,
    shippingCents: 2_900,
    discountCents: 0,
    totalCents: 12_900,
    discountCode: null,
  };
}

function address() {
  return {
    firstName: "Ayşe",
    lastName: "Yılmaz",
    line1: "Atatürk Caddesi 1",
    district: "Kadıköy",
    city: "İstanbul",
    countryCode: "TR" as const,
    phone: "+905551112233",
  };
}

function deliveryInput(): UpdateCheckoutDeliveryInput {
  return {
    hostname: "shop.celebix.site",
    credentialDigest: DIGEST,
    now: NOW,
    delivery: {
      cartVersion: 1,
      checkoutNonce: NONCE,
      operationId: OPERATION_ID,
      email: "ayse@example.com",
      marketingOptIn: false,
      shippingAddress: address(),
      billingAddress: null,
      shippingId: "standard",
      discountCode: null,
    },
  };
}

function submissionInput(): SubmitBuiltInCheckoutInput {
  return {
    hostname: "shop.celebix.site",
    credentialDigest: DIGEST,
    now: NOW,
    submission: {
      cartVersion: 1,
      checkoutNonce: NONCE,
      operationId: OPERATION_ID,
      paymentMethodId: PAYMENT_ID,
      consents: { distanceSales: true, preInformation: true },
    },
  };
}

function hostedInput(): BeginHostedCheckoutInput {
  return {
    ...submissionInput(),
    attemptId: ATTEMPT_ID,
    callbackBindingDigest: "b".repeat(64),
    orderId: ORDER_ID,
    orderItemIds: [ORDER_ITEM_ID],
    orderEventId: ORDER_EVENT_ID,
    orderNumber: "SF-2026-000001",
  };
}

function hostedAuthorityPayload() {
  return {
    storeId: CART_ID,
    paymentMethodId: PAYMENT_ID,
    profileId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    providerCode: "iyzico_iframe",
    orderReference: `sf:${CART_ID}`,
    amountMinor: 12_900,
    currency: "TRY",
    customer: {
      name: "Ayşe Yılmaz",
      email: "ayse@example.com",
      phone: "+905551112233",
      shippingAddress: address(),
      billingAddress: null,
    },
    basket: [{
      reference: ITEM_ID,
      name: "Ürün",
      quantity: 1,
      unitAmountMinor: 10_000,
      itemType: "PHYSICAL",
    }],
    attemptId: ATTEMPT_ID,
    bridgeId: ATTEMPT_ID,
    environment: "test",
    reservationStatus: "held",
  };
}

function repository(pool: FakePool, audits: unknown[] = []) {
  return new PostgresPublicCheckoutRepository({
    pool,
    role: "celebix_saas_workflow",
    timeouts: {
      poolCheckoutMs: 100,
      statementMs: 500,
      lockMs: 300,
      idleTransactionMs: 700,
    },
    audit: (event) => { audits.push(event); },
  } as PostgresPublicCheckoutRepositoryOptions);
}

function errorCode(code: string) {
  return (error: unknown) => {
    assert.ok(error instanceof PublicCheckoutRepositoryError);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    assert.equal(Object.isFrozen(error), true);
    assert.equal(String(error).includes(PRIVATE_DRIVER), false);
    return true;
  };
}

function selfThrowingPrototypeProxy(): object {
  let hostile: object;
  hostile = new Proxy({}, {
    getPrototypeOf() { throw hostile; },
  });
  return hostile;
}

test("issueNonce binds exact host, digest, nonce digest and timestamp", async () => {
  const client = new FakeClient((text) => (
    text.includes("saas.storefront_checkout_issue_nonce")
      ? [selected("issued", quotePayload())]
      : []
  ));
  const result = await repository(new FakePool([client])).issueNonce({
    hostname: "shop.celebix.site",
    credentialDigest: DIGEST,
    now: NOW,
  });
  const query = client.calls.find((call) => /saas\.storefront_checkout_issue_nonce/.test(call.text));
  assert.deepEqual(query?.values.slice(0, 2), ["shop.celebix.site", DIGEST]);
  assert.match(String(query?.values[2]), /^[a-f0-9]{64}$/);
  assert.deepEqual(query?.values[3], NOW);
  assert.match(result.checkoutNonce, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(createHash("sha256").update(result.checkoutNonce).digest("hex"), query?.values[2]);
  assert.equal(JSON.stringify(client.calls).includes(result.checkoutNonce), false);
});

test("updateDelivery binds exact migration 064 signature and rotates the nonce", async () => {
  const client = new FakeClient((text) => (
    text.includes("saas.storefront_checkout_update_delivery")
      ? [selected("updated", quotePayload())]
      : []
  ));
  const result = await repository(new FakePool([client])).updateDelivery(deliveryInput());
  const query = client.calls.find((call) => textIncludes(call, "saas.storefront_checkout_update_delivery"));
  assert.equal(query?.values.length, 14);
  assert.deepEqual(query?.values.slice(0, 5), [
    "shop.celebix.site",
    DIGEST,
    1,
    OPERATION_ID,
    query?.values[4],
  ]);
  assert.match(String(query?.values[4]), /^[a-f0-9]{64}$/);
  assert.equal(query?.values[5], createHash("sha256").update(NONCE).digest("hex"));
  assert.match(String(query?.values[6]), /^[a-f0-9]{64}$/);
  assert.equal(query?.values[7], "ayse@example.com");
  assert.equal(query?.values[8], false);
  assert.equal(query?.values[11], "standard");
  assert.equal(query?.values[12], null);
  assert.deepEqual(query?.values[13], NOW);
  assert.match(result.checkoutNonce, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(createHash("sha256").update(result.checkoutNonce).digest("hex"), query?.values[6]);
  assert.notEqual(result.checkoutNonce, NONCE);
  assert.equal(JSON.stringify(client.calls).includes(result.checkoutNonce), false);
});

function textIncludes(call: Call, text: string): boolean {
  return call.text.includes(text);
}

test("read methods use exact read-only boundaries and Task 1 parsers", async () => {
  const status = new FakeClient((text) => (
    text.includes("saas.storefront_checkout_get_status")
      ? [selected("found", { kind: "ready" })]
      : []
  ));
  assert.deepEqual(await repository(new FakePool([status])).getStatus({
    hostname: "shop.celebix.site",
    credentialDigest: DIGEST,
    now: NOW,
  }), { kind: "ready" });
  assert.equal(status.calls[0]?.text, "BEGIN READ ONLY");
  assert.equal(status.calls.at(-1)?.text, "COMMIT");

  const policy = new FakeClient((text) => (
    text.includes("saas.storefront_checkout_get_policy")
      ? [selected("found", {
        policyType: "privacy",
        label: "Gizlilik",
        body: "Gizlilik metni",
        effectiveAt: "2026-07-28T14:00:00.000Z",
      })]
      : []
  ));
  const result = await repository(new FakePool([policy])).getPolicy({
    hostname: "shop.celebix.site",
    policyType: "privacy",
    now: NOW,
  });
  assert.equal(result.policyType, "privacy");
  assert.equal(policy.calls[0]?.text, "BEGIN READ ONLY");
});

test("commit unknown performs one fresh read-only recovery and never repeats delivery", async () => {
  const writer = new FakeClient((text) => {
    if (text.includes("saas.storefront_checkout_update_delivery")) {
      return [selected("updated", quotePayload())];
    }
    if (text === "COMMIT") throw new Error(PRIVATE_DRIVER);
    return [];
  });
  const recovery = new FakeClient((text) => (
    text.includes("saas.storefront_checkout_recover_operation")
      ? [selected("not_found", null)]
      : []
  ));
  const pool = new FakePool([writer, recovery]);
  const audits: unknown[] = [];
  await assert.rejects(repository(pool, audits).updateDelivery(deliveryInput()), errorCode("commit_unknown"));
  assert.equal(pool.connects, 2);
  assert.equal(writer.calls.filter((call) => textIncludes(call, "storefront_checkout_update_delivery")).length, 1);
  assert.deepEqual(writer.releases, [true]);
  assert.equal(recovery.calls[0]?.text, "BEGIN READ ONLY");
  assert.equal(recovery.calls.some((call) => textIncludes(call, "storefront_checkout_update_delivery")), false);
  assert.deepEqual(audits, [{ type: "storefront_checkout_commit_unknown" }]);
});

test("a recovered delivery returns only the matching next nonce", async () => {
  const writer = new FakeClient((text) => {
    if (text.includes("saas.storefront_checkout_update_delivery")) {
      return [selected("updated", quotePayload())];
    }
    if (text === "COMMIT") throw new Error(PRIVATE_DRIVER);
    return [];
  });
  const recovery = new FakeClient((text) => (
    text.includes("saas.storefront_checkout_recover_operation")
      ? [selected("operation_replayed", quotePayload())]
      : []
  ));
  const result = await repository(new FakePool([writer, recovery])).updateDelivery(deliveryInput());
  const write = writer.calls.find((call) => textIncludes(call, "storefront_checkout_update_delivery"));
  assert.equal(createHash("sha256").update(result.checkoutNonce).digest("hex"), write?.values[6]);
  const recovered = recovery.calls.find((call) => textIncludes(call, "storefront_checkout_recover_operation"));
  assert.deepEqual(recovered?.values.slice(0, 4), [
    "shop.celebix.site",
    DIGEST,
    OPERATION_ID,
    write?.values[4],
  ]);
});

test("commit recovery rejects a valid quote different from the pre-COMMIT observation", async () => {
  const writer = new FakeClient((text) => {
    if (text.includes("saas.storefront_checkout_update_delivery")) {
      return [selected("updated", quotePayload())];
    }
    if (text === "COMMIT") throw new Error(PRIVATE_DRIVER);
    return [];
  });
  const recovery = new FakeClient((text) => (
    text.includes("saas.storefront_checkout_recover_operation")
      ? [selected("operation_replayed", { ...quotePayload(), cartVersion: 3 })]
      : []
  ));
  await assert.rejects(
    repository(new FakePool([writer, recovery])).updateDelivery(deliveryInput()),
    errorCode("commit_unknown"),
  );
});

test("issueNonce commit unknown performs one read-only quote recovery but cannot claim success", async () => {
  const writer = new FakeClient((text) => {
    if (text.includes("saas.storefront_checkout_issue_nonce")) {
      return [selected("issued", quotePayload())];
    }
    if (text === "COMMIT") throw new Error(PRIVATE_DRIVER);
    return [];
  });
  const recovery = new FakeClient((text) => (
    text.includes("saas.storefront_checkout_get_quote")
      ? [selected("found", quotePayload())]
      : []
  ));
  const pool = new FakePool([writer, recovery]);
  await assert.rejects(repository(pool).issueNonce({
    hostname: "shop.celebix.site",
    credentialDigest: DIGEST,
    now: NOW,
  }), errorCode("commit_unknown"));
  assert.equal(pool.connects, 2);
  assert.deepEqual(writer.releases, [true]);
  assert.equal(writer.calls.filter((call) => textIncludes(call, "storefront_checkout_issue_nonce")).length, 1);
  assert.equal(recovery.calls[0]?.text, "BEGIN READ ONLY");
  assert.equal(recovery.calls.filter((call) => textIncludes(call, "storefront_checkout_get_quote")).length, 1);
  assert.equal(recovery.calls.some((call) => textIncludes(call, "storefront_checkout_issue_nonce")), false);
});

test("recover binds only the exact migration 064 read authority", async () => {
  const client = new FakeClient((text) => (
    text.includes("saas.storefront_checkout_recover_operation")
      ? [selected("operation_replayed", quotePayload())]
      : []
  ));
  const result = await repository(new FakePool([client])).recover({
    hostname: "shop.celebix.site",
    credentialDigest: DIGEST,
    operationId: OPERATION_ID,
    fingerprint: "b".repeat(64),
    checkoutNonce: NONCE,
    now: NOW,
  });
  assert.equal("checkoutNonce" in result && result.checkoutNonce, NONCE);
  const query = client.calls.find((call) => textIncludes(call, "storefront_checkout_recover_operation"));
  assert.deepEqual(query?.values, [
    "shop.celebix.site",
    DIGEST,
    OPERATION_ID,
    "b".repeat(64),
    NOW,
  ]);
  assert.equal(client.calls[0]?.text, "BEGIN READ ONLY");
});

test("submitBuiltIn binds the exact migration 064 signature and parses placed replay-safe output", async () => {
  const client = new FakeClient((text) => (
    text.includes("saas.storefront_checkout_submit_builtin")
      ? [selected("placed", {
        kind: "placed",
        orderNumber: "SF-2026-000001",
        statusPath: "/checkout/status",
      })]
      : []
  ));
  const result = await repository(new FakePool([client])).submitBuiltIn(submissionInput());
  assert.deepEqual(result, {
    kind: "placed",
    orderNumber: "SF-2026-000001",
    statusPath: "/checkout/status",
  });
  const query = client.calls.find((call) => textIncludes(call, "storefront_checkout_submit_builtin"));
  assert.equal(query?.values.length, 8);
  assert.deepEqual(query?.values.slice(0, 4), [
    "shop.celebix.site", DIGEST, 1, OPERATION_ID,
  ]);
  assert.match(String(query?.values[4]), /^[a-f0-9]{64}$/);
  assert.equal(query?.values[5], createHash("sha256").update(NONCE).digest("hex"));
  assert.equal(query?.values[6], PAYMENT_ID);
  assert.deepEqual(query?.values[7], NOW);
  assert.equal(client.calls[0]?.text, "BEGIN ISOLATION LEVEL READ COMMITTED");
  assert.equal(client.calls.at(-1)?.text, "COMMIT");
});

test("beginHosted binds exact generated identities and returns credential-free private authority", async () => {
  const client = new FakeClient((text) => (
    text.includes("saas.storefront_checkout_begin_hosted")
      ? [selected("created", hostedAuthorityPayload())]
      : []
  ));
  const result = await repository(new FakePool([client])).beginHosted(hostedInput());
  const query = client.calls.find((call) => textIncludes(call, "storefront_checkout_begin_hosted"));
  assert.equal(query?.values.length, 14);
  assert.deepEqual(query?.values.slice(0, 4), [
    "shop.celebix.site", DIGEST, 1, OPERATION_ID,
  ]);
  assert.match(String(query?.values[4]), /^[a-f0-9]{64}$/);
  assert.equal(query?.values[5], createHash("sha256").update(NONCE).digest("hex"));
  assert.deepEqual(query?.values.slice(6), [
    PAYMENT_ID,
    ATTEMPT_ID,
    "b".repeat(64),
    ORDER_ID,
    [ORDER_ITEM_ID],
    ORDER_EVENT_ID,
    "SF-2026-000001",
    NOW,
  ]);
  assert.equal(result.reservationStatus, "held");
  assert.equal(result.attemptId, ATTEMPT_ID);
  assert.equal(JSON.stringify(result).includes("credential"), false);
  assert.equal(JSON.stringify(result).includes("sealed"), false);
});

test("built-in unknown COMMIT performs one read-only recovery without repeating the write", async () => {
  const payload = { kind: "placed", orderNumber: "SF-2026-000001", statusPath: "/checkout/status" };
  const writer = new FakeClient((text) => {
    if (text.includes("saas.storefront_checkout_submit_builtin")) return [selected("placed", payload)];
    if (text === "COMMIT") throw new Error(PRIVATE_DRIVER);
    return [];
  });
  const recovery = new FakeClient((text) => (
    text.includes("saas.storefront_checkout_recover_operation")
      ? [selected("operation_replayed", payload)]
      : []
  ));
  const pool = new FakePool([writer, recovery]);
  assert.deepEqual(await repository(pool).submitBuiltIn(submissionInput()), payload);
  assert.equal(pool.connects, 2);
  assert.equal(writer.calls.filter((call) => textIncludes(call, "storefront_checkout_submit_builtin")).length, 1);
  assert.equal(recovery.calls[0]?.text, "BEGIN READ ONLY");
  assert.equal(recovery.calls.some((call) => textIncludes(call, "storefront_checkout_submit_builtin")), false);
});

test("hosted unknown COMMIT recovers the exact private authority without repeating begin", async () => {
  const writer = new FakeClient((text) => {
    if (text.includes("saas.storefront_checkout_begin_hosted")) {
      return [selected("created", hostedAuthorityPayload())];
    }
    if (text === "COMMIT") throw new Error(PRIVATE_DRIVER);
    return [];
  });
  const recovery = new FakeClient((text) => (
    text.includes("saas.storefront_checkout_recover_operation")
      ? [selected("operation_replayed", hostedAuthorityPayload())]
      : []
  ));
  const pool = new FakePool([writer, recovery]);
  assert.deepEqual(await repository(pool).beginHosted(hostedInput()), hostedAuthorityPayload());
  assert.equal(pool.connects, 2);
  assert.equal(writer.calls.filter((call) => textIncludes(call, "storefront_checkout_begin_hosted")).length, 1);
  assert.equal(recovery.calls[0]?.text, "BEGIN READ ONLY");
  assert.equal(recovery.calls.some((call) => textIncludes(call, "storefront_checkout_begin_hosted")), false);
});

test("hosted identity metadata is exact and rejected before pool checkout", async () => {
  for (const input of [
    { ...hostedInput(), callbackBindingDigest: PRIVATE_DRIVER },
    { ...hostedInput(), orderItemIds: [] },
    { ...hostedInput(), orderItemIds: [ORDER_ITEM_ID, ORDER_ITEM_ID] },
    { ...hostedInput(), orderNumber: `SF-${PRIVATE_DRIVER}` },
  ]) {
    const pool = new FakePool([]);
    await assert.rejects(repository(pool).beginHosted(input), errorCode("invalid_input"));
    assert.equal(pool.connects, 0);
  }
});

test("descriptor-hostile and browser-authority inputs fail before pool checkout", async () => {
  const pool = new FakePool([]);
  const repo = repository(pool);
  const hostile = new Proxy(deliveryInput(), {
    ownKeys() { throw new Error(PRIVATE_DRIVER); },
  });
  await assert.rejects(repo.updateDelivery(hostile), errorCode("invalid_input"));
  await assert.rejects(repo.issueNonce({
    hostname: "shop.celebix.site",
    credentialDigest: DIGEST,
    now: NOW,
    storeId: CART_ID,
  } as never), errorCode("invalid_input"));
  await assert.rejects(repo.updateDelivery({
    ...deliveryInput(),
    delivery: { ...deliveryInput().delivery, totalCents: 1 },
  } as never), errorCode("invalid_input"));
  assert.equal(pool.connects, 0);
});

test("decorated dates and Date subclasses fail exact validation before checkout", async () => {
  class HostileDate extends Date {}
  const decorated = new Date(NOW);
  Object.defineProperty(decorated, "credentialDigest", {
    enumerable: true,
    value: PRIVATE_DRIVER,
  });
  for (const now of [new HostileDate(NOW), decorated]) {
    const pool = new FakePool([]);
    await assert.rejects(repository(pool).getStatus({
      hostname: "shop.celebix.site",
      credentialDigest: DIGEST,
      now,
    }), errorCode("invalid_input"));
    assert.equal(pool.connects, 0);
  }
});

test("corrupt rows and driver failures expose only sealed finite errors", async () => {
  const corrupt = new FakeClient((text) => (
    text.includes("saas.storefront_checkout_get_status")
      ? [selected("found", { kind: "ready", providerCode: PRIVATE_DRIVER })]
      : []
  ));
  await assert.rejects(repository(new FakePool([corrupt])).getStatus({
    hostname: "shop.celebix.site",
    credentialDigest: DIGEST,
    now: NOW,
  }), errorCode("unavailable"));
  await assert.rejects(repository(new FakePool([new Error(PRIVATE_DRIVER)])).getStatus({
    hostname: "shop.celebix.site",
    credentialDigest: DIGEST,
    now: NOW,
  }), errorCode("unavailable"));
});

test("trusted-error inspection is total and rejects hostile or forged objects", () => {
  const internal = trustedPublicCheckoutError("not_found");
  const forged = Object.create(Object.getPrototypeOf(internal)) as Record<string, unknown>;
  Object.defineProperty(forged, "code", {
    enumerable: true,
    get() { throw selfThrowingPrototypeProxy(); },
  });
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  const hostilePrototype = new Proxy({}, {
    getPrototypeOf() { throw new Error(PRIVATE_DRIVER); },
  });
  const accessor = Object.defineProperty({}, "code", {
    get() { throw new Error(PRIVATE_DRIVER); },
  });

  assert.equal(isTrustedPublicCheckoutError(internal), true);
  for (const value of [
    selfThrowingPrototypeProxy(), revoked.proxy, hostilePrototype, accessor, forged,
    Object.create(null), new Error(PRIVATE_DRIVER), () => PRIVATE_DRIVER,
    null, undefined, PRIVATE_DRIVER, 1, 1n, Symbol(PRIVATE_DRIVER),
  ]) {
    assert.doesNotThrow(() => {
      assert.equal(isTrustedPublicCheckoutError(value), false);
    });
  }
});

test("self-throwing query rejection is sanitized after rollback and normal release", async () => {
  const hostile = selfThrowingPrototypeProxy();
  const client = new FakeClient((text) => {
    if (text.includes("saas.storefront_checkout_get_status")) throw hostile;
    return [];
  });
  let captured: unknown;
  try {
    await repository(new FakePool([client])).getStatus({
      hostname: "shop.celebix.site",
      credentialDigest: DIGEST,
      now: NOW,
    });
  } catch (error) {
    captured = error;
  }
  assert.notEqual(captured, hostile);
  assert.ok(captured instanceof PublicCheckoutRepositoryError);
  assert.equal(captured.code, "unavailable");
  assert.equal(captured.message, "unavailable");
  assert.equal(Object.isFrozen(captured), true);
  assert.equal(client.calls.at(-1)?.text, "ROLLBACK");
  assert.deepEqual(client.releases, [undefined]);
});

test("self-throwing rollback rejection is sanitized and destroys the client", async () => {
  const queryHostile = selfThrowingPrototypeProxy();
  const rollbackHostile = selfThrowingPrototypeProxy();
  const client = new FakeClient((text) => {
    if (text.includes("saas.storefront_checkout_get_status")) throw queryHostile;
    if (text === "ROLLBACK") throw rollbackHostile;
    return [];
  });
  let captured: unknown;
  try {
    await repository(new FakePool([client])).getStatus({
      hostname: "shop.celebix.site",
      credentialDigest: DIGEST,
      now: NOW,
    });
  } catch (error) {
    captured = error;
  }
  assert.notEqual(captured, queryHostile);
  assert.notEqual(captured, rollbackHostile);
  assert.ok(captured instanceof PublicCheckoutRepositoryError);
  assert.equal(captured.code, "unavailable");
  assert.equal(captured.message, "unavailable");
  assert.equal(Object.isFrozen(captured), true);
  assert.equal(client.calls.at(-1)?.text, "ROLLBACK");
  assert.deepEqual(client.releases, [true]);
});

test("controlled SQL errors require an exact null payload", async () => {
  const valid = new FakeClient((text) => (
    text.includes("saas.storefront_checkout_get_status")
      ? [selected("not_found", null)]
      : []
  ));
  await assert.rejects(repository(new FakePool([valid])).getStatus({
    hostname: "shop.celebix.site",
    credentialDigest: DIGEST,
    now: NOW,
  }), errorCode("not_found"));

  const corrupt = new FakeClient((text) => (
    text.includes("saas.storefront_checkout_get_status")
      ? [selected("not_found", { credential: PRIVATE_DRIVER })]
      : []
  ));
  await assert.rejects(repository(new FakePool([corrupt])).getStatus({
    hostname: "shop.celebix.site",
    credentialDigest: DIGEST,
    now: NOW,
  }), errorCode("unavailable"));
});

test("repository exposes the exact finite Task 4 error vocabulary", () => {
  assert.deepEqual(PUBLIC_CHECKOUT_ERROR_CODES, [
    "invalid_input",
    "not_found",
    "version_conflict",
    "discount_invalid",
    "stock_unavailable",
    "payment_method_unavailable",
    "operation_mismatch",
    "commit_unknown",
    "unavailable",
  ]);
  assert.throws(
    () => new PublicCheckoutRepositoryError(PRIVATE_DRIVER as never),
    /public_checkout_error_code_invalid/,
  );
});
