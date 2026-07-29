const TOKEN = /^[A-Za-z0-9_-]{43}$/;

function invalid(): never {
  throw new Error("panel_browser_binding_credential_invalid");
}

export function canonicalPanelBrowserBindingCredential(value: unknown): string {
  if (typeof value !== "string" || value.trim() !== value || !value.startsWith("pb1.")) invalid();
  const token = value.slice(4);
  if (!TOKEN.test(token)) invalid();
  const bytes = Buffer.from(token, "base64url");
  if (bytes.byteLength !== 32 || bytes.toString("base64url") !== token) invalid();
  return value;
}

export function createPanelBrowserBindingCredentialGenerator(
  randomBytes: (size: number) => Uint8Array,
) {
  if (typeof randomBytes !== "function") invalid();
  const source = randomBytes;
  return Object.freeze({
    generate(): string {
      const produced = source(32);
      if (!(produced instanceof Uint8Array) || produced.byteLength !== 32) invalid();
      const bytes = new Uint8Array(produced);
      return canonicalPanelBrowserBindingCredential(`pb1.${Buffer.from(bytes).toString("base64url")}`);
    },
  });
}
