import assert from "node:assert/strict";
import test from "node:test";

import { readAbandonedCartListInput, readAbandonedCartMutationInput, readAbandonedCartPathId } from "./request-input.ts";

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OPERATION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("list input accepts only bounded abandoned-cart filters", () => {
  assert.deepEqual(readAbandonedCartListInput(new Request("https://panel.example/api/orders/abandoned-carts?pageSize=25&status=abandoned&sort=highest&search=Ada")), {
    kind: "valid", value: { pageSize: 25, status: "abandoned", sort: "highest", search: "Ada" },
  });
  for (const query of ["storeId=evil", "pageSize=0", "status=wrong", "sort=wrong", "search=%20Ada", "status=abandoned&status=active"]) {
    assert.deepEqual(readAbandonedCartListInput(new Request(`https://panel.example/api/orders/abandoned-carts?${query}`)), { kind: "invalid" });
  }
});

test("mutations require one UUID idempotency key and exact expectedVersion body", async () => {
  const valid = new Request(`https://panel.example/api/orders/abandoned-carts/${ID}/archive`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": OPERATION }, body: JSON.stringify({ expectedVersion: 3 }) });
  assert.deepEqual(await readAbandonedCartMutationInput(valid), { kind: "valid", operationId: OPERATION, expectedVersion: 3 });
  for (const body of [{}, { expectedVersion: 0 }, { expectedVersion: 3, storeId: ID }]) {
    const request = new Request("https://panel.example/api/orders/abandoned-carts/x/archive", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": OPERATION }, body: JSON.stringify(body) });
    assert.deepEqual(await readAbandonedCartMutationInput(request), { kind: "invalid" });
  }
  assert.equal(readAbandonedCartPathId(ID), ID);
  assert.equal(readAbandonedCartPathId("bad"), null);
});
