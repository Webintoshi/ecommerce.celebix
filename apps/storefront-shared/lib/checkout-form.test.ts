import assert from "node:assert/strict";
import test from "node:test";

import { validateCheckoutFormDraft } from "./checkout-form.ts";

const VALID = Object.freeze({
  name: "Güzide Elif",
  email: "info@example.com",
  phone: "+90 555 111 22 33",
  addressLine1: "Bağdat Caddesi 10",
  addressLine2: "Kat 2",
  city: "İstanbul",
  district: "Kadıköy",
  postalCode: "34710",
  note: "Kapıyı çalınız.",
});

test("checkout form accepts only the bounded delivery draft and normalizes the email", () => {
  const result = validateCheckoutFormDraft({ ...VALID, email: "INFO@EXAMPLE.COM" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.contact.email, "info@example.com");
    assert.equal(result.value.shippingAddress.addressLine2, "Kat 2");
    assert.equal(result.value.note, "Kapıyı çalınız.");
    assert.equal(Object.isFrozen(result.value), true);
  }
});

test("checkout form rejects every missing malformed or oversized delivery authority", () => {
  const invalid = [
    ["name", " "], ["email", "invalid"], ["phone", "123"], ["addressLine1", "x"],
    ["city", "x"], ["district", "x"], ["postalCode", "?".repeat(17)], ["note", "n".repeat(1_001)],
  ] as const;
  for (const [field, value] of invalid) {
    const result = validateCheckoutFormDraft({ ...VALID, [field]: value });
    assert.equal(result.ok, false, field);
  }
});

test("checkout form rejects browser price payment and private identifier injection", () => {
  for (const extra of ["priceCents", "shippingCents", "iban", "paymentId", "storeId", "tenantId", "customerId", "orderId"]) {
    assert.equal(validateCheckoutFormDraft({ ...VALID, [extra]: "attacker" }).ok, false, extra);
  }
});

test("optional address line and note are omitted instead of serialized as empty authority", () => {
  const result = validateCheckoutFormDraft({ ...VALID, addressLine2: "", note: "" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal("addressLine2" in result.value.shippingAddress, false);
    assert.equal("note" in result.value, false);
  }
});
