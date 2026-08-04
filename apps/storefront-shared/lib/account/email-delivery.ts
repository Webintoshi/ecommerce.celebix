import { normalizeStorefrontAccountEmail } from "./email.ts";

const CODE = /^[0-9]{6}$/u;
const API_KEY = /^re_[A-Za-z0-9_-]{16,200}$/u;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const MAGIC_TICKET = /^ch1[.][a-z][a-z0-9_-]{2,31}[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{1,1024}[.][A-Za-z0-9_-]{22}[.]tk1[.][A-Za-z0-9_-]{43}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?[.])+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const MAXIMUM_RESPONSE_BYTES = 32_768;

export type StorefrontIdentityEmailDelivery = (message: Readonly<{ email: string; ticket: string; code: string; storeName: string; storeOrigin: string; returnTo: string; idempotencyKey: string }>) => Promise<void>;
export type ResendStorefrontIdentityEmailDeliveryOptions = Readonly<{
  apiKey: string;
  from: string;
  fetch: (request: Request) => Promise<Response>;
  timeoutMs: number;
}>;

function unavailable(): never { throw new Error("account_email_unavailable"); }
function escapeHtml(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }
function safeReturnTo(value: string): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 1_024 || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.includes("?") || value.includes("#") || value.includes("%") || CONTROL.test(value)) unavailable();
  return value;
}
function safeStoreOrigin(value: string): string {
  let origin: URL;
  try { origin = new URL(value); } catch { return unavailable(); }
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.port || origin.pathname !== "/" || origin.search || origin.hash || origin.hostname !== origin.hostname.toLowerCase() || !HOSTNAME.test(origin.hostname) || origin.origin !== value) unavailable();
  return origin.origin;
}
async function boundedBody(response: Response): Promise<void> {
  if (response.body === null) return;
  const reader = response.body.getReader(); let total = 0;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break; total += part.value.byteLength;
      if (total > MAXIMUM_RESPONSE_BYTES) { await reader.cancel().catch(() => undefined); unavailable(); }
    }
  } finally { reader.releaseLock(); }
}

export function createResendStorefrontIdentityEmailDelivery(options: ResendStorefrontIdentityEmailDeliveryOptions): StorefrontIdentityEmailDelivery {
  if (!options || typeof options !== "object" || Array.isArray(options) || !API_KEY.test(options.apiKey) || typeof options.fetch !== "function" || !Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 100 || options.timeoutMs > 10_000) unavailable();
  let from: string; try { from = normalizeStorefrontAccountEmail(options.from); } catch { return unavailable(); }
  return async (message) => {
    let email: string;
    try { email = normalizeStorefrontAccountEmail(message.email); } catch { return unavailable(); }
    if (!CODE.test(message.code) || !MAGIC_TICKET.test(message.ticket) || !UUID.test(message.idempotencyKey) || typeof message.storeName !== "string" || message.storeName !== message.storeName.trim() || message.storeName.length < 1 || message.storeName.length > 120 || CONTROL.test(message.storeName)) unavailable();
    const storeOrigin = safeStoreOrigin(message.storeOrigin); const returnTo = safeReturnTo(message.returnTo);
    const magicLink = new URL("/account/verify", storeOrigin); magicLink.searchParams.set("ticket", message.ticket); magicLink.searchParams.set("returnTo", returnTo);
    const controller = new AbortController(); const deadline = setTimeout(() => controller.abort(), options.timeoutMs); deadline.unref?.();
    try {
      const storeName = message.storeName;
      const response = await options.fetch(new Request("https://api.resend.com/emails", {
        method: "POST", signal: controller.signal,
        headers: { authorization: `Bearer ${options.apiKey}`, "content-type": "application/json", accept: "application/json", "idempotency-key": `account-login/${message.idempotencyKey}` },
        body: JSON.stringify({
          from: `${storeName} <${from}>`, to: email, subject: `${storeName} hesabınıza giriş yapın`,
          text: `${storeName} hesabınıza giriş yapmak için bağlantıyı açın:\n${magicLink.toString()}\n\nBağlantı çalışmazsa şu tek kullanımlık kodu girin: ${message.code}\n\nBağlantı ve kod 10 dakika geçerlidir. Bu isteği siz yapmadıysanız e-postayı yok sayabilirsiniz.`,
          html: `<div style="font-family:Arial,sans-serif;color:#171717;max-width:520px;margin:auto;padding:32px"><p style="color:#ff5a00;font-weight:700">${escapeHtml(storeName)}</p><h1 style="font-size:24px">Hesabınıza giriş yapın</h1><p style="color:#555;line-height:1.6">Siparişlerinize ve hesabınıza güvenle ulaşın.</p><p style="margin:28px 0"><a href="${escapeHtml(magicLink.toString())}" style="display:inline-block;background:#171717;color:#fff;text-decoration:none;padding:15px 26px;border-radius:10px;font-weight:700">Giriş yap</a></p><p style="color:#666">Bağlantı çalışmazsa bu kodu kullanın:</p><p style="font-size:30px;font-weight:800;letter-spacing:7px">${message.code}</p><p style="color:#777;font-size:13px">Bağlantı ve kod 10 dakika geçerlidir. Bu isteği siz yapmadıysanız e-postayı yok sayabilirsiniz.</p></div>`,
        }),
      }));
      await boundedBody(response);
      if (!response.ok) unavailable();
    } catch { return unavailable(); }
    finally { clearTimeout(deadline); }
  };
}
