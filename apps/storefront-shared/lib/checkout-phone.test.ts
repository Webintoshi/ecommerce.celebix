import assert from "node:assert/strict";
import test from "node:test";

import { PHONE_COUNTRIES, composePhoneNumber, isCanonicalPhoneNumber, splitPhoneNumber } from "./checkout-phone.ts";

test("phone countries are complete, unique, searchable and include native flags and calling codes", () => {
  assert.equal(PHONE_COUNTRIES.length, 245);
  assert.equal(new Set(PHONE_COUNTRIES.map((country) => country.country)).size, PHONE_COUNTRIES.length);
  assert.equal(PHONE_COUNTRIES[0]?.country, "TR");
  for (const country of PHONE_COUNTRIES) {
    assert.match(country.country, /^[A-Z]{2}$/u);
    assert.match(country.dialCode, /^\+[1-9][0-9]{0,2}$/u);
    assert.ok(country.name.length > 1);
    assert.equal([...country.flag].length, 2);
  }
});

test("phone entry converts common local formatting without mutating meaningful Italian zero", () => {
  assert.equal(composePhoneNumber("TR", "0555 111 22 33"), "+905551112233");
  assert.equal(composePhoneNumber("TR", "905551112233"), "+905551112233");
  assert.equal(composePhoneNumber("GB", "07911 123456"), "+447911123456");
  assert.equal(composePhoneNumber("US", "(415) 555-2671"), "+14155552671");
  assert.equal(composePhoneNumber("US", "1 (415) 555-2671"), "+14155552671");
  assert.equal(composePhoneNumber("IT", "06 6982"), "+39066982");
  assert.equal(composePhoneNumber("TR", ""), "");
});

test("international pasted and prefilled numbers retain exact canonical authority", () => {
  for (const value of ["+905551112233", "+14155552671", "+447911123456", "+39066982", "+971501234567", "+870773111632"]) {
    const split = splitPhoneNumber(value);
    assert.equal(composePhoneNumber(split.country.country, split.nationalNumber), value, value);
  }
  assert.equal(composePhoneNumber("TR", "+44 7911 123456"), "+447911123456");
  assert.equal(composePhoneNumber("TR", "0044 7911 123456"), "+447911123456");
});

test("ambiguous calling codes choose deterministic main regions and preserve an explicit selection", () => {
  assert.equal(splitPhoneNumber("+14155552671").country.country, "US");
  assert.equal(splitPhoneNumber("+74951234567").country.country, "RU");
  assert.equal(splitPhoneNumber("+447911123456").country.country, "GB");
  assert.equal(splitPhoneNumber("+14155552671", "CA").country.country, "CA");
});

test("normalization never silently discards letters or unsupported symbols into another phone number", () => {
  assert.equal(isCanonicalPhoneNumber(composePhoneNumber("TR", "5551112233x")), false);
  for (const value of ["+0123456789", "+1", "+1234567890123456", "+905551112233\n"]) {
    assert.equal(isCanonicalPhoneNumber(value), false, value);
  }
  assert.equal(isCanonicalPhoneNumber("+14155552671"), true);
});
