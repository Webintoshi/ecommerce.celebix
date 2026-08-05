import assert from "node:assert/strict";
import test from "node:test";

import { maskAccountEmail } from "./account-auth-view-model.ts";

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
