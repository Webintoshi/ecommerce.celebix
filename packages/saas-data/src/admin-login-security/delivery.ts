import { normalizeAdminLoginPhone } from "./crypto.ts";

export type AdminWhatsAppOtpMessage = Readonly<{ phone: string; code: string; storeName: string; idempotencyKey: string }>;
export type AdminWhatsAppDeliveryAcceptance = Readonly<{ reportId: string; recipient: string }>;
export type AdminWhatsAppOtpDelivery = (message: AdminWhatsAppOtpMessage) => Promise<AdminWhatsAppDeliveryAcceptance>;
export type AdminVatanSmsWhatsAppDeliveryOptions = Readonly<{ apiKey: string; regId: string; timeoutMs?: number; fetch: (request: Request) => Promise<Response> }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
function unavailable(): never { throw new Error("admin_whatsapp_delivery_unavailable"); }

// Pure server adapter for the same connected-device NtoN API as customer OTP.
// It does not import or call customer challenge/session authority.
export function createAdminVatanSmsWhatsAppDelivery(options: AdminVatanSmsWhatsAppDeliveryOptions): AdminWhatsAppOtpDelivery {
  const timeoutMs = options?.timeoutMs ?? 12000;
  if (!options || typeof options.apiKey !== "string" || !/^[A-Za-z0-9_-]{16,256}$/u.test(options.apiKey) || typeof options.regId !== "string" || !/^[0-9]{1,20}$/u.test(options.regId) || typeof options.fetch !== "function" || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 12000) unavailable();
  const { apiKey, regId, fetch: fetchRequest } = options;
  return async message => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const parts: Uint8Array[] = [];
    const controller = new AbortController();
    try {
      const phone = normalizeAdminLoginPhone(message.phone).slice(1);
      if (typeof message.code !== "string" || !/^[0-9]{6}$/u.test(message.code) || typeof message.idempotencyKey !== "string" || message.idempotencyKey.length !== 36 || !UUID.test(message.idempotencyKey) || typeof message.storeName !== "string" || message.storeName.length < 1 || message.storeName.length > 200 || message.storeName !== message.storeName.trim() || /[\u0000-\u001f\u007f-\u009f]/u.test(message.storeName)) unavailable();
      const deadline = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("admin_whatsapp_delivery_unavailable")); }, timeoutMs); });
      // Provider has no documented idempotency facility. idempotencyKey is checked
      // for our durable challenge correlation; ambiguous sends never auto retry.
      const response = await Promise.race([fetchRequest(new Request("https://api.toplusms.app/bulk/wp/nton", {
        method: "POST", redirect: "error", signal: controller.signal,
        headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
        body: JSON.stringify({ messages: [{ reg_id: regId, target: phone, message: `${message.storeName} yönetici paneli giriş doğrulama kodunuz: ${message.code}. Kod 10 dakika geçerlidir. Bu kodu kimseyle paylaşmayın.` }] }),
      })), deadline]);
      if (!response.ok || response.redirected || !response.body) unavailable();
      const contentLength = response.headers.get("Content-Length");
      if (contentLength !== null && (!/^[0-9]{1,10}$/u.test(contentLength) || Number(contentLength) > 32768)) unavailable();
      reader = response.body.getReader(); let size = 0;
      for (;;) {
        const next = await Promise.race([reader.read(), deadline]); if (next.done) break;
        size += next.value.byteLength; if (size > 32768) unavailable();
        parts.push(next.value);
      }
      const payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts))) as Record<string, unknown>;
      if (!payload || payload.code !== 200 || payload.status !== "OK" || !Array.isArray(payload.reports) || payload.reports.length !== 1) unavailable();
      const report = payload.reports[0] as Record<string, unknown>;
      // Acceptance requires the sole report's canonical provider UUID and exact
      // digit recipient. A generic OK or an unrelated report is ambiguous.
      if (!report || typeof report.reportId !== "string" || report.reportId.length !== 36 || !UUID.test(report.reportId) || report.phone !== phone) unavailable();
      return Object.freeze({ reportId: report.reportId, recipient: phone });
    } catch { return unavailable(); }
    finally {
      if (timer !== undefined) clearTimeout(timer);
      controller.abort();
      if (reader) { void reader.cancel().catch(() => {}); reader.releaseLock(); }
      for (const part of parts) part.fill(0);
    }
  };
}
