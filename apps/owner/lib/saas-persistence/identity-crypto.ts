import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

const AES_KEY_BYTES = 32;
const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;

export class IdentityCryptoError extends Error {
  constructor() {
    super("identity_crypto_failed");
    this.name = "IdentityCryptoError";
  }
}

function copyAesKey(value: Uint8Array | undefined): Buffer {
  if (!value || value.byteLength !== AES_KEY_BYTES) throw new IdentityCryptoError();
  return Buffer.from(value);
}

function copyHmacKey(value: Uint8Array | undefined): Buffer {
  if (!value || value.byteLength < 32) throw new IdentityCryptoError();
  return Buffer.from(value);
}

function requiredText(value: string): string {
  if (typeof value !== "string" || !value || value.length > 256) throw new IdentityCryptoError();
  return value;
}

export interface OpaqueStateDigester {
  digest(rawState: string): string;
}

export function createOpaqueStateDigester(input: {
  key: Uint8Array;
  context: string;
}): OpaqueStateDigester {
  const key = copyHmacKey(input.key);
  const context = requiredText(input.context);
  return Object.freeze({
    digest(rawState: string) {
      const state = requiredText(rawState);
      return createHmac("sha256", key)
        .update("celebix-saas-state-v1\0", "utf8")
        .update(context, "utf8")
        .update("\0", "utf8")
        .update(state, "utf8")
        .digest("hex");
    },
  });
}

export interface PayloadBinding {
  purpose: string;
  stateDigest: string;
  schemaVersion: number;
  recordId?: string;
}

export interface EncryptedPayload {
  keyId: string;
  iv: Uint8Array;
  ciphertext: Uint8Array;
}

export interface AuthenticatedPayloadCipher {
  encrypt(input: { binding: PayloadBinding; payload: unknown }): EncryptedPayload;
  decrypt(input: { binding: PayloadBinding; encrypted: EncryptedPayload }): unknown;
}

function aad(binding: PayloadBinding): Buffer {
  if (!/^[a-f0-9]{64}$/.test(binding.stateDigest)) throw new IdentityCryptoError();
  if (!Number.isSafeInteger(binding.schemaVersion) || binding.schemaVersion < 1 || binding.schemaVersion > 32767) {
    throw new IdentityCryptoError();
  }
  const canonical = JSON.stringify({
    version: 1,
    purpose: requiredText(binding.purpose),
    stateDigest: binding.stateDigest,
    payloadSchemaVersion: binding.schemaVersion,
    recordId: binding.recordId === undefined ? null : requiredText(binding.recordId),
  });
  return Buffer.from(canonical, "utf8");
}

export function createAes256GcmPayloadCipher(input: {
  currentKeyId: string;
  resolveKey(keyId: string): Uint8Array | undefined;
}): AuthenticatedPayloadCipher {
  const currentKeyId = requiredText(input.currentKeyId);
  if (typeof input.resolveKey !== "function") throw new IdentityCryptoError();

  return Object.freeze({
    encrypt({ binding, payload }: { binding: PayloadBinding; payload: unknown }): EncryptedPayload {
      try {
        const key = copyAesKey(input.resolveKey(currentKeyId));
        const iv = randomBytes(GCM_IV_BYTES);
        const engine = createCipheriv("aes-256-gcm", key, iv, { authTagLength: GCM_TAG_BYTES });
        engine.setAAD(aad(binding));
        const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
        const body = Buffer.concat([engine.update(plaintext), engine.final()]);
        return { keyId: currentKeyId, iv, ciphertext: Buffer.concat([body, engine.getAuthTag()]) };
      } catch {
        throw new IdentityCryptoError();
      }
    },
    decrypt({ binding, encrypted }: { binding: PayloadBinding; encrypted: EncryptedPayload }): unknown {
      try {
        const keyId = requiredText(encrypted.keyId);
        const key = copyAesKey(input.resolveKey(keyId));
        const iv = Buffer.from(encrypted.iv);
        const combined = Buffer.from(encrypted.ciphertext);
        if (iv.length !== GCM_IV_BYTES || combined.length <= GCM_TAG_BYTES) throw new IdentityCryptoError();
        const engine = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: GCM_TAG_BYTES });
        engine.setAAD(aad(binding));
        engine.setAuthTag(combined.subarray(combined.length - GCM_TAG_BYTES));
        const plaintext = Buffer.concat([
          engine.update(combined.subarray(0, combined.length - GCM_TAG_BYTES)),
          engine.final(),
        ]).toString("utf8");
        return JSON.parse(plaintext) as unknown;
      } catch {
        throw new IdentityCryptoError();
      }
    },
  });
}
