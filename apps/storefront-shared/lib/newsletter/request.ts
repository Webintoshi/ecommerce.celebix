import { parseNewsletterSubscribeInput, type NewsletterSubscribeInput } from "@celebix/saas-contracts";

const MAXIMUM_BODY_BYTES = 2_048;

function invalid(): never {
  throw new TypeError("storefront_newsletter_request_invalid");
}

function canonicalPublicOrigin(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash || url.origin !== value) invalid();
    return url.origin;
  } catch {
    return invalid();
  }
}

export async function parseNewsletterSubscribeRequest(request: Request, publicOrigin: string): Promise<NewsletterSubscribeInput> {
  let url: URL;
  try { url = new URL(request.url); } catch { return invalid(); }
  const origin = canonicalPublicOrigin(publicOrigin);
  if (
    request.method !== "POST"
    || (url.protocol !== "http:" && url.protocol !== "https:")
    || url.username
    || url.password
    || url.pathname !== "/api/newsletter/subscriptions"
    || url.search
    || url.hash
    || request.headers.get("origin") !== origin
    || request.headers.get("content-type") !== "application/json"
    || request.headers.has("authorization")
    || request.headers.has("cookie")
    || request.headers.has("transfer-encoding")
    || request.body === null
  ) invalid();
  for (const name of request.headers.keys()) {
    if (name.startsWith("x-celebix-") && name !== "x-celebix-storefront-proxy") invalid();
  }
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^(?:0|[1-9]\d*)$/u.test(declared) || Number(declared) > MAXIMUM_BODY_BYTES)) invalid();

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
      return parseNewsletterSubscribeInput(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
    } catch {
      return invalid();
    } finally {
      bytes.fill(0);
    }
  } catch (error) {
    if (error instanceof TypeError && error.message === "storefront_newsletter_request_invalid") throw error;
    return invalid();
  } finally {
    for (const chunk of chunks) chunk.fill(0);
  }
}
