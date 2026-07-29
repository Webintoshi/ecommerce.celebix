import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  PanelSessionCredentialError,
  createPanelSessionCredentialCodec,
} from "./credential-codec.ts";

const ACTIVE_KEY_ID = "panel.active.v1";
const ACTIVE_KEY = new Uint8Array(32).fill(0x11);
const OLD_KEY = new Uint8Array(48).fill(0x22);
const TOKEN = new Uint8Array(32).map((_, index) => index);
const HANDOFF = `h1.handoff.active.v1.${Buffer.from(new Uint8Array(32).fill(0x33)).toString("base64url")}`;

function codec(overrides: Record<string, unknown> = {}) {
  return createPanelSessionCredentialCodec({
    activeKeyId: ACTIVE_KEY_ID,
    keys: new Map([
      [ACTIVE_KEY_ID, ACTIVE_KEY],
      ["panel.old.v1", OLD_KEY],
    ]),
    randomBytes: (size: number) => {
      assert.equal(size, 32);
      return TOKEN;
    },
    ...overrides,
  });
}

test("issues one exact canonical v1 credential from exactly 32 random bytes", () => {
  let requested = 0;
  const authority = codec({
    randomBytes(size: number) {
      requested = size;
      return TOKEN;
    },
  });
  const issued = authority.issueCredential();
  assert.equal(requested, 32);
  assert.equal(issued.credential, `v1.${ACTIVE_KEY_ID}.${Buffer.from(TOKEN).toString("base64url")}`);
  assert.match(issued.credential.split(".").at(-1) ?? "", /^[A-Za-z0-9_-]{43}$/);
  assert.equal(issued.tokenKeyId, ACTIVE_KEY_ID);
  assert.match(issued.tokenDigest, /^[a-f0-9]{64}$/);
});

test("uses the exact HMAC-SHA-256 credential preimage", () => {
  const issued = codec().issueCredential();
  const expected = createHmac("sha256", ACTIVE_KEY)
    .update(`celebix-panel-session-v1\n${issued.credential}`, "utf8")
    .digest("hex");
  assert.equal(issued.tokenDigest, expected);
  assert.deepEqual(codec().digestCredential(issued.credential), {
    tokenKeyId: ACTIVE_KEY_ID,
    tokenDigest: expected,
  });
});

test("strict parsing rejects alternate versions, separators, padding, encoding, and token lengths", () => {
  const authority = codec();
  const validToken = Buffer.from(TOKEN).toString("base64url");
  for (const candidate of [
    `v2.${ACTIVE_KEY_ID}.${validToken}`,
    `v1..${ACTIVE_KEY_ID}.${validToken}`,
    `v1.${ACTIVE_KEY_ID}.${validToken}=`,
    `v1.${ACTIVE_KEY_ID}.${validToken.slice(0, -1)}%41`,
    `v1.${ACTIVE_KEY_ID}.${validToken.slice(1)}`,
    `v1.${ACTIVE_KEY_ID}.${validToken}A`,
    ` v1.${ACTIVE_KEY_ID}.${validToken}`,
  ]) {
    assert.throws(() => authority.digestCredential(candidate), PanelSessionCredentialError);
  }
});

test("rejects invalid and unknown key identifiers without leaking the candidate", () => {
  const validToken = Buffer.from(TOKEN).toString("base64url");
  for (const keyId of ["bad key", "x".repeat(65), "removed.v1"]) {
    const candidate = `v1.${keyId}.${validToken}`;
    assert.throws(
      () => codec().digestCredential(candidate),
      (error: unknown) => {
        assert.equal(error instanceof PanelSessionCredentialError, true);
        assert.equal(String(error).includes(candidate), false);
        assert.equal(String(error).includes(validToken), false);
        return true;
      },
    );
  }
});

test("rejects short, oversized, empty, and excessive verification key sets", () => {
  const cases = [
    new Map([[ACTIVE_KEY_ID, new Uint8Array(31)]]),
    new Map([[ACTIVE_KEY_ID, new Uint8Array(65)]]),
    new Map<string, Uint8Array>(),
    new Map(Array.from({ length: 17 }, (_, index) => [`key.${index}`, new Uint8Array(32)])),
  ];
  for (const keys of cases) {
    assert.throws(() => codec({ keys }), PanelSessionCredentialError);
  }
});

test("new credentials use only the active key while an injected old key remains verifiable", () => {
  const authority = codec();
  assert.equal(authority.issueCredential().tokenKeyId, ACTIVE_KEY_ID);
  const oldCredential = `v1.panel.old.v1.${Buffer.from(TOKEN).toString("base64url")}`;
  assert.deepEqual(authority.digestCredential(oldCredential), {
    tokenKeyId: "panel.old.v1",
    tokenDigest: createHmac("sha256", OLD_KEY)
      .update(`celebix-panel-session-v1\n${oldCredential}`, "utf8")
      .digest("hex"),
  });
  assert.throws(
    () => codec({ keys: new Map([[ACTIVE_KEY_ID, ACTIVE_KEY]]) }).digestCredential(oldCredential),
    PanelSessionCredentialError,
  );
});

test("derives one deterministic panel credential from a complete handoff with a separate HMAC domain", () => {
  const authority = codec();
  const derived = authority.deriveCredentialFromHandoff(HANDOFF, ACTIVE_KEY_ID);
  const expectedToken = createHmac("sha256", ACTIVE_KEY)
    .update(`celebix-panel-session-from-handoff-v1\n${HANDOFF}`, "utf8")
    .digest("base64url");
  assert.deepEqual(derived, {
    credential: `v1.${ACTIVE_KEY_ID}.${expectedToken}`,
    tokenKeyId: ACTIVE_KEY_ID,
    tokenDigest: createHmac("sha256", ACTIVE_KEY)
      .update(`celebix-panel-session-v1\nv1.${ACTIVE_KEY_ID}.${expectedToken}`, "utf8")
      .digest("hex"),
  });
  assert.deepEqual(authority.deriveCredentialFromHandoff(HANDOFF, ACTIVE_KEY_ID), derived);
  assert.notEqual(
    authority.deriveCredentialFromHandoff(`${HANDOFF.slice(0, -1)}A`, ACTIVE_KEY_ID).credential,
    derived.credential,
  );
});

test("retained session keys rederive an existing handoff and removed or malformed authorities fail closed", () => {
  const retained = codec().deriveCredentialFromHandoff(HANDOFF, "panel.old.v1");
  assert.equal(retained.tokenKeyId, "panel.old.v1");
  assert.throws(
    () => codec({ keys: new Map([[ACTIVE_KEY_ID, ACTIVE_KEY]]) })
      .deriveCredentialFromHandoff(HANDOFF, "panel.old.v1"),
    PanelSessionCredentialError,
  );
  for (const candidate of ["", "h1.bad", `${HANDOFF}=`, `v1.${HANDOFF}`]) {
    assert.throws(
      () => codec().deriveCredentialFromHandoff(candidate, ACTIVE_KEY_ID),
      PanelSessionCredentialError,
    );
  }
});

test("copies the key map, key bytes, and issued random bytes at construction and use", () => {
  const active = new Uint8Array(ACTIVE_KEY);
  const keys = new Map([[ACTIVE_KEY_ID, active]]);
  const random = new Uint8Array(TOKEN);
  const authority = codec({ keys, randomBytes: () => random });
  const first = authority.issueCredential();
  active.fill(0xff);
  keys.clear();
  random.fill(0xff);
  assert.deepEqual(authority.digestCredential(first.credential), {
    tokenKeyId: first.tokenKeyId,
    tokenDigest: first.tokenDigest,
  });
});

test("fails closed when the random source does not return exactly 32 bytes", () => {
  for (const size of [0, 31, 33]) {
    assert.throws(
      () => codec({ randomBytes: () => new Uint8Array(size) }).issueCredential(),
      PanelSessionCredentialError,
    );
  }
});
