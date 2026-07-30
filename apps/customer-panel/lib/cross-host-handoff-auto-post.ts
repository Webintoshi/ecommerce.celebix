import { parseCanonicalAdminHostname } from "@celebix/saas-data";

const KEY_ID = /^[A-Za-z0-9._-]{1,64}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

function invalid(): never {
  throw new Error("cross_host_handoff_auto_post_invalid");
}

function canonicalOrigin(value: unknown): string {
  if (typeof value !== "string" || value !== value.trim() || value.length > 2_048) invalid();
  let url: URL;
  try { url = new URL(value); } catch { return invalid(); }
  if (
    url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" ||
    url.search || url.hash || url.origin !== value
  ) invalid();
  try { parseCanonicalAdminHostname(url.hostname, "production"); }
  catch {
    try { parseCanonicalAdminHostname(url.hostname, "staging"); }
    catch { return invalid(); }
  }
  return value;
}

function canonicalCredential(value: unknown): string {
  if (typeof value !== "string" || value !== value.trim() || !value.startsWith("v1.")) invalid();
  const separator = value.length - 44;
  if (separator <= 3 || value[separator] !== ".") invalid();
  const keyId = value.slice(3, separator);
  const token = value.slice(separator + 1);
  if (!KEY_ID.test(keyId) || keyId.startsWith(".") || keyId.endsWith(".") || keyId.includes("..") || !TOKEN.test(token)) invalid();
  const bytes = Buffer.from(token, "base64url");
  if (bytes.byteLength !== 32 || bytes.toString("base64url") !== token) invalid();
  return value;
}

function createNonce(randomBytes: (size: number) => Uint8Array): string {
  if (typeof randomBytes !== "function") invalid();
  const bytes = randomBytes(18);
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== 18) invalid();
  return Buffer.from(bytes).toString("base64url");
}

export function createCrossHostHandoffAutoPostResponse(input: Readonly<{
  destinationOrigin: string;
  handoffCredential: string;
  randomBytes(size: number): Uint8Array;
}>): Response {
  const destinationOrigin = canonicalOrigin(input?.destinationOrigin);
  const handoffCredential = canonicalCredential(input?.handoffCredential);
  const nonce = createNonce(input?.randomBytes);
  const action = `${destinationOrigin}/auth/handoff`;
  const policy = [
    "default-src 'none'",
    "base-uri 'none'",
    `form-action ${destinationOrigin}`,
    "frame-ancestors 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
    "connect-src 'none'",
    "img-src 'none'",
    "object-src 'none'",
  ].join("; ");
  const body = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Yönetim paneli açılıyor</title><style nonce="${nonce}">:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f7f8;color:#202124;font:500 16px/1.5 system-ui,-apple-system,sans-serif}.card{text-align:center;padding:32px}.mark{width:48px;height:48px;margin:0 auto 18px;border-radius:16px;display:grid;place-items:center;background:#ff6500;color:#fff;font-size:24px;font-weight:800}.muted{color:#70757d;margin:6px 0 20px}button{border:0;border-radius:12px;padding:12px 20px;background:#ff6500;color:#fff;font:700 15px system-ui;cursor:pointer}</style></head><body><main class="card"><div class="mark">C</div><h1>Yönetim paneliniz açılıyor</h1><p class="muted">Güvenli mağaza oturumunuz hazırlanıyor.</p><form id="handoff" method="post" action="${action}"><input type="hidden" name="handoff" value="${handoffCredential}"><button type="submit">Devam et</button></form></main><script nonce="${nonce}">document.getElementById("handoff").submit()</script></body></html>`;
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "content-security-policy": policy,
    },
  });
}
