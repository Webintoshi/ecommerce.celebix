import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  openInvitationDeliveryPayload,
  sealInvitationDeliveryPayload,
  type InvitationDeliveryPayload,
  type InvitationPayloadKeyring,
  type InvitationSealContext,
  type InvitationSealedPayload,
} from "./seal.ts";

function rejectsInvalid(operation: () => unknown): void {
  assert.throws(operation, (error: unknown) => error instanceof Error && error.message === "store_admin_invitation_seal_invalid");
}
const token = Buffer.alloc(32, 5).toString("base64url");
const payload: InvitationDeliveryPayload = Object.freeze({
  token,
  recipient: "recipient@example.com",
  sender: "sender@example.com",
  displayName: "Sadık Ahmet",
  storeName: "Güzide Kuyumcu",
  role: "admin",
  expiresAt: "2020-01-01T00:00:00.000Z",
  acceptanceOrigin: "https://accounts.celebix.co",
});
const context: InvitationSealContext = Object.freeze({
  invitationId: "123e4567-e89b-42d3-a456-426614174000",
  generation: 2,
});

function keyring(activeKeyId = "invite_key_02"): InvitationPayloadKeyring {
  return Object.freeze({
    activeKeyId,
    keys: Object.freeze({
      invite_key_01: Buffer.alloc(32, 1),
      invite_key_02: Buffer.alloc(32, 2),
    }),
  });
}

function digest(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertDecryptUpdateBuffersWiped(mode: "success" | "tampered-tag"): void {
  const sealUrl = new URL("./seal.ts", import.meta.url).href;
  const cryptoWrapper = `
    import { createCipheriv, createDecipheriv as realCreateDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
    globalThis.__invitationDecryptUpdateBuffers = [];
    export { createCipheriv, createHash, randomBytes, timingSafeEqual };
    export function createDecipheriv(...arguments_) {
      const decipher = realCreateDecipheriv(...arguments_);
      return new Proxy(decipher, {
        get(target, property) {
          if (property === "update") {
            return (...updateArguments) => {
              const output = target.update(...updateArguments);
              globalThis.__invitationDecryptUpdateBuffers.push(output);
              return output;
            };
          }
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        }
      });
    }
  `;
  const child = `
    import assert from "node:assert/strict";
    import { createHash } from "node:crypto";
    import { registerHooks } from "node:module";
    const wrapperUrl = ${JSON.stringify(`data:text/javascript,${encodeURIComponent(cryptoWrapper)}`)};
    registerHooks({
      resolve(specifier, context, nextResolve) {
        if (specifier === "node:crypto" && context.parentURL === ${JSON.stringify(sealUrl)}) {
          return { shortCircuit: true, url: wrapperUrl };
        }
        return nextResolve(specifier, context);
      }
    });
    const { openInvitationDeliveryPayload, sealInvitationDeliveryPayload } = await import(${JSON.stringify(sealUrl)});
    const token = Buffer.alloc(32, 5).toString("base64url");
    const payload = { token, recipient: "recipient@example.com", sender: "sender@example.com", displayName: "Sadık Ahmet", storeName: "Güzide Kuyumcu", role: "admin", expiresAt: "2020-01-01T00:00:00.000Z", acceptanceOrigin: "https://accounts.celebix.co" };
    const context = { invitationId: "123e4567-e89b-42d3-a456-426614174000", generation: 2 };
    const keyring = { activeKeyId: "invite_key_02", keys: { invite_key_02: Buffer.alloc(32, 2) } };
    const sealed = sealInvitationDeliveryPayload(payload, context, keyring);
    if (${JSON.stringify(mode)} === "tampered-tag") {
      const bytes = Buffer.from(sealed.bytes);
      bytes[15] ^= 1;
      const tampered = { ...sealed, bytes, digest: createHash("sha256").update(bytes).digest("hex") };
      const bytesBefore = Buffer.from(bytes);
      const keyBefore = Buffer.from(keyring.keys.invite_key_02);
      assert.throws(() => openInvitationDeliveryPayload(tampered, context, keyring), error => error instanceof Error && error.message === "store_admin_invitation_seal_invalid");
      assert.deepEqual(bytes, bytesBefore);
      assert.deepEqual(keyring.keys.invite_key_02, keyBefore);
    } else {
      assert.deepEqual(openInvitationDeliveryPayload(sealed, context, keyring), payload);
    }
    assert.ok(globalThis.__invitationDecryptUpdateBuffers.length > 0);
    assert.equal(globalThis.__invitationDecryptUpdateBuffers.every(buffer => buffer.every(byte => byte === 0)), true, "decrypt update plaintext buffer was not wiped");
  `;
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "--eval", child], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
}

test("delivery payload round trips opaquely with random authenticated envelopes", () => {
  const selected = keyring();
  const keysBefore = Object.fromEntries(Object.entries(selected.keys).map(([id, key]) => [id, Buffer.from(key)]));
  const payloadBefore = structuredClone(payload);
  const contextBefore = structuredClone(context);
  const first = sealInvitationDeliveryPayload(payload, context, selected);
  const second = sealInvitationDeliveryPayload(payload, context, selected);

  assert.equal(first.version, "ai1");
  assert.equal(first.keyId, "invite_key_02");
  assert.match(first.digest, /^[a-f0-9]{64}$/u);
  assert.notDeepEqual(first.bytes, second.bytes);
  assert.equal(first.bytes.includes(Buffer.from(token)), false);
  assert.equal(first.bytes.includes(Buffer.from(payload.recipient)), false);
  assert.deepEqual(openInvitationDeliveryPayload(first, context, selected), payload);
  assert.deepEqual(payload, payloadBefore);
  assert.deepEqual(context, contextBefore);
  assert.deepEqual(selected.keys, keysBefore);
});

test("context, rotation key, metadata, digest, tag, ciphertext, and truncation are authenticated", () => {
  const selected = keyring();
  const sealed = sealInvitationDeliveryPayload(payload, context, selected);
  const mutated = (index: number): InvitationSealedPayload => {
    const bytes = Buffer.from(sealed.bytes);
    bytes[index] ^= 1;
    return { ...sealed, bytes, digest: digest(bytes) };
  };

  for (const operation of [
    () => openInvitationDeliveryPayload(sealed, { ...context, invitationId: "223e4567-e89b-42d3-a456-426614174000" }, selected),
    () => openInvitationDeliveryPayload(sealed, { ...context, generation: 3 }, selected),
    () => openInvitationDeliveryPayload(sealed, context, { activeKeyId: "invite_key_02", keys: { invite_key_02: Buffer.alloc(32, 9) } }),
    () => openInvitationDeliveryPayload({ ...sealed, keyId: "invite_key_01" }, context, selected),
    () => openInvitationDeliveryPayload({ ...sealed, keyId: "unknown_key" }, context, selected),
    () => openInvitationDeliveryPayload({ ...sealed, version: "ai2" as "ai1" }, context, selected),
    () => openInvitationDeliveryPayload({ ...sealed, digest: "0".repeat(64) }, context, selected),
    () => openInvitationDeliveryPayload({ ...sealed, bytes: sealed.bytes.subarray(0, 20), digest: digest(sealed.bytes.subarray(0, 20)) }, context, selected),
    () => openInvitationDeliveryPayload(mutated(3 + 12), context, selected),
    () => openInvitationDeliveryPayload(mutated(sealed.bytes.length - 1), context, selected),
  ]) rejectsInvalid(operation);
});

test("successful decryption wipes the real crypto update plaintext buffer", () => {
  assertDecryptUpdateBuffersWiped("success");
});

test("failed tag authentication wipes the real crypto update plaintext buffer", () => {
  assertDecryptUpdateBuffersWiped("tampered-tag");
});

test("payload validation rejects extra, missing, malformed, oversized, and noncanonical fields", () => {
  const invalidPayloads: unknown[] = [
    { ...payload, extra: true },
    Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "role")),
    { ...payload, token: `${token.slice(0, -1)}h` },
    { ...payload, recipient: "récipient@example.com" },
    { ...payload, sender: "sender@EXAMPLE.com" },
    { ...payload, displayName: " name" },
    { ...payload, displayName: "<name>" },
    { ...payload, storeName: `store\u0000` },
    { ...payload, role: "owner" },
    { ...payload, expiresAt: "2026-01-01T00:00:00+00:00" },
    { ...payload, expiresAt: "not-a-date" },
    { ...payload, acceptanceOrigin: "https://accounts.celebix.co/" },
  ];
  for (const candidate of invalidPayloads) {
    rejectsInvalid(() => sealInvitationDeliveryPayload(candidate as InvitationDeliveryPayload, context, keyring()));
  }
  assert.doesNotThrow(() => sealInvitationDeliveryPayload({
    ...payload,
    storeName: "x".repeat(160),
    displayName: "y".repeat(160),
    recipient: `${"z".repeat(64)}@example.com`,
  }, context, keyring()));
});

test("exact context, envelope, and keyring boundaries fail closed without mutating inputs", () => {
  const selected = keyring();
  const sealed = sealInvitationDeliveryPayload(payload, context, selected);
  for (const operation of [
    () => sealInvitationDeliveryPayload(payload, { ...context, extra: true } as InvitationSealContext, selected),
    () => sealInvitationDeliveryPayload(payload, { ...context, generation: 0 }, selected),
    () => sealInvitationDeliveryPayload(payload, { ...context, invitationId: "" }, selected),
    () => sealInvitationDeliveryPayload(payload, context, { ...selected, extra: true } as InvitationPayloadKeyring),
    () => sealInvitationDeliveryPayload(payload, context, { activeKeyId: "Invite", keys: selected.keys }),
    () => sealInvitationDeliveryPayload(payload, context, { activeKeyId: "missing", keys: selected.keys }),
    () => sealInvitationDeliveryPayload(payload, context, { activeKeyId: "invite_key_02", keys: {} }),
    () => sealInvitationDeliveryPayload(payload, context, { activeKeyId: "invite_key_02", keys: { invite_key_02: Buffer.alloc(31) } }),
    () => sealInvitationDeliveryPayload(payload, context, { activeKeyId: "invite_key_02", keys: { invite_key_02: Buffer.alloc(32), bad: Buffer.alloc(31) } }),
    () => sealInvitationDeliveryPayload(payload, context, { activeKeyId: "invite_key_02", keys: { invite_key_02: Buffer.alloc(32), unexpected: Buffer.alloc(32) }, extra: true } as InvitationPayloadKeyring),
    () => openInvitationDeliveryPayload({ ...sealed, extra: true } as InvitationSealedPayload, context, selected),
  ]) rejectsInvalid(operation);
});

test("oversized payload fields and encrypted envelopes fail while past expiry remains decryptable", () => {
  const baseSize = Buffer.byteLength(JSON.stringify(payload), "utf8");
  const room = 8192 - baseSize;
  const boundary = { ...payload, storeName: "x".repeat(payload.storeName.length + room) };
  rejectsInvalid(() => sealInvitationDeliveryPayload(boundary, context, keyring()));

  const oversizedBytes = Buffer.alloc(3 + 12 + 16 + 8193);
  oversizedBytes.write("ai1", 0, "utf8");
  rejectsInvalid(() => openInvitationDeliveryPayload({
    version: "ai1",
    keyId: "invite_key_02",
    bytes: oversizedBytes,
    digest: digest(oversizedBytes),
  }, context, keyring()));

  const sealed = sealInvitationDeliveryPayload(payload, context, keyring());
  assert.equal(openInvitationDeliveryPayload(sealed, context, keyring()).expiresAt, "2020-01-01T00:00:00.000Z");
});
