import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  PanelSessionHandoffCredentialError,
  createPanelSessionHandoffCredentialCodec,
} from "./credential-codec.ts";

const RAW_STATE = "state_1234567890abcdefghijklmnop";
const ACTIVE_ID = "handoff.active.v1";
const OLD_ID = "handoff.old.v1";
const ACTIVE_KEY = new Uint8Array(32).fill(0x41);
const OLD_KEY = new Uint8Array(48).fill(0x42);

function codec(keys = new Map([[ACTIVE_ID, ACTIVE_KEY], [OLD_ID, OLD_KEY]])) {
  return createPanelSessionHandoffCredentialCodec({ keys, activeKeyId: ACTIVE_ID });
}

test("Owner derives the exact canonical deterministic handoff and a separate complete-credential digest", () => {
  const authority = codec();
  const derived = authority.deriveCredential(RAW_STATE);
  const token = createHmac("sha256", ACTIVE_KEY)
    .update(`celebix-panel-handoff-v1\n${RAW_STATE}`, "utf8")
    .digest("base64url");
  const credential = `h1.${ACTIVE_ID}.${token}`;
  assert.deepEqual(derived, {
    credential,
    tokenKeyId: ACTIVE_ID,
    tokenDigest: createHmac("sha256", ACTIVE_KEY)
      .update(`celebix-panel-handoff-digest-v1\n${credential}`, "utf8")
      .digest("hex"),
  });
  assert.deepEqual(authority.deriveCredential(RAW_STATE), derived);
  assert.notEqual(authority.deriveCredential(`${RAW_STATE}x`).credential, credential);
});

test("stored old key IDs reproduce handoffs while removed, invalid, or excessive keys fail closed", () => {
  const retained = codec().deriveCredential(RAW_STATE, OLD_ID);
  assert.equal(retained.tokenKeyId, OLD_ID);
  assert.deepEqual(codec().digestCredential(retained.credential), {
    tokenKeyId: OLD_ID,
    tokenDigest: retained.tokenDigest,
  });
  assert.throws(
    () => codec(new Map([[ACTIVE_ID, ACTIVE_KEY]])).deriveCredential(RAW_STATE, OLD_ID),
    PanelSessionHandoffCredentialError,
  );
  assert.throws(
    () => codec(new Map(Array.from({ length: 17 }, (_, index) => [`key.${index}`, new Uint8Array(32)]))),
    PanelSessionHandoffCredentialError,
  );
  for (const state of ["", "short", "x".repeat(1025)]) {
    assert.throws(() => codec().deriveCredential(state), PanelSessionHandoffCredentialError);
  }
});

test("Owner codec copies key bytes and never includes raw state in errors", () => {
  const key = new Uint8Array(ACTIVE_KEY);
  const keys = new Map([[ACTIVE_ID, key]]);
  const authority = codec(keys);
  const derived = authority.deriveCredential(RAW_STATE);
  key.fill(0xff);
  keys.clear();
  assert.deepEqual(authority.digestCredential(derived.credential), {
    tokenKeyId: ACTIVE_ID,
    tokenDigest: derived.tokenDigest,
  });
  assert.throws(
    () => authority.deriveCredential("short"),
    (error: unknown) => !String(error).includes("short") && !String(error).includes(RAW_STATE),
  );
});
