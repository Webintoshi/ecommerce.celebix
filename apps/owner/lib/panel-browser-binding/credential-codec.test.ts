import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { createPanelBrowserBindingAuthorityCodec } from "./credential-codec.ts";

const ACTIVE = Buffer.alloc(32, 0x41);
const OLD = Buffer.alloc(48, 0x42);
const TOKEN = Buffer.alloc(32, 0x51).toString("base64url");

function digest(key: Uint8Array, domain: string, credential: string): string {
  return createHmac("sha256", key).update(`${domain}\n${credential}`, "utf8").digest("hex");
}

test("creates exact bs1 credentials and domain-separated bootstrap digests from 32 random bytes", () => {
  const calls: number[] = [];
  const codec = createPanelBrowserBindingAuthorityCodec({
    bootstrapKeys: new Map([["active", ACTIVE], ["old", OLD]]),
    activeBootstrapKeyId: "active",
    browserBindingKeys: new Map([["active", ACTIVE], ["old", OLD]]),
    activeBrowserBindingKeyId: "active",
    randomBytes(size) { calls.push(size); return Buffer.alloc(size, 0x51); },
  });
  const candidate = codec.generateBootstrapCredential();
  assert.deepEqual(candidate, {
    credential: `bs1.active.${TOKEN}`,
    keyId: "active",
    digest: digest(ACTIVE, "celebix-panel-browser-bootstrap-digest-v1", `bs1.active.${TOKEN}`),
  });
  assert.deepEqual(calls, [32]);
});

test("copies all key bytes and rejects wrong, removed, malformed, excessive, and short keys safely", () => {
  const mutable = Buffer.alloc(32, 0x41);
  const codec = createPanelBrowserBindingAuthorityCodec({
    bootstrapKeys: new Map([["active", mutable]]),
    activeBootstrapKeyId: "active",
    browserBindingKeys: new Map([["binding", mutable]]),
    activeBrowserBindingKeyId: "binding",
    randomBytes: () => Buffer.alloc(32, 0x51),
  });
  const credential = `bs1.active.${TOKEN}`;
  const before = codec.digestBootstrapCredential(credential);
  mutable.fill(0x00);
  assert.deepEqual(codec.digestBootstrapCredential(credential), before);
  for (const value of [`bs1.missing.${TOKEN}`, "bs1.bad", `${credential} `]) {
    assert.throws(() => codec.digestBootstrapCredential(value), /panel_browser_binding_authority_invalid/);
  }
  assert.throws(() => createPanelBrowserBindingAuthorityCodec({
    bootstrapKeys: new Map(Array.from({ length: 17 }, (_, index) => [`k${index}`, ACTIVE])),
    activeBootstrapKeyId: "k0",
    browserBindingKeys: new Map([["binding", ACTIVE]]),
    activeBrowserBindingKeyId: "binding",
    randomBytes: () => Buffer.alloc(32),
  }), /panel_browser_binding_authority_invalid/);
  assert.throws(() => createPanelBrowserBindingAuthorityCodec({
    bootstrapKeys: new Map([["active", Buffer.alloc(31)]]),
    activeBootstrapKeyId: "active",
    browserBindingKeys: new Map([["binding", ACTIVE]]),
    activeBrowserBindingKeyId: "binding",
    randomBytes: () => Buffer.alloc(32),
  }), /panel_browser_binding_authority_invalid/);
});

test("derives one active binding digest and at most 16 claim candidates with the exact domain", () => {
  const codec = createPanelBrowserBindingAuthorityCodec({
    bootstrapKeys: new Map([["active", ACTIVE]]),
    activeBootstrapKeyId: "active",
    browserBindingKeys: new Map([["old", OLD], ["active", ACTIVE]]),
    activeBrowserBindingKeyId: "active",
    randomBytes: () => Buffer.alloc(32, 0x51),
  });
  const credential = `pb1.${TOKEN}`;
  assert.deepEqual(codec.digestBrowserBindingCredential(credential), {
    keyId: "active",
    digest: digest(ACTIVE, "celebix-panel-browser-binding-digest-v1", credential),
  });
  assert.deepEqual(codec.digestBrowserBindingCredentialCandidates(credential), [
    { keyId: "active", digest: digest(ACTIVE, "celebix-panel-browser-binding-digest-v1", credential) },
    { keyId: "old", digest: digest(OLD, "celebix-panel-browser-binding-digest-v1", credential) },
  ]);
  assert.throws(() => codec.digestBrowserBindingCredential(`pb1.${"a".repeat(42)}=`), /panel_browser_binding_authority_invalid/);
});
