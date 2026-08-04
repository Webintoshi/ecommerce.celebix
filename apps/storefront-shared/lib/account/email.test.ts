import assert from "node:assert/strict";
import test from "node:test";

import { normalizeStorefrontAccountEmail } from "./email.ts";

test("normalizes one bounded storefront account email", () => {
  assert.equal(normalizeStorefrontAccountEmail(" \tAda@Example.COM\r\n"), "ada@example.com");
  assert.equal(normalizeStorefrontAccountEmail("güzide@örnek.com"), "güzide@örnek.com");
});

test("rejects ambiguous malformed and unsafe storefront account emails", () => {
  for (const value of ["", "a@b", "a\u0000@example.com", " ada @example.com ", ["a@example.com"], { email: "a@example.com" }, "a".repeat(321)]) {
    assert.throws(() => normalizeStorefrontAccountEmail(value), /storefront_account_email_invalid/u);
  }
});
