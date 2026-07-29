import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalPanelBrowserBindingCredential,
  createPanelBrowserBindingCredentialGenerator,
} from "./credential-codec.ts";

const TOKEN = Buffer.alloc(32, 0x5a).toString("base64url");

test("generates the exact pb1 credential from exactly 32 injected random bytes", () => {
  const calls: number[] = [];
  const generator = createPanelBrowserBindingCredentialGenerator((size) => {
    calls.push(size);
    return Buffer.alloc(size, 0x5a);
  });
  assert.equal(generator.generate(), `pb1.${TOKEN}`);
  assert.deepEqual(calls, [32]);
});

test("rejects malformed, whitespace, percent-encoded, non-canonical, and mutable random output", () => {
  for (const value of [
    "pb1.bad",
    `pb1.${TOKEN} `,
    `pb1.${TOKEN}%3D`,
    `pb1.${"a".repeat(42)}=`,
    `pb1.${"a".repeat(44)}`,
  ]) assert.throws(() => canonicalPanelBrowserBindingCredential(value), /panel_browser_binding_credential_invalid/);

  const bytes = Buffer.alloc(32, 0x5a);
  const generator = createPanelBrowserBindingCredentialGenerator(() => bytes);
  assert.equal(generator.generate(), `pb1.${TOKEN}`);
  bytes.fill(0x01);
  assert.equal(generator.generate(), `pb1.${Buffer.alloc(32, 0x01).toString("base64url")}`);
  assert.throws(
    () => createPanelBrowserBindingCredentialGenerator(() => Buffer.alloc(31)).generate(),
    /panel_browser_binding_credential_invalid/,
  );
});
