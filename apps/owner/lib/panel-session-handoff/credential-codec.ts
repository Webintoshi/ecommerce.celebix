import { createHmac } from "node:crypto";

const KEY_ID = /^[A-Za-z0-9._-]{1,64}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const TOKEN_BYTES = 32;
const MAXIMUM_KEYS = 16;
const DIGEST_DOMAIN = "celebix-panel-handoff-digest-v1\n";

export class PanelSessionHandoffCredentialError extends Error {
  constructor() {
    super("panel_session_handoff_credential_invalid");
    this.name = "PanelSessionHandoffCredentialError";
  }
}

export interface PanelSessionHandoffCredentialProof {
  tokenKeyId: string;
  tokenDigest: string;
}

export interface DerivedPanelSessionHandoffCredential extends PanelSessionHandoffCredentialProof {
  credential: string;
}

function validKeyId(value: unknown): value is string {
  return typeof value === "string"
    && KEY_ID.test(value)
    && !value.startsWith(".")
    && !value.endsWith(".")
    && !value.includes("..");
}

function copyKeys(keys: ReadonlyMap<string, Uint8Array>): ReadonlyMap<string, Uint8Array> {
  if (!(keys instanceof Map) || keys.size < 1 || keys.size > MAXIMUM_KEYS) {
    throw new PanelSessionHandoffCredentialError();
  }
  const copied = new Map<string, Uint8Array>();
  for (const [keyId, key] of keys) {
    if (!validKeyId(keyId) || !(key instanceof Uint8Array) || key.byteLength < 32 || key.byteLength > 64) {
      throw new PanelSessionHandoffCredentialError();
    }
    copied.set(keyId, new Uint8Array(key));
  }
  return copied;
}

function parse(credential: unknown): { keyId: string; token: string } {
  if (typeof credential !== "string" || credential.trim() !== credential || !credential.startsWith("h1.")) {
    throw new PanelSessionHandoffCredentialError();
  }
  const separator = credential.length - 44;
  if (separator <= 3 || credential[separator] !== ".") throw new PanelSessionHandoffCredentialError();
  const keyId = credential.slice(3, separator);
  const token = credential.slice(separator + 1);
  if (!validKeyId(keyId) || !TOKEN.test(token)) throw new PanelSessionHandoffCredentialError();
  const decoded = Buffer.from(token, "base64url");
  if (decoded.byteLength !== TOKEN_BYTES || decoded.toString("base64url") !== token) {
    throw new PanelSessionHandoffCredentialError();
  }
  return { keyId, token };
}

function proof(key: Uint8Array, credential: string, tokenKeyId: string): PanelSessionHandoffCredentialProof {
  return Object.freeze({
    tokenKeyId,
    tokenDigest: createHmac("sha256", key).update(`${DIGEST_DOMAIN}${credential}`, "utf8").digest("hex"),
  });
}

export function createPanelSessionHandoffCredentialCodec(input: {
  keys: ReadonlyMap<string, Uint8Array>;
  activeKeyId: string;
  randomBytes(size: number): Uint8Array;
}) {
  if (!input || !validKeyId(input.activeKeyId) || typeof input.randomBytes !== "function") {
    throw new PanelSessionHandoffCredentialError();
  }
  const keys = copyKeys(input.keys);
  const activeKeyId = input.activeKeyId;
  const randomBytes = input.randomBytes;
  if (!keys.has(activeKeyId)) throw new PanelSessionHandoffCredentialError();

  return Object.freeze({
    generateCredential(): DerivedPanelSessionHandoffCredential {
      const key = keys.get(activeKeyId);
      if (!key) throw new PanelSessionHandoffCredentialError();
      const generated = randomBytes(TOKEN_BYTES);
      if (!(generated instanceof Uint8Array) || generated.byteLength !== TOKEN_BYTES) {
        throw new PanelSessionHandoffCredentialError();
      }
      const copied = new Uint8Array(generated);
      const token = Buffer.from(copied).toString("base64url");
      if (!TOKEN.test(token)) throw new PanelSessionHandoffCredentialError();
      const credential = `h1.${activeKeyId}.${token}`;
      return Object.freeze({ credential, ...proof(key, credential, activeKeyId) });
    },

    digestCredential(credential: string): PanelSessionHandoffCredentialProof {
      const parsed = parse(credential);
      const key = keys.get(parsed.keyId);
      if (!key) throw new PanelSessionHandoffCredentialError();
      return proof(key, credential, parsed.keyId);
    },
  });
}
