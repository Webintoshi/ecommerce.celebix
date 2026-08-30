import "server-only";
import { hasApprovedPanelMutationOriginShape } from "../panel-origin-authority.ts";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const MEDIA_PATH = new RegExp(`^/api/catalog/products/${UUID}/media(?:/reorder|/${UUID}(?:/(?:archive|restore|cleanup))?)?$`);
export type ProductMediaRequestDecision = "approved" | "method_not_allowed" | "origin_denied" | "request_invalid";
export function createProductMediaRequestAuthorityValidator(panelOrigin: string) {
  let origin: URL; try { origin = new URL(panelOrigin); } catch { throw new Error("product_media_request_authority_invalid"); }
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.port || origin.pathname !== "/" || origin.search || origin.hash || origin.origin !== panelOrigin) throw new Error("product_media_request_authority_invalid");
  return Object.freeze({ validate(request: unknown, expected: Readonly<{ method: "GET" | "POST" | "PATCH"; pathname: string }>): ProductMediaRequestDecision { if (!(request instanceof Request) || !expected || !MEDIA_PATH.test(expected.pathname)) return "request_invalid"; if (request.method !== expected.method) return "method_not_allowed"; if (expected.method !== "GET" && !hasApprovedPanelMutationOriginShape(request, panelOrigin)) return "origin_denied"; let url: URL; try { url = new URL(request.url); } catch { return "request_invalid"; } return ["http:","https:"].includes(url.protocol) && !url.username && !url.password && url.pathname === expected.pathname && !url.search && !url.hash ? "approved" : "request_invalid"; } });
}
