import assert from "node:assert/strict";
import test from "node:test";

import {
  createStorefrontCredential,
  createStorefrontOperationCredential,
  credentialDigestCandidates,
  parseStorefrontCommerceCredentialKeyring,
  readStorefrontCredentialCookie,
  serializeStorefrontCredentialDeletionCookie,
  serializeStorefrontCredentialCookie,
} from "./credential.ts";

const KEY_A = Buffer.alloc(32, 7).toString("base64url");
const KEY_B = Buffer.alloc(32, 9).toString("base64url");
const keyring = parseStorefrontCommerceCredentialKeyring({
  CELEBIX_DEPLOYMENT_TIER: "staging",
  CELEBIX_STOREFRONT_COMMERCE_CREDENTIALS_MODE: "approved_staging",
  CELEBIX_STOREFRONT_COMMERCE_ACTIVE_KEY_ID: "current_01",
  CELEBIX_STOREFRONT_COMMERCE_KEYS: JSON.stringify([
    { keyId: "current_01", key: KEY_A },
    { keyId: "previous_01", key: KEY_B },
  ]),
});

test("purpose-bound credentials are canonical and produce only keyed digest candidates", () => {
  const created = createStorefrontCredential("cart", keyring, (size) => new Uint8Array(size).fill(3));
  assert.match(created.value, /^c1[.]current_01[.][A-Za-z0-9_-]{43}$/u);
  assert.match(created.digest, /^[a-f0-9]{64}$/u);
  assert.deepEqual(credentialDigestCandidates("cart", created.value, keyring), [{ keyId: "current_01", digest: created.digest }]);
  assert.notEqual(createStorefrontCredential("intent", keyring, (size) => new Uint8Array(size).fill(3)).digest, created.digest);
  assert.notEqual(createStorefrontCredential("customer", keyring, (size) => new Uint8Array(size).fill(3)).digest, created.digest);
  assert.notEqual(createStorefrontCredential("receipt", keyring, (size) => new Uint8Array(size).fill(3)).digest, created.digest);
});

test("checkout credentials are deterministic only for the exact operation and purpose", () => {
  const operation = "30000000-0000-4000-8000-000000000001";
  const first = createStorefrontOperationCredential("receipt", operation, keyring);
  const replay = createStorefrontOperationCredential("receipt", operation, keyring);
  const customer = createStorefrontOperationCredential("customer", operation, keyring);
  const changed = createStorefrontOperationCredential("receipt", "30000000-0000-4000-8000-000000000002", keyring);
  assert.deepEqual(replay, first);
  assert.notEqual(customer.value, first.value);
  assert.notEqual(changed.value, first.value);
});

test("checkout replay can reproduce its original credential across active-key rotation", () => {
  const operation = "30000000-0000-4000-8000-000000000001";
  const first = createStorefrontOperationCredential("receipt", operation, keyring);
  const rotated = parseStorefrontCommerceCredentialKeyring({
    CELEBIX_DEPLOYMENT_TIER: "staging",
    CELEBIX_STOREFRONT_COMMERCE_CREDENTIALS_MODE: "approved_staging",
    CELEBIX_STOREFRONT_COMMERCE_ACTIVE_KEY_ID: "previous_01",
    CELEBIX_STOREFRONT_COMMERCE_KEYS: JSON.stringify([
      { keyId: "previous_01", key: KEY_B },
      { keyId: "current_01", key: KEY_A },
    ]),
  });
  assert.notEqual(createStorefrontOperationCredential("receipt", operation, rotated).value, first.value);
  assert.deepEqual(createStorefrontOperationCredential("receipt", operation, rotated, first.keyId), first);
});

test("cookie readers isolate purposes and reject duplicate or noncanonical credentials", () => {
  const cart = createStorefrontCredential("cart", keyring, (size) => new Uint8Array(size).fill(4)).value;
  const intent = createStorefrontCredential("intent", keyring, (size) => new Uint8Array(size).fill(5)).value;
  assert.deepEqual(readStorefrontCredentialCookie("cart", `theme=warm; __Host-celebix_cart=${cart}`), { kind: "present", value: cart });
  assert.deepEqual(readStorefrontCredentialCookie("cart", `__Host-celebix_cart=${intent}`), { kind: "invalid" });
  assert.deepEqual(readStorefrontCredentialCookie("cart", `__Host-celebix_cart=${cart}; __Host-celebix_cart=${cart}`), { kind: "invalid" });
  assert.deepEqual(readStorefrontCredentialCookie("cart", "theme=warm"), { kind: "missing" });
  assert.deepEqual(readStorefrontCredentialCookie("cart", `__Host-celebix_cart= ${cart}`), { kind: "invalid" });
});

test("every credential cookie has exact secure host-only attributes and bounded lifetime", () => {
  const cases = [
    ["cart", "__Host-celebix_cart", 2_592_000],
    ["intent", "__Host-celebix_checkout_intent", 900],
    ["customer", "__Host-celebix_customer", 2_592_000],
    ["receipt", "__Host-celebix_receipt", 900],
  ] as const;
  for (const [purpose, name, maxAge] of cases) {
    const value = createStorefrontCredential(purpose, keyring, (size) => new Uint8Array(size).fill(maxAge % 251)).value;
    assert.equal(serializeStorefrontCredentialCookie(purpose, value), `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`);
  }
  assert.equal(serializeStorefrontCredentialDeletionCookie("cart"), "__Host-celebix_cart=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax");
});

test("credential keyring activates only an exact isolated staging authority", () => {
  for (const source of [
    {},
    { CELEBIX_DEPLOYMENT_TIER: "production", CELEBIX_STOREFRONT_COMMERCE_CREDENTIALS_MODE: "approved_staging", CELEBIX_STOREFRONT_COMMERCE_ACTIVE_KEY_ID: "current_01", CELEBIX_STOREFRONT_COMMERCE_KEYS: JSON.stringify([{ keyId: "current_01", key: KEY_A }]) },
    { CELEBIX_DEPLOYMENT_TIER: "staging", CELEBIX_STOREFRONT_COMMERCE_CREDENTIALS_MODE: "approved_staging", CELEBIX_STOREFRONT_COMMERCE_ACTIVE_KEY_ID: "missing_01", CELEBIX_STOREFRONT_COMMERCE_KEYS: JSON.stringify([{ keyId: "current_01", key: KEY_A }]) },
    { CELEBIX_DEPLOYMENT_TIER: "staging", CELEBIX_STOREFRONT_COMMERCE_CREDENTIALS_MODE: "approved_staging", CELEBIX_STOREFRONT_COMMERCE_ACTIVE_KEY_ID: "current_01", CELEBIX_STOREFRONT_COMMERCE_KEYS: JSON.stringify(Array.from({ length: 17 }, (_, index) => ({ keyId: `key_${String(index).padStart(2, "0")}`, key: KEY_A }))) },
  ]) assert.throws(() => parseStorefrontCommerceCredentialKeyring(source), /storefront_commerce_credentials_unavailable/u);
});
