const MAXIMUM_BODY_BYTES = 8_192;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const SAFE_PATH = /^\/(?:account(?:\/[A-Za-z0-9_-]+)*|checkout|cart|products(?:\/[A-Za-z0-9_-]+)?|favorites)$/;

function invalid(): never { throw new TypeError("storefront_account_request_invalid"); }

function canonicalOrigin(value: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.origin !== value) invalid();
    return parsed.origin;
  } catch { return invalid(); }
}

function exactRootObject(value: unknown): void {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) if (descriptor.get || descriptor.set) invalid();
}

export async function readAccountJsonRequest<T>(request: Request, configuredOrigin: string, shape: (value: unknown) => T): Promise<T> {
  try {
    const url = new URL(request.url);
    const origin = canonicalOrigin(configuredOrigin);
    if (request.method !== "POST" || (url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || !url.pathname.startsWith("/api/account/") || url.search || url.hash) invalid();
    if (request.headers.get("origin") !== origin || request.headers.get("content-type") !== "application/json" || request.headers.has("authorization") || request.headers.has("transfer-encoding") || request.body === null) invalid();
    const fetchSite = request.headers.get("sec-fetch-site");
    if (fetchSite !== null && fetchSite !== "same-origin") invalid();
    for (const name of request.headers.keys()) if (name.startsWith("x-celebix-") && name !== "x-celebix-storefront-proxy" && name !== "x-celebix-account-csrf") invalid();
    const declared = request.headers.get("content-length");
    if (declared !== null && (!/^(?:0|[1-9]\d*)$/.test(declared) || Number(declared) > MAXIMUM_BODY_BYTES)) invalid();

    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        total += next.value.byteLength;
        if (total > MAXIMUM_BODY_BYTES) { await reader.cancel().catch(() => undefined); invalid(); }
        chunks.push(new Uint8Array(next.value));
      }
      if (total === 0) invalid();
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      try {
        const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
        exactRootObject(value);
        return shape(value);
      } finally { bytes.fill(0); }
    } finally { for (const chunk of chunks) chunk.fill(0); }
  } catch (error) {
    if (error instanceof TypeError && error.message === "storefront_account_request_invalid") throw error;
    return invalid();
  }
}

export async function readAccountFormRequest<T>(request: Request, configuredOrigin: string, expectedPath: string, shape: (value: Readonly<Record<string, string>>) => T): Promise<T> {
  try {
    const url = new URL(request.url);
    const origin = canonicalOrigin(configuredOrigin);
    if (request.method !== "POST" || url.origin !== origin || url.pathname !== expectedPath || url.search || url.hash) invalid();
    if (request.headers.get("origin") !== origin || request.headers.get("content-type") !== "application/x-www-form-urlencoded" || request.headers.has("authorization") || request.headers.has("transfer-encoding") || request.body === null) invalid();
    const fetchSite = request.headers.get("sec-fetch-site");
    if (fetchSite !== null && fetchSite !== "same-origin") invalid();
    for (const name of request.headers.keys()) if (name.startsWith("x-celebix-") && name !== "x-celebix-storefront-proxy") invalid();
    const declared = request.headers.get("content-length");
    if (declared !== null && (!/^(?:0|[1-9]\d*)$/.test(declared) || Number(declared) > MAXIMUM_BODY_BYTES)) invalid();

    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        total += next.value.byteLength;
        if (total > MAXIMUM_BODY_BYTES) { await reader.cancel().catch(() => undefined); invalid(); }
        chunks.push(new Uint8Array(next.value));
      }
      if (total === 0) invalid();
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      try {
        const params = new URLSearchParams(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
        const value: Record<string, string> = {};
        for (const [name, field] of params) {
          if (!name || Object.hasOwn(value, name)) invalid();
          value[name] = field;
        }
        return shape(Object.freeze(value));
      } finally { bytes.fill(0); }
    } finally { for (const chunk of chunks) chunk.fill(0); }
  } catch (error) {
    if (error instanceof TypeError && error.message === "storefront_account_request_invalid") throw error;
    return invalid();
  }
}

export function safeAccountReturnTo(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 512 || CONTROL.test(value) || value.includes("\\") || value.includes("%") || value.includes("?") || value.includes("#") || value.includes("//") || value.split("/").some((part) => part === "." || part === "..") || !SAFE_PATH.test(value)) return "/account";
  return value;
}
