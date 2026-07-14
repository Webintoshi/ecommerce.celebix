import { createHmac } from "node:crypto";

const KEY_ID = /^[A-Za-z0-9._-]{1,64}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const BOOTSTRAP_DOMAIN = "celebix-panel-browser-bootstrap-digest-v1";
const BINDING_DOMAIN = "celebix-panel-browser-binding-digest-v1";

function invalid(): never {
  throw new Error("panel_browser_binding_authority_invalid");
}

function canonicalKeyId(value: unknown): string {
  if (
    typeof value !== "string" || !KEY_ID.test(value) || value.startsWith(".") ||
    value.endsWith(".") || value.includes("..")
  ) invalid();
  return value;
}

function copyKeys(value: unknown): ReadonlyMap<string, Uint8Array> {
  if (!(value instanceof Map) || value.size < 1 || value.size > 16) invalid();
  const copied = new Map<string, Uint8Array>();
  for (const [rawKeyId, rawKey] of value) {
    const keyId = canonicalKeyId(rawKeyId);
    if (!(rawKey instanceof Uint8Array) || rawKey.byteLength < 32 || rawKey.byteLength > 64) invalid();
    copied.set(keyId, new Uint8Array(rawKey));
  }
  return copied;
}

function canonicalToken(value: string): string {
  if (!TOKEN.test(value)) invalid();
  const bytes = Buffer.from(value, "base64url");
  if (bytes.byteLength !== 32 || bytes.toString("base64url") !== value) invalid();
  return value;
}

function canonicalBootstrap(value: unknown): { credential: string; keyId: string } {
  if (typeof value !== "string" || value.trim() !== value || !value.startsWith("bs1.")) invalid();
  const tokenSeparator = value.length - 44;
  if (tokenSeparator <= 4 || value[tokenSeparator] !== ".") invalid();
  const keyId = canonicalKeyId(value.slice(4, tokenSeparator));
  canonicalToken(value.slice(tokenSeparator + 1));
  return { credential: value, keyId };
}

function canonicalBinding(value: unknown): string {
  if (typeof value !== "string" || value.trim() !== value || !value.startsWith("pb1.")) invalid();
  canonicalToken(value.slice(4));
  return value;
}

function digest(key: Uint8Array, domain: string, credential: string): string {
  return createHmac("sha256", key).update(`${domain}\n${credential}`, "utf8").digest("hex");
}

export type PanelBrowserCredentialDigest = Readonly<{ keyId: string; digest: string }>;
export type GeneratedPanelBrowserBootstrapCredential = Readonly<{
  credential: string;
  keyId: string;
  digest: string;
}>;

export interface PanelBrowserBindingAuthorityCodec {
  generateBootstrapCredential(): GeneratedPanelBrowserBootstrapCredential;
  digestBootstrapCredential(credential: string): PanelBrowserCredentialDigest;
  digestBrowserBindingCredential(credential: string): PanelBrowserCredentialDigest;
  digestBrowserBindingCredentialCandidates(credential: string): readonly PanelBrowserCredentialDigest[];
}

export function createPanelBrowserBindingAuthorityCodec(input: {
  bootstrapKeys: ReadonlyMap<string, Uint8Array>;
  activeBootstrapKeyId: string;
  browserBindingKeys: ReadonlyMap<string, Uint8Array>;
  activeBrowserBindingKeyId: string;
  randomBytes(size: number): Uint8Array;
}): PanelBrowserBindingAuthorityCodec {
  if (!input || typeof input.randomBytes !== "function") invalid();
  const bootstrapKeys = copyKeys(input.bootstrapKeys);
  const bindingKeys = copyKeys(input.browserBindingKeys);
  const activeBootstrapKeyId = canonicalKeyId(input.activeBootstrapKeyId);
  const activeBrowserBindingKeyId = canonicalKeyId(input.activeBrowserBindingKeyId);
  if (!bootstrapKeys.has(activeBootstrapKeyId) || !bindingKeys.has(activeBrowserBindingKeyId)) invalid();
  const randomBytes = input.randomBytes;
  const bindingKeyOrder = [
    activeBrowserBindingKeyId,
    ...[...bindingKeys.keys()].filter((keyId) => keyId !== activeBrowserBindingKeyId).sort(),
  ];

  const digestBootstrapCredential = (credential: string): PanelBrowserCredentialDigest => {
    const parsed = canonicalBootstrap(credential);
    const key = bootstrapKeys.get(parsed.keyId);
    if (!key) invalid();
    return Object.freeze({ keyId: parsed.keyId, digest: digest(key, BOOTSTRAP_DOMAIN, parsed.credential) });
  };

  const codec: PanelBrowserBindingAuthorityCodec = Object.freeze({
    generateBootstrapCredential() {
      const produced = randomBytes(32);
      if (!(produced instanceof Uint8Array) || produced.byteLength !== 32) invalid();
      const token = Buffer.from(new Uint8Array(produced)).toString("base64url");
      const credential = `bs1.${activeBootstrapKeyId}.${canonicalToken(token)}`;
      return Object.freeze({ credential, ...digestBootstrapCredential(credential) });
    },
    digestBootstrapCredential,
    digestBrowserBindingCredential(credential: string) {
      const canonical = canonicalBinding(credential);
      const key = bindingKeys.get(activeBrowserBindingKeyId);
      if (!key) invalid();
      return Object.freeze({
        keyId: activeBrowserBindingKeyId,
        digest: digest(key, BINDING_DOMAIN, canonical),
      });
    },
    digestBrowserBindingCredentialCandidates(credential: string) {
      const canonical = canonicalBinding(credential);
      return Object.freeze(bindingKeyOrder.map((keyId) => Object.freeze({
        keyId,
        digest: digest(bindingKeys.get(keyId)!, BINDING_DOMAIN, canonical),
      })));
    },
  });
  return codec;
}
