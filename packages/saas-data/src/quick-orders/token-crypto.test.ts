import assert from "node:assert/strict";
import test from "node:test";

import {
  digestQuickLinkToken,
  generateQuickLinkToken,
  openQuickLinkSecret,
  sealQuickLinkSecret,
  type QuickLinkKeyring,
  type SealedEnvelope,
} from "./index.ts";

const STORE_ID = "11111111-1111-4111-8111-111111111111";
const OBJECT_ID = "22222222-2222-4222-8222-222222222222";
const TOKEN = Buffer.alloc(32, 0x41).toString("base64url");
const DIGEST = "b".repeat(64);
const ACTIVE_KEY = new Uint8Array(32).fill(0x11);
const RETIRED_KEY = new Uint8Array(32).fill(0x22);

function keyring(activeKeyId = "active-v1", keys: QuickLinkKeyring["keys"] = [
  { keyId: "active-v1", key: ACTIVE_KEY },
]): QuickLinkKeyring {
  return { activeKeyId, keys };
}

function seal(overrides: Record<string, unknown> = {}): SealedEnvelope {
  return sealQuickLinkSecret({
    plaintext: TOKEN,
    purpose: "link-token",
    storeId: STORE_ID,
    objectId: OBJECT_ID,
    digest: DIGEST,
    keyring: keyring(),
    ...overrides,
  } as Parameters<typeof sealQuickLinkSecret>[0]);
}

function open(envelope: SealedEnvelope, overrides: Record<string, unknown> = {}): string {
  return openQuickLinkSecret({
    envelope,
    purpose: "link-token",
    storeId: STORE_ID,
    objectId: OBJECT_ID,
    digest: DIGEST,
    keyring: keyring(),
    ...overrides,
  } as Parameters<typeof openQuickLinkSecret>[0]);
}

function observeZeroization<T>(operation: () => T): Readonly<{
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

function assertWiped(wipes: readonly Readonly<{ before: Buffer; target: Buffer }>[], secret: Uint8Array): void {
  const match = wipes.find(({ before }) => before.equals(secret));
  assert.ok(match, "expected secret buffer to be zeroized");
  assert.equal(match.target.every((byte) => byte === 0), true);
}

test("quick link crypto generates exactly 32 random canonical base64url bytes", () => {
  const calls: number[] = [];
  const source = Buffer.alloc(32, 0x41);
  const token = generateQuickLinkToken((size) => {
    calls.push(size);
    return source;
  });
  assert.deepEqual(calls, [32]);
  assert.equal(token, TOKEN);
  assert.equal(Buffer.from(token, "base64url").byteLength, 32);
  assert.equal(Buffer.from(token, "base64url").toString("base64url"), token);
  assert.equal(source.every((byte) => byte === 0), true);
  for (const size of [31, 33]) {
    const invalidSource = Buffer.alloc(size, 0x42);
    assert.throws(() => generateQuickLinkToken(() => invalidSource), /quick_link_crypto_invalid/);
    assert.equal(invalidSource.every((byte) => byte === 0), true);
  }
  assert.throws(() => generateQuickLinkToken(() => "not-bytes" as unknown as Buffer), /quick_link_crypto_invalid/);
});

test("quick link crypto digests only canonical 32-byte tokens to lowercase SHA-256", () => {
  assert.equal(digestQuickLinkToken(TOKEN), "aebddc7466d56ad82b5797e7bb90a4224bfa2bd3c12d364d88fc2416854009dc");
  for (const token of ["", `${TOKEN}=`, TOKEN.slice(0, -1), `${TOKEN}A`, "é".repeat(32)]) {
    assert.throws(() => digestQuickLinkToken(token), /quick_link_crypto_invalid/);
  }
});

test("quick link crypto seals with the active key and opens an immutable exact envelope", () => {
  const envelope = seal();
  assert.deepEqual(Object.keys(envelope), ["algorithm", "ciphertext", "iv", "keyId", "tag", "version"]);
  assert.equal(envelope.algorithm, "A256GCM");
  assert.equal(envelope.keyId, "active-v1");
  assert.equal(envelope.version, 1);
  assert.equal(Buffer.from(envelope.iv, "base64url").byteLength, 12);
  assert.equal(Buffer.from(envelope.tag, "base64url").byteLength, 16);
  assert.equal(Object.isFrozen(envelope), true);
  assert.equal(open(envelope), TOKEN);
});

test("quick link crypto decrypts retired envelopes while new seals use only the active key", () => {
  const oldEnvelope = seal({ keyring: keyring("retired-v1", [{ keyId: "retired-v1", key: RETIRED_KEY }]) });
  const rotated = keyring("active-v2", [
    { keyId: "active-v2", key: ACTIVE_KEY },
    { keyId: "retired-v1", key: RETIRED_KEY },
  ]);
  assert.equal(open(oldEnvelope, { keyring: rotated }), TOKEN);
  assert.equal(seal({ keyring: rotated }).keyId, "active-v2");
});

test("quick link crypto rejects invalid 31-byte and 33-byte key material", () => {
  for (const key of [new Uint8Array(31), new Uint8Array(33)]) {
    assert.throws(() => seal({ keyring: keyring("active-v1", [{ keyId: "active-v1", key }]) }), /quick_link_crypto_invalid/);
  }
  let getterCalled = 0;
  class KeySubclass extends Uint8Array {}
  const accessorKey = new KeySubclass(32).fill(0x11);
  for (const property of ["buffer", "byteLength", "byteOffset", "length", "values"] as const) Object.defineProperty(accessorKey, property, {
    get() {
      getterCalled += 1;
      throw new Error("hostile");
    },
  });
  const envelope = seal({ keyring: keyring("active-v1", [{ keyId: "active-v1", key: accessorKey }]) });
  assert.equal(open(envelope, { keyring: keyring("active-v1", [{ keyId: "active-v1", key: Buffer.alloc(32, 0x11) }]) }), TOKEN);
  assert.equal(getterCalled, 0);
  for (const foreignKey of [
    new Uint16Array(32),
    new Uint8ClampedArray(32),
    new Int8Array(32),
    new DataView(new ArrayBuffer(32)),
    new Proxy(new Uint8Array(32), {}),
  ]) {
    assert.throws(
      () => seal({ keyring: keyring("active-v1", [{ keyId: "active-v1", key: foreignKey as unknown as Uint8Array }]) }),
      /quick_link_crypto_invalid/,
    );
  }
});

test("quick link crypto rejects duplicate IDs missing active keys and duplicate bytes", () => {
  const cases: QuickLinkKeyring[] = [
    keyring("missing", [{ keyId: "active-v1", key: ACTIVE_KEY }]),
    keyring("active-v1", [
      { keyId: "active-v1", key: ACTIVE_KEY },
      { keyId: "active-v1", key: RETIRED_KEY },
    ]),
    keyring("active-v1", [
      { keyId: "active-v1", key: ACTIVE_KEY },
      { keyId: "retired-v1", key: new Uint8Array(ACTIVE_KEY) },
    ]),
  ];
  for (const value of cases) assert.throws(() => seal({ keyring: value }), /quick_link_crypto_invalid/);
});

test("quick link crypto rejects an envelope whose retired key is unknown", () => {
  const envelope = seal();
  assert.throws(() => open({ ...envelope, keyId: "retired-unknown" }), /quick_link_crypto_invalid/);
});

test("quick link crypto authenticates every exact AAD field including persisted key ID", () => {
  const envelope = seal();
  const cases = [
    { purpose: "provider-token" },
    { storeId: "33333333-3333-4333-8333-333333333333" },
    { objectId: "44444444-4444-4444-8444-444444444444" },
    { digest: "c".repeat(64) },
  ];
  for (const overrides of cases) assert.throws(() => open(envelope, overrides), /quick_link_crypto_invalid/);
});

test("quick link crypto rejects changed ciphertext tag and IV", () => {
  const envelope = seal();
  const flip = (value: string) => `${value[0] === "A" ? "B" : "A"}${value.slice(1)}`;
  for (const changed of [
    { ...envelope, ciphertext: flip(envelope.ciphertext) },
    { ...envelope, tag: flip(envelope.tag) },
    { ...envelope, iv: flip(envelope.iv) },
  ]) {
    assert.throws(() => open(changed), /quick_link_crypto_invalid/);
  }
  const failed = observeZeroization(() => open({ ...envelope, tag: flip(envelope.tag) }));
  assert.match(String(failed.error), /quick_link_crypto_invalid/);
  assertWiped(failed.wipes, ACTIVE_KEY);
  assertWiped(failed.wipes, Buffer.from(TOKEN, "utf8"));
});

test("quick link crypto rejects noncanonical exact-key and hostile inputs without invoking getters", () => {
  const envelope = seal();
  let getterCalled = false;
  const hostile = {
    plaintext: TOKEN,
    purpose: "link-token",
    storeId: STORE_ID,
    objectId: OBJECT_ID,
    digest: DIGEST,
    keyring: keyring(),
  };
  Object.defineProperty(hostile, "plaintext", { enumerable: true, get() { getterCalled = true; throw new Error("hostile"); } });
  const ordinary = {
    plaintext: TOKEN,
    purpose: "link-token",
    storeId: STORE_ID,
    objectId: OBJECT_ID,
    digest: DIGEST,
    keyring: keyring(),
  };
  for (const input of [
    { ...ordinary, unexpected: true },
    hostile,
    [],
    new Proxy(ordinary, { ownKeys() { throw new Error("hostile"); } }),
  ]) {
    assert.throws(() => sealQuickLinkSecret(input as Parameters<typeof sealQuickLinkSecret>[0]), /quick_link_crypto_invalid/);
  }
  for (const changed of [
    { ...envelope, ciphertext: `${envelope.ciphertext}=` },
    { ...envelope, iv: `${envelope.iv}=` },
    { ...envelope, tag: `${envelope.tag}=` },
    { ...envelope, version: 2 },
    { ...envelope, unexpected: true },
  ]) {
    assert.throws(() => open(changed as SealedEnvelope), /quick_link_crypto_invalid/);
  }
  assert.equal(getterCalled, false);
});

test("quick link crypto copies key bytes and leaves every caller input mutable and unchanged", () => {
  const mutableKey = new Uint8Array(ACTIVE_KEY);
  const mutableKeyring = keyring("active-v1", [{ keyId: "active-v1", key: mutableKey }]);
  const input = {
    plaintext: TOKEN,
    purpose: "link-token" as const,
    storeId: STORE_ID,
    objectId: OBJECT_ID,
    digest: DIGEST,
    keyring: mutableKeyring,
  };
  const before = new Uint8Array(mutableKey);
  const sealed = observeZeroization(() => sealQuickLinkSecret(input));
  assert.equal(sealed.error, undefined);
  const envelope = sealed.result!;
  assertWiped(sealed.wipes, mutableKey);
  assertWiped(sealed.wipes, Buffer.from(TOKEN, "utf8"));
  assert.deepEqual(mutableKey, before);
  assert.equal(Object.isFrozen(input), false);
  assert.equal(Object.isFrozen(mutableKeyring), false);
  assert.equal(Object.isFrozen(mutableKey), false);
  const opened = observeZeroization(() => open(envelope, { keyring: mutableKeyring }));
  assert.equal(opened.error, undefined);
  assert.equal(opened.result, TOKEN);
  assertWiped(opened.wipes, mutableKey);
  assertWiped(opened.wipes, Buffer.from(TOKEN, "utf8"));
});

test("quick link crypto re-encryption preserves the original raw token", () => {
  const first = seal();
  const recovered = open(first);
  const second = seal({ plaintext: recovered });
  assert.equal(open(second), TOKEN);
  assert.equal(digestQuickLinkToken(open(second)), digestQuickLinkToken(TOKEN));
  assert.notEqual(first.iv, second.iv);
});
