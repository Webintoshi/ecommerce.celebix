import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  commerceDigest,
  readCommerceBridgeKey,
  readCommerceDataKey,
  sealCommercePayload,
  unsealCommercePayload,
  verifyCommerceBridgeSignature,
} from "./security.ts";

const KEY = Buffer.alloc(32, 41);
const OTHER_KEY = Buffer.alloc(32, 42);
const NOW = new Date("2026-10-26T12:00:00Z");
const STAMP = String(Math.floor(NOW.getTime() / 1000));

test("bridge and data keys accept only canonical 32-byte base64url values", () => {
  const encoded = KEY.toString("base64url");
  assert.deepEqual(readCommerceBridgeKey({ CELEBIX_PLATFORM_COMMERCE_BRIDGE_KEY_B64URL: encoded }), KEY);
  assert.deepEqual(readCommerceDataKey({ CELEBIX_PLATFORM_COMMERCE_DATA_KEY_B64URL: encoded }), KEY);
  for (const value of [undefined, "", encoded + "=", " " + encoded, Buffer.alloc(31).toString("base64url"), Buffer.alloc(33).toString("base64url"), "!".repeat(43)]) {
    assert.throws(() => readCommerceBridgeKey({ CELEBIX_PLATFORM_COMMERCE_BRIDGE_KEY_B64URL: value }), /^TypeError: platform_commerce_key_invalid$/);
    assert.throws(() => readCommerceDataKey({ CELEBIX_PLATFORM_COMMERCE_DATA_KEY_B64URL: value }), /^TypeError: platform_commerce_key_invalid$/);
  }
});

test("commerce digest produces a stable SHA-256 hex digest", () => {
  assert.equal(commerceDigest("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.notEqual(commerceDigest("abc"), commerceDigest("abcd"));
});

test("AES payloads roundtrip with randomized ciphertext and no visible buyer data", () => {
  const value = { email: "buyer@example.test", identityNumber: "74300864791", totalCents: 125050 };
  const first = sealCommercePayload(value, KEY, "order:one:buyer");
  const second = sealCommercePayload(value, KEY, "order:one:buyer");
  assert.notEqual(first, second);
  assert.ok(!first.includes(value.email));
  assert.ok(!first.includes(value.identityNumber));
  assert.deepEqual(unsealCommercePayload(first, KEY, "order:one:buyer"), value);
  assert.deepEqual(unsealCommercePayload(sealCommercePayload(null, KEY, "value"), KEY, "value"), null);
});

test("sealed buyer data is bound to its purpose and rejects tampering with safe errors", () => {
  const sealed = sealCommercePayload({ email: "private-buyer@example.test" }, KEY, "order:one:buyer");
  const original = JSON.parse(sealed);
  assert.equal(typeof original.ciphertext, "string");
  for (const [value, key, context] of [
    [sealed, OTHER_KEY, "order:one:buyer"], [sealed, KEY, "order:two:buyer"],
    [JSON.stringify({ ...original, v: 2 }), KEY, "order:one:buyer"],
    [JSON.stringify({ ...original, iv: "A".repeat(16) }), KEY, "order:one:buyer"],
    [JSON.stringify({ ...original, tag: "A".repeat(22) }), KEY, "order:one:buyer"],
    [JSON.stringify({ ...original, ciphertext: original.ciphertext.slice(0, -1) + (original.ciphertext.endsWith("A") ? "B" : "A") }), KEY, "order:one:buyer"],
    [JSON.stringify({ ...original, extra: "ignored" }), KEY, "order:one:buyer"],
    ["not-json-private-buyer@example.test", KEY, "order:one:buyer"],
  ] as const) {
    assert.throws(() => unsealCommercePayload(value, key, context), /^TypeError: platform_commerce_payload_invalid$/);
  }
  assert.throws(() => sealCommercePayload(undefined, KEY, "buyer"), /platform_commerce_payload_invalid/);
  assert.throws(() => sealCommercePayload({}, Buffer.alloc(31), "buyer"), /platform_commerce_payload_invalid/);
  assert.throws(() => sealCommercePayload({}, KEY, ""), /platform_commerce_payload_invalid/);
});

test("bridge verification authenticates exact bytes and rejects stale or altered signatures", () => {
  const body = Buffer.from('{"action":"read","payload":{"code":"a"}}');
  const signature = createHmac("sha256", KEY).update(`${STAMP}.`).update(body).digest("hex");
  const base = { key: KEY, timestamp: STAMP, signature, body, now: NOW };
  assert.equal(verifyCommerceBridgeSignature(base), true);
  for (const override of [
    { key: OTHER_KEY }, { body: Buffer.from(body.toString() + " ") },
    { signature: signature.toUpperCase() }, { signature: "0".repeat(64) },
    { signature: signature.slice(1) }, { timestamp: "0" + STAMP },
    { now: new Date(NOW.getTime() + 301_000) }, { now: new Date(NOW.getTime() - 301_000) },
    { now: new Date("invalid") },
  ]) assert.equal(verifyCommerceBridgeSignature({ ...base, ...override }), false);
  assert.equal(verifyCommerceBridgeSignature({ ...base, now: new Date(NOW.getTime() + 300_000) }), true);
  assert.equal(verifyCommerceBridgeSignature({ ...base, now: new Date(NOW.getTime() - 300_000) }), true);
});
