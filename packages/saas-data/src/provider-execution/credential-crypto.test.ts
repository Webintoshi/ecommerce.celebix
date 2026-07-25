import assert from "node:assert/strict";
import test from "node:test";

import {
  openMerchantProviderCredential,
  sealMerchantProviderCredential,
  type MerchantProviderCredentialKeyring,
  type SealedMerchantProviderCredential,
} from "./credential-crypto.ts";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PROFILE_ID = "22222222-2222-4222-8222-222222222222";
const STORE_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_STORE_ID = "44444444-4444-4444-8444-444444444444";
const ACTIVE_KEY = new Uint8Array(32).fill(0x11);
const RETIRED_KEY = new Uint8Array(32).fill(0x22);
const PLAINTEXT = new TextEncoder().encode('{"apiSecret":"never-print"}');

function keyring(
  activeKeyId = "provider.current",
  keys: MerchantProviderCredentialKeyring["keys"] = [{ keyId: "provider.current", key: ACTIVE_KEY }],
): MerchantProviderCredentialKeyring {
  return { activeKeyId, keys };
}

function seal(overrides: Record<string, unknown> = {}): SealedMerchantProviderCredential {
  return sealMerchantProviderCredential({
    plaintext: PLAINTEXT,
    profileId: PROFILE_ID,
    storeId: STORE_ID,
    providerCode: "fixture_provider",
    capability: "marketplace_sync" as const,
    credentialVersion: 1,
    keyring: keyring(),
    ...overrides,
  } as Parameters<typeof sealMerchantProviderCredential>[0]);
}

function open(envelope: SealedMerchantProviderCredential, overrides: Record<string, unknown> = {}): Uint8Array {
  return openMerchantProviderCredential({
    envelope,
    profileId: PROFILE_ID,
    storeId: STORE_ID,
    providerCode: "fixture_provider",
    capability: "marketplace_sync",
    credentialVersion: 1,
    keyring: keyring(),
    ...overrides,
  } as Parameters<typeof openMerchantProviderCredential>[0]);
}

function observeBufferZeroization<T>(operation: () => T): Readonly<{
  result?: T;
  error?: unknown;
  wipes: readonly Readonly<{ before: Buffer; target: Buffer }>[];
}> {
  const owner = Buffer.prototype as unknown as { fill: (value: unknown, ...args: readonly unknown[]) => Buffer };
  const original = owner.fill;
  const wipes: Array<Readonly<{ before: Buffer; target: Buffer }>> = [];
  owner.fill = function observedFill(this: Buffer, value: unknown, ...args: readonly unknown[]): Buffer {
    const before = Buffer.from(this);
    const result = Reflect.apply(original, this, [value, ...args]);
    if (value === 0) wipes.push({ before, target: this });
    return result;
  };
  try {
    return { result: operation(), wipes };
  } catch (error) {
    return { error, wipes };
  } finally {
    owner.fill = original;
  }
}

function assertWiped(wipes: readonly Readonly<{ before: Buffer; target: Buffer }>[], expected: Uint8Array): void {
  const match = wipes.find(({ before }) => before.equals(expected));
  assert.ok(match, "expected copied bytes to be zeroized");
  assert.equal(match.target.every((byte) => byte === 0), true);
}

test("provider credentials bind every authority field and rotate without plaintext persistence", () => {
  const callerPlaintext = new Uint8Array(PLAINTEXT);
  const envelope = sealMerchantProviderCredential({
    plaintext: callerPlaintext,
    profileId: PROFILE_ID,
    storeId: STORE_ID,
    providerCode: "fixture_provider",
    capability: "marketplace_sync",
    credentialVersion: 1,
    keyring: keyring("provider.retired", [{ keyId: "provider.retired", key: RETIRED_KEY }]),
  });
  assert.equal(Object.isFrozen(envelope), true);
  assert.deepEqual(Object.keys(envelope), ["algorithm", "ciphertext", "iv", "keyId", "tag", "version"]);
  assert.doesNotMatch(JSON.stringify(envelope), /never-print|apiSecret/);
  const opened = open(envelope, {
    keyring: keyring("provider.current", [
      { keyId: "provider.current", key: ACTIVE_KEY },
      { keyId: "provider.retired", key: RETIRED_KEY },
    ]),
  });
  assert.equal(new TextDecoder().decode(opened), '{"apiSecret":"never-print"}');
  assert.deepEqual(callerPlaintext, PLAINTEXT);
  opened.fill(0);
  callerPlaintext.fill(0);
});

test("credential AAD rejects cross-store profile provider capability and version substitution", () => {
  const envelope = seal();
  for (const change of [
    { storeId: OTHER_STORE_ID },
    { profileId: OTHER_PROFILE_ID },
    { providerCode: "other_provider" },
    { capability: "indexing" as const },
    { credentialVersion: 2 },
  ]) assert.throws(() => open(envelope, change), /provider_credential_crypto_invalid/);
});

test("credential envelopes reject ciphertext tag IV key ID and schema substitution", () => {
  const envelope = seal();
  const flip = (value: string) => `${value[0] === "A" ? "B" : "A"}${value.slice(1)}`;
  for (const changed of [
    { ...envelope, ciphertext: flip(envelope.ciphertext) },
    { ...envelope, tag: flip(envelope.tag) },
    { ...envelope, iv: flip(envelope.iv) },
    { ...envelope, keyId: "provider.other" },
    { ...envelope, version: 2 },
    { ...envelope, extra: true },
    { ...envelope, ciphertext: `${envelope.ciphertext}=` },
  ]) assert.throws(() => open(changed as SealedMerchantProviderCredential), /provider_credential_crypto_invalid/);
});

test("credential crypto rejects accessors duplicate key bytes and noncanonical inputs", () => {
  let getterCalled = false;
  const hostile = {
    plaintext: PLAINTEXT,
    profileId: PROFILE_ID,
    storeId: STORE_ID,
    providerCode: "fixture_provider",
    capability: "marketplace_sync" as const,
    credentialVersion: 1,
    keyring: keyring(),
  };
  Object.defineProperty(hostile, "plaintext", { enumerable: true, get() { getterCalled = true; throw new Error("hostile"); } });
  assert.throws(() => sealMerchantProviderCredential(hostile), /provider_credential_crypto_invalid/);
  assert.equal(getterCalled, false);
  assert.throws(() => seal({ keyring: keyring("provider.current", [
    { keyId: "provider.current", key: ACTIVE_KEY },
    { keyId: "provider.retired", key: new Uint8Array(ACTIVE_KEY) },
  ]) }), /provider_credential_crypto_invalid/);
  assert.throws(() => seal({ providerCode: "fixture/provider" }), /provider_credential_crypto_invalid/);
  assert.throws(() => seal({ credentialVersion: 0 }), /provider_credential_crypto_invalid/);
});

test("credential crypto accepts only exact Uint8Array key and plaintext boundaries", () => {
  for (const key of [new Uint8Array(31), new Uint8Array(33), new Uint16Array(32), new DataView(new ArrayBuffer(32))]) {
    assert.throws(() => seal({ keyring: keyring("provider.current", [{ keyId: "provider.current", key: key as unknown as Uint8Array }]) }), /provider_credential_crypto_invalid/);
  }
  for (const plaintext of [new Uint16Array(4), new DataView(new ArrayBuffer(4)), new Uint8Array(0), new Uint8Array(16_385)]) {
    assert.throws(() => seal({ plaintext }), /provider_credential_crypto_invalid/);
  }
});

test("credential crypto zeroizes copied key plaintext and failure-path buffers", () => {
  const sealed = observeBufferZeroization(() => seal());
  assert.equal(sealed.error, undefined);
  assertWiped(sealed.wipes, ACTIVE_KEY);
  assertWiped(sealed.wipes, PLAINTEXT);

  const envelope = sealed.result!;
  const failed = observeBufferZeroization(() => open({ ...envelope, tag: `${envelope.tag[0] === "A" ? "B" : "A"}${envelope.tag.slice(1)}` }));
  assert.match(String(failed.error), /provider_credential_crypto_invalid/);
  assertWiped(failed.wipes, ACTIVE_KEY);
});
