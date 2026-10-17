import { createHash } from "node:crypto";
import type { NativeMarketingWorkflowRepository } from "@celebix/saas-data";
import { marketingPublicOrigin } from "./config.ts";
type Options = Readonly<{ publicOrigin: string; repository: Pick<NativeMarketingWorkflowRepository, "unsubscribe">; now(): Date }>;
function html(message: string, action?: string): string {
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>E-posta tercihiniz</title></head><body style="margin:0;background:#f5f5f4;font-family:Arial,sans-serif;color:#292524"><main style="max-width:460px;margin:64px auto;padding:32px;background:#fff;border-radius:16px"><h1 style="font-size:24px">${message}</h1>${action ? `<p style="line-height:1.7">Bu bağlantıyı gönderen mağazanın pazarlama e-postalarını kapatabilirsiniz. Sipariş bildirimleriniz devam eder.</p><form method="post" action="${action}"><button name="confirm" value="unsubscribe" style="padding:14px 20px;border:0;border-radius:8px;background:#292524;color:#fff;font-size:15px">Bu mağazanın e-postalarını kapat</button></form>` : "<p>Tercihiniz kaydedildi.</p>"}</main></body></html>`;
}
function response(status: number, body: string | null = null) {
  return new Response(body, { status, headers: { "cache-control": "no-store", "referrer-policy": "no-referrer", "content-type": "text/html; charset=utf-8", "x-content-type-options": "nosniff", "x-frame-options": "DENY", "content-security-policy": "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; style-src 'unsafe-inline'" } });
}
async function formBody(request: Request): Promise<string | null> {
  const type = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (type !== "application/x-www-form-urlencoded" || !request.body) return null;
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 1_024) { await reader.cancel(); return null; } chunks.push(chunk.value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
    return new TextDecoder("utf-8",{fatal:true}).decode(bytes);
  } catch { return null; } finally { reader.releaseLock(); }
}
export function createNativeMarketingUnsubscribeHandler(options: Options) {
  const origin = marketingPublicOrigin(options.publicOrigin);
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url), rawToken = url.searchParams.get("token");
    if (url.pathname !== "/api/marketing/unsubscribe" || url.searchParams.size !== 1 || !rawToken || !/^[A-Za-z0-9_-]{43}$/u.test(rawToken) || url.hash) return response(400);
    const action = `${origin}/api/marketing/unsubscribe?token=${rawToken}`;
    if (request.method === "GET") return response(200,html("E-posta tercihiniz",action));
    if (request.method !== "POST") return response(400);
    const requestOrigin = request.headers.get("origin");
    if (requestOrigin !== null && requestOrigin !== origin) return response(400);
    const body = await formBody(request);
    if (body === null) return response(400);
    const form = new URLSearchParams(body), oneClick = form.get("List-Unsubscribe") === "One-Click", human = form.get("confirm") === "unsubscribe";
    if (form.size !== 1 || (!oneClick && !human)) return response(400);
    const current = options.now(); if (!(current instanceof Date) || !Number.isFinite(current.getTime())) return response(503);
    try { await options.repository.unsubscribe({ tokenDigest: createHash("sha256").update(rawToken).digest("hex"), now: new Date(current.getTime()) }); }
    catch { return response(503); }
    return oneClick ? response(200) : response(200,html("Pazarlama e-postaları kapatıldı"));
  };
}
