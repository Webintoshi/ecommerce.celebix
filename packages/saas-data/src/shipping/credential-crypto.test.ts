import assert from "node:assert/strict";
import test from "node:test";

import {
  openShippingCredential,
  sealShippingCredential,
  type ShippingCredentialKeyring,
} from "./credential-crypto.ts";

const STORE = "10000000-0000-4000-8000-000000000001";
const PROFILE = "40000000-0000-4000-8000-000000000001";
const TOKEN = new TextEncoder().encode("bk_live_secret_123456789");
const KEY = new Uint8Array(32).fill(17);

function keyring(): ShippingCredentialKeyring {
  return Object.freeze({
    activeKeyId: "shipping.current",
    keys: Object.freeze([Object.freeze({ keyId: "shipping.current", key: KEY })]),
  });
}

test("shipping credentials are AES-GCM sealed without plaintext persistence", () => {
  const sealed = sealShippingCredential({
    plaintext: TOKEN,
    storeId: STORE,
    profileId: PROFILE,
    providerCode: "basit_kargo",
    credentialVersion: 1,
    keyring: keyring(),
  });
  assert.deepEqual(Object.keys(sealed), ["algorithm", "ciphertext", "iv", "keyId", "tag", "version"]);
  assert.doesNotMatch(JSON.stringify(sealed), /bk_live_secret/u);
  const opened = openShippingCredential({
    envelope: sealed,
    storeId: STORE,
    profileId: PROFILE,
    providerCode: "basit_kargo",
    credentialVersion: 1,
    keyring: keyring(),
  });
  assert.equal(new TextDecoder().decode(opened), "bk_live_secret_123456789");
  opened.fill(0);
});

test("shipping credential AAD rejects store profile provider and version substitution", () => {
  const sealed = sealShippingCredential({
    plaintext: TOKEN,
    storeId: STORE,
    profileId: PROFILE,
    providerCode: "basit_kargo",
    credentialVersion: 1,
    keyring: keyring(),
  });
  for (const change of [
    { storeId: "10000000-0000-4000-8000-000000000002" },
    { profileId: "40000000-0000-4000-8000-000000000002" },
    { providerCode: "shipentegra" },
    { credentialVersion: 2 },
  ]) {
    assert.throws(() => openShippingCredential({
      envelope: sealed,
      storeId: STORE,
      profileId: PROFILE,
      providerCode: "basit_kargo",
      credentialVersion: 1,
      keyring: keyring(),
      ...change,
    } as never), /shipping_credential_crypto_invalid/u);
  }
});

test("shipping credential crypto leaves caller buffers intact and rejects malformed keyrings", () => {
  const caller = new Uint8Array(TOKEN);
  sealShippingCredential({
    plaintext: caller,
    storeId: STORE,
    profileId: PROFILE,
    providerCode: "basit_kargo",
    credentialVersion: 1,
    keyring: keyring(),
  });
  assert.deepEqual(caller, TOKEN);
  assert.throws(() => sealShippingCredential({
    plaintext: caller,
    storeId: STORE,
    profileId: PROFILE,
    providerCode: "basit_kargo",
    credentialVersion: 1,
    keyring: { activeKeyId: "shipping.current", keys: [{ keyId: "shipping.current", key: new Uint8Array(31) }] },
  }), /shipping_credential_crypto_invalid/u);
  caller.fill(0);
});
