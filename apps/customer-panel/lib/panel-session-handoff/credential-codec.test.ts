import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  PanelSessionHandoffCredentialError,
  createPanelSessionHandoffCredentialVerifier,
} from "./credential-codec.ts";

const KEY_ID = "handoff.active.v1";
const KEY = new Uint8Array(32).fill(0x41);
const RAW_STATE = "state_1234567890abcdefghijklmnop";
const TOKEN = createHmac("sha256", KEY)
  .update(`celebix-panel-handoff-v1\n${RAW_STATE}`, "utf8")
  .digest("base64url");
const CREDENTIAL = `h1.${KEY_ID}.${TOKEN}`;

test("customer verifier accepts only canonical handoffs and returns the separate complete-credential digest", () => {
  const verifier = createPanelSessionHandoffCredentialVerifier({ keys: new Map([[KEY_ID, KEY]]) });
  assert.deepEqual(verifier.digestCredential(CREDENTIAL), {
    tokenKeyId: KEY_ID,
    tokenDigest: createHmac("sha256", KEY)
      .update(`celebix-panel-handoff-digest-v1\n${CREDENTIAL}`, "utf8")
      .digest("hex"),
  });
  for (const candidate of ["", `h2.${KEY_ID}.${TOKEN}`, `${CREDENTIAL}=`, ` ${CREDENTIAL}`, `${CREDENTIAL}A`]) {
    assert.throws(() => verifier.digestCredential(candidate), PanelSessionHandoffCredentialError);
  }
});

test("customer verifier accepts explicitly retained keys and rejects removed keys without pool authority", () => {
  const oldId = "handoff.old.v1";
  const oldKey = new Uint8Array(64).fill(0x52);
  const oldCredential = `h1.${oldId}.${createHmac("sha256", oldKey).update(`celebix-panel-handoff-v1\n${RAW_STATE}`).digest("base64url")}`;
  assert.equal(
    createPanelSessionHandoffCredentialVerifier({ keys: new Map([[KEY_ID, KEY], [oldId, oldKey]]) })
      .digestCredential(oldCredential).tokenKeyId,
    oldId,
  );
  assert.throws(
    () => createPanelSessionHandoffCredentialVerifier({ keys: new Map([[KEY_ID, KEY]]) }).digestCredential(oldCredential),
    PanelSessionHandoffCredentialError,
  );
});
