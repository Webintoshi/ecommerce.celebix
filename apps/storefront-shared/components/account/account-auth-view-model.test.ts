import assert from "node:assert/strict";
import test from "node:test";

import * as model from "./account-auth-view-model.ts";

const { maskAccountEmail } = model;

test("account email masking preserves only a short recognition prefix", () => {
  assert.equal(maskAccountEmail("ada@example.com"), "ad***@example.com");
  assert.equal(maskAccountEmail("a@example.com"), "a***@example.com");
  assert.equal(maskAccountEmail("ALİ@EXAMPLE.COM"), "al***@example.com");
});

test("account email masking fails closed for empty and malformed values", () => {
  assert.equal(maskAccountEmail(""), "***");
  assert.equal(maskAccountEmail("not-an-email"), "***");
  assert.equal(maskAccountEmail("a@@example.com"), "***");
  assert.equal(maskAccountEmail("a@invalid"), "***");
});

test("phone recognition hides the middle digits for local and international input", () => {
  assert.equal(model.maskAccountPhone("0555 111 22 33"), "+90 5** *** 22 33");
  assert.equal(model.maskAccountPhone("+90 (555) 111 22 33"), "+90 5** *** 22 33");
  assert.equal(model.maskAccountPhone("5551112233"), "+90 5** *** 22 33");
  assert.equal(model.maskAccountPhone(""), "***");
  assert.equal(model.maskAccountPhone("123"), "***");
});

test("phone recognition covers accepted WhatsApp landlines and international numbers", () => {
  assert.equal(model.maskAccountPhone("0452 606 05 52"), "+90 4** *** 05 52");
  assert.equal(model.maskAccountPhone("0090 (452) 606 05 52"), "+90 4** *** 05 52");
  assert.equal(model.maskAccountPhone("+44 20 7946 0123"), "+*** *** 01 23");
  assert.equal(model.maskAccountPhone("+1 (202) 555-0123"), "+*** *** 01 23");
  assert.equal(model.maskAccountPhone("0555 111 22 33abc"), "***");
});

test("phone entry sends only the phone and safe return destination", () => {
  const entry = { phone: " +90 555 111 22 33 ", returnTo: "/account/orders" };
  assert.deepEqual(model.accountPhoneStartBody(entry), { phone: "+90 555 111 22 33", returnTo: "/account/orders" });
});

test("retry countdown uses elapsed time including background browser delays", () => {
  assert.equal(model.accountRetryDeadline(91, 1_000), 92_000);
  assert.equal(model.accountRetryRemaining(92_000, 61_500), 31);
  assert.equal(model.accountRetryRemaining(92_000, 93_000), 0);
  assert.equal(model.accountRetryDeadline(Number.NaN, 1_000), 1_000);
  assert.equal(model.accountRetryDeadline(-1, 1_000), 1_000);
});
