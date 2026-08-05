import { createHmac } from "node:crypto";

const KEY_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const PREIMAGE_PREFIX = "celebix-panel-session-v1\n";
const HANDOFF_PREIMAGE_PREFIX = "celebix-panel-session-from-handoff-v1\n";
const TOKEN_BYTES = 32;
const MINIMUM_KEY_BYTES = 32;
const MAXIMUM_KEY_BYTES = 64;
const MAXIMUM_KEYS = 16;

export class PanelSessionCredentialError extends Error {
  constructor() {
    super("panel_session_credential_invalid");
    this.name = "PanelSessionCredentialError";
  }
}

export interface PanelSessionCredentialProof {
  tokenKeyId: string;
  tokenDigest: string;
}

export interface IssuedPanelSessionCredential extends PanelSessionCredentialProof {
  credential: string;
}

interface CredentialCodecInput {
  activeKeyId: string;
  keys: ReadonlyMap<string, Uint8Array>;
  randomBytes(size: number): Uint8Array;
}

function validKeyId(value: unknown): value is string {
  return typeof value === "string"
    && KEY_ID_PATTERN.test(value)
    && !value.startsWith(".")
    && !value.endsWith(".")
    && !value.includes("..");
}

function copyKeys(input: CredentialCodecInput): ReadonlyMap<string, Uint8Array> {
  if (!(input.keys instanceof Map) || input.keys.size < 1 || input.keys.size > MAXIMUM_KEYS) {
    throw new PanelSessionCredentialError();
  }
  const copied = new Map<string, Uint8Array>();
  for (const [keyId, key] of input.keys.entries()) {
    if (
      !validKeyId(keyId)
      || !(key instanceof Uint8Array)
      || key.byteLength < MINIMUM_KEY_BYTES
      || key.byteLength > MAXIMUM_KEY_BYTES
      || copied.has(keyId)
    ) {
      throw new PanelSessionCredentialError();
    }
    copied.set(keyId, new Uint8Array(key));
  }
  return copied;
}

function parseCanonicalCredential(credential: string): { keyId: string; token: string } {
  if (typeof credential !== "string" || credential.trim() !== credential || !credential.startsWith("v1.")) {
    throw new PanelSessionCredentialError();
  }
  const tokenSeparator = credential.length - 44;
  if (tokenSeparator <= 3 || credential[tokenSeparator] !== ".") throw new PanelSessionCredentialError();
  const keyId = credential.slice(3, tokenSeparator);
  const token = credential.slice(tokenSeparator + 1);
  if (!validKeyId(keyId) || !TOKEN_PATTERN.test(token)) throw new PanelSessionCredentialError();
  let decoded: Buffer;
  try {
    decoded = Buffer.from(token, "base64url");
  } catch {
    throw new PanelSessionCredentialError();
  }
  if (decoded.byteLength !== TOKEN_BYTES || decoded.toString("base64url") !== token) {
    throw new PanelSessionCredentialError();
  }
  return { keyId, token };
}

function parseCanonicalHandoffCredential(credential: string): void {
  if (typeof credential !== "string" || credential.trim() !== credential || !credential.startsWith("h1.")) {
    throw new PanelSessionCredentialError();
  }
  const tokenSeparator = credential.length - 44;
  if (tokenSeparator <= 3 || credential[tokenSeparator] !== ".") throw new PanelSessionCredentialError();
  const keyId = credential.slice(3, tokenSeparator);
  const token = credential.slice(tokenSeparator + 1);
  if (!validKeyId(keyId) || !TOKEN_PATTERN.test(token)) throw new PanelSessionCredentialError();
  let decoded: Buffer;
  try {
    decoded = Buffer.from(token, "base64url");
  } catch {
    throw new PanelSessionCredentialError();
  }
  if (decoded.byteLength !== TOKEN_BYTES || decoded.toString("base64url") !== token) {
    throw new PanelSessionCredentialError();
  }
}

function digest(key: Uint8Array, credential: string): string {
  const value = createHmac("sha256", key)
    .update(`${PREIMAGE_PREFIX}${credential}`, "utf8")
    .digest("hex");
  if (!DIGEST_PATTERN.test(value)) throw new PanelSessionCredentialError();
  return value;
}

export function createPanelSessionCredentialCodec(input: CredentialCodecInput) {
  if (!input || !validKeyId(input.activeKeyId) || typeof input.randomBytes !== "function") {
    throw new PanelSessionCredentialError();
  }
  const keys = copyKeys(input);
  if (!keys.has(input.activeKeyId)) throw new PanelSessionCredentialError();
  const activeKeyId = input.activeKeyId;
  const randomSource = input.randomBytes;

  return Object.freeze({
    issueCredential(): IssuedPanelSessionCredential {
      let random: Uint8Array;
      try {
        random = randomSource(TOKEN_BYTES);
      } catch {
        throw new PanelSessionCredentialError();
      }
      if (!(random instanceof Uint8Array) || random.byteLength !== TOKEN_BYTES) {
        throw new PanelSessionCredentialError();
      }
      const token = Buffer.from(new Uint8Array(random)).toString("base64url");
      if (!TOKEN_PATTERN.test(token)) throw new PanelSessionCredentialError();
      const credential = `v1.${activeKeyId}.${token}`;
      const key = keys.get(activeKeyId);
      if (!key) throw new PanelSessionCredentialError();
      return Object.freeze({
        credential,
        tokenKeyId: activeKeyId,
        tokenDigest: digest(key, credential),
      });
    },

    digestCredential(credential: string): PanelSessionCredentialProof {
      const parsed = parseCanonicalCredential(credential);
      const key = keys.get(parsed.keyId);
      if (!key) throw new PanelSessionCredentialError();
      return Object.freeze({
        tokenKeyId: parsed.keyId,
        tokenDigest: digest(key, credential),
      });
    },

    deriveCredentialFromHandoff(
      handoffCredential: string,
      tokenKeyId: string,
    ): IssuedPanelSessionCredential {
      parseCanonicalHandoffCredential(handoffCredential);
      if (!validKeyId(tokenKeyId)) throw new PanelSessionCredentialError();
      const key = keys.get(tokenKeyId);
      if (!key) throw new PanelSessionCredentialError();
      const token = createHmac("sha256", key)
        .update(`${HANDOFF_PREIMAGE_PREFIX}${handoffCredential}`, "utf8")
        .digest("base64url");
      if (!TOKEN_PATTERN.test(token)) throw new PanelSessionCredentialError();
      const credential = `v1.${tokenKeyId}.${token}`;
      return Object.freeze({
        credential,
        tokenKeyId,
        tokenDigest: digest(key, credential),
      });
    },
  });
}
