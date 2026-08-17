import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./http-security.ts", import.meta.url), "utf8");

test("storefront CSP permits only the exact PayTR iframe origin", () => {
  assert.match(source, /frame-src 'self' https:\/\/www\.paytr\.com;/);
  assert.match(source, /child-src 'self' https:\/\/www\.paytr\.com;/);
  assert.doesNotMatch(source, /frame-src 'self' https:;/);
  assert.doesNotMatch(source, /child-src 'self' https:;/);
});
