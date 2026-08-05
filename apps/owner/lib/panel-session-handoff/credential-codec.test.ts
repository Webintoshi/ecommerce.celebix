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

function codec(options: {
  keys?: Map<string, Uint8Array>;
  candidates?: Uint8Array[];
  sizes?: number[];
} = {}) {
  const candidates = options.candidates ?? [new Uint8Array(32).fill(0x61)];
  let next = 0;
  return createPanelSessionHandoffCredentialCodec({
    keys: options.keys ?? new Map([[ACTIVE_ID, ACTIVE_KEY], [OLD_ID, OLD_KEY]]),
    activeKeyId: ACTIVE_ID,
    randomBytes(size) {
      options.sizes?.push(size);
      return candidates[next++] ?? candidates.at(-1)!;
    },
  });
}

test("Owner creates opaque random h1 credentials from exactly 32 bytes with the exact digest domain", () => {
  const sizes: number[] = [];
  const random = new Uint8Array(Array.from({ length: 32 }, (_, index) => index));
  const authority = codec({ candidates: [random], sizes });
  const generated = authority.generateCredential();
  const credential = `h1.${ACTIVE_ID}.${Buffer.from(random).toString("base64url")}`;
  assert.deepEqual(generated, {
    credential,
    tokenKeyId: ACTIVE_ID,
    tokenDigest: createHmac("sha256", ACTIVE_KEY)
      .update(`celebix-panel-handoff-digest-v1\n${credential}`, "utf8")
      .digest("hex"),
  });
  assert.deepEqual(sizes, [32]);
  assert.equal(generated.credential.includes(RAW_STATE), false);
  assert.equal("deriveCredential" in authority, false);
});

test("same callback state cannot reconstruct or reproduce independent random candidates", () => {
  const first = new Uint8Array(32).fill(0x11);
  const second = new Uint8Array(32).fill(0x22);
  const authority = codec({ candidates: [first, second] });
  const candidateA = authority.generateCredential();
  const candidateB = authority.generateCredential();
  assert.notEqual(candidateA.credential, candidateB.credential);
  const stateDerivedGuess = createHmac("sha256", ACTIVE_KEY)
    .update(`celebix-panel-handoff-v1\n${RAW_STATE}`, "utf8")
    .digest("base64url");
  assert.notEqual(candidateA.credential, `h1.${ACTIVE_ID}.${stateDerivedGuess}`);
  assert.notEqual(candidateB.credential, `h1.${ACTIVE_ID}.${stateDerivedGuess}`);
});

test("retained old keys verify existing candidates while removed keys fail closed", () => {
  const credential = `h1.${OLD_ID}.${Buffer.from(new Uint8Array(32).fill(0x42)).toString("base64url")}`;
  const expected = createHmac("sha256", OLD_KEY)
    .update(`celebix-panel-handoff-digest-v1\n${credential}`, "utf8")
    .digest("hex");
  assert.deepEqual(codec().digestCredential(credential), { tokenKeyId: OLD_ID, tokenDigest: expected });
  assert.throws(
    () => codec({ keys: new Map([[ACTIVE_ID, ACTIVE_KEY]]) }).digestCredential(credential),
    PanelSessionHandoffCredentialError,
  );
});

test("codec snapshots key and random sources and validates random output exactly", () => {
  const key = new Uint8Array(ACTIVE_KEY);
  const keys = new Map([[ACTIVE_ID, key]]);
  const random = new Uint8Array(32).fill(0x31);
  const source = { randomBytes: (_size: number) => random };
  const authority = createPanelSessionHandoffCredentialCodec({
    keys,
    activeKeyId: ACTIVE_ID,
    randomBytes: source.randomBytes,
  });
  source.randomBytes = () => new Uint8Array(31);
  key.fill(0xff);
  keys.clear();
  const generated = authority.generateCredential();
  random.fill(0xff);
  assert.deepEqual(authority.digestCredential(generated.credential), {
    tokenKeyId: ACTIVE_ID,
    tokenDigest: generated.tokenDigest,
  });
  for (const invalid of [new Uint8Array(31), new Uint8Array(33), "x"] as unknown[]) {
    const invalidCodec = createPanelSessionHandoffCredentialCodec({
      keys: new Map([[ACTIVE_ID, ACTIVE_KEY]]),
      activeKeyId: ACTIVE_ID,
      randomBytes: () => invalid as Uint8Array,
    });
    assert.throws(() => invalidCodec.generateCredential(), PanelSessionHandoffCredentialError);
  }
});
