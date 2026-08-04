import { normalizeStorefrontAccountEmail } from "./email.ts";

const CODE = /^[0-9]{6}$/u;
const API_KEY = /^re_[A-Za-z0-9_-]{16,200}$/u;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const MAXIMUM_RESPONSE_BYTES = 32_768;

export type StorefrontIdentityEmailDelivery = (message: Readonly<{ email: string; code: string; storeName: string }>) => Promise<void>;
export type ResendStorefrontIdentityEmailDeliveryOptions = Readonly<{
  apiKey: string;
  from: string;
  fetch: (request: Request) => Promise<Response>;
  timeoutMs: number;
}>;

function unavailable(): never { throw new Error("account_email_unavailable"); }
function escapeHtml(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }
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
    if (!CODE.test(message.code) || typeof message.storeName !== "string" || message.storeName !== message.storeName.trim() || message.storeName.length < 1 || message.storeName.length > 120 || CONTROL.test(message.storeName)) unavailable();
    const controller = new AbortController(); const deadline = setTimeout(() => controller.abort(), options.timeoutMs); deadline.unref?.();
    try {
      const storeName = message.storeName;
      const response = await options.fetch(new Request("https://api.resend.com/emails", {
        method: "POST", signal: controller.signal,
        headers: { authorization: `Bearer ${options.apiKey}`, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          from: `Celebix <${from}>`, to: email, subject: `${storeName} giriş kodunuz`,
          text: `${storeName} hesabınıza giriş kodunuz: ${message.code}\n\nBu kod 10 dakika geçerlidir. Bu isteği siz yapmadıysanız e-postayı yok sayabilirsiniz.`,
          html: `<div style="font-family:Arial,sans-serif;color:#171717;max-width:520px;margin:auto;padding:32px"><p style="color:#ff5a00;font-weight:700">${escapeHtml(storeName)}</p><h1 style="font-size:24px">Giriş kodunuz</h1><p style="font-size:36px;font-weight:800;letter-spacing:8px">${message.code}</p><p style="color:#666">Bu kod 10 dakika geçerlidir. Bu isteği siz yapmadıysanız e-postayı yok sayabilirsiniz.</p></div>`,
        }),
      }));
      await boundedBody(response);
      if (!response.ok) unavailable();
    } catch { return unavailable(); }
    finally { clearTimeout(deadline); }
  };
}
