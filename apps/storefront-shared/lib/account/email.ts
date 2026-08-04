const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const ASCII_EDGE_WHITESPACE = /^[\u0009-\u000d\u0020]+|[\u0009-\u000d\u0020]+$/gu;

function invalid(): never {
  throw new TypeError("storefront_account_email_invalid");
}

export function normalizeStorefrontAccountEmail(value: unknown): string {
  if (typeof value !== "string") invalid();
  const normalized = value.replace(ASCII_EDGE_WHITESPACE, "").normalize("NFC").toLowerCase();
  const length = new TextEncoder().encode(normalized).byteLength;
  if (length < 3 || length > 320 || CONTROL.test(normalized) || !EMAIL.test(normalized)) invalid();
  const [local, domain, ...rest] = normalized.split("@");
  if (!local || !domain || rest.length > 0 || local.length > 64 || domain.length > 255 || domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) invalid();
  return normalized;
}
