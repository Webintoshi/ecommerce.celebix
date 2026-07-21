import assert from "node:assert/strict";
import test from "node:test";

import {
  readQuickLinkListInput,
  readQuickLinkMutationInput,
  readQuickLinkPanelSessionCookie,
  readQuickLinkPathId,
} from "./request-input.ts";

const LINK_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OPERATION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CREDENTIAL = `v1.panel.current.${Buffer.alloc(32, 0x31).toString("base64url")}`;

const address = {
  recipientName: "Ada Lovelace",
  phone: "+905551112233",
  line1: "Örnek Mahallesi 1",
  city: "İstanbul",
  country: "TR",
};

const createBody = {
  items: [{ variantId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", quantity: 2 }],
  customerName: "Ada Lovelace",
  customerEmail: "ada@example.com",
  customerPhone: "+905551112233",
  shippingAddress: address,
  billingAddress: address,
  shippingCents: 500,
  discountCents: 0,
  expiryHours: 24,
};

function post(body: unknown, operation = true) {
  return new Request("http://internal/api/orders/quick-links", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(operation ? { "idempotency-key": OPERATION_ID } : {}),
    },
    body: JSON.stringify(body),
  });
}

test("reads only a canonical persistent panel credential", () => {
  assert.deepEqual(readQuickLinkPanelSessionCookie(new Request("http://internal", {
    headers: { cookie: `theme=dark; __Host-celebix_panel=${CREDENTIAL}` },
  })), { kind: "present", credential: CREDENTIAL });
  for (const cookie of [undefined, `__Host-celebix_panel=${CREDENTIAL}; __Host-celebix_panel=${CREDENTIAL}`, "__Host-celebix_panel=v1.bad"] ) {
    const result = readQuickLinkPanelSessionCookie(new Request("http://internal", {
      headers: cookie === undefined ? undefined : { cookie },
    }));
    assert.notEqual(result.kind, "present");
  }
});

test("parses bounded list query and rejects unknown duplicate or malformed parameters", () => {
  assert.deepEqual(readQuickLinkListInput(new Request("http://internal/api/orders/quick-links")), {
    kind: "valid", value: { pageSize: 20 },
  });
  assert.deepEqual(readQuickLinkListInput(new Request(
    "http://internal/api/orders/quick-links?pageSize=100&status=active&cursor=eyJ2IjoxfQ",
  )), { kind: "valid", value: { pageSize: 100, cursor: "eyJ2IjoxfQ", status: "active" } });
  for (const query of ["?pageSize=0", "?status=unknown", "?x=1", "?pageSize=20&pageSize=30", "?cursor=%20bad"]) {
    assert.equal(readQuickLinkListInput(new Request(`http://internal/api/orders/quick-links${query}`)).kind, "invalid");
  }
});

test("accepts create intent containing only variant quantity and merchant fields", async () => {
  const parsed = await readQuickLinkMutationInput(post(createBody), "create");
  assert.equal(parsed.kind, "valid");
  if (parsed.kind === "valid") {
    assert.equal(parsed.operationId, OPERATION_ID);
    assert.deepEqual(parsed.value, createBody);
    assert.equal(Object.isFrozen(parsed.value), true);
  }
});

test("rejects browser store price currency provider and snapshot authority before use", async () => {
  for (const forbidden of [
    { storeId: LINK_ID }, { tenantId: LINK_ID }, { currency: "TRY" }, { providerConfigId: LINK_ID },
    { items: [{ ...createBody.items[0], unitPriceCents: 12_500 }] },
    { items: [{ ...createBody.items[0], productName: "Browser snapshot" }] },
  ]) {
    const body = forbidden.items === undefined
      ? { ...createBody, ...forbidden }
      : { ...createBody, items: forbidden.items };
    assert.equal((await readQuickLinkMutationInput(post(body), "create")).kind, "invalid");
  }
});

test("requires canonical idempotency for mutations and exact JSON bodies", async () => {
  for (const operation of [undefined, "BAD", `${OPERATION_ID},${OPERATION_ID}`, OPERATION_ID.toUpperCase()]) {
    const request = new Request("http://internal/api/orders/quick-links", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(operation === undefined ? {} : { "idempotency-key": operation }),
      },
      body: JSON.stringify(createBody),
    });
    assert.equal((await readQuickLinkMutationInput(request, "create")).kind, "invalid");
  }
  assert.deepEqual(await readQuickLinkMutationInput(post({ expectedVersion: 4 }), "cancel"), {
    kind: "valid", operationId: OPERATION_ID, value: { expectedVersion: 4 },
  });
  assert.equal((await readQuickLinkMutationInput(post({ expectedVersion: 4, extra: true }), "cancel")).kind, "invalid");
  assert.equal((await readQuickLinkMutationInput(post({}, true), "duplicate")).kind, "valid");
});

test("enforces exact JSON content type bounded bodies empty control bodies and canonical path IDs", async () => {
  const wrongType = new Request("http://internal/api/orders/quick-links", {
    method: "POST", headers: { "content-type": "text/plain", "idempotency-key": OPERATION_ID }, body: "{}",
  });
  assert.equal((await readQuickLinkMutationInput(wrongType, "duplicate")).kind, "invalid");
  const transfer = new Request("http://internal/api/orders/quick-links", {
    method: "POST", headers: { "content-type": "application/json", "idempotency-key": OPERATION_ID, "transfer-encoding": "chunked" }, body: "{}",
  });
  assert.equal((await readQuickLinkMutationInput(transfer, "duplicate")).kind, "invalid");
  assert.equal(readQuickLinkPathId(LINK_ID), LINK_ID);
  assert.equal(readQuickLinkPathId(LINK_ID.toUpperCase()), null);
  assert.equal(readQuickLinkPathId(`${LINK_ID}/evil`), null);
});
