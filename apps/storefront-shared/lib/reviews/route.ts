import { parseReviewSubmission } from "@celebix/saas-contracts";
import { ReviewCollectionError, type ReviewCollectionRepository } from "@celebix/saas-data";
import type { TrustedStorefrontHostAuthority } from "../trusted-host-authority.ts";
export type ReviewRouteDependencies = Readonly<{ selectAuthority(headers: Headers): TrustedStorefrontHostAuthority; resolveRepository(): Promise<ReviewCollectionRepository | null>; now(): Date }>;
function json(value: unknown, status = 200): Response { return Response.json(value, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" } }); }
function invalid(): never { throw new TypeError("review_request_invalid"); }
async function body(request: Request, hostname: string): Promise<Record<string, unknown>> {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.search || url.hash || url.username || url.password || request.headers.get("origin") !== `https://${hostname}` || request.headers.get("content-type") !== "application/json" || request.headers.has("authorization") || request.headers.has("transfer-encoding") || !request.body) invalid();
  const fetchSite = request.headers.get("sec-fetch-site"); if (fetchSite !== null && fetchSite !== "same-origin") invalid();
  const declared = request.headers.get("content-length"); if (declared !== null && (!/^[0-9]+$/u.test(declared) || Number(declared) > 8192)) invalid();
  for (const key of request.headers.keys()) if (["x-store-id", "x-tenant-id", "x-principal-id"].includes(key) || (key.startsWith("x-celebix-") && key !== "x-celebix-storefront-proxy")) invalid();
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
  try { for (;;) { const next = await reader.read(); if (next.done) break; length += next.value.length; if (length > 8192) { await reader.cancel(); invalid(); } chunks.push(next.value); } } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  const result = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer)); if (!result || typeof result !== "object" || Array.isArray(result)) invalid(); return result;
}
export function createReviewCollectionPublicRoute(deps: ReviewRouteDependencies, action: "invitation" | "submit" | "unsubscribe") {
  return async (request: Request): Promise<Response> => {
    try {
      const host = deps.selectAuthority(request.headers); if (host.kind !== "trusted") return json({ message: "Mağaza doğrulanamadı." }, 503);
      if (new URL(request.url).pathname !== `/api/reviews/${action}`) invalid();
      const input = await body(request, host.hostname), expected = action === "submit" ? ["review", "token"] : ["token"];
      if (Object.keys(input).sort().join(",") !== expected.join(",") || typeof input.token !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(input.token)) invalid();
      const repository = await deps.resolveRepository(); if (!repository) return json({ message: "Yorum işlemi şu anda kullanılamıyor." }, 503);
      const base = { hostname: host.hostname, now: deps.now(), token: input.token };
      if (action === "invitation") return json(await repository.invitation(base));
      if (action === "unsubscribe") { await repository.unsubscribe(base); return json({ status: "unsubscribed" }); }
      const operationId = request.headers.get("idempotency-key"); if (!operationId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(operationId)) invalid();
      return json(await repository.submit({ ...base, operationId, review: parseReviewSubmission(input.review) }));
    } catch (caught) {
      const code = caught instanceof ReviewCollectionError ? caught.code : caught instanceof TypeError || caught instanceof SyntaxError ? "invalid_input" : "unavailable";
      if (["not_found", "invitation_expired"].includes(code)) return json({ code: "invitation_expired", message: "Yorum bağlantısı geçersiz veya süresi dolmuş." }, 410);
      if (code === "already_submitted") return json({ code, message: "Bu ürün için yorumunuz daha önce alındı." }, 409);
      if (code === "operation_mismatch") return json({ code, message: "İşlem bilgileri değişti. Sayfayı yeniden açın." }, 409);
      return json({ code, message: code === "invalid_input" ? "Yorum bilgilerini kontrol edin." : "İşlem tamamlanamadı. Bilgileriniz korunuyor; tekrar deneyin." }, code === "invalid_input" ? 400 : 503);
    }
  };
}
