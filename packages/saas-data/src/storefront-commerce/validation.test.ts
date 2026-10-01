import assert from "node:assert/strict";
import test from "node:test";

import { commerceDelivery } from "./validation.ts";

const delivery = (phone: string) => ({
  contact: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.test", phone },
  shippingAddress: { line1: "Cadde 1", city: "İstanbul", country: "TR" },
});

test("commerce delivery preserves canonical international E164 phones without changing shipping country", () => {
  for (const phone of ["+905551112233", "+14155552671", "+447911123456", "+4915112345678", "+12345678", "+123456789012345"]) {
    const selected = commerceDelivery(delivery(phone));
    assert.equal(selected.contact.phone, phone);
    assert.equal(selected.shippingAddress.country, "TR");
    assert.equal(Object.hasOwn(selected.shippingAddress, "postalCode"), false);
  }
});

test("commerce delivery rejects noncanonical or unbounded international phone text", () => {
  for (const phone of ["14155552671", "+04155552671", "+1 4155552671", "+1-4155552671", "+1234567", "+1234567890123456", "+14155552671\n", "+١٤١٥٥٥٥٢٦٧١"]) {
    assert.throws(() => commerceDelivery(delivery(phone)), /invalid_input/u);
  }
});
