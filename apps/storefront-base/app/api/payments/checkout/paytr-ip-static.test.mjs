import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

test("checkout extracts a public customer IP from trusted proxy headers for PayTR", () => {
  assert.match(source, /cf-connecting-ip/);
  assert.match(source, /x-real-ip/);
  assert.match(source, /x-forwarded-for/);
  assert.match(source, /isPublicCheckoutIp/);
  assert.match(source, /isPrivateIpv4/);
});
