import assert from "node:assert/strict";
import test from "node:test";

import {
  CART_COOKIE_NAME,
  createCartCredential,
  readCartCredential,
  serializeCartCredential,
} from "./credential.ts";

test("creates an exact 32-byte canonical opaque credential and lowercase digest", () => {
  const created = createCartCredential((size) => {
    assert.equal(size, 32);
    return Buffer.alloc(size, 0x42);
  });
  assert.match(created.credential, /^[A-Za-z0-9_-]{43}$/);
  assert.match(created.digest, /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(created), true);
  assert.equal(created.digest.includes(created.credential), false);
});

test("serializes only the secure first-party __Host cart cookie", () => {
  const credential = Buffer.alloc(32, 0x42).toString("base64url");
  assert.equal(CART_COOKIE_NAME, "__Host-celebix_cart");
  assert.equal(serializeCartCredential(credential), `${CART_COOKIE_NAME}=${credential}; Path=/; HttpOnly; Secure; SameSite=Lax`);
});

test("reads exactly one canonical cart cookie and rejects ambiguity", () => {
  const credential = Buffer.alloc(32, 0x42).toString("base64url");
  assert.deepEqual(readCartCredential(`${CART_COOKIE_NAME}=${credential}`), { kind: "present", credential });
  assert.deepEqual(readCartCredential(null), { kind: "missing" });
  for (const cookie of [
    `${CART_COOKIE_NAME}=short`,
    `${CART_COOKIE_NAME}=${credential}; ${CART_COOKIE_NAME}=${credential}`,
    `${CART_COOKIE_NAME}=${credential},${credential}`,
    `${CART_COOKIE_NAME}= ${credential}`,
  ]) assert.deepEqual(readCartCredential(cookie), { kind: "invalid" });
});
