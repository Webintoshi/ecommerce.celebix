import assert from "node:assert/strict";
import test from "node:test";

import { validateCheckoutFormDraft } from "./checkout-form.ts";

const VALID = Object.freeze({
  firstName: "Güzide",
  lastName: "Elif",
  email: "info@example.com",
  phone: "+905551112233",
  addressLine1: "Bağdat Caddesi 10, Kat 2",
  city: "İstanbul",
  district: "Kadıköy",
  postalCode: "34710",
  note: "Kapıyı çalınız.",
});

test("separate checkout names bridge to the existing contact contract and email is normalized", () => {
  const result = validateCheckoutFormDraft({ ...VALID, firstName: "  Güzide   Nur  ", lastName: "  Elif  ", email: "INFO@EXAMPLE.COM" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.contact.name, "Güzide Nur Elif");
    assert.equal(result.value.contact.email, "info@example.com");
    assert.equal(result.value.shippingAddress.postalCode, "34710");
    assert.equal("addressLine2" in result.value.shippingAddress, false);
    assert.equal(result.value.note, "Kapıyı çalınız.");
    assert.equal(Object.isFrozen(result.value), true);
  }
});

test("checkout requires both names and postal code and rejects malformed delivery authority", () => {
  const invalid = [
    ["firstName", " "], ["lastName", " "], ["email", "invalid"], ["phone", "123"], ["addressLine1", "x"],
    ["city", "x"], ["district", "x"], ["postalCode", ""], ["postalCode", "?".repeat(17)], ["note", "n".repeat(501)],
  ] as const;
  for (const [field, value] of invalid) {
    const result = validateCheckoutFormDraft({ ...VALID, [field]: value });
    assert.equal(result.ok, false, field);
    if (!result.ok) assert.equal(typeof result.errors[field], "string", field);
  }
});

test("checkout rejects browser price payment private identifier and removed address line injection", () => {
  for (const extra of ["priceCents", "shippingCents", "iban", "paymentId", "storeId", "tenantId", "customerId", "orderId", "name", "addressLine2"]) {
    assert.equal(validateCheckoutFormDraft({ ...VALID, [extra]: "attacker" }).ok, false, extra);
  }
});

test("blank optional note is omitted while required postal authority is retained", () => {
  const result = validateCheckoutFormDraft({ ...VALID, note: "" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.shippingAddress.postalCode, "34710");
    assert.equal("note" in result.value, false);
  }
});

test("checkout accepts canonical international E.164 and rejects formatting or invalid bounds", () => {
  for (const phone of ["+905551112233", "+14155552671", "+447911123456", "+39066982", "+971501234567"]) {
    assert.equal(validateCheckoutFormDraft({ ...VALID, phone }).ok, true, phone);
  }
  for (const phone of ["+90 555 111 22 33", "05551112233", "+01234567890", "+1", "+1234567890123456", "+44<script>"]) {
    assert.equal(validateCheckoutFormDraft({ ...VALID, phone }).ok, false, phone);
  }
});

test("checkout name parts cannot cross existing request and SQL name bounds", () => {
  for (const [field, value] of [["firstName", "A".repeat(101)], ["lastName", "E".repeat(101)], ["firstName", "Güzide\u00a0Nur"], ["lastName", "Elif\nNur"]] as const) {
    assert.equal(validateCheckoutFormDraft({ ...VALID, [field]: value }).ok, false, field);
  }
  assert.equal(validateCheckoutFormDraft({ ...VALID, firstName: "A", lastName: "B" }).ok, true);
  assert.equal(validateCheckoutFormDraft({ ...VALID, firstName: "A".repeat(100), lastName: "B".repeat(100) }).ok, false);
});

test("multiword names respect the backend UTF-8 limit after the existing name projection", () => {
  const rejected = validateCheckoutFormDraft({ ...VALID, firstName: "Ş".repeat(45), lastName: `${"Ç".repeat(10)} Yılmaz` });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(typeof rejected.errors.lastName, "string");
  assert.equal(validateCheckoutFormDraft({ ...VALID, firstName: "Ş".repeat(40), lastName: `${"Ç".repeat(5)} Yılmaz` }).ok, true);
});
