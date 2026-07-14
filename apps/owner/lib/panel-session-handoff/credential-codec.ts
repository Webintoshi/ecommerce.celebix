import { createHmac } from "node:crypto";

const KEY_ID = /^[A-Za-z0-9._-]{1,64}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const TOKEN_BYTES = 32;
const MAXIMUM_KEYS = 16;
const TOKEN_DOMAIN = "celebix-panel-handoff-v1\n";
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

function rawState(value: unknown): string {
  if (typeof value !== "string" || value.trim() !== value || value.length < 16 || value.length > 1024) {
    throw new PanelSessionHandoffCredentialError();
  }
  return value;
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
}) {
  if (!input || !validKeyId(input.activeKeyId)) throw new PanelSessionHandoffCredentialError();
  const keys = copyKeys(input.keys);
  const activeKeyId = input.activeKeyId;
  if (!keys.has(activeKeyId)) throw new PanelSessionHandoffCredentialError();

  return Object.freeze({
    deriveCredential(state: string, selectedKeyId = activeKeyId): DerivedPanelSessionHandoffCredential {
      const canonicalState = rawState(state);
      if (!validKeyId(selectedKeyId)) throw new PanelSessionHandoffCredentialError();
      const key = keys.get(selectedKeyId);
      if (!key) throw new PanelSessionHandoffCredentialError();
      const token = createHmac("sha256", key).update(`${TOKEN_DOMAIN}${canonicalState}`, "utf8").digest("base64url");
      if (!TOKEN.test(token)) throw new PanelSessionHandoffCredentialError();
      const credential = `h1.${selectedKeyId}.${token}`;
      return Object.freeze({ credential, ...proof(key, credential, selectedKeyId) });
    },

    digestCredential(credential: string): PanelSessionHandoffCredentialProof {
      const parsed = parse(credential);
      const key = keys.get(parsed.keyId);
      if (!key) throw new PanelSessionHandoffCredentialError();
      return proof(key, credential, parsed.keyId);
    },
  });
}
