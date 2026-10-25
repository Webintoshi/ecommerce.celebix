import { parseProductPageReviewAvailability, parseReviewSubmission } from "@celebix/saas-contracts";
import { ProductPageReviewError } from "@celebix/saas-data";
import type { TrustedStorefrontHostAuthority } from "../trusted-host-authority.ts";
import type { ProductPageReviewRuntime } from "./product-page-runtime.ts";
import { readReviewJsonBody } from "./route.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
type Dependencies = Readonly<{ selectAuthority(headers: Headers): TrustedStorefrontHostAuthority; resolveRuntime(): Promise<ProductPageReviewRuntime | null> }>;
class InvalidRequest extends Error {}
function invalid(): never { throw new InvalidRequest(); }
function json(value: unknown, status = 200) { return Response.json(value, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" } }); }
function failure(error: unknown) {
  const code = error instanceof InvalidRequest ? "invalid_input" : error instanceof ProductPageReviewError ? error.code : "unavailable";
  const status = code === "invalid_input" ? 400 : code === "unauthenticated" ? 401 : ["disabled", "feature_disabled", "feature_not_enabled"].includes(code) ? 403 : code === "not_found" ? 404 : ["already_submitted", "operation_mismatch"].includes(code) ? 409 : code === "rate_limited" ? 429 : 503;
  const message = code === "unauthenticated" ? "Yorum yazmak için hesabınıza giriş yapın." : ["disabled", "feature_disabled", "feature_not_enabled"].includes(code) ? "Bu mağaza şu anda yeni yorum almıyor." : code === "already_submitted" ? "Bu ürün için yorumunuz daha önce alındı." : code === "rate_limited" ? "Kısa sürede çok sayıda yorum gönderdiniz. Daha sonra tekrar deneyin." : code === "invalid_input" ? "Yorum bilgilerini kontrol edin." : code === "not_found" ? "Ürün şu anda yorum almıyor." : "İşlem tamamlanamadı. Yorumunuz korunuyor; yeniden deneyebilirsiniz.";
  return json({ code, message }, status);
}
export function createProductPageReviewRoutes(deps: Dependencies) {
  async function run(request: Request, method: "GET" | "POST") {
    try {
      const host = deps.selectAuthority(request.headers);
      if (host.kind !== "trusted") return json({ message: "Mağaza doğrulanamadı." }, 503);
      const url = new URL(request.url), match = /^\/api\/products\/([^/]+)\/reviews$/u.exec(url.pathname);
      if (request.method !== method || url.search || url.hash || url.username || url.password || !match || !UUID.test(match[1]!)) invalid();
      for (const key of request.headers.keys()) if (["authorization", "transfer-encoding", "x-store-id", "x-tenant-id", "x-principal-id"].includes(key) || (key.startsWith("x-celebix-") && key !== "x-celebix-storefront-proxy")) invalid();
      const site = request.headers.get("sec-fetch-site"), origin = request.headers.get("origin");
      if ((site !== null && site !== "same-origin") || (origin !== null && origin !== `https://${host.hostname}`)) invalid();
      let submission;
      if (method === "POST") {
        try {
          const value = await readReviewJsonBody(request, host.hostname);
          if (Object.keys(value).join(",") !== "review") invalid();
          const operationId = request.headers.get("idempotency-key"); if (!operationId || !UUID.test(operationId)) invalid();
          submission = { operationId, review: parseReviewSubmission(value.review) };
        } catch { invalid(); }
      }
      const runtime = await deps.resolveRuntime(); if (!runtime) return json({ message: "Yorum işlemi şu anda kullanılamıyor." }, 503);
      const authority = { hostname: host.hostname, productId: match[1]!, cookieHeader: request.headers.get("cookie") };
      if (!submission) return json(parseProductPageReviewAvailability(await runtime.availability(authority)));
      const result = await runtime.submit({ ...authority, ...submission });
      if (!result || Object.keys(result).join(",") !== "status" || result.status !== "pending") throw new Error("product_review_result_invalid");
      return json({ status: "pending" });
    } catch (error) { return failure(error); }
  }
  return Object.freeze({ GET: (request: Request) => run(request, "GET"), POST: (request: Request) => run(request, "POST") });
}
